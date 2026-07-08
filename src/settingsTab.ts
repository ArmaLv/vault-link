import { App, Notice, PluginSettingTab, Setting, TFile } from "obsidian";
import * as path from "path";
import type VaultLinkPlugin from "./main";
import { isOneWay, LinkItem, LinkRule, newLinkItem, newLinkRule } from "./settings";
import { detachLinkRule, SyncResult, syncLinkRule } from "./linkManager";
import { pickFolder } from "./electronDialog";
import { VaultFolderSuggest, VaultPathSuggest } from "./suggest";

export class VaultLinkSettingTab extends PluginSettingTab {
	plugin: VaultLinkPlugin;
	private expandedRuleIds = new Set<string>();
	private expandedItemIds = new Set<string>();

	constructor(app: App, plugin: VaultLinkPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("p", {
			text: "Vault Link keeps a file or folder in sync between this vault and another vault on your computer, by pointing both at the same content on disk.",
		});

		if (this.plugin.settings.links.length === 0) {
			this.renderQuickStart(containerEl);
		} else {
			for (const rule of this.plugin.settings.links) {
				this.renderRule(rule.id);
			}
		}

		new Setting(containerEl).addButton((btn) =>
			btn
				.setButtonText("+ Add link")
				.setCta()
				.onClick(async () => {
					const rule = newLinkRule();
					this.expandedRuleIds.add(rule.id);
					this.plugin.settings.links.push(rule);
					await this.plugin.saveSettings();
					this.display();
				})
		);
	}

	private renderQuickStart(containerEl: HTMLElement) {
		const box = containerEl.createDiv({ cls: "vault-link-quickstart" });
		box.createEl("p", { text: "No links yet. Click \"+ Add link\" below, then:" });
		const steps = box.createEl("ol");
		steps.createEl("li", { text: "Pick the other vault it should sync with." });
		steps.createEl("li", { text: "By default the whole vault syncs. Optionally pick specific files/folders instead." });
		steps.createEl("li", { text: "Click \"Sync now\". From then on it updates automatically." });
	}

	private async runWithNotice(label: string, fn: () => SyncResult): Promise<SyncResult> {
		const notice = new Notice(`Vault Link: ${label}…`, 0);
		await new Promise((resolve) => setTimeout(resolve, 0));
		try {
			return fn();
		} finally {
			notice.hide();
		}
	}

	private normalizeSourcePath(v: string): string {
		const trimmed = v.trim();
		return trimmed === "/" || trimmed === "\\" ? "" : trimmed;
	}

	private isFileSource(sourcePath: string): boolean {
		if (!sourcePath) return false;
		return this.app.vault.getAbstractFileByPath(sourcePath) instanceof TFile;
	}

	private excludeRelativeToItem(item: LinkItem, chosen: string): string | null {
		if (item.sourcePath === "") return chosen;
		if (chosen === item.sourcePath) return null;
		const prefix = item.sourcePath + "/";
		return chosen.startsWith(prefix) ? chosen.slice(prefix.length) : null;
	}

	private renderRuleSummary(summary: HTMLElement, rule: LinkRule) {
		summary.empty();
		summary.createSpan({ text: path.basename(rule.targetVaultPath) || "New link" });
		if (!rule.enabled) summary.createSpan({ text: " (disabled)", cls: "vault-link-tag" });
		else if (rule.targetVaultPath && !rule.hasSyncedOnce) {
			summary.createSpan({ text: " (not syncing yet — click Sync now)", cls: "vault-link-tag" });
		}
	}

	private renderRule(id: string) {
		const rule = this.plugin.settings.links.find((r) => r.id === id);
		if (!rule) return;
		const { containerEl } = this;

		const section = containerEl.createEl("details", { cls: "vault-link-rule" });
		if (!rule.targetVaultPath || this.expandedRuleIds.has(id)) section.setAttr("open", "");
		section.addEventListener("toggle", () => {
			if (section.open) this.expandedRuleIds.add(id);
			else this.expandedRuleIds.delete(id);
		});

		const summary = section.createEl("summary");
		this.renderRuleSummary(summary, rule);

		new Setting(section)
			.setName("Enabled")
			.addToggle((t) =>
				t.setValue(rule.enabled).onChange(async (v) => {
					rule.enabled = v;
					await this.plugin.saveSettings();
					this.renderRuleSummary(summary, rule);
				})
			);

		new Setting(section)
			.setName("Sync target vault")
			.addText((t) => {
				t.setPlaceholder("Vault name or folder path")
					.setValue(rule.targetVaultPath)
					.onChange(async (v) => {
						rule.targetVaultPath = v.trim();
						await this.plugin.saveSettings();
					});
				new VaultFolderSuggest(this.app, t.inputEl, this.plugin.vaultBasePath, (vault) => {
					rule.targetVaultPath = vault.path;
					void this.plugin.saveSettings();
				});
			})
			.addButton((btn) =>
				btn.setButtonText("Browse...").onClick(async () => {
					const picked = await pickFolder(rule.targetVaultPath || undefined);
					if (!picked) return;
					rule.targetVaultPath = picked;
					await this.plugin.saveSettings();
					this.display();
				})
			);

		new Setting(section)
			.setName("Default sync direction")
			.setDesc("Used by files/folders below that don't set their own.")
			.addDropdown((d) =>
				d
					.addOption("twoway", "Two-way (edit either side)")
					.addOption("oneway", "One-way (this vault → target)")
					.setValue(rule.oneWay ? "oneway" : "twoway")
					.onChange(async (v) => {
						rule.oneWay = v === "oneway";
						await this.plugin.saveSettings();
						this.display();
					})
			);

		new Setting(section)
			.setName("Files & folders")
			.setDesc(`Defaults to the whole vault, excluding ${this.app.vault.configDir}.`)
			.setHeading();

		for (const item of rule.items) {
			this.renderItem(section, rule, item);
		}

		new Setting(section).addButton((btn) =>
			btn.setButtonText("+ Add file/folder").onClick(async () => {
				const item = newLinkItem();
				this.expandedItemIds.add(item.id);
				rule.items.push(item);
				await this.plugin.saveSettings();
				this.display();
			})
		);

		const hasTwoWayItems = rule.items.some((i) => !isOneWay(rule, i));
		const actions = new Setting(section).addButton((btn) =>
			btn.setButtonText("Sync now").onClick(async () => {
				if (!rule.targetVaultPath) {
					this.plugin.reportResult({
						linked: [],
						skippedExcluded: [],
						conflicts: [],
						errors: [{ path: "", message: "Set the sync target vault first." }],
					});
					return;
				}
				const result = await this.runWithNotice("syncing", () =>
					syncLinkRule(rule, this.plugin.vaultBasePath, this.app.vault.configDir)
				);
				this.plugin.reportResult(result);
				if (!rule.hasSyncedOnce) {
					rule.hasSyncedOnce = true;
					await this.plugin.saveSettings();
					this.renderRuleSummary(summary, rule);
				}
			})
		);

		if (hasTwoWayItems) {
			actions.addButton((btn) =>
				btn.setButtonText("Detach (unlink)").onClick(async () => {
					const result = await this.runWithNotice("detaching", () =>
						detachLinkRule(rule, this.plugin.vaultBasePath, this.app.vault.configDir)
					);
					this.plugin.reportResult(result);
				})
			);
		}

		actions.addButton((btn) =>
			btn
				.setButtonText("Remove")
				.setWarning()
				.onClick(async () => {
					this.plugin.settings.links = this.plugin.settings.links.filter((r) => r.id !== id);
					await this.plugin.saveSettings();
					this.display();
				})
		);
	}

	private renderItem(containerEl: HTMLElement, rule: LinkRule, item: LinkItem) {
		const itemEl = containerEl.createEl("details", { cls: "vault-link-item" });
		if (!rule.targetVaultPath || this.expandedItemIds.has(item.id)) itemEl.setAttr("open", "");
		itemEl.addEventListener("toggle", () => {
			if (itemEl.open) this.expandedItemIds.add(item.id);
			else this.expandedItemIds.delete(item.id);
		});

		const summary = itemEl.createEl("summary");
		summary.createSpan({ text: item.sourcePath || "Whole vault" });
		if (isOneWay(rule, item)) summary.createSpan({ text: " (one-way)", cls: "vault-link-tag" });

		new Setting(itemEl)
			.setName("File or folder")
			.setDesc("Leave blank (or \"/\") for the whole vault.")
			.addText((t) => {
				t.setPlaceholder("Leave blank for the whole vault")
					.setValue(item.sourcePath)
					.onChange(async (v) => {
						item.sourcePath = this.normalizeSourcePath(v);
						await this.plugin.saveSettings();
					});
				t.inputEl.addEventListener("blur", () => this.display());
				new VaultPathSuggest(this.app, t.inputEl, (chosen) => {
					item.sourcePath = chosen;
					void this.plugin.saveSettings();
					this.display();
				});
			});

		if (item.sourcePath === "") {
			new Setting(itemEl)
				.setName(`Also sync ${this.app.vault.configDir}`)
				.setDesc("Off by default so plugin data, caches, and workspace layout don't get synced or slow things down.")
				.addToggle((t) =>
					t.setValue(!!item.syncConfigDir).onChange(async (v) => {
						item.syncConfigDir = v;
						await this.plugin.saveSettings();
					})
				);
		}

		new Setting(itemEl)
			.setName("Synced target")
			.addText((t) =>
				t
					.setPlaceholder("Leave blank for vault root")
					.setValue(item.targetPath)
					.onChange(async (v) => {
						item.targetPath = v.trim();
						await this.plugin.saveSettings();
					})
			)
			.addButton((btn) =>
				btn.setButtonText("Browse...").onClick(async () => {
					if (!rule.targetVaultPath) {
						btn.setButtonText("Set the target vault first");
						return;
					}
					const picked = await pickFolder(rule.targetVaultPath);
					if (!picked) return;
					item.targetPath = path.relative(rule.targetVaultPath, picked).split(path.sep).join("/");
					await this.plugin.saveSettings();
					this.display();
				})
			);

		new Setting(itemEl)
			.setName("Sync direction")
			.setDesc(isOneWay(rule, item) ? "Target edits are overwritten on the next sync." : "")
			.addDropdown((d) =>
				d
					.addOption("default", `Use default (${rule.oneWay ? "one-way" : "two-way"})`)
					.addOption("twoway", "Two-way (edit either side)")
					.addOption("oneway", "One-way (this vault → target)")
					.setValue(item.oneWay === undefined ? "default" : item.oneWay ? "oneway" : "twoway")
					.onChange(async (v) => {
						item.oneWay = v === "default" ? undefined : v === "oneway";
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (!this.isFileSource(item.sourcePath)) {
			new Setting(itemEl)
				.setName("Exclude patterns")
				.addTextArea((t) =>
					t
						.setPlaceholder("theme.css, *.css")
						.setValue(item.excludes.join(", "))
						.onChange(async (v) => {
							item.excludes = v
								.split(",")
								.map((s) => s.trim())
								.filter(Boolean);
							await this.plugin.saveSettings();
						})
				);

			new Setting(itemEl)
				.setName("Exclude a specific file/folder")
				.addText((t) => {
					t.setPlaceholder("Start typing to pick one to exclude");
					new VaultPathSuggest(this.app, t.inputEl, (chosen) => {
						const rel = this.excludeRelativeToItem(item, chosen);
						if (!rel) {
							new Notice(`Vault Link: pick something inside ${item.sourcePath || "the vault"}.`);
							return;
						}
						if (!item.excludes.includes(rel)) {
							item.excludes.push(rel);
							void this.plugin.saveSettings();
						}
						this.display();
					});
				});
		}

		if (rule.items.length > 1) {
			new Setting(itemEl).addButton((btn) =>
				btn
					.setButtonText("Remove this file/folder")
					.setWarning()
					.onClick(async () => {
						rule.items = rule.items.filter((i) => i.id !== item.id);
						await this.plugin.saveSettings();
						this.display();
					})
			);
		}
	}
}
