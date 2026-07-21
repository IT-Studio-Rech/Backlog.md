import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/backlog.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup, sleep } from "./test-utils.ts";

let TEST_DIR: string;
let WORKTREE_DIR: string;
let mainCore: Core | undefined;

const TASK_FILE = "task-1 - Live edit.md";

/**
 * Polls `check` at a fixed interval until it stops throwing, or fails with its last
 * error. Watcher propagation is debounced (task-19) and depends on OS fs-event
 * latency, so tests can't assert on the first tick - unlike test-utils' `retry`,
 * this uses a constant interval instead of linear backoff to stay well under bun's
 * default per-test timeout.
 */
async function waitFor(check: () => void, attempts = 20, intervalMs = 100): Promise<void> {
	let lastError: unknown;
	for (let attempt = 0; attempt < attempts; attempt++) {
		try {
			check();
			return;
		} catch (error) {
			lastError = error;
			await sleep(intervalMs);
		}
	}
	throw lastError;
}

async function writeTaskFile(worktreeDir: string, status = "To Do"): Promise<void> {
	// git doesn't track empty directories, so a freshly checked-out worktree with no
	// tasks yet committed won't have backlog/tasks/ on disk until something creates it.
	await mkdir(join(worktreeDir, "backlog", "tasks"), { recursive: true });
	const content = [
		"---",
		"id: task-1",
		"title: Live edit",
		`status: ${status}`,
		"assignee: []",
		"created_date: '2026-07-21'",
		"labels: []",
		"dependencies: []",
		"---",
		"## Description",
		"Edited directly on disk in a sibling worktree, never committed.",
		"",
	].join("\n");
	return writeFile(join(worktreeDir, "backlog", "tasks", TASK_FILE), content);
}

describe("worktree live watcher (task-19)", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-worktree-live-watcher");
		WORKTREE_DIR = `${TEST_DIR}-feature`;
		await mkdir(TEST_DIR, { recursive: true });
		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

		const setupCore = new Core(TEST_DIR);
		await initializeTestProject(setupCore, "Worktree Live Watcher", true);
		const config = await setupCore.filesystem.loadConfig();
		if (!config) {
			throw new Error("Expected initialized config");
		}
		await setupCore.filesystem.saveConfig({
			...config,
			checkActiveBranches: true,
			remoteOperations: false,
		});
		await $`git add backlog/config.yml`.cwd(TEST_DIR).quiet();
		await $`git commit -m "Configure active branch scanning"`.cwd(TEST_DIR).quiet();
	});

	afterEach(async () => {
		mainCore?.disposeContentStore();
		mainCore = undefined;
		try {
			await safeCleanup(WORKTREE_DIR);
			await safeCleanup(TEST_DIR);
		} catch {
			// Ignore cleanup errors - unique directory names prevent conflicts.
		}
	});

	it("surfaces a task written directly to a sibling worktree's filesystem, without any commit", async () => {
		await $`git worktree add ${WORKTREE_DIR} -b feature`.cwd(TEST_DIR).quiet();

		mainCore = new Core(TEST_DIR, { enableWatchers: true });
		const store = await mainCore.getContentStore();
		expect(store.getTasks().map((task) => task.id)).not.toContain("TASK-1");

		await writeTaskFile(WORKTREE_DIR);

		await waitFor(() => {
			const task = store.getTasks().find((t) => t.id === "TASK-1");
			if (!task) {
				throw new Error("Task not yet visible");
			}
			expect(task.status).toBe("To Do");
			expect(task.source).toBe("worktree");
			expect(task.branch).toBe("feature");
		});

		// git status in the worktree must still show the file as untracked - proves
		// visibility did not require a commit. (-uall so an untracked directory is listed
		// file-by-file rather than collapsed to the directory name.)
		const { stdout } = await $`git status --porcelain -uall`.cwd(WORKTREE_DIR).quiet();
		expect(stdout.toString()).toContain(TASK_FILE);
	});

	it("propagates a later uncommitted edit in the sibling worktree (latest-wins, no restart)", async () => {
		await $`git worktree add ${WORKTREE_DIR} -b feature`.cwd(TEST_DIR).quiet();
		await writeTaskFile(WORKTREE_DIR, "To Do");

		mainCore = new Core(TEST_DIR, { enableWatchers: true });
		const store = await mainCore.getContentStore();

		await waitFor(() => {
			const task = store.getTasks().find((t) => t.id === "TASK-1");
			if (task?.status !== "To Do") {
				throw new Error("Initial task state not yet visible");
			}
		});

		await writeTaskFile(WORKTREE_DIR, "In Progress");

		await waitFor(() => {
			const task = store.getTasks().find((t) => t.id === "TASK-1");
			if (task?.status !== "In Progress") {
				throw new Error("Updated task state not yet visible");
			}
		});
	});

	it("drops the task again once the sibling worktree is removed (registry-driven lifecycle)", async () => {
		await $`git worktree add ${WORKTREE_DIR} -b feature`.cwd(TEST_DIR).quiet();
		await writeTaskFile(WORKTREE_DIR);

		mainCore = new Core(TEST_DIR, { enableWatchers: true });
		const store = await mainCore.getContentStore();

		await waitFor(() => {
			if (!store.getTasks().some((t) => t.id === "TASK-1")) {
				throw new Error("Task not yet visible");
			}
		});

		await $`git worktree remove --force ${WORKTREE_DIR}`.cwd(TEST_DIR).quiet();

		await waitFor(() => {
			if (store.getTasks().some((t) => t.id === "TASK-1")) {
				throw new Error("Task should have disappeared with the worktree");
			}
		});
	});

	it("tolerates a half-written task file instead of crashing the watcher", async () => {
		await $`git worktree add ${WORKTREE_DIR} -b feature`.cwd(TEST_DIR).quiet();

		mainCore = new Core(TEST_DIR, { enableWatchers: true });
		const store = await mainCore.getContentStore();

		// Truncated frontmatter - parseTask should fail on this; the watcher must not throw.
		await mkdir(join(WORKTREE_DIR, "backlog", "tasks"), { recursive: true });
		await writeFile(join(WORKTREE_DIR, "backlog", "tasks", TASK_FILE), "---\nid: task-1\ntitle: Broken");
		await writeTaskFile(WORKTREE_DIR, "In Progress");

		await waitFor(() => {
			const task = store.getTasks().find((t) => t.id === "TASK-1");
			if (task?.status !== "In Progress") {
				throw new Error("Task did not recover after the half-written write");
			}
		});
	});
});
