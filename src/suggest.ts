import { AbstractInputSuggest, App } from "obsidian";
import * as fs from "fs";
import * as path from "path";

export class VaultPathSuggest extends AbstractInputSuggest<string> {
	constructor(
		app: App,
		textInputEl: HTMLInputElement,
		private vaultBasePath: string,
		private onPick: (path: string) => void
	) {
		super(app, textInputEl);
	}

	protected getSuggestions(query: string): string[] {
		const q = query.toLowerCase();
		const indexed = this.app.vault.getAllLoadedFiles().map((f) => f.path);
		const configPaths = this.listConfigCandidates();
		const all = Array.from(new Set([...indexed, ...configPaths]));
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

	/** Lists the config dir plus a couple of levels of children, e.g. ".obsidian/themes/MyTheme". */
	private listConfigCandidates(): string[] {
		const configDir = this.app.vault.configDir;
		const results: string[] = [configDir];
		const walk = (relDir: string, depth: number) => {
			if (depth <= 0) return;
			let names: string[];
			try {
				names = fs.readdirSync(path.join(this.vaultBasePath, relDir));
			} catch {
				return;
			}
			for (const name of names) {
				const rel = `${relDir}/${name}`;
				results.push(rel);
				try {
					if (fs.statSync(path.join(this.vaultBasePath, rel)).isDirectory()) {
						walk(rel, depth - 1);
					}
				} catch {
					/* skip unreadable entries */
				}
			}
		};
		walk(configDir, 2);
		return results;
	}
}
