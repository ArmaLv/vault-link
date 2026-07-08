import { debounce, Debouncer, FileSystemAdapter, Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, isOneWay, migrateSettings, VaultLinkSettings } from "./settings";
import { VaultLinkSettingTab } from "./settingsTab";
import { SyncResult, syncLinkRule } from "./linkManager";

const CONTENT_IDLE_MS = 8000;

export default class VaultLinkPlugin extends Plugin {
	settings: VaultLinkSettings = DEFAULT_SETTINGS;
	private requestStructuralSync!: Debouncer<[], void>;
	private requestContentSync!: Debouncer<[], void>;

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
			callback: () => this.syncAll({ manual: true }),
		});

		this.requestStructuralSync = debounce(() => this.syncAll({ silent: true }), 1000, true);
		this.requestContentSync = debounce(() => this.syncAll({ silent: true, scope: "oneway" }), CONTENT_IDLE_MS, true);

		this.app.workspace.onLayoutReady(() => {
			this.syncAll({ silent: true });
			this.registerEvent(this.app.vault.on("create", () => this.requestStructuralSync()));
			this.registerEvent(this.app.vault.on("delete", () => this.requestStructuralSync()));
			this.registerEvent(this.app.vault.on("rename", () => this.requestStructuralSync()));
			this.registerEvent(this.app.vault.on("modify", () => this.requestContentSync()));
		});
	}

	onunload() {
		this.syncAll({ silent: true });
	}

	async syncAll(opts: { silent?: boolean; manual?: boolean; scope?: "all" | "oneway" } = {}) {
		let notice: Notice | undefined;
		if (opts.manual) {
			notice = new Notice("Vault Link: syncing…", 0);
			await new Promise((resolve) => setTimeout(resolve, 0));
		}

		const combined: SyncResult = { linked: [], skippedExcluded: [], conflicts: [], errors: [] };
		let flagsChanged = false;
		for (const rule of this.settings.links) {
			if (!rule.enabled || !rule.targetVaultPath || rule.items.length === 0) continue;
			if (!opts.manual && !rule.hasSyncedOnce) continue;
			const items = opts.scope === "oneway" ? rule.items.filter((item) => isOneWay(rule, item)) : rule.items;
			if (items.length === 0) continue;
			const result = syncLinkRule(rule, this.vaultBasePath, this.app.vault.configDir, items);
			if (opts.manual && !rule.hasSyncedOnce) {
				rule.hasSyncedOnce = true;
				flagsChanged = true;
			}
			combined.linked.push(...result.linked);
			combined.skippedExcluded.push(...result.skippedExcluded);
			combined.conflicts.push(...result.conflicts);
			combined.errors.push(...result.errors);
		}
		if (flagsChanged) await this.saveData(this.settings);
		notice?.hide();
		this.reportResult(combined, opts.silent);
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

	async loadSettings() {
		this.settings = migrateSettings(Object.assign({}, DEFAULT_SETTINGS, await this.loadData()));
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.requestStructuralSync?.();
	}
}
