import { AbstractInputSuggest, App } from "obsidian";
import { KnownVault, listKnownVaults } from "./vaultList";

export class VaultPathSuggest extends AbstractInputSuggest<string> {
	constructor(
		app: App,
		textInputEl: HTMLInputElement,
		private onPick: (path: string) => void
	) {
		super(app, textInputEl);
	}

	protected getSuggestions(query: string): string[] {
		const q = query.toLowerCase();
		const all = this.app.vault.getAllLoadedFiles().map((f) => f.path);
		return all.filter((p) => p.length > 0 && p.toLowerCase().contains(q)).slice(0, 100);
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	selectSuggestion(value: string): void {
		this.setValue(value);
		this.onPick(value);
		this.close();
	}
}

export class VaultFolderSuggest extends AbstractInputSuggest<KnownVault> {
	constructor(
		app: App,
		textInputEl: HTMLInputElement,
		private currentVaultPath: string,
		private onPick: (vault: KnownVault) => void
	) {
		super(app, textInputEl);
	}

	protected getSuggestions(query: string): KnownVault[] {
		const q = query.toLowerCase();
		return listKnownVaults(this.currentVaultPath).filter(
			(v) => v.name.toLowerCase().contains(q) || v.path.toLowerCase().contains(q)
		);
	}

	renderSuggestion(value: KnownVault, el: HTMLElement): void {
		el.createDiv({ text: value.name });
		el.createEl("small", { text: value.path });
	}

	selectSuggestion(value: KnownVault): void {
		this.setValue(value.path);
		this.onPick(value);
		this.close();
	}
}
