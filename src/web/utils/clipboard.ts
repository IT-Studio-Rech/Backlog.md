export async function copyTextToClipboard(text: string): Promise<void> {
	if (navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return;
		} catch {
			// Fall back for browsers that deny async clipboard access in local sessions.
		}
	}

	const textarea = document.createElement("textarea");
	textarea.value = text;
	textarea.setAttribute("readonly", "");
	textarea.style.position = "fixed";
	textarea.style.top = "0";
	textarea.style.left = "0";
	textarea.style.opacity = "0";
	document.body.appendChild(textarea);
	textarea.focus();
	textarea.select();

	let copied = false;
	try {
		copied = document.execCommand("copy");
	} finally {
		textarea.remove();
	}

	if (!copied) {
		throw new Error("Clipboard copy failed");
	}
}
