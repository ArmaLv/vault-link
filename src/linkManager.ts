import * as fs from "fs";
import * as path from "path";
import { isExcluded } from "./glob";
import { LinkRule } from "./settings";

export interface SyncResult {
	linked: string[];
	skippedExcluded: string[];
	conflicts: string[];
	errors: { path: string; message: string }[];
}

function emptyResult(): SyncResult {
	return { linked: [], skippedExcluded: [], conflicts: [], errors: [] };
}

function resolvePaths(rule: LinkRule, vaultBasePath: string) {
	return {
		sourceAbs: path.join(vaultBasePath, rule.sourcePath),
		targetAbs: path.join(rule.targetVaultPath, rule.targetPath || rule.sourcePath),
	};
}

/** Creates/repairs symlinks for a rule so both sides point at one real copy, skipping excludes. */
export function syncLinkRule(rule: LinkRule, vaultBasePath: string): SyncResult {
	const result = emptyResult();
	const { sourceAbs, targetAbs } = resolvePaths(rule, vaultBasePath);

	if (!fs.existsSync(sourceAbs) && !fs.existsSync(targetAbs)) {
		result.errors.push({ path: rule.sourcePath, message: "Neither side exists yet." });
		return result;
	}

	if (rule.excludes.length === 0) {
		linkEntry(sourceAbs, targetAbs, result);
		return result;
	}

	walkAndLink(sourceAbs, targetAbs, "", rule.excludes, result);
	return result;
}

export function detachLinkRule(rule: LinkRule, vaultBasePath: string): SyncResult {
	const result = emptyResult();
	const { sourceAbs, targetAbs } = resolvePaths(rule, vaultBasePath);
	detachEntry(sourceAbs, result);
	detachEntry(targetAbs, result);
	return result;
}

function detachEntry(entryAbs: string, result: SyncResult) {
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
			detachEntry(path.join(entryAbs, name), result);
		}
	}
}

function linkEntry(sourceAbs: string, targetAbs: string, result: SyncResult) {
	const sourceExists = fs.existsSync(sourceAbs);
	const targetExists = fs.existsSync(targetAbs);
	const sourceIsLink = sourceExists && fs.lstatSync(sourceAbs).isSymbolicLink();
	const targetIsLink = targetExists && fs.lstatSync(targetAbs).isSymbolicLink();

	if (sourceExists && targetExists && !sourceIsLink && !targetIsLink) {
		result.conflicts.push(`${sourceAbs} <-> ${targetAbs}`);
		return;
	}

	try {
		if (sourceExists && !sourceIsLink) {
			replaceWithLink(targetAbs, sourceAbs, result);
		} else if (targetExists && !targetIsLink) {
			replaceWithLink(sourceAbs, targetAbs, result);
		} else if (sourceIsLink && !targetExists) {
			result.errors.push({ path: sourceAbs, message: "Broken link: no real file on either side." });
		} else if (targetIsLink && !sourceExists) {
			result.errors.push({ path: targetAbs, message: "Broken link: no real file on either side." });
		}
		// Both sides already correctly linked: nothing to do.
	} catch (e) {
		result.errors.push({ path: sourceAbs, message: describeError(e) });
	}
}

function replaceWithLink(linkPath: string, realPath: string, result: SyncResult) {
	fs.mkdirSync(path.dirname(linkPath), { recursive: true });
	if (fs.existsSync(linkPath)) {
		if (fs.lstatSync(linkPath).isSymbolicLink()) {
			fs.unlinkSync(linkPath);
		} else {
			result.conflicts.push(linkPath);
			return;
		}
	}
	const isDir = fs.statSync(realPath).isDirectory();
	const type: "dir" | "file" | "junction" = isDir ? (process.platform === "win32" ? "junction" : "dir") : "file";
	fs.symlinkSync(realPath, linkPath, type);
	result.linked.push(linkPath);
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
		if (isExcluded(relPath, excludes)) {
			result.skippedExcluded.push(relPath);
			continue;
		}
		const sChild = path.join(sourceDir, name);
		const tChild = path.join(targetDir, name);
		const sExists = fs.existsSync(sChild);
		const tExists = fs.existsSync(tChild);
		const sIsLink = sExists && fs.lstatSync(sChild).isSymbolicLink();
		const tIsLink = tExists && fs.lstatSync(tChild).isSymbolicLink();
		const sIsDir = sExists && !sIsLink && fs.statSync(sChild).isDirectory();
		const tIsDir = tExists && !tIsLink && fs.statSync(tChild).isDirectory();

		if ((sIsDir || tIsDir) && !sIsLink && !tIsLink) {
			// Recurse so files inside can be individually excluded.
			walkAndLink(sourceAbs, targetAbs, relPath, excludes, result);
			continue;
		}

		linkEntry(sChild, tChild, result);
	}
}
