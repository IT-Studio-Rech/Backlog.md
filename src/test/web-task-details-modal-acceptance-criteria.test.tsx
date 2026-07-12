import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import { renderToString } from "react-dom/server";
import type { Task } from "../types/index.ts";
import TaskCard from "../web/components/TaskCard";
import { TaskDetailsModal } from "../web/components/TaskDetailsModal";
import { ThemeProvider } from "../web/contexts/ThemeContext";

import i18n from "../web/i18n.ts";

// Die Tests dieser Datei prüfen englische UI-Texte; das Produkt-Default ist Deutsch.
beforeAll(async () => {
	await i18n.changeLanguage("en");
});

afterAll(async () => {
	await i18n.changeLanguage("de");
});

const setupDom = () => {
	const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
	globalThis.window = dom.window as unknown as Window & typeof globalThis;
	globalThis.document = dom.window.document as Document;
	globalThis.navigator = dom.window.navigator as Navigator;
	globalThis.localStorage = dom.window.localStorage;

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
};

describe("Web task popup acceptance criteria display", () => {
	it("renders existing acceptance criteria numbers in preview", () => {
		setupDom();

		const task: Task = {
			id: "TASK-1",
			title: "Task with acceptance criteria",
			status: "To Do",
			assignee: [],
			createdDate: "2025-01-01",
			labels: [],
			dependencies: [],
			acceptanceCriteriaItems: [
				{ index: 1, text: "First criterion", checked: false },
				{ index: 3, text: "Third criterion", checked: true },
			],
		};

		const html = renderToString(
			<ThemeProvider>
				<TaskDetailsModal task={task} isOpen={true} onClose={() => {}} />
			</ThemeProvider>,
		);

		// SSR fügt Kommentar-Knoten zwischen Textsegmente ein („Acceptance Criteria<!-- --> (1/2)"),
		// deshalb Titel und Zähler getrennt prüfen; die Index-Badges rendern ohne #-Präfix.
		expect(html).toContain("Acceptance Criteria");
		expect(html).toContain("(1/2)");
		expect(html).toContain("First criterion");
		expect(html).toContain("Third criterion");
	});

	it("shows acceptance criteria progress with a tooltip preview on board cards", () => {
		setupDom();

		const task: Task = {
			id: "TASK-7",
			title: "Board card task",
			status: "To Do",
			assignee: [],
			createdDate: "2025-01-01",
			labels: [],
			dependencies: [],
			acceptanceCriteriaItems: [{ index: 7, text: "Hidden criterion", checked: false }],
		};

		const html = renderToString(<TaskCard task={task} onUpdate={() => {}} onEdit={() => {}} />);

		expect(html).toContain("Board card task");
		// Karten zeigen den Kriterien-Fortschritt als Zähler; der Kriterien-Text
		// erscheint nur in der Hover-Tooltip-Vorschau.
		expect(html).toContain("Acceptance criteria");
		expect(html).toContain("Hidden criterion");
	});
});
