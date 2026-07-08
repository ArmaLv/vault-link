import * as fs from "fs";
import * as path from "path";
import { remote } from "electron";

export interface KnownVault {
	name: string;
	path: string;
}

interface ObsidianAppConfig {
	vaults?: Record<string, { path: string; ts?: number }>;
}

export function listKnownVaults(excludePath: string): KnownVault[] {
	try {
		const configFile = path.join(remote.app.getPath("userData"), "obsidian.json");
		const data = JSON.parse(fs.readFileSync(configFile, "utf8")) as ObsidianAppConfig;
		const excludeResolved = path.resolve(excludePath);

		return Object.values(data.vaults ?? {})
			.filter((v) => v.path && path.resolve(v.path) !== excludeResolved)
			.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
			.map((v) => ({ name: path.basename(v.path), path: v.path }));
	} catch {
		return [];
	}
}
