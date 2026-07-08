export interface LinkItem {
	id: string;
	sourcePath: string;
	targetPath: string;
	excludes: string[];
	oneWay?: boolean;
	syncConfigDir?: boolean;
}

export interface LinkRule {
	id: string;
	enabled: boolean;
	targetVaultPath: string;
	oneWay: boolean;
	items: LinkItem[];
	hasSyncedOnce: boolean;
}

export interface VaultLinkSettings {
	links: LinkRule[];
}

export const DEFAULT_SETTINGS: VaultLinkSettings = {
	links: [],
};

export function isOneWay(rule: LinkRule, item: LinkItem): boolean {
	return item.oneWay ?? rule.oneWay;
}

export function newLinkItem(): LinkItem {
	return {
		id: crypto.randomUUID(),
		sourcePath: "",
		targetPath: "",
		excludes: [],
	};
}

export function newLinkRule(): LinkRule {
	return {
		id: crypto.randomUUID(),
		enabled: true,
		targetVaultPath: "",
		oneWay: false,
		items: [newLinkItem()],
		hasSyncedOnce: false,
	};
}

interface LegacyLinkRule {
	id: string;
	enabled: boolean;
	sourcePath: string;
	targetVaultPath: string;
	targetPath: string;
	excludes: string[];
}

export function migrateSettings(raw: Partial<VaultLinkSettings> | undefined): VaultLinkSettings {
	const links = (raw?.links ?? []).map((rule): LinkRule => {
		const withItems = rule as LinkRule & { oneWay?: boolean; items?: Array<Partial<LinkItem>> };
		if (!Array.isArray(withItems.items)) {
			const legacy = rule as unknown as LegacyLinkRule;
			return {
				id: legacy.id,
				enabled: legacy.enabled,
				targetVaultPath: legacy.targetVaultPath,
				oneWay: false,
				items: [
					{
						id: crypto.randomUUID(),
						sourcePath: legacy.sourcePath,
						targetPath: legacy.targetPath,
						excludes: legacy.excludes,
					},
				],
				hasSyncedOnce: true,
			};
		}
		return {
			id: withItems.id,
			enabled: withItems.enabled,
			targetVaultPath: withItems.targetVaultPath,
			oneWay: withItems.oneWay ?? false,
			items: withItems.items.map((item) => ({
				id: item.id ?? crypto.randomUUID(),
				sourcePath: item.sourcePath ?? "",
				targetPath: item.targetPath ?? "",
				excludes: item.excludes ?? [],
				oneWay: typeof item.oneWay === "boolean" ? item.oneWay : undefined,
				syncConfigDir: item.syncConfigDir,
			})),
			hasSyncedOnce: withItems.hasSyncedOnce ?? !!withItems.targetVaultPath,
		};
	});
	return { links };
}
