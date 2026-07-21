import { afterEach, describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import type { Task } from "../types/index.ts";
import TaskList from "../web/components/TaskList.tsx";

// Mirrors the customer's real status set from the feature request: the
// terminal status ("Done") is the last entry, matching src/utils/terminal-status.ts.
const CUSTOMER_STATUSES = ["Needs Triage", "Ready for Agent", "In Progress", "Needs Info", "In Review", "Done"];

const createTask = (overrides: Partial<Task>): Task => ({
	id: "task-1",
	title: "Task",
	status: "To Do",
	assignee: [],
	labels: [],
	dependencies: [],
	createdDate: "2026-01-01",
	...overrides,
});

const tasks: Task[] = [
	createTask({ id: "task-101", title: "Triage this", status: "Needs Triage" }),
	createTask({ id: "task-102", title: "Ship docs", status: "Done" }),
];

let activeRoot: Root | null = null;
const originalFetch = globalThis.fetch;

const setupDom = () => {
	const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost" });
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	globalThis.window = dom.window as unknown as Window & typeof globalThis;
	globalThis.document = dom.window.document as unknown as Document;
	globalThis.navigator = dom.window.navigator as unknown as Navigator;
	globalThis.localStorage = dom.window.localStorage as unknown as Storage;

	if (!window.matchMedia) {
		window.matchMedia = () =>
			({
				matches: false,
				media: "",
				onchange: null,
				addListener: () => {},
				removeListener: () => {},
				addEventListener: () => {},
				removeEventListener: () => {},
				dispatchEvent: () => false,
			}) as MediaQueryList;
	}

	// StatusFilterDropdown (like LabelFilterDropdown) uses requestAnimationFrame
	// for its scroll hint; jsdom doesn't implement it, so polyfill onto a timer,
	// mirroring src/test/web-task-details-modal-final-summary.test.tsx.
	globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => window.setTimeout(callback, 0) as unknown as number;
	globalThis.cancelAnimationFrame = (handle: number) => window.clearTimeout(handle);

	const htmlElementPrototype = window.HTMLElement.prototype as unknown as {
		attachEvent?: () => void;
		detachEvent?: () => void;
	};
	if (typeof htmlElementPrototype.attachEvent !== "function") {
		htmlElementPrototype.attachEvent = () => {};
	}
	if (typeof htmlElementPrototype.detachEvent !== "function") {
		htmlElementPrototype.detachEvent = () => {};
	}
};

const buildSearchUrl = (params: Record<string, string[]>): string => {
	const usp = new URLSearchParams();
	for (const [key, values] of Object.entries(params)) {
		for (const value of values) {
			usp.append(key, value);
		}
	}
	return `/?${usp.toString()}`;
};

const renderTaskList = (
	initialEntries?: string[],
	options: { tasks?: Task[]; availableStatuses?: string[] } = {},
): HTMLElement => {
	setupDom();
	const container = document.getElementById("root");
	expect(container).toBeTruthy();
	const renderedTasks = options.tasks ?? tasks;
	const renderedStatuses = options.availableStatuses ?? CUSTOMER_STATUSES;
	activeRoot = createRoot(container as HTMLElement);
	act(() => {
		activeRoot?.render(
			<MemoryRouter initialEntries={initialEntries}>
				<TaskList
					tasks={renderedTasks}
					availableStatuses={renderedStatuses}
					availableLabels={[]}
					availableMilestones={[]}
					milestoneEntities={[]}
					archivedMilestones={[]}
					onEditTask={() => {}}
					onNewTask={() => {}}
				/>
			</MemoryRouter>,
		);
	});
	return container as HTMLElement;
};

const clickElement = async (element: Element) => {
	await act(async () => {
		element.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
		await Promise.resolve();
	});
};

const waitFor = async (predicate: () => boolean) => {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		if (predicate()) {
			return;
		}
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
	}
};

// Opening the dropdown schedules a requestAnimationFrame-driven scroll-hint
// update (polyfilled onto setTimeout above). Flush it inside act() so it
// doesn't land after the test's own act() blocks and warn.
const flushPendingEffects = async () => {
	await act(async () => {
		await Promise.resolve();
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
};

const getStatusButton = (container: HTMLElement): HTMLButtonElement => {
	const button = container.querySelector("button[aria-controls='task-list-status-menu']");
	expect(button).toBeTruthy();
	return button as HTMLButtonElement;
};

const getStatusMenu = (container: HTMLElement): HTMLElement => {
	const menu = container.querySelector("#task-list-status-menu");
	expect(menu).toBeTruthy();
	return menu as HTMLElement;
};

// Status names are customer-provided data, not translated strings, so matching
// on their exact text content stays language-independent.
const getStatusRow = (menu: HTMLElement, status: string): HTMLElement => {
	const row = Array.from(menu.querySelectorAll("label")).find((label) => label.textContent?.trim() === status);
	expect(row).toBeTruthy();
	return row as HTMLElement;
};

const getStatusCheckbox = (menu: HTMLElement, status: string): HTMLInputElement => {
	const row = getStatusRow(menu, status);
	const checkbox = row.querySelector("input[type='checkbox']");
	expect(checkbox).toBeTruthy();
	return checkbox as HTMLInputElement;
};

const parseFetchUrl = (rawUrl: string): URL => new URL(rawUrl, "http://localhost");

const mockSearchFetch = (fetchCalls: string[]) => {
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
		fetchCalls.push(url);
		expect(url).toContain("/api/search");
		return {
			ok: true,
			status: 200,
			statusText: "OK",
			json: async () => [],
		} as Response;
	}) as typeof fetch;
};

afterEach(() => {
	globalThis.fetch = originalFetch;
	if (activeRoot) {
		act(() => {
			activeRoot?.unmount();
		});
		activeRoot = null;
	}
});

describe("TaskList status filter menu", () => {
	it("selecting two statuses sends two status params to the search request", async () => {
		const fetchCalls: string[] = [];
		mockSearchFetch(fetchCalls);

		const container = renderTaskList();
		const statusButton = getStatusButton(container);
		await clickElement(statusButton);
		await flushPendingEffects();

		const menu = getStatusMenu(container);
		await clickElement(getStatusRow(menu, "Ready for Agent"));
		await waitFor(() => fetchCalls.length === 1);

		await clickElement(getStatusRow(menu, "In Review"));
		await waitFor(() => fetchCalls.length === 2);

		const lastUrl = parseFetchUrl(fetchCalls[fetchCalls.length - 1] as string);
		const statusParams = lastUrl.searchParams.getAll("status");
		expect(statusParams).toHaveLength(2);
		expect(new Set(statusParams)).toEqual(new Set(["Ready for Agent", "In Review"]));

		// Both checkboxes reflect the selection, independent of any translated label.
		expect(getStatusCheckbox(menu, "Ready for Agent").checked).toBe(true);
		expect(getStatusCheckbox(menu, "In Review").checked).toBe(true);
		expect(getStatusCheckbox(menu, "Needs Triage").checked).toBe(false);
	});

	it("the Offen quick option selects every status except the terminal one", async () => {
		const fetchCalls: string[] = [];
		mockSearchFetch(fetchCalls);

		const container = renderTaskList();
		const statusButton = getStatusButton(container);
		await clickElement(statusButton);
		await flushPendingEffects();

		const menu = getStatusMenu(container);
		// With nothing selected yet, the quick-select row is the only <button>
		// in the menu — the checkbox rows are <label>+<input>, and the "clear"
		// button only renders once a selection exists.
		const quickOptionButtons = menu.querySelectorAll("button");
		expect(quickOptionButtons).toHaveLength(1);
		await clickElement(quickOptionButtons[0] as HTMLButtonElement);

		await waitFor(() => fetchCalls.length === 1);

		const lastUrl = parseFetchUrl(fetchCalls[fetchCalls.length - 1] as string);
		const statusParams = lastUrl.searchParams.getAll("status");
		const expectedOpenStatuses = CUSTOMER_STATUSES.slice(0, -1);
		expect(statusParams).toHaveLength(expectedOpenStatuses.length);
		expect(new Set(statusParams)).toEqual(new Set(expectedOpenStatuses));
		expect(statusParams).not.toContain("Done");

		// The quick option closes the menu (same UX as the clear action).
		expect(container.querySelector("#task-list-status-menu")).toBeNull();

		// Reopen and confirm every non-terminal checkbox is checked, and the
		// terminal one is not.
		await clickElement(statusButton);
		await flushPendingEffects();
		const reopenedMenu = getStatusMenu(container);
		for (const status of expectedOpenStatuses) {
			expect(getStatusCheckbox(reopenedMenu, status).checked).toBe(true);
		}
		expect(getStatusCheckbox(reopenedMenu, "Done").checked).toBe(false);
	});

	it("clearing the status filter drops status params while other filters stay applied", async () => {
		const fetchCalls: string[] = [];
		mockSearchFetch(fetchCalls);

		const initialUrl = buildSearchUrl({
			status: ["Needs Triage", "In Progress"],
			priority: ["high"],
		});
		const container = renderTaskList([initialUrl]);
		await waitFor(() => fetchCalls.length === 1);

		const firstUrl = parseFetchUrl(fetchCalls[0] as string);
		expect(firstUrl.searchParams.getAll("status")).toHaveLength(2);
		expect(firstUrl.searchParams.get("priority")).toBe("high");

		const statusButton = getStatusButton(container);
		await clickElement(statusButton);
		await flushPendingEffects();
		const menu = getStatusMenu(container);

		// With a selection present, both the quick-select row and the clear
		// action render as buttons — the clear action is always the last one.
		const buttons = Array.from(menu.querySelectorAll("button"));
		expect(buttons.length).toBeGreaterThanOrEqual(2);
		const clearButton = buttons[buttons.length - 1] as HTMLButtonElement;
		await clickElement(clearButton);

		await waitFor(() => fetchCalls.length === 2);

		const lastUrl = parseFetchUrl(fetchCalls[fetchCalls.length - 1] as string);
		expect(lastUrl.searchParams.getAll("status")).toHaveLength(0);
		expect(lastUrl.searchParams.get("priority")).toBe("high");

		expect(container.querySelector("#task-list-status-menu")).toBeNull();
	});
});
