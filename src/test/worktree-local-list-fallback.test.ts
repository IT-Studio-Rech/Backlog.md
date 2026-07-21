import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { $ } from "bun";
import { Core } from "../core/backlog.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
let WORKTREE_DIR: string;
let mainCore: Core | undefined;

describe("local task list with newer state on another worktree", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-worktree-local-list");
		WORKTREE_DIR = `${TEST_DIR}-feature`;
		await mkdir(TEST_DIR, { recursive: true });
		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();
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

	it("keeps the task visible in the local view instead of dropping the cross-branch winner", async () => {
		const setupCore = new Core(TEST_DIR);
		await initializeTestProject(setupCore, "Worktree Local List", true);
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

		const task: Task = {
			id: "task-1",
			title: "Banner test task",
			status: "To Do",
			assignee: [],
			createdDate: "2026-07-01",
			labels: [],
			dependencies: [],
			rawContent: "## Description\nCreated on main.",
		};
		await setupCore.createTask(task, true);

		// A worktree branch progresses the task further than the local checkout.
		await $`git worktree add ${WORKTREE_DIR} -b feature`.cwd(TEST_DIR).quiet();
		const featureCore = new Core(WORKTREE_DIR);
		const featureTask = await featureCore.filesystem.loadTask("task-1");
		if (!featureTask) {
			throw new Error("Expected task-1 in worktree");
		}
		await featureCore.updateTask({ ...featureTask, status: "In Progress" }, true);

		mainCore = new Core(TEST_DIR, { enableWatchers: true });

		// Cross-branch view surfaces the newer worktree state.
		const crossBranchTasks = await mainCore.queryTasks();
		const crossBranchTask = crossBranchTasks.find((t) => t.id === "TASK-1");
		expect(crossBranchTask?.status).toBe("In Progress");
		expect(crossBranchTask?.source).toBe("local-branch");

		// Local view must fall back to the local file version - not drop the task.
		const localTasks = await mainCore.queryTasks({ includeCrossBranch: false });
		const localTask = localTasks.find((t) => t.id === "TASK-1");
		expect(localTask).toBeDefined();
		expect(localTask?.status).toBe("To Do");
		expect(localTask?.source).toBe("local");
	});
});
