import { afterEach, describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import type { Task } from "../types/index.ts";
// Side-effect import: initializes the i18next singleton (German by default) so
// that t('board:density.*') resolves to real text instead of raw keys when
// this file is the first to render a translated component in the test process.
import "../web/i18n.ts";
import BoardPage from "../web/components/BoardPage.tsx";

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
	createTask({ id: "task-101", title: "Fix login bug", status: "To Do" }),
	createTask({ id: "task-102", title: "Write docs", status: "In Progress" }),
];

let activeRoot: Root | null = null;

const setupDom = (url = "http://localhost/board") => {
	const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url });
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

const renderBoardPage = (
	options: { url?: string; tasks?: Task[]; beforeRender?: () => void } = {},
): HTMLElement => {
	setupDom(options.url);
	options.beforeRender?.();
	const container = document.getElementById("root");
	expect(container).toBeTruthy();
	activeRoot = createRoot(container as HTMLElement);
	act(() => {
		activeRoot?.render(
			<BrowserRouter>
				<BoardPage
					tasks={options.tasks ?? tasks}
					statuses={["To Do", "In Progress", "Done"]}
					milestones={[]}
					availableLabels={[]}
					milestoneEntities={[]}
					archivedMilestones={[]}
					isLoading={false}
					onEditTask={() => {}}
					onNewTask={() => {}}
				/>
			</BrowserRouter>,
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

const getButtonByText = (container: HTMLElement, text: string): HTMLButtonElement => {
	const button = Array.from(container.querySelectorAll("button")).find(
		(element) => element.textContent?.trim() === text,
	);
	expect(button).toBeTruthy();
	return button as HTMLButtonElement;
};

// The task-card root is the direct parent of its <h4> title — see TaskCard.tsx.
const getCard = (container: HTMLElement, title: string): HTMLElement => {
	const heading = Array.from(container.querySelectorAll("h4")).find((element) => element.textContent === title);
	expect(heading).toBeTruthy();
	const card = heading?.parentElement;
	expect(card).toBeTruthy();
	return card as HTMLElement;
};

const getCardTitle = (card: HTMLElement): HTMLElement => {
	const heading = card.querySelector("h4");
	expect(heading).toBeTruthy();
	return heading as HTMLElement;
};

// The card footer is the only child div with both a top border and the
// footer's distinctive text size — see TaskCard.tsx.
const getCardFooter = (card: HTMLElement): HTMLElement => {
	const footer = Array.from(card.querySelectorAll("div")).find(
		(element) => element.className.includes("border-t") && element.className.includes("text-[10px]"),
	);
	expect(footer).toBeTruthy();
	return footer as HTMLElement;
};

// Every TaskColumn root carries min-h-24 (empty) or min-h-96 (non-empty),
// regardless of density — a stable marker that doesn't depend on status text.
const getColumnRoots = (container: HTMLElement): HTMLElement[] =>
	Array.from(container.querySelectorAll<HTMLElement>("div")).filter((element) =>
		/\bmin-h-(24|96)\b/.test(element.className),
	);

afterEach(() => {
	if (activeRoot) {
		act(() => {
			activeRoot?.unmount();
		});
		activeRoot = null;
	}
});

describe("Board density toggle", () => {
	it("defaults to comfortable, switches to compact on click, and persists the choice to localStorage", async () => {
		const container = renderBoardPage();

		expect(window.localStorage.getItem("backlog.board.density")).toBeNull();

		const cardBefore = getCard(container, "Fix login bug");
		expect(cardBefore.className).toContain("p-4");
		expect(getCardTitle(cardBefore).className).toContain("text-[15px]");
		expect(getCardFooter(cardBefore).className).toContain("mt-2 pt-2");

		const columnsBefore = getColumnRoots(container);
		expect(columnsBefore.length).toBeGreaterThan(0);
		for (const column of columnsBefore) {
			expect(column.className).toContain("p-4");
		}

		await clickElement(getButtonByText(container, "Kompakt"));

		expect(window.localStorage.getItem("backlog.board.density")).toBe("compact");

		const cardAfter = getCard(container, "Fix login bug");
		expect(cardAfter.className).toContain("p-2.5");
		expect(getCardTitle(cardAfter).className).toContain("text-[13px]");
		expect(getCardFooter(cardAfter).className).toContain("mt-1 pt-1");

		const columnsAfter = getColumnRoots(container);
		for (const column of columnsAfter) {
			expect(column.className).toContain("p-2");
			expect(column.className).not.toContain("p-2.5");
		}

		await clickElement(getButtonByText(container, "Komfortabel"));

		expect(window.localStorage.getItem("backlog.board.density")).toBe("comfortable");
		expect(getCard(container, "Fix login bug").className).toContain("p-4");
	});

	it("starts compact on a fresh render when localStorage already has the density preference set", () => {
		const container = renderBoardPage({
			beforeRender: () => window.localStorage.setItem("backlog.board.density", "compact"),
		});

		const card = getCard(container, "Fix login bug");
		expect(card.className).toContain("p-2.5");
		expect(getCardTitle(card).className).toContain("text-[13px]");

		const columns = getColumnRoots(container);
		expect(columns.length).toBeGreaterThan(0);
		for (const column of columns) {
			expect(column.className).toContain("p-2");
		}
	});

	it("applies compact spacing to the milestone grid layout as well", async () => {
		const milestoneTasks: Task[] = [
			createTask({ id: "task-201", title: "Milestone task", status: "To Do", milestone: "m-1" }),
		];
		const container = renderBoardPage({ url: "http://localhost/board?lane=milestone", tasks: milestoneTasks });

		const grid = container.querySelector('[style*="grid-template-columns"]');
		expect(grid).toBeTruthy();
		expect((grid as HTMLElement).className).toContain("gap-4");

		await clickElement(getButtonByText(container, "Kompakt"));

		const gridAfter = container.querySelector('[style*="grid-template-columns"]');
		expect(gridAfter).toBeTruthy();
		expect((gridAfter as HTMLElement).className).toContain("gap-2");
		expect((gridAfter as HTMLElement).className).not.toContain("gap-4");
	});
});
