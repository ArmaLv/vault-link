import { Notice } from "obsidian";
import { remote } from "electron";

export async function pickFolder(defaultPath?: string): Promise<string | null> {
	try {
		const result = await remote.dialog.showOpenDialog({
			defaultPath,
			properties: ["openDirectory"],
		});
		if (result.canceled || result.filePaths.length === 0) return null;
		return result.filePaths[0];
	} catch (e) {
		new Notice("Vault Link: couldn't open the folder picker. Enter the path manually.");
		console.error("Vault Link folder picker error:", e);
		return null;
	}
}
