import { App, PluginSettingTab, Setting } from "obsidian";
import * as path from "path";
import type VaultLinkPlugin from "./main";
import { newLinkRule } from "./settings";
import { detachLinkRule, syncLinkRule } from "./linkManager";
import { pickFolder } from "./electronDialog";
import { VaultPathSuggest } from "./suggest";

export class VaultLinkSettingTab extends PluginSettingTab {
	plugin: VaultLinkPlugin;

	constructor(app: App, plugin: VaultLinkPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Vault Link").setHeading();
		containerEl.createEl("p", {
			text: "Link a file or folder in this vault to a file or folder in another vault. Linked entries share the same content on disk. Excluded entries stay independent in each vault. Links are kept in sync automatically on vault load, on file changes, and whenever you edit a rule.",
		});

		for (const rule of this.plugin.settings.links) {
			this.renderRule(rule.id);
		}

		new Setting(containerEl).addButton((btn) =>
			btn
				.setButtonText("Add link")
				.setCta()
				.onClick(async () => {
					this.plugin.settings.links.push(newLinkRule());
					await this.plugin.saveSettings();
					this.display();
				})
		);
	}

	private renderRule(id: string) {
		const rule = this.plugin.settings.links.find((r) => r.id === id);
		if (!rule) return;
		const { containerEl } = this;

		const section = containerEl.createDiv({ cls: "vault-link-rule" });
		section.createEl("hr");

		new Setting(section)
			.setName("Enabled")
			.addToggle((t) =>
				t.setValue(rule.enabled).onChange(async (v) => {
					rule.enabled = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(section)
			.setName("Sync Files/Folders")
			.setDesc(
				"File or folder in this vault. Start typing to pick from existing files/folders, including " +
					this.app.vault.configDir +
					" (plugins, themes, snippets, etc.)."
			)
			.addText((t) => {
				t.setPlaceholder("Templates")
					.setValue(rule.sourcePath)
					.onChange(async (v) => {
						rule.sourcePath = v.trim();
						await this.plugin.saveSettings();
					});
				new VaultPathSuggest(this.app, t.inputEl, this.plugin.vaultBasePath, async (chosen) => {
					rule.sourcePath = chosen;
					await this.plugin.saveSettings();
				});
			});

		new Setting(section)
			.setName("Other vault's folder")
			.setDesc("Absolute path to the root of the other vault on disk")
			.addText((t) =>
				t
					.setPlaceholder("C:\\Users\\me\\Documents\\OtherVault")
					.setValue(rule.targetVaultPath)
					.onChange(async (v) => {
						rule.targetVaultPath = v.trim();
						await this.plugin.saveSettings();
					})
			)
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
			.setName("Synced Target")
			.setDesc(
				`Destination folder inside the other vault's folder to place "${path.basename(rule.sourcePath) || "the file/folder"}" in. ` +
					"Leave blank to place it at the root of the other vault's folder."
			)
			.addText((t) =>
				t
					.setPlaceholder("Leave blank for vault root")
					.setValue(rule.targetPath)
					.onChange(async (v) => {
						rule.targetPath = v.trim();
						await this.plugin.saveSettings();
					})
			)
			.addButton((btn) =>
				btn.setButtonText("Browse...").onClick(async () => {
					if (!rule.targetVaultPath) {
						btn.setButtonText("Set other vault's folder first");
						return;
					}
					const picked = await pickFolder(rule.targetVaultPath);
					if (!picked) return;
					rule.targetPath = path.relative(rule.targetVaultPath, picked).split(path.sep).join("/");
					await this.plugin.saveSettings();
					this.display();
				})
			);

		new Setting(section)
			.setName("Exclude patterns")
			.setDesc(
				"Comma-separated globs kept independent in each vault, e.g. theme.css, *.css, assets/private/**. " +
					"Linking " +
					this.app.vault.configDir +
					"? You'll likely want to exclude workspace.json, workspace-mobile.json, and appearance.json " +
					"(window layout and active theme are usually vault-specific)."
			)
			.addTextArea((t) =>
				t
					.setPlaceholder("theme.css, *.css")
					.setValue(rule.excludes.join(", "))
					.onChange(async (v) => {
						rule.excludes = v
							.split(",")
							.map((s) => s.trim())
							.filter(Boolean);
						await this.plugin.saveSettings();
					})
			);

		new Setting(section)
			.addButton((btn) =>
				btn.setButtonText("Sync now").onClick(() => {
					const result = syncLinkRule(rule, this.plugin.vaultBasePath);
					this.plugin.reportResult(result);
				})
			)
			.addButton((btn) =>
				btn.setButtonText("Detach (unlink)").onClick(() => {
					const result = detachLinkRule(rule, this.plugin.vaultBasePath);
					this.plugin.reportResult(result);
				})
			)
			.addButton((btn) =>
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
}
