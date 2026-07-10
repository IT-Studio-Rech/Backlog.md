import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import deBoard from "./locales/de/board.json";
import deCommon from "./locales/de/common.json";
import deDecisions from "./locales/de/decisions.json";
import deDocs from "./locales/de/docs.json";
import deInit from "./locales/de/init.json";
import deMilestones from "./locales/de/milestones.json";
import deNav from "./locales/de/nav.json";
import deSettings from "./locales/de/settings.json";
import deStatistics from "./locales/de/statistics.json";
import deTaskModal from "./locales/de/taskModal.json";
import deTasks from "./locales/de/tasks.json";
import enBoard from "./locales/en/board.json";
import enCommon from "./locales/en/common.json";
import enDecisions from "./locales/en/decisions.json";
import enDocs from "./locales/en/docs.json";
import enInit from "./locales/en/init.json";
import enMilestones from "./locales/en/milestones.json";
import enNav from "./locales/en/nav.json";
import enSettings from "./locales/en/settings.json";
import enStatistics from "./locales/en/statistics.json";
import enTaskModal from "./locales/en/taskModal.json";
import enTasks from "./locales/en/tasks.json";

// German is the primary language; the app must default to German for every
// first-time visitor regardless of browser locale — only an explicit toggle
// (persisted below) switches to English. Read synchronously here (not just in
// LanguageContext) so the very first render already uses the right language,
// with no flash of English before React's effects run.
const getInitialLanguage = (): "de" | "en" => {
	if (typeof window === "undefined") return "de";
	return localStorage.getItem("backlog-language") === "en" ? "en" : "de";
};

i18n.use(initReactI18next).init({
	resources: {
		en: {
			common: enCommon,
			nav: enNav,
			board: enBoard,
			taskModal: enTaskModal,
			tasks: enTasks,
			milestones: enMilestones,
			settings: enSettings,
			statistics: enStatistics,
			docs: enDocs,
			decisions: enDecisions,
			init: enInit,
		},
		de: {
			common: deCommon,
			nav: deNav,
			board: deBoard,
			taskModal: deTaskModal,
			tasks: deTasks,
			milestones: deMilestones,
			settings: deSettings,
			statistics: deStatistics,
			docs: deDocs,
			decisions: deDecisions,
			init: deInit,
		},
	},
	lng: getInitialLanguage(),
	fallbackLng: "de",
	defaultNS: "common",
	ns: [
		"common",
		"nav",
		"board",
		"taskModal",
		"tasks",
		"milestones",
		"settings",
		"statistics",
		"docs",
		"decisions",
		"init",
	],
	interpolation: { escapeValue: false },
});

export default i18n;
