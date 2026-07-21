import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { FileSystem } from "../file-system/operations.ts";
import { BacklogServer } from "../server/index.ts";
import { createUniqueTestDir, retry, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
let filesystem: FileSystem;
let server: BacklogServer | null = null;
let serverPort = 0;

async function fetchWithTimeout(path: string, timeoutMs = 1000): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(`http://127.0.0.1:${serverPort}${path}`, { signal: controller.signal });
	} finally {
		clearTimeout(timeout);
	}
}

describe("BacklogServer GET /api/progress (shipcraft loop status, task-5)", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("server-progress");
		filesystem = new FileSystem(TEST_DIR);
		await filesystem.ensureBacklogStructure();
		await filesystem.saveConfig({
			projectName: "Server Progress",
			statuses: ["To Do", "In Progress", "Done"],
			labels: [],
			milestones: [],
			dateFormat: "YYYY-MM-DD",
			remoteOperations: false,
		});

		server = new BacklogServer(TEST_DIR);
		await server.start(0, false);
		const port = server.getPort();
		expect(port).not.toBeNull();
		serverPort = port ?? 0;

		await retry(
			async () => {
				const res = await fetchWithTimeout("/api/status", 500);
				if (!res.ok) throw new Error("server not ready");
				return true;
			},
			10,
			50,
		);
	});

	afterEach(async () => {
		if (server) {
			await server.stop();
			server = null;
		}
		await safeCleanup(TEST_DIR);
	});

	it("returns { active: false } when .shipcraft/progress.json does not exist", async () => {
		const res = await fetchWithTimeout("/api/progress");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ active: false });
	});

	it("returns the current progress.json contents once shipcraft's PostToolUse hook writes one", async () => {
		const shipcraftDir = join(TEST_DIR, ".shipcraft");
		await mkdir(shipcraftDir, { recursive: true });
		await Bun.write(
			join(shipcraftDir, "progress.json"),
			JSON.stringify({
				active: true,
				issue: "task-42",
				gestartet: "2026-07-21T09:12:00.000Z",
				heartbeat: "2026-07-21T09:44:31.000Z",
			}),
		);

		const res = await fetchWithTimeout("/api/progress");
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.active).toBe(true);
		expect(body.issue).toBe("task-42");
		expect(body.heartbeat).toBe("2026-07-21T09:44:31.000Z");
	});

	it("falls back to { active: false } once progress.json is removed again", async () => {
		const shipcraftDir = join(TEST_DIR, ".shipcraft");
		await mkdir(shipcraftDir, { recursive: true });
		const progressPath = join(shipcraftDir, "progress.json");
		await Bun.write(progressPath, JSON.stringify({ active: true, issue: "task-42" }));
		expect((await fetchWithTimeout("/api/progress").then((r) => r.json())).active).toBe(true);

		await rm(progressPath, { force: true });
		const res = await fetchWithTimeout("/api/progress");
		expect(await res.json()).toEqual({ active: false });
	});
});
