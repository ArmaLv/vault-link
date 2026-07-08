import * as fs from "fs";
import * as path from "path";
import { isExcluded } from "./glob";
import { isOneWay, LinkItem, LinkRule } from "./settings";

export interface SyncResult {
	linked: string[];
	skippedExcluded: string[];
	conflicts: string[];
	errors: { path: string; message: string }[];
}

function emptyResult(): SyncResult {
	return { linked: [], skippedExcluded: [], conflicts: [], errors: [] };
}

function mergeInto(target: SyncResult, source: SyncResult) {
	target.linked.push(...source.linked);
	target.skippedExcluded.push(...source.skippedExcluded);
	target.conflicts.push(...source.conflicts);
	target.errors.push(...source.errors);
}

function resolvePaths(item: LinkItem, targetVaultPath: string, vaultBasePath: string) {
	return {
		sourceAbs: path.join(vaultBasePath, item.sourcePath),
		targetAbs: path.join(targetVaultPath, item.targetPath, path.basename(item.sourcePath)),
	};
}

function effectiveExcludes(item: LinkItem, siblingItems: LinkItem[], configDir: string): string[] {
	const extras = new Set(item.excludes);
	if (item.sourcePath === "" && !item.syncConfigDir) extras.add(configDir);

	const prefix = item.sourcePath ? item.sourcePath + "/" : "";
	for (const sibling of siblingItems) {
		if (sibling === item || !sibling.sourcePath || sibling.sourcePath === item.sourcePath) continue;
		if (item.sourcePath === "") {
			extras.add(sibling.sourcePath);
		} else if (sibling.sourcePath.startsWith(prefix)) {
			extras.add(sibling.sourcePath.slice(prefix.length));
		}
	}
	return Array.from(extras);
}

export function syncLinkRule(rule: LinkRule, vaultBasePath: string, configDir: string, itemsOverride?: LinkItem[]): SyncResult {
	const result = emptyResult();
	for (const item of itemsOverride ?? rule.items) {
		const itemResult = isOneWay(rule, item)
			? syncItemOneWay(item, rule, vaultBasePath, configDir)
			: syncItemTwoWay(item, rule, vaultBasePath, configDir);
		mergeInto(result, itemResult);
	}
	return result;
}

export function detachLinkRule(rule: LinkRule, vaultBasePath: string, configDir: string): SyncResult {
	const result = emptyResult();
	for (const item of rule.items) {
		if (isOneWay(rule, item)) continue;
		const { sourceAbs, targetAbs } = resolvePaths(item, rule.targetVaultPath, vaultBasePath);
		const excludes = effectiveExcludes(item, rule.items, configDir);
		detachEntry(sourceAbs, excludes, "", result);
		detachEntry(targetAbs, excludes, "", result);
	}
	return result;
}

function syncItemTwoWay(item: LinkItem, rule: LinkRule, vaultBasePath: string, configDir: string): SyncResult {
	const result = emptyResult();
	const { sourceAbs, targetAbs } = resolvePaths(item, rule.targetVaultPath, vaultBasePath);

	const sourceExists = fs.existsSync(sourceAbs);
	const targetExists = fs.existsSync(targetAbs);
	if (!sourceExists && !targetExists) {
		result.errors.push({ path: item.sourcePath || "(vault root)", message: "Neither side exists yet." });
		return result;
	}

	const excludes = effectiveExcludes(item, rule.items, configDir);
	const sourceIsDir = sourceExists && fs.statSync(sourceAbs).isDirectory();
	const targetIsDir = targetExists && fs.statSync(targetAbs).isDirectory();
	if (item.sourcePath !== "" && (excludes.length === 0 || (!sourceIsDir && !targetIsDir))) {
		linkEntry(sourceAbs, targetAbs, result);
		return result;
	}

	walkAndLink(sourceAbs, targetAbs, "", excludes, result);
	return result;
}

function syncItemOneWay(item: LinkItem, rule: LinkRule, vaultBasePath: string, configDir: string): SyncResult {
	const result = emptyResult();
	const { sourceAbs, targetAbs } = resolvePaths(item, rule.targetVaultPath, vaultBasePath);

	if (!fs.existsSync(sourceAbs)) {
		result.errors.push({ path: item.sourcePath || "(vault root)", message: "Source doesn't exist in this vault." });
		return result;
	}

	if (fs.statSync(sourceAbs).isDirectory()) {
		walkOneWay(sourceAbs, targetAbs, "", effectiveExcludes(item, rule.items, configDir), result);
	} else {
		copyFileOneWay(sourceAbs, targetAbs, result);
	}
	return result;
}

function detachEntry(entryAbs: string, excludes: string[], relPath: string, result: SyncResult) {
	if (isExcluded(relPath, excludes)) return;
	if (!fs.existsSync(entryAbs)) return;
	const stat = fs.lstatSync(entryAbs);
	if (stat.isSymbolicLink()) {
		const real = fs.realpathSync(entryAbs);
		const realStat = fs.statSync(real);
		fs.unlinkSync(entryAbs);
		if (realStat.isDirectory()) {
			fs.cpSync(real, entryAbs, { recursive: true });
		} else {
			fs.copyFileSync(real, entryAbs);
		}
		result.linked.push(entryAbs);
		return;
	}
	if (stat.isDirectory()) {
		for (const name of fs.readdirSync(entryAbs)) {
			const childRel = relPath ? `${relPath}/${name}` : name;
			detachEntry(path.join(entryAbs, name), excludes, childRel, result);
		}
		return;
	}
	if (stat.nlink > 1) {
		const data = fs.readFileSync(entryAbs);
		fs.unlinkSync(entryAbs);
		fs.writeFileSync(entryAbs, data);
		result.linked.push(entryAbs);
	}
}

function ensureIndependentTarget(targetAbs: string) {
	if (!fs.existsSync(targetAbs)) return;
	const stat = fs.lstatSync(targetAbs);
	if (stat.isSymbolicLink()) {
		fs.unlinkSync(targetAbs);
		return;
	}
	if (stat.isFile() && stat.nlink > 1) {
		fs.unlinkSync(targetAbs);
	}
}

function copyFileOneWay(sourceAbs: string, targetAbs: string, result: SyncResult) {
	fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
	ensureIndependentTarget(targetAbs);
	if (!fs.existsSync(targetAbs) || hasChanged(sourceAbs, targetAbs)) {
		fs.copyFileSync(sourceAbs, targetAbs);
		result.linked.push(targetAbs);
	}
}

function hasChanged(sourceAbs: string, targetAbs: string): boolean {
	const s = fs.statSync(sourceAbs);
	const t = fs.statSync(targetAbs);
	return s.size !== t.size || s.mtimeMs > t.mtimeMs;
}

function walkOneWay(sourceAbs: string, targetAbs: string, relDir: string, excludes: string[], result: SyncResult) {
	const sourceDir = path.join(sourceAbs, relDir);
	const targetDir = path.join(targetAbs, relDir);
	ensureIndependentTarget(targetDir);
	fs.mkdirSync(targetDir, { recursive: true });

	for (const name of fs.readdirSync(sourceDir)) {
		const relPath = relDir ? `${relDir}/${name}` : name;
		if (isExcluded(relPath, excludes)) {
			result.skippedExcluded.push(relPath);
			continue;
		}
		const sChild = path.join(sourceDir, name);
		const tChild = path.join(targetDir, name);
		if (fs.statSync(sChild).isDirectory()) {
			walkOneWay(sourceAbs, targetAbs, relPath, excludes, result);
		} else {
			copyFileOneWay(sChild, tChild, result);
		}
	}
}

function linkEntry(sourceAbs: string, targetAbs: string, result: SyncResult) {
	const sourceExists = fs.existsSync(sourceAbs);
	const targetExists = fs.existsSync(targetAbs);

	if (sourceExists && targetExists) {
		if (!isSameFile(sourceAbs, targetAbs)) {
			result.conflicts.push(`${sourceAbs} <-> ${targetAbs}`);
		}
		return;
	}

	try {
		if (sourceExists) {
			createLink(targetAbs, sourceAbs, result);
		} else if (targetExists) {
			createLink(sourceAbs, targetAbs, result);
		} else if (isBrokenLink(sourceAbs) || isBrokenLink(targetAbs)) {
			result.errors.push({ path: sourceAbs, message: "Broken link: no real file on either side." });
		}
	} catch (e) {
		result.errors.push({ path: sourceAbs, message: describeError(e) });
	}
}

function isSameFile(a: string, b: string): boolean {
	try {
		const sa = fs.statSync(a);
		const sb = fs.statSync(b);
		return sa.dev === sb.dev && sa.ino === sb.ino;
	} catch {
		return false;
	}
}

function isBrokenLink(p: string): boolean {
	try {
		return fs.lstatSync(p).isSymbolicLink();
	} catch {
		return false;
	}
}

function createLink(linkPath: string, realPath: string, result: SyncResult) {
	fs.mkdirSync(path.dirname(linkPath), { recursive: true });
	try {
		if (fs.lstatSync(linkPath).isSymbolicLink()) fs.unlinkSync(linkPath);
	} catch {
	}
	const isDir = fs.statSync(realPath).isDirectory();
	if (isDir) {
		fs.symlinkSync(realPath, linkPath, process.platform === "win32" ? "junction" : "dir");
	} else {
		linkFile(realPath, linkPath);
	}
	result.linked.push(linkPath);
}

function linkFile(realPath: string, linkPath: string) {
	if (process.platform === "win32") {
		try {
			fs.linkSync(realPath, linkPath);
			return;
		} catch {
		}
	}
	fs.symlinkSync(realPath, linkPath, "file");
}

function describeError(e: unknown): string {
	const err = e as NodeJS.ErrnoException;
	if (err.code === "EPERM" && process.platform === "win32") {
		return "Permission denied creating a symlink. On Windows, enable Developer Mode (Settings > Privacy & Security > For developers) or run Obsidian as administrator.";
	}
	return err.message ?? String(e);
}

function walkAndLink(sourceAbs: string, targetAbs: string, relDir: string, excludes: string[], result: SyncResult) {
	const sourceDir = path.join(sourceAbs, relDir);
	const targetDir = path.join(targetAbs, relDir);
	const names = new Set<string>();
	if (fs.existsSync(sourceDir) && fs.statSync(sourceDir).isDirectory()) {
		for (const n of fs.readdirSync(sourceDir)) names.add(n);
	}
	if (fs.existsSync(targetDir) && fs.statSync(targetDir).isDirectory()) {
		for (const n of fs.readdirSync(targetDir)) names.add(n);
	}

	for (const name of names) {
		const relPath = relDir ? `${relDir}/${name}` : name;
		const sChild = path.join(sourceDir, name);
		const tChild = path.join(targetDir, name);
		if (isExcluded(relPath, excludes)) {
			detachEntry(sChild, [], "", result);
			detachEntry(tChild, [], "", result);
			result.skippedExcluded.push(relPath);
			continue;
		}
		const sExists = fs.existsSync(sChild);
		const tExists = fs.existsSync(tChild);
		const sIsLink = sExists && fs.lstatSync(sChild).isSymbolicLink();
		const tIsLink = tExists && fs.lstatSync(tChild).isSymbolicLink();
		const sIsDir = sExists && !sIsLink && fs.statSync(sChild).isDirectory();
		const tIsDir = tExists && !tIsLink && fs.statSync(tChild).isDirectory();

		if ((sIsDir || tIsDir) && !sIsLink && !tIsLink) {
			walkAndLink(sourceAbs, targetAbs, relPath, excludes, result);
			continue;
		}

		linkEntry(sChild, tChild, result);
	}
}
