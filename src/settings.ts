export interface LinkRule {
	id: string;
	enabled: boolean;
	/** Path relative to this vault's root, e.g. "Templates" or "Templates/daily.md" */
	sourcePath: string;
	/** Absolute filesystem path to the root of the other vault */
	targetVaultPath: string;
	/** Path relative to the target vault's root. Defaults to sourcePath if left blank. */
	targetPath: string;
	/** Glob-style patterns e.g. "theme.css", "*.css", "assets/private/**" */
	excludes: string[];
}

export interface VaultLinkSettings {
	links: LinkRule[];
}

export const DEFAULT_SETTINGS: VaultLinkSettings = {
	links: [],
};

export function newLinkRule(): LinkRule {
	return {
		id: crypto.randomUUID(),
		enabled: true,
		sourcePath: "",
		targetVaultPath: "",
		targetPath: "",
		excludes: [],
	};
}
