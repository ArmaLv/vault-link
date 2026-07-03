import { debounce, Debouncer, FileSystemAdapter, Notice, Plugin } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import { DEFAULT_SETTINGS, VaultLinkSettings } from "./settings";
import { VaultLinkSettingTab } from "./settingsTab";
import { SyncResult, syncLinkRule } from "./linkManager";

export default class VaultLinkPlugin extends Plugin {
	settings: VaultLinkSettings = DEFAULT_SETTINGS;
	private requestSync!: Debouncer<[], void>;
	private configWatchers = new Map<string, fs.FSWatcher>();

	get vaultBasePath(): string {
		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			throw new Error("Vault Link requires the desktop app.");
		}
		return adapter.getBasePath();
	}

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new VaultLinkSettingTab(this.app, this));

		this.addCommand({
			id: "sync-all-links",
			name: "Sync all links",
			callback: () => this.syncAll(),
		});

		this.requestSync = debounce(() => this.syncAll({ silent: true }), 1000, true);
		this.app.workspace.onLayoutReady(() => {
			this.syncAll({ silent: true });
			this.registerEvent(this.app.vault.on("create", () => this.requestSync()));
			this.registerEvent(this.app.vault.on("delete", () => this.requestSync()));
			this.registerEvent(this.app.vault.on("rename", () => this.requestSync()));
			this.refreshConfigWatchers();
		});
	}

	onunload() {
		for (const watcher of this.configWatchers.values()) watcher.close();
		this.configWatchers.clear();
		this.syncAll({ silent: true });
	}

	syncAll(opts: { silent?: boolean } = {}) {
		const combined: SyncResult = { linked: [], skippedExcluded: [], conflicts: [], errors: [] };
		for (const rule of this.settings.links) {
			if (!rule.enabled || !rule.sourcePath || !rule.targetVaultPath) continue;
			const result = syncLinkRule(rule, this.vaultBasePath);
			combined.linked.push(...result.linked);
			combined.skippedExcluded.push(...result.skippedExcluded);
			combined.conflicts.push(...result.conflicts);
			combined.errors.push(...result.errors);
		}
		this.reportResult(combined, opts.silent);
		this.refreshConfigWatchers();
	}

	reportResult(result: SyncResult, silent = false) {
		const notable = result.conflicts.length > 0 || result.errors.length > 0;
		if (silent && !notable && result.linked.length === 0) return;

		const parts: string[] = [];
		if (result.linked.length) parts.push(`${result.linked.length} linked`);
		if (result.conflicts.length) parts.push(`${result.conflicts.length} conflicts`);
		if (result.errors.length) parts.push(`${result.errors.length} errors`);
		if (!parts.length) parts.push("nothing to do");
		new Notice(`Vault Link: ${parts.join(", ")}`);

		if (result.conflicts.length) {
			console.warn("Vault Link conflicts (both sides have independent real files):", result.conflicts);
		}
		if (result.errors.length) {
			console.error("Vault Link errors:", result.errors);
		}
	}

	private refreshConfigWatchers() {
		for (const watcher of this.configWatchers.values()) watcher.close();
		this.configWatchers.clear();

		const configDir = this.app.vault.configDir;
		for (const rule of this.settings.links) {
			if (!rule.enabled || !rule.sourcePath) continue;
			const isConfigPath = rule.sourcePath === configDir || rule.sourcePath.startsWith(configDir + "/");
			if (!isConfigPath) continue;

			const abs = path.join(this.vaultBasePath, rule.sourcePath);
			if (!fs.existsSync(abs)) continue;

			try {
				const watcher = fs.watch(abs, { recursive: true }, () => this.requestSync());
				this.configWatchers.set(rule.id, watcher);
			} catch {
				// "recursive" isn't supported on Linux in older Node versions; fall back to shallow watching.
				try {
					const watcher = fs.watch(abs, () => this.requestSync());
					this.configWatchers.set(rule.id, watcher);
				} catch (e2) {
					console.error("Vault Link: couldn't watch", abs, e2);
				}
			}
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.requestSync?.();
	}
}
