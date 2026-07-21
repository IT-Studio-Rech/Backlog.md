import { existsSync, type FSWatcher, mkdirSync, readFileSync, watch } from "node:fs";
import { basename, dirname } from "node:path";

export interface ProgressWatcherCallbacks {
	onProgressChanged?: (progress: Record<string, unknown> | null) => void | Promise<void>;
}

function readProgress(progressPath: string): Record<string, unknown> | null {
	try {
		if (!existsSync(progressPath)) {
			return null;
		}
		const parsed = JSON.parse(readFileSync(progressPath, "utf8"));
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

// Watches .shipcraft/progress.json (shipcraft's PostToolUse hook mirror of loop.lock).
// Unlike watchConfig, the file is ephemeral — absent whenever no loop is running — so we
// watch the containing directory instead of the file itself (fs.watch on a missing path
// throws immediately) and filter events down to the one filename we care about.
export function watchProgress(progressPath: string, callbacks: ProgressWatcherCallbacks): { stop: () => void } {
	let watcher: FSWatcher | null = null;
	const dir = dirname(progressPath);
	const filename = basename(progressPath);

	const stop = () => {
		if (watcher) {
			try {
				watcher.close();
			} catch {
				// Ignore
			}
			watcher = null;
		}
	};

	try {
		mkdirSync(dir, { recursive: true });
		watcher = watch(dir, (_eventType, changedFilename) => {
			if (changedFilename && changedFilename !== filename) {
				return;
			}
			try {
				void callbacks.onProgressChanged?.(readProgress(progressPath));
			} catch {
				// Ignore; subsequent events will retry
			}
		});
	} catch {
		// If watching fails (e.g., directory unwritable), keep silent; GET /api/progress still works
	}

	return { stop };
}

export function readCurrentProgress(progressPath: string): Record<string, unknown> | null {
	return readProgress(progressPath);
}
