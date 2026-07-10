import type { CSSProperties } from "react";

// Default palette offered when a label has no explicit color yet, so a newly
// created label doesn't start out black/white before the user picks one.
export const DEFAULT_LABEL_PALETTE = [
	"#0d9488", // teal
	"#0284c7", // sky
	"#7c3aed", // violet
	"#d97706", // amber
	"#e11d48", // rose
	"#059669", // emerald
];

export function pickDefaultLabelColor(label: string): string {
	let hash = 0;
	for (let i = 0; i < label.length; i++) {
		hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
	}
	return DEFAULT_LABEL_PALETTE[hash % DEFAULT_LABEL_PALETTE.length] ?? DEFAULT_LABEL_PALETTE[0]!;
}

// Single source of truth for resolving a label's configured color. Returns
// undefined when no color is set, so callers can fall back to the default
// neutral chip styling.
export function resolveLabelColor(label: string, labelColors: Record<string, string> | undefined): string | undefined {
	return labelColors?.[label];
}

// Chip styling for a resolved color: tinted translucent background (reads
// well on both light and dark surfaces without separate dark-mode classes)
// with the solid color used for text, mirroring GitHub-style label chips.
// Tailwind can't pick up dynamically-built arbitrary color classes at build
// time, so this is applied as an inline style instead.
export function getLabelChipStyle(color: string | undefined): CSSProperties | undefined {
	if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return undefined;
	return {
		backgroundColor: `${color}26`,
		color,
	};
}
