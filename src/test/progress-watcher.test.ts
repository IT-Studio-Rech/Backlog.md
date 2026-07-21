import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { readCurrentProgress, watchProgress } from "../utils/progress-watcher.ts";
import { createUniqueTestDir, sleep } from "./test-utils.ts";

let TEST_DIR: string;
let progressPath: string;
let watcher: { stop: () => void } | null = null;

describe("watchProgress (shipcraft .shipcraft/progress.json mirror, task-5)", () => {
	beforeEach(() => {
		TEST_DIR = createUniqueTestDir("progress-watcher");
		progressPath = join(TEST_DIR, ".shipcraft", "progress.json");
	});

	afterEach(async () => {
		watcher?.stop();
		watcher = null;
		await rm(TEST_DIR, { recursive: true, force: true });
	});

	it("readCurrentProgress returns null when the file does not exist yet", () => {
		expect(readCurrentProgress(progressPath)).toBeNull();
	});

	it("readCurrentProgress returns null for malformed JSON instead of throwing", async () => {
		await Bun.write(progressPath, "{not json");
		expect(readCurrentProgress(progressPath)).toBeNull();
	});

	it("creates the .shipcraft directory eagerly so fs.watch never throws on a missing path", () => {
		watcher = watchProgress(progressPath, {});
		expect(readCurrentProgress(progressPath)).toBeNull(); // directory exists, file doesn't
	});

	it("fires onProgressChanged when progress.json is created, updated, and removed", async () => {
		const seen: Array<Record<string, unknown> | null> = [];
		watcher = watchProgress(progressPath, {
			onProgressChanged: (progress) => {
				seen.push(progress);
			},
		});

		await Bun.write(progressPath, JSON.stringify({ active: true, issue: "task-42" }));
		await sleep(200);
		await Bun.write(progressPath, JSON.stringify({ active: true, issue: "task-43" }));
		await sleep(200);
		await rm(progressPath, { force: true });
		await sleep(200);

		expect(seen.length).toBeGreaterThanOrEqual(1);
		const issues = seen.map((p) => p?.issue);
		expect(issues).toContain("task-43");
		expect(seen.at(-1)).toBeNull();
	});
});
