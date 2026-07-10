export function isMacPlatform(): boolean {
	if (typeof navigator === "undefined") return false;
	return /Mac|iPod|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent ?? "");
}

export function getSearchShortcutHint(): string {
	return isMacPlatform() ? "⌘K" : "Ctrl+K";
}
