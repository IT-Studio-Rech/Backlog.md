import { type FSWatcher, watch } from "node:fs";
import { realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import type { GitOperations } from "../git/operations.ts";

export interface WorktreeWatcherOptions {
	git: GitOperations;
	/** This Core instance's project root (may be a subdirectory of the repo root). */
	projectRoot: string;
	/** Backlog directory name (usually "backlog"), relative to each worktree's project root. */
	backlogDirName: string;
	/** Called (debounced) whenever a sibling worktree appears/disappears or its tasks change. */
	onChange: () => void;
	debounceMs?: number;
}

export interface WorktreeWatcherHandle {
	stop(): void;
}

const DEFAULT_DEBOUNCE_MS = 150;

function normalizeWatchFilename(value: string | Buffer | null): string | null {
	if (typeof value === "string") return value;
	if (value instanceof Buffer) return value.toString();
	return null;
}

/**
 * Watches git's own worktree registry (`<git-common-dir>/worktrees/`) for entries
 * appearing/disappearing - i.e. `git worktree add`/`remove` - independent of where any
 * worktree happens to live on disk. The registry directory may not exist yet (no linked
 * worktree has ever been added), so we watch its parent (which always exists for a repo)
 * and filter events down to the "worktrees" entry, attaching a nested watcher once it
 * shows up - the same "watch the parent, filter by name" trick used for ephemeral files.
 */
function watchWorktreeRegistry(gitCommonDir: string, onChange: () => void): WorktreeWatcherHandle {
	const worktreesDir = join(gitCommonDir, "worktrees");
	let inner: FSWatcher | null = null;
	let outer: FSWatcher | null = null;

	const attachInner = () => {
		if (inner) return;
		try {
			inner = watch(worktreesDir, { recursive: false }, () => onChange());
			inner.on("error", () => {
				inner?.close();
				inner = null;
			});
		} catch {
			inner = null;
		}
	};

	try {
		outer = watch(gitCommonDir, { recursive: false }, (_eventType, filename) => {
			if (normalizeWatchFilename(filename) !== "worktrees") return;
			attachInner();
			onChange();
		});
		outer.on("error", () => {
			outer?.close();
			outer = null;
		});
	} catch {
		outer = null;
	}

	attachInner();

	return {
		stop() {
			try {
				inner?.close();
			} catch {
				// Ignore
			}
			try {
				outer?.close();
			} catch {
				// Ignore
			}
		},
	};
}

/**
 * Live-watches sibling worktrees' `backlog/tasks` directories for changes, so a task
 * created or edited in another worktree shows up here without needing a commit first.
 *
 * Lifecycle: one watcher on git's `.git/worktrees/` registry drives targeted sub-watchers
 * per worktree (task-19 decision: registry-based lifecycle, no location convention).
 * File-system events are debounced to absorb half-written files from editors/agents.
 */
export function watchWorktreeTasks(options: WorktreeWatcherOptions): WorktreeWatcherHandle {
	const { git, projectRoot, backlogDirName, onChange, debounceMs = DEFAULT_DEBOUNCE_MS } = options;

	let disposed = false;
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let registryWatcher: WorktreeWatcherHandle | null = null;
	let selfRoot: string | null = null;
	const perWorktreeWatchers = new Map<string, FSWatcher>();

	const scheduleChange = () => {
		if (disposed) return;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			debounceTimer = null;
			if (!disposed) onChange();
		}, debounceMs);
	};

	const closeWatcher = (path: string) => {
		const watcher = perWorktreeWatchers.get(path);
		if (!watcher) return;
		try {
			watcher.close();
		} catch {
			// Ignore
		}
		perWorktreeWatchers.delete(path);
	};

	const syncWorktrees = async (): Promise<void> => {
		if (disposed) return;

		const repoRoot = await git.getRepositoryRoot();
		if (!repoRoot) return;

		if (!selfRoot) {
			selfRoot = await realpath(projectRoot).catch(() => projectRoot);
		}

		const projectRelativePath = relative(repoRoot, projectRoot);
		if (projectRelativePath.startsWith("..") || isAbsolute(projectRelativePath)) {
			return;
		}

		const worktrees = await git.listWorktrees().catch(() => []);
		const seenPaths = new Set<string>();

		for (const worktree of worktrees) {
			if (disposed) return;

			const worktreeProjectRoot = projectRelativePath ? join(worktree.path, projectRelativePath) : worktree.path;
			const resolvedRoot = await realpath(worktreeProjectRoot).catch(() => worktreeProjectRoot);
			if (resolvedRoot === selfRoot) continue; // our own worktree - ContentStore already watches it directly

			seenPaths.add(resolvedRoot);
			if (perWorktreeWatchers.has(resolvedRoot)) continue;

			const tasksDir = join(worktreeProjectRoot, backlogDirName, "tasks");
			try {
				const watcher = watch(tasksDir, { recursive: false }, () => scheduleChange());
				watcher.on("error", () => closeWatcher(resolvedRoot));
				perWorktreeWatchers.set(resolvedRoot, watcher);
			} catch {
				// Worktree has no backlog/tasks directory (yet) - skip silently, registry
				// changes or a later resync will pick it up once it exists.
			}
		}

		for (const knownPath of [...perWorktreeWatchers.keys()]) {
			if (!seenPaths.has(knownPath)) {
				closeWatcher(knownPath);
			}
		}
	};

	void (async () => {
		const gitCommonDir = await git.getGitCommonDir();
		if (disposed || !gitCommonDir) return;

		registryWatcher = watchWorktreeRegistry(gitCommonDir, () => {
			void syncWorktrees().finally(scheduleChange);
		});
		await syncWorktrees();
		// A task can be written to a sibling worktree in the gap between ContentStore's
		// initial load and this watcher finishing attachment (both do real async git/fs
		// work). fs.watch never replays missed events, so force one refresh right after
		// setup completes to close that race instead of relying on some later change.
		scheduleChange();
	})();

	return {
		stop() {
			disposed = true;
			if (debounceTimer) clearTimeout(debounceTimer);
			registryWatcher?.stop();
			for (const path of [...perWorktreeWatchers.keys()]) {
				closeWatcher(path);
			}
		},
	};
}
