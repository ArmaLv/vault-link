export function globToRegExp(pattern: string): RegExp {
	let re = "";
	for (let i = 0; i < pattern.length; i++) {
		const c = pattern[i];
		if (c === "*") {
			if (pattern[i + 1] === "*") {
				re += ".*";
				i++;
			} else {
				re += "[^/]*";
			}
		} else if (c === "?") {
			re += "[^/]";
		} else if (".+^${}()|[]\\".includes(c)) {
			re += "\\" + c;
		} else {
			re += c;
		}
	}
	return new RegExp(`^${re}$`);
}

export function isExcluded(relativePath: string, patterns: string[]): boolean {
	const normalized = relativePath.replace(/\\/g, "/");
	return patterns.some((pattern) => {
		const trimmed = pattern.trim();
		if (!trimmed) return false;
		const normalizedPattern = trimmed.replace(/\\/g, "/");
		if (globToRegExp(normalizedPattern).test(normalized)) return true;
		const baseName = normalized.split("/").pop() ?? normalized;
		return globToRegExp(normalizedPattern).test(baseName);
	});
}
