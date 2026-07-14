import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AcceptanceCriterion, Milestone, Task, TaskComment } from "../../types";
import Modal from "./Modal";
import { apiClient } from "../lib/api";
import { useTheme } from "../contexts/ThemeContext";
import MDEditor from "@uiw/react-md-editor";
import AcceptanceCriteriaEditor from "./AcceptanceCriteriaEditor";
import MermaidMarkdown from './MermaidMarkdown';
import ChipInput from "./ChipInput";
import { resolveLabelColor } from "../utils/labelColors";
import DependencyInput from "./DependencyInput";
import { formatStoredUtcDateForDisplay } from "../utils/date-display";
import { useConfirm } from "../hooks/useConfirm";
import Select from "./Select";

interface Props {
  task?: Task; // Optional for create mode
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => Promise<void> | void; // refresh callback
  onSubmit?: (taskData: Partial<Task>) => Promise<void>; // For creating new tasks
  onArchive?: () => void; // For archiving tasks
  availableStatuses?: string[]; // Available statuses for new tasks
  isDraftMode?: boolean; // Whether creating a draft
  availableMilestones?: string[];
  milestoneEntities?: Milestone[];
  archivedMilestoneEntities?: Milestone[];
  definitionOfDoneDefaults?: string[];
  dateFormat?: string;
  labelColors?: Record<string, string>;
  availableAssignees?: string[];
}

type Mode = "preview" | "edit" | "create";

type TaskUpdatePayload = Partial<Task> & {
  definitionOfDoneAdd?: string[];
  definitionOfDoneRemove?: number[];
  definitionOfDoneCheck?: number[];
  definitionOfDoneUncheck?: number[];
  disableDefinitionOfDoneDefaults?: boolean;
  commentsAppend?: string[];
  commentAuthor?: string;
};

type InlineMetaUpdatePayload = Omit<Partial<Task>, "milestone"> & {
  milestone?: string | null;
};

type TaskDetailsFormState = {
  title: string;
  description: string;
  plan: string;
  notes: string;
  displayComments: TaskComment[];
  finalSummary: string;
  criteria: AcceptanceCriterion[];
  definitionOfDone: AcceptanceCriterion[];
  status: string;
  assignee: string[];
  labels: string[];
  priority: string;
  dependencies: string[];
  references: string[];
  milestone: string;
};

const containsCommentDelimiterLine = (value: string): boolean => /^\s*---\s*$/m.test(value.replace(/\r\n/g, "\n"));

const areJsonEqual = (first: unknown, second: unknown): boolean => JSON.stringify(first) === JSON.stringify(second);

const preserveDirtyRefreshValue = <T,>(
  current: T,
  previous: T,
  next: T,
  isEqual: (first: T, second: T) => boolean = Object.is,
): T => (isEqual(current, previous) ? next : current);

const buildTaskDetailsFormState = ({
  task,
  isCreateMode,
  isDraftMode,
  availableStatuses,
  defaultDefinitionOfDone,
}: {
  task?: Task;
  isCreateMode: boolean;
  isDraftMode?: boolean;
  availableStatuses?: string[];
  defaultDefinitionOfDone: AcceptanceCriterion[];
}): TaskDetailsFormState => ({
  title: task?.title || "",
  description: task?.description || "",
  plan: task?.implementationPlan || "",
  notes: task?.implementationNotes || "",
  displayComments: task?.comments ?? [],
  finalSummary: task?.finalSummary || "",
  criteria: task?.acceptanceCriteriaItems || [],
  definitionOfDone: task?.definitionOfDoneItems || (isCreateMode ? defaultDefinitionOfDone : []),
  status: task?.status || (isDraftMode ? "Draft" : (availableStatuses?.[0] || "To Do")),
  assignee: task?.assignee || [],
  labels: task?.labels || [],
  priority: task?.priority || "",
  dependencies: task?.dependencies || [],
  references: task?.references || [],
  milestone: task?.milestone || "",
});

const SectionHeader: React.FC<{ title: string; subtitle?: string; right?: React.ReactNode }> = ({ title, subtitle, right }) => (
  <div className="mb-3">
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 tracking-tight transition-colors duration-200">
        {title}
      </h3>
      {right ? <div className="ml-2 text-xs text-gray-500 dark:text-gray-400">{right}</div> : null}
    </div>
    {subtitle ? (
      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{subtitle}</p>
    ) : null}
  </div>
);

// Compact label+control row for the metadata sidebar - several of these share one
// bordered panel (divide-y) instead of each field getting its own card, so the
// sidebar reads as one property list rather than a stack of boxes.
const MetaRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="px-3 py-2.5">
    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
      {label}
    </label>
    {children}
  </div>
);

// Empty-state text for the markdown tabs, with an inline edit shortcut so
// switching to edit mode doesn't require scrolling back up to the modal header.
const EmptyContentHint: React.FC<{ text: string; editLabel: string; onEdit: () => void; showEdit: boolean }> = ({
  text,
  editLabel,
  onEdit,
  showEdit,
}) => (
  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
    <span>{text}</span>
    {showEdit && (
      <button
        type="button"
        onClick={onEdit}
        aria-label={editLabel}
        data-tooltip-id="app-tooltip"
        data-tooltip-content={editLabel}
        className="p-1 text-gray-400 dark:text-gray-500 hover:text-stone-600 dark:hover:text-stone-400 rounded-md hover:bg-gray-100 dark:hover:bg-white/5 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 dark:focus-visible:ring-stone-400"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
      </button>
    )}
  </div>
);

export const TaskDetailsModal: React.FC<Props> = ({
  task,
  isOpen,
  onClose,
  onSaved,
  onSubmit,
  onArchive,
  availableStatuses,
  availableMilestones: _availableMilestones,
  milestoneEntities,
  archivedMilestoneEntities,
  isDraftMode,
  definitionOfDoneDefaults,
  dateFormat,
  labelColors,
  availableAssignees,
}) => {
  const { theme } = useTheme();
  const { t } = useTranslation(["taskModal", "common"]);
  const { confirm, confirmDialog } = useConfirm();
  const isCreateMode = !task;
  const isFromOtherBranch = Boolean(task?.branch);
  const [mode, setMode] = useState<Mode>(isCreateMode ? "create" : "preview");
  const modeRef = useRef(mode);
  const previousTaskId = useRef(task?.id ?? "");
  const previousIsOpen = useRef(isOpen);
  const formBaselineRef = useRef<TaskDetailsFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Title field for create mode
  const [title, setTitle] = useState(task?.title || "");

  // Editable fields (edit mode)
  const [description, setDescription] = useState(task?.description || "");
  const [plan, setPlan] = useState(task?.implementationPlan || "");
  const [notes, setNotes] = useState(task?.implementationNotes || "");
  const [displayComments, setDisplayComments] = useState<TaskComment[]>(task?.comments ?? []);
  const [commentBody, setCommentBody] = useState("");
  const [commentAuthor, setCommentAuthor] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const [commentsChanged, setCommentsChanged] = useState(false);
  const preserveEditModeAfterCommentRefresh = useRef(false);
  const [finalSummary, setFinalSummary] = useState(task?.finalSummary || "");
  // Description/Plan/Notes/Final Summary share one tabbed card instead of stacking
  // four separate scroll-heavy sections - reset to the first tab per task.
  type ContentTab = "description" | "plan" | "notes" | "finalSummary";
  const [contentTab, setContentTab] = useState<ContentTab>("description");
  useEffect(() => {
    setContentTab("description");
  }, [task?.id]);
  // Milestone/Dependencies are edited rarely - collapse them behind a "show more"
  // toggle when both are empty, but never hide them once either has a value.
  const [planningExpanded, setPlanningExpanded] = useState(false);
  // Acceptance Criteria / Definition of Done share one tabbed card, same pattern
  // as the Description/Plan/Notes/Summary tabs above.
  const [checklistTab, setChecklistTab] = useState<"criteria" | "definitionOfDone">("criteria");
  useEffect(() => {
    setChecklistTab("criteria");
  }, [task?.id]);
  // Set by the tab's "+" shortcut so the editor that mounts right after
  // switching to edit mode scrolls to and focuses its "add new" row.
  const [autoFocusNewChecklistItem, setAutoFocusNewChecklistItem] = useState(false);
  const [criteria, setCriteria] = useState<AcceptanceCriterion[]>(task?.acceptanceCriteriaItems || []);
  const defaultDefinitionOfDone = useMemo(
    () => (definitionOfDoneDefaults ?? []).map((text, index) => ({ index: index + 1, text, checked: false })),
    [definitionOfDoneDefaults],
  );
  const initialDefinitionOfDone = task?.definitionOfDoneItems ?? (isCreateMode ? defaultDefinitionOfDone : []);
  const [definitionOfDone, setDefinitionOfDone] = useState<AcceptanceCriterion[]>(initialDefinitionOfDone);
  const resolveMilestoneToId = useCallback((value?: string | null): string => {
    const normalized = (value ?? "").trim();
    if (!normalized) return "";
    const key = normalized.toLowerCase();
    const aliasKeys = new Set<string>([key]);
    const looksLikeMilestoneId = /^\d+$/.test(normalized) || /^m-\d+$/i.test(normalized);
    const canonicalInputId = looksLikeMilestoneId
      ? `m-${String(Number.parseInt(normalized.replace(/^m-/i, ""), 10))}`
      : null;
    if (/^\d+$/.test(normalized)) {
      const numericAlias = String(Number.parseInt(normalized, 10));
      aliasKeys.add(numericAlias);
      aliasKeys.add(`m-${numericAlias}`);
    } else {
      const idMatch = normalized.match(/^m-(\d+)$/i);
      if (idMatch?.[1]) {
        const numericAlias = String(Number.parseInt(idMatch[1], 10));
        aliasKeys.add(numericAlias);
        aliasKeys.add(`m-${numericAlias}`);
      }
    }
    const idMatchesAlias = (milestoneId: string): boolean => {
      const milestoneKey = milestoneId.trim().toLowerCase();
      if (aliasKeys.has(milestoneKey)) {
        return true;
      }
      const idMatch = milestoneId.trim().match(/^m-(\d+)$/i);
      if (!idMatch?.[1]) {
        return false;
      }
      const numericAlias = String(Number.parseInt(idMatch[1], 10));
      return aliasKeys.has(numericAlias) || aliasKeys.has(`m-${numericAlias}`);
    };
    const findIdMatch = (milestones: Milestone[]): Milestone | undefined => {
      const rawExactMatch = milestones.find((milestone) => milestone.id.trim().toLowerCase() === key);
      if (rawExactMatch) {
        return rawExactMatch;
      }
      if (canonicalInputId) {
        const canonicalRawMatch = milestones.find(
          (milestone) => milestone.id.trim().toLowerCase() === canonicalInputId,
        );
        if (canonicalRawMatch) {
          return canonicalRawMatch;
        }
      }
      return milestones.find((milestone) => idMatchesAlias(milestone.id));
    };
    const activeMilestones = milestoneEntities ?? [];
    const archivedMilestones = archivedMilestoneEntities ?? [];
    const activeIdMatch = findIdMatch(activeMilestones);
    if (activeIdMatch) {
      return activeIdMatch.id;
    }
    if (looksLikeMilestoneId) {
      const archivedIdMatch = findIdMatch(archivedMilestones);
      if (archivedIdMatch) {
        return archivedIdMatch.id;
      }
    }
    const activeTitleMatches = activeMilestones.filter((milestone) => milestone.title.trim().toLowerCase() === key);
    if (activeTitleMatches.length === 1) {
      return activeTitleMatches[0]?.id ?? normalized;
    }
    if (activeTitleMatches.length > 1) {
      return normalized;
    }
    const archivedIdMatch = findIdMatch(archivedMilestones);
    if (archivedIdMatch) {
      return archivedIdMatch.id;
    }
    const archivedTitleMatches = archivedMilestones.filter((milestone) => milestone.title.trim().toLowerCase() === key);
    if (archivedTitleMatches.length === 1) {
      return archivedTitleMatches[0]?.id ?? normalized;
    }
    return normalized;
  }, [milestoneEntities, archivedMilestoneEntities]);
  const resolveMilestoneLabel = useCallback((value?: string | null): string => {
    const normalized = (value ?? "").trim();
    if (!normalized) return "";
    const key = normalized.toLowerCase();
    const aliasKeys = new Set<string>([key]);
    const canonicalInputId =
      /^\d+$/.test(normalized) || /^m-\d+$/i.test(normalized)
        ? `m-${String(Number.parseInt(normalized.replace(/^m-/i, ""), 10))}`
        : null;
    if (/^\d+$/.test(normalized)) {
      const numericAlias = String(Number.parseInt(normalized, 10));
      aliasKeys.add(numericAlias);
      aliasKeys.add(`m-${numericAlias}`);
    } else {
      const idMatch = normalized.match(/^m-(\d+)$/i);
      if (idMatch?.[1]) {
        const numericAlias = String(Number.parseInt(idMatch[1], 10));
        aliasKeys.add(numericAlias);
        aliasKeys.add(`m-${numericAlias}`);
      }
    }
    const idMatchesAlias = (milestoneId: string): boolean => {
      const milestoneKey = milestoneId.trim().toLowerCase();
      if (aliasKeys.has(milestoneKey)) {
        return true;
      }
      const idMatch = milestoneId.trim().match(/^m-(\d+)$/i);
      if (!idMatch?.[1]) {
        return false;
      }
      const numericAlias = String(Number.parseInt(idMatch[1], 10));
      return aliasKeys.has(numericAlias) || aliasKeys.has(`m-${numericAlias}`);
    };
    const findIdMatch = (milestones: Milestone[]): Milestone | undefined => {
      const rawExactMatch = milestones.find((milestone) => milestone.id.trim().toLowerCase() === key);
      if (rawExactMatch) {
        return rawExactMatch;
      }
      if (canonicalInputId) {
        const canonicalRawMatch = milestones.find(
          (milestone) => milestone.id.trim().toLowerCase() === canonicalInputId,
        );
        if (canonicalRawMatch) {
          return canonicalRawMatch;
        }
      }
      return milestones.find((milestone) => idMatchesAlias(milestone.id));
    };
    const allMilestones = [...(milestoneEntities ?? []), ...(archivedMilestoneEntities ?? [])];
    const idMatch = findIdMatch(allMilestones);
    if (idMatch) {
      return idMatch.title;
    }
    const titleMatches = allMilestones.filter((milestone) => milestone.title.trim().toLowerCase() === key);
    return titleMatches.length === 1 ? (titleMatches[0]?.title ?? normalized) : normalized;
  }, [milestoneEntities, archivedMilestoneEntities]);

  // Sidebar metadata (inline edit)
  const [status, setStatus] = useState(task?.status || (isDraftMode ? "Draft" : (availableStatuses?.[0] || "To Do")));
  const [assignee, setAssignee] = useState<string[]>(task?.assignee || []);
  const [labels, setLabels] = useState<string[]>(task?.labels || []);
  const [priority, setPriority] = useState<string>(task?.priority || "");
  const [dependencies, setDependencies] = useState<string[]>(task?.dependencies || []);
  const [references, setReferences] = useState<string[]>(task?.references || []);
  const [milestone, setMilestone] = useState<string>(task?.milestone || "");
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  const milestoneSelectionValue = resolveMilestoneToId(milestone);
  const hasMilestoneSelection = (milestoneEntities ?? []).some((milestoneEntity) => milestoneEntity.id === milestoneSelectionValue);

  // Keep a baseline for dirty-check
  const baseline = useMemo(() => ({
    title: task?.title || "",
    description: task?.description || "",
    plan: task?.implementationPlan || "",
    notes: task?.implementationNotes || "",
    finalSummary: task?.finalSummary || "",
    criteria: JSON.stringify(task?.acceptanceCriteriaItems || []),
    definitionOfDone: JSON.stringify(task?.definitionOfDoneItems || (isCreateMode ? defaultDefinitionOfDone : [])),
  }), [task, defaultDefinitionOfDone, isCreateMode]);

  const isDirty = useMemo(() => {
    return (
      title !== baseline.title ||
      description !== baseline.description ||
      plan !== baseline.plan ||
      notes !== baseline.notes ||
      finalSummary !== baseline.finalSummary ||
      JSON.stringify(criteria) !== baseline.criteria ||
      JSON.stringify(definitionOfDone) !== baseline.definitionOfDone
    );
  }, [title, description, plan, notes, finalSummary, criteria, definitionOfDone, baseline]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Intercept Escape to cancel edit (not close modal) when in edit mode
  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      if (mode === "edit" && (e.key === "Escape")) {
        e.preventDefault();
        e.stopPropagation();
        handleCancelEdit();
      }
      if (mode === "edit" && ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s")) {
        e.preventDefault();
        e.stopPropagation();
        void handleSave();
      }
      if (mode === "preview" && !isTypingTarget(e.target) && (e.key.toLowerCase() === "e") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        setMode("edit");
      }
      if (mode === "preview" && !isTypingTarget(e.target) && isDoneStatus && (e.key.toLowerCase() === "c") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        void handleComplete();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true } as any);
  }, [mode, title, description, plan, notes, finalSummary, criteria, definitionOfDone, status]);

  // Reset local state when task changes or modal opens
  useEffect(() => {
    const nextTaskId = task?.id ?? "";
    const nextFormState = buildTaskDetailsFormState({
      task,
      isCreateMode,
      isDraftMode,
      availableStatuses,
      defaultDefinitionOfDone,
    });
    const previousFormState = formBaselineRef.current;
    const sameOpenModalRefresh =
      Boolean(previousFormState) && isOpen && previousIsOpen.current && previousTaskId.current === nextTaskId;
    const shouldPreserveEditMode =
      !isCreateMode &&
      sameOpenModalRefresh &&
      (modeRef.current === "edit" || preserveEditModeAfterCommentRefresh.current);

    if (sameOpenModalRefresh && previousFormState) {
      setTitle((current) => preserveDirtyRefreshValue(current, previousFormState.title, nextFormState.title));
      setDescription((current) =>
        preserveDirtyRefreshValue(current, previousFormState.description, nextFormState.description),
      );
      setPlan((current) => preserveDirtyRefreshValue(current, previousFormState.plan, nextFormState.plan));
      setNotes((current) => preserveDirtyRefreshValue(current, previousFormState.notes, nextFormState.notes));
      setDisplayComments(nextFormState.displayComments);
      setCommentSaving(false);
      setCommentsChanged(false);
      setFinalSummary((current) =>
        preserveDirtyRefreshValue(current, previousFormState.finalSummary, nextFormState.finalSummary),
      );
      setCriteria((current) =>
        preserveDirtyRefreshValue(current, previousFormState.criteria, nextFormState.criteria, areJsonEqual),
      );
      setDefinitionOfDone((current) =>
        preserveDirtyRefreshValue(
          current,
          previousFormState.definitionOfDone,
          nextFormState.definitionOfDone,
          areJsonEqual,
        ),
      );
      setStatus((current) => preserveDirtyRefreshValue(current, previousFormState.status, nextFormState.status));
      setAssignee((current) =>
        preserveDirtyRefreshValue(current, previousFormState.assignee, nextFormState.assignee, areJsonEqual),
      );
      setLabels((current) =>
        preserveDirtyRefreshValue(current, previousFormState.labels, nextFormState.labels, areJsonEqual),
      );
      setPriority((current) => preserveDirtyRefreshValue(current, previousFormState.priority, nextFormState.priority));
      setDependencies((current) =>
        preserveDirtyRefreshValue(current, previousFormState.dependencies, nextFormState.dependencies, areJsonEqual),
      );
      setReferences((current) =>
        preserveDirtyRefreshValue(current, previousFormState.references, nextFormState.references, areJsonEqual),
      );
      setMilestone((current) =>
        preserveDirtyRefreshValue(current, previousFormState.milestone, nextFormState.milestone),
      );
      setMode(shouldPreserveEditMode ? "edit" : isCreateMode ? "create" : modeRef.current);
      preserveEditModeAfterCommentRefresh.current = false;
      previousTaskId.current = nextTaskId;
      previousIsOpen.current = isOpen;
      formBaselineRef.current = nextFormState;
      setError(null);
      apiClient.fetchTasks().then(setAvailableTasks).catch(() => setAvailableTasks([]));
      return;
    }

    setTitle(nextFormState.title);
    setDescription(nextFormState.description);
    setPlan(nextFormState.plan);
    setNotes(nextFormState.notes);
    setDisplayComments(nextFormState.displayComments);
    setCommentBody("");
    setCommentAuthor("");
    setCommentSaving(false);
    setCommentsChanged(false);
    setFinalSummary(nextFormState.finalSummary);
    setCriteria(nextFormState.criteria);
    setDefinitionOfDone(nextFormState.definitionOfDone);
    setStatus(nextFormState.status);
    setAssignee(nextFormState.assignee);
    setLabels(nextFormState.labels);
    setPriority(nextFormState.priority);
    setDependencies(nextFormState.dependencies);
    setReferences(nextFormState.references);
    setMilestone(nextFormState.milestone);
    setMode(isCreateMode ? "create" : "preview");
    preserveEditModeAfterCommentRefresh.current = false;
    previousTaskId.current = nextTaskId;
    previousIsOpen.current = isOpen;
    formBaselineRef.current = nextFormState;
    setError(null);
    // Preload tasks for dependency picker
    apiClient.fetchTasks().then(setAvailableTasks).catch(() => setAvailableTasks([]));
  }, [task, isOpen, isCreateMode, isDraftMode, availableStatuses, defaultDefinitionOfDone]);

  const refreshAfterCommentChange = useCallback(() => {
    if (!commentsChanged) return;
    setCommentsChanged(false);
    if (onSaved) void onSaved();
  }, [commentsChanged, onSaved]);

  const handleCancelEdit = async () => {
    if (isDirty) {
      const confirmDiscard = await confirm({ message: t("taskModal:discardUnsavedChanges"), tone: "danger" });
      if (!confirmDiscard) return;
    }
    if (isCreateMode) {
      // In create mode, close the modal on cancel
      onClose();
    } else {
      setTitle(task?.title || "");
      setDescription(task?.description || "");
      setPlan(task?.implementationPlan || "");
      setNotes(task?.implementationNotes || "");
      setCommentBody("");
      setCommentAuthor("");
      setFinalSummary(task?.finalSummary || "");
      setCriteria(task?.acceptanceCriteriaItems || []);
      setDefinitionOfDone(task?.definitionOfDoneItems || []);
      setMode("preview");
      refreshAfterCommentChange();
    }
  };

  const normalizeChecklistItems = (items: AcceptanceCriterion[]): AcceptanceCriterion[] => {
    return items
      .map((item) => ({ ...item, text: item.text.trim() }))
      .filter((item) => item.text.length > 0);
  };

  const buildDefinitionOfDoneCreatePayload = (): TaskUpdatePayload => {
    const cleanedCurrent = normalizeChecklistItems(definitionOfDone);
    const defaults = (definitionOfDoneDefaults ?? []).map((item) => item.trim()).filter((item) => item.length > 0);
    const defaultItems = defaults.map((text, index) => ({ index: index + 1, text, checked: false }));
    const defaultsMatch =
      cleanedCurrent.length >= defaultItems.length &&
      defaultItems.every(
        (item, index) =>
          cleanedCurrent[index]?.text === item.text && cleanedCurrent[index]?.checked === false,
      );

    const disableDefaults = !defaultsMatch;
    const definitionOfDoneAdd = disableDefaults
      ? cleanedCurrent.map((item) => item.text)
      : cleanedCurrent.slice(defaultItems.length).map((item) => item.text);

    const payload: TaskUpdatePayload = {};
    if (definitionOfDoneAdd.length > 0) {
      payload.definitionOfDoneAdd = definitionOfDoneAdd;
    }
    if (disableDefaults) {
      payload.disableDefinitionOfDoneDefaults = true;
    }
    return payload;
  };

  const buildDefinitionOfDoneEditPayload = (): TaskUpdatePayload => {
    const original = task?.definitionOfDoneItems ?? [];
    const cleanedCurrent = normalizeChecklistItems(definitionOfDone);
    const originalByIndex = new Map(original.map((item) => [item.index, item]));
    const currentByIndex = new Map(cleanedCurrent.map((item) => [item.index, item]));
    const removals = new Set<number>();
    const additions: string[] = [];
    const checks: number[] = [];
    const unchecks: number[] = [];

    let nextIndex = original.reduce((max, item) => Math.max(max, item.index), 0);

    for (const item of cleanedCurrent) {
      const originalItem = originalByIndex.get(item.index);
      if (!originalItem) {
        additions.push(item.text);
        nextIndex += 1;
        if (item.checked) {
          checks.push(nextIndex);
        }
        continue;
      }
      if (originalItem.text !== item.text) {
        removals.add(item.index);
        additions.push(item.text);
        nextIndex += 1;
        if (item.checked) {
          checks.push(nextIndex);
        }
        continue;
      }
      if (originalItem.checked !== item.checked) {
        if (item.checked) {
          checks.push(item.index);
        } else {
          unchecks.push(item.index);
        }
      }
    }

    for (const originalItem of original) {
      if (!currentByIndex.has(originalItem.index)) {
        removals.add(originalItem.index);
      }
    }

    const payload: TaskUpdatePayload = {};
    if (additions.length > 0) {
      payload.definitionOfDoneAdd = additions;
    }
    if (removals.size > 0) {
      payload.definitionOfDoneRemove = Array.from(removals);
    }
    if (checks.length > 0) {
      payload.definitionOfDoneCheck = checks;
    }
    if (unchecks.length > 0) {
      payload.definitionOfDoneUncheck = unchecks;
    }
    return payload;
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    // Validation for create mode
    if (isCreateMode && !title.trim()) {
      setError(t("taskModal:titleRequired"));
      setSaving(false);
      return;
    }

    try {
      const taskData: TaskUpdatePayload = {
        title: title.trim(),
        description,
        implementationPlan: plan,
        implementationNotes: notes,
        finalSummary,
        acceptanceCriteriaItems: criteria,
        status,
        assignee,
        labels,
        priority: (priority === "" ? undefined : priority) as "high" | "medium" | "low" | undefined,
        dependencies,
        milestone: milestone.trim().length > 0 ? milestone.trim() : undefined,
      };

      if (isCreateMode && onSubmit) {
        Object.assign(taskData, buildDefinitionOfDoneCreatePayload());
        // Create new task
        await onSubmit(taskData);
        // Only close if successful (no error thrown)
        onClose();
      } else if (task) {
        Object.assign(taskData, buildDefinitionOfDoneEditPayload());
        // Update existing task
        await apiClient.updateTask(task.id, taskData);
        setMode("preview");
        if (onSaved) await onSaved();
        setCommentsChanged(false);
      }
    } catch (err) {
      // Extract and display the error message from API response
      let errorMessage = t('taskModal:failedToSaveTask');

      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'object' && err !== null && 'error' in err) {
        errorMessage = String((err as any).error);
      } else if (typeof err === 'string') {
        errorMessage = err;
      }

      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleCriterion = async (index: number, checked: boolean) => {
    if (!task) return; // Can't toggle in create mode
    if (isFromOtherBranch) return; // Can't toggle for cross-branch tasks
    // Optimistic update
    const next = (criteria || []).map((c) => (c.index === index ? { ...c, checked } : c));
    setCriteria(next);
    try {
      await apiClient.updateTask(task.id, { acceptanceCriteriaItems: next });
      if (onSaved) await onSaved();
    } catch (err) {
      // rollback
      setCriteria(criteria);
      console.error("Failed to update criterion", err);
    }
  };

  const handleToggleDefinitionOfDone = async (index: number, checked: boolean) => {
    if (!task) return; // Can't toggle in create mode
    if (isFromOtherBranch) return; // Can't toggle for cross-branch tasks
    const next = (definitionOfDone || []).map((c) => (c.index === index ? { ...c, checked } : c));
    setDefinitionOfDone(next);
    try {
      const updates: TaskUpdatePayload = checked
        ? { definitionOfDoneCheck: [index] }
        : { definitionOfDoneUncheck: [index] };
      await apiClient.updateTask(task.id, updates);
      if (onSaved) await onSaved();
    } catch (err) {
      setDefinitionOfDone(definitionOfDone);
      console.error("Failed to update Definition of Done item", err);
    }
  };

  const handleInlineMetaUpdate = async (updates: InlineMetaUpdatePayload) => {
    // Don't allow updates for cross-branch tasks
    if (isFromOtherBranch) return;

    // Optimistic UI
    if (updates.status !== undefined) setStatus(String(updates.status));
    if (updates.assignee !== undefined) setAssignee(updates.assignee as string[]);
    if (updates.labels !== undefined) setLabels(updates.labels as string[]);
    if (updates.priority !== undefined) setPriority(String(updates.priority));
    if (updates.dependencies !== undefined) setDependencies(updates.dependencies as string[]);
    if (updates.references !== undefined) setReferences(updates.references as string[]);
    if (updates.milestone !== undefined) setMilestone((updates.milestone ?? "") as string);

    // Only update server if editing existing task
    if (task) {
      try {
        await apiClient.updateTask(task.id, updates);
        if (onSaved) await onSaved();
      } catch (err) {
        console.error("Failed to update task metadata", err);
        // No rollback for simplicity; caller can refresh
      }
    }
  };

  const handleAddComment = async () => {
    if (!task || isFromOtherBranch) return;
    const body = commentBody.trim();
    if (!body) return;
    const author = commentAuthor.trim();
    if (containsCommentDelimiterLine(body)) {
      setError("Comment body cannot contain standalone '---' delimiter lines.");
      return;
    }
    if (author && containsCommentDelimiterLine(author)) {
      setError("Comment author cannot contain standalone '---' delimiter lines.");
      return;
    }
    setCommentSaving(true);
    setError(null);
    preserveEditModeAfterCommentRefresh.current = true;
    try {
      const updatedTask = await apiClient.updateTask(task.id, {
        commentsAppend: [body],
        ...(author.length > 0 && { commentAuthor: author }),
      });
      setDisplayComments(updatedTask.comments ?? []);
      setCommentsChanged(true);
      setCommentBody("");
      setCommentAuthor("");
    } catch (err) {
      preserveEditModeAfterCommentRefresh.current = false;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCommentSaving(false);
    }
  };

  // labels handled via ChipInput; no textarea parsing

	const handleComplete = async () => {
		if (!task || completing) return;
		if (!(await confirm({ message: t("taskModal:completeConfirm") }))) return;
		setCompleting(true);
		try {
			await apiClient.completeTask(task.id);
			if (onSaved) await onSaved();
			onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCompleting(false);
    }
  };

  const handleArchive = async () => {
    if (!task || !onArchive || archiving) return;
    if (!(await confirm({ message: t("taskModal:archiveConfirm", { title: task.title }), tone: "danger" }))) return;
    setArchiving(true);
    onArchive();
    onClose();
  };

  const checkedCount = (criteria || []).filter((c) => c.checked).length;
  const totalCount = (criteria || []).length;
  const definitionCheckedCount = (definitionOfDone || []).filter((c) => c.checked).length;
  const definitionTotalCount = (definitionOfDone || []).length;
  const isDoneStatus = (status || "").toLowerCase().includes("done");
  const comments = displayComments;

  const displayId = task?.id ?? "";
  const documentation = task?.documentation ?? [];

  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={async () => {
        // When in edit mode, confirm closing if dirty
        if (mode === "edit" && isDirty) {
          if (!(await confirm({ message: t("taskModal:discardUnsavedChangesAndClose"), tone: "danger" }))) return;
        }
        refreshAfterCommentChange();
        onClose();
      }}
      title={isCreateMode ? (isDraftMode ? t("taskModal:createNewDraft") : t("taskModal:createNewTask")) : `${displayId} — ${task.title}`}
      maxWidthClass={isCreateMode ? "max-w-2xl" : "max-w-5xl"}
      disableEscapeClose={mode === "edit" || mode === "create"}
      showCloseButton={mode === "preview"}
      actions={
        <div className="flex items-center gap-2">
		          {mode === "preview" && !isCreateMode && !isFromOtherBranch && task && onArchive && (
		            <button
		              onClick={handleArchive}
		              disabled={archiving}
		              className="inline-flex items-center px-3 py-2 mr-2 border border-transparent rounded-lg text-sm font-medium text-white bg-red-500 dark:bg-red-600 hover:bg-red-600 dark:hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition-colors duration-200 disabled:opacity-50"
		              data-tooltip-id="app-tooltip"
		              data-tooltip-content={t("taskModal:archiveTask")}
		            >
		              {archiving ? (
		                <svg className="animate-spin w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" aria-hidden="true">
		                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
		                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
		                </svg>
		              ) : (
		                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
		                </svg>
		              )}
		              {t("taskModal:archiveTask")}
		            </button>
		          )}
		          {isDoneStatus && mode === "preview" && !isCreateMode && !isFromOtherBranch && (
		            <button
		              onClick={handleComplete}
		              disabled={completing}
		              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 dark:bg-emerald-700 hover:bg-emerald-700 dark:hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition-colors duration-200 disabled:opacity-50"
		              data-tooltip-id="app-tooltip"
		              data-tooltip-content={t("taskModal:markAsCompletedTooltip")}
		            >
		              {completing ? (
		                <svg className="animate-spin w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" aria-hidden="true">
		                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
		                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
		                </svg>
		              ) : (
		                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
		                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
		                </svg>
		              )}
		              {t("taskModal:markAsCompleted")}
		            </button>
		          )}
		          {mode === "preview" && !isCreateMode && !isFromOtherBranch ? (
		            <button
		              onClick={() => setMode("edit")}
		              aria-label={t("taskModal:edit")}
		              className={`inline-flex items-center border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition-colors duration-200 ${
		                isDoneStatus ? 'p-2' : 'gap-2 px-4 py-2'
		              }`}
		              data-tooltip-id="app-tooltip"
		              data-tooltip-content={t("taskModal:edit")}
		            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              {!isDoneStatus && t("taskModal:edit")}
            </button>
          ) : (mode === "edit" || mode === "create") ? (
            <div className="flex items-center gap-2">
		              <button
		                onClick={handleCancelEdit}
		                className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition-colors duration-200"
		                data-tooltip-id="app-tooltip"
		                data-tooltip-content={t("common:cancel")}
		              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                {t("common:cancel")}
              </button>
		              <button
		                onClick={() => void handleSave()}
		                disabled={saving}
		                className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition-colors duration-200 disabled:opacity-50"
		                data-tooltip-id="app-tooltip"
		                data-tooltip-content={t("common:save")}
		              >
                {saving ? (
                  <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {saving ? t("common:saving") : (isCreateMode ? t("common:create") : t("common:save"))}
              </button>
            </div>
          ) : null}
        </div>
      }
    >
      {error && (
        <div className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</div>
      )}

      {/* Cross-branch task indicator */}
      {isFromOtherBranch && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg text-amber-800 dark:text-amber-200">
          <svg className="w-5 h-5 flex-shrink-0 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <div className="flex-1">
            <span className="font-medium">{t("taskModal:readOnlyLabel")}</span> {t("taskModal:readOnlyBranchNotice", { branch: task?.branch })}
          </div>
        </div>
      )}

      {isCreateMode && (
        <div className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-900 dark:text-gray-100">{t("taskModal:fields.title")}</label>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("taskModal:fields.titlePlaceholder")}
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-colors duration-200"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-900 dark:text-gray-100">{t("taskModal:fields.description")}</label>
            <div className="border border-gray-200 dark:border-gray-700 rounded-md">
              <MDEditor
                value={description}
                onChange={(val) => setDescription(val || "")}
                preview="edit"
                height={160}
                data-color-mode={theme}
                textareaProps={{ placeholder: t("taskModal:fields.descriptionPlaceholder") }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-900 dark:text-gray-100">{t("taskModal:fields.status")}</label>
              <StatusSelect current={status} onChange={(val) => handleInlineMetaUpdate({ status: val })} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-900 dark:text-gray-100">{t("taskModal:fields.priority")}</label>
              <Select
                uiSize="md"
                value={priority}
                onChange={(e) => handleInlineMetaUpdate({ priority: e.target.value as any })}
              >
                <option value="">{t("common:priority.none")}</option>
                <option value="low">{t("common:priority.low")}</option>
                <option value="medium">{t("common:priority.medium")}</option>
                <option value="high">{t("common:priority.high")}</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-900 dark:text-gray-100">{t("taskModal:fields.labels")}</label>
              <ChipInput
                name="labels"
                label=""
                value={labels}
                onChange={(value) => handleInlineMetaUpdate({ labels: value })}
                placeholder={t("taskModal:fields.labelsPlaceholderShort")}
                chipColor={(l) => resolveLabelColor(l, labelColors)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-900 dark:text-gray-100">{t("taskModal:fields.assignee")}</label>
              <ChipInput
                name="assignee"
                label=""
                value={assignee}
                onChange={(value) => handleInlineMetaUpdate({ assignee: value })}
                placeholder={t("taskModal:fields.assigneePlaceholderShort")}
                suggestions={availableAssignees}
              />
            </div>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t("taskModal:createModeHint")}
          </p>
        </div>
      )}

      {!isCreateMode && (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="md:col-span-2 space-y-6">
          {/* Description / Plan / Notes / Final Summary share one tabbed card instead
              of stacking four scroll-heavy markdown sections */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
            <div className="grid grid-cols-4 px-3 pt-2 border-b border-gray-200 dark:border-gray-700">
              {([
                { key: "description" as const, label: t("taskModal:fields.description") },
                { key: "plan" as const, label: t("taskModal:implementationPlan") },
                { key: "notes" as const, label: t("taskModal:implementationNotes") },
                { key: "finalSummary" as const, label: t("taskModal:finalSummaryTab") },
              ]).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setContentTab(tab.key)}
                  className={`px-2 py-2 text-sm font-medium text-center truncate border-b-2 -mb-px transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 dark:focus-visible:ring-stone-400 rounded-t-md ${
                    contentTab === tab.key
                      ? "border-stone-500 dark:border-stone-400 text-gray-900 dark:text-gray-100"
                      : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="p-4">
              {contentTab === "description" && (
                mode === "preview" ? (
                  description ? (
                    <div className="prose prose-sm !max-w-none wmde-markdown" data-color-mode={theme}>
                      <MermaidMarkdown source={description} />
                    </div>
                  ) : (
                    <EmptyContentHint
                      text={t("taskModal:noDescription")}
                      editLabel={t("taskModal:edit")}
                      onEdit={() => setMode("edit")}
                      showEdit={!isFromOtherBranch}
                    />
                  )
                ) : (
                  <div className="rounded-md overflow-hidden">
                    <MDEditor
                      value={description}
                      onChange={(val) => setDescription(val || "")}
                      preview="edit"
                      height={320}
                      data-color-mode={theme}
                    />
                  </div>
                )
              )}
              {contentTab === "plan" && (
                mode === "preview" ? (
                  plan ? (
                    <div className="prose prose-sm !max-w-none wmde-markdown" data-color-mode={theme}>
                      <MermaidMarkdown source={plan} />
                    </div>
                  ) : (
                    <EmptyContentHint
                      text={t("taskModal:noPlan")}
                      editLabel={t("taskModal:edit")}
                      onEdit={() => setMode("edit")}
                      showEdit={!isFromOtherBranch}
                    />
                  )
                ) : (
                  <div className="rounded-md overflow-hidden">
                    <MDEditor
                      value={plan}
                      onChange={(val) => setPlan(val || "")}
                      preview="edit"
                      height={280}
                      data-color-mode={theme}
                    />
                  </div>
                )
              )}
              {contentTab === "notes" && (
                mode === "preview" ? (
                  notes ? (
                    <div className="prose prose-sm !max-w-none wmde-markdown" data-color-mode={theme}>
                      <MermaidMarkdown source={notes} />
                    </div>
                  ) : (
                    <EmptyContentHint
                      text={t("taskModal:noNotes")}
                      editLabel={t("taskModal:edit")}
                      onEdit={() => setMode("edit")}
                      showEdit={!isFromOtherBranch}
                    />
                  )
                ) : (
                  <div className="rounded-md overflow-hidden">
                    <MDEditor
                      value={notes}
                      onChange={(val) => setNotes(val || "")}
                      preview="edit"
                      height={280}
                      data-color-mode={theme}
                    />
                  </div>
                )
              )}
              {contentTab === "finalSummary" && (
                mode === "preview" ? (
                  finalSummary ? (
                    <div className="prose prose-sm !max-w-none wmde-markdown" data-color-mode={theme}>
                      <MermaidMarkdown source={finalSummary} />
                    </div>
                  ) : (
                    <EmptyContentHint
                      text={t("taskModal:noFinalSummary")}
                      editLabel={t("taskModal:edit")}
                      onEdit={() => setMode("edit")}
                      showEdit={!isFromOtherBranch}
                    />
                  )
                ) : (
                  <div className="rounded-md overflow-hidden">
                    <MDEditor
                      value={finalSummary}
                      onChange={(val) => setFinalSummary(val || "")}
                      preview="edit"
                      height={220}
                      data-color-mode={theme}
                      textareaProps={{
                        placeholder: t("taskModal:finalSummaryPlaceholder"),
                      }}
                    />
                  </div>
                )
              )}
            </div>
          </div>

          {/* References - collapsed when empty in preview, same pattern as Final Summary below */}
          {(mode !== "preview" || references.length > 0) && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <SectionHeader title={t("taskModal:references")} />
            <div className="space-y-3">
              {references.length > 0 ? (
                <ul className="space-y-2">
                  {references.map((ref, idx) => (
                    <li key={idx} className="flex items-center gap-3 group">
                      <span className="flex-1 min-w-0">
                        {ref.startsWith("http://") || ref.startsWith("https://") ? (
                          <a
                            href={ref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline break-all"
                          >
                            {ref}
                          </a>
                        ) : (
                          <code className="text-sm font-mono text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded break-all">
                            {ref}
                          </code>
                        )}
                      </span>
                      {!isFromOtherBranch && (
                        <button
                          onClick={() => {
                            const newRefs = references.filter((_, i) => i !== idx);
                            handleInlineMetaUpdate({ references: newRefs });
                          }}
                          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-gray-400 hover:text-red-500 transition-all flex-shrink-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 dark:focus-visible:ring-stone-400"
                          data-tooltip-id="app-tooltip"
                          data-tooltip-content={t("taskModal:removeReference")}
                          aria-label={t("taskModal:removeReference")}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">{t("taskModal:noReferences")}</p>
              )}
              {mode === "preview" && !isFromOtherBranch && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const input = e.currentTarget.elements.namedItem("newRef") as HTMLInputElement;
                    const value = input.value.trim();
                    if (value && !references.includes(value)) {
                      handleInlineMetaUpdate({ references: [...references, value] });
                      input.value = "";
                    }
                  }}
                  className="flex gap-2"
                >
                  <input
                    name="newRef"
                    type="text"
                    placeholder={t("taskModal:referencePlaceholder")}
                    className="flex-1 text-sm px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                  >
                    {t("taskModal:add")}
                  </button>
                </form>
              )}
            </div>
          </div>
          )}

          {/* Documentation */}
          {documentation.length > 0 && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <SectionHeader title={t("taskModal:documentation")} />
              <div className="space-y-2">
                <ul className="space-y-2">
                  {documentation.map((doc, idx) => (
                    <li key={idx} className="flex items-center gap-3">
                      <span className="flex-1 min-w-0">
                        {doc.startsWith("http://") || doc.startsWith("https://") ? (
                          <a
                            href={doc}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline break-all"
                          >
                            {doc}
                          </a>
                        ) : (
                          <code className="text-sm font-mono text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded break-all">
                            {doc}
                          </code>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Acceptance Criteria / Definition of Done share one tabbed card - both
              are core checklists, tabs keep both reachable without doubling
              vertical space (same pattern as the markdown tabs above) */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
            <div className="grid grid-cols-2 px-3 pt-2 border-b border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setChecklistTab("criteria")}
                className={`px-2 py-2 text-sm font-medium text-center truncate border-b-2 -mb-px transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 dark:focus-visible:ring-stone-400 rounded-t-md ${
                  checklistTab === "criteria"
                    ? "border-stone-500 dark:border-stone-400 text-gray-900 dark:text-gray-100"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                }`}
              >
                {t("taskModal:acceptanceCriteria")}{totalCount ? ` (${checkedCount}/${totalCount})` : ""}
              </button>
              <button
                type="button"
                onClick={() => setChecklistTab("definitionOfDone")}
                className={`px-2 py-2 text-sm font-medium text-center truncate border-b-2 -mb-px transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 dark:focus-visible:ring-stone-400 rounded-t-md ${
                  checklistTab === "definitionOfDone"
                    ? "border-stone-500 dark:border-stone-400 text-gray-900 dark:text-gray-100"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                }`}
              >
                {t("taskModal:definitionOfDone")}{definitionTotalCount ? ` (${definitionCheckedCount}/${definitionTotalCount})` : ""}
              </button>
            </div>
            <div className="p-4">
              {checklistTab === "criteria" && (
                <>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-400 dark:text-gray-500">{t("taskModal:acceptanceCriteriaSubtitle")}</p>
                    {mode === "preview" && !isFromOtherBranch && (
                      <button
                        type="button"
                        onClick={() => {
                          setMode("edit");
                          setAutoFocusNewChecklistItem(true);
                        }}
                        data-tooltip-id="app-tooltip"
                        data-tooltip-content={t("taskModal:edit")}
                        aria-label={t("taskModal:edit")}
                        className="p-1 text-gray-400 dark:text-gray-500 hover:text-stone-600 dark:hover:text-stone-400 rounded-md hover:bg-gray-100 dark:hover:bg-white/5 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 dark:focus-visible:ring-stone-400 shrink-0"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {mode === "preview" ? (
                    <ul className="space-y-2">
                      {(criteria || []).map((c) => (
                        <li key={c.index} className="flex items-start gap-2 rounded-md px-2 py-1">
                          <span className="mt-0.5 inline-flex items-center justify-center min-w-[1.125rem] h-[1.125rem] shrink-0 rounded-full bg-gray-100 dark:bg-white/10 px-1 font-mono text-[10px] tabular-nums text-gray-500 dark:text-gray-400">
                            {c.index}
                          </span>
                          <input
                            type="checkbox"
                            checked={c.checked}
                            onChange={(e) => void handleToggleCriterion(c.index, e.target.checked)}
                            className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <div className="text-sm text-gray-800 dark:text-gray-100">{c.text}</div>
                        </li>
                      ))}
                      {totalCount === 0 && (
                        <li className="text-sm text-gray-500 dark:text-gray-400">{t("taskModal:noAcceptanceCriteria")}</li>
                      )}
                    </ul>
                  ) : (
                    <AcceptanceCriteriaEditor
                      criteria={criteria}
                      onChange={setCriteria}
                      autoFocusNew={autoFocusNewChecklistItem}
                      onAutoFocused={() => setAutoFocusNewChecklistItem(false)}
                    />
                  )}
                </>
              )}
              {checklistTab === "definitionOfDone" && (
                <>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-400 dark:text-gray-500">{t("taskModal:definitionOfDoneSubtitle")}</p>
                    {mode === "preview" && !isFromOtherBranch && (
                      <button
                        type="button"
                        onClick={() => {
                          setMode("edit");
                          setAutoFocusNewChecklistItem(true);
                        }}
                        data-tooltip-id="app-tooltip"
                        data-tooltip-content={t("taskModal:edit")}
                        aria-label={t("taskModal:edit")}
                        className="p-1 text-gray-400 dark:text-gray-500 hover:text-stone-600 dark:hover:text-stone-400 rounded-md hover:bg-gray-100 dark:hover:bg-white/5 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 dark:focus-visible:ring-stone-400 shrink-0"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {mode === "preview" ? (
                    <ul className="space-y-2">
                      {(definitionOfDone || []).map((item) => (
                        <li key={item.index} className="flex items-start gap-2 rounded-md px-2 py-1">
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={(e) => void handleToggleDefinitionOfDone(item.index, e.target.checked)}
                            className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <div className="text-sm text-gray-800 dark:text-gray-100">{item.text}</div>
                        </li>
                      ))}
                      {definitionTotalCount === 0 && (
                        <li className="text-sm text-gray-500 dark:text-gray-400">{t("taskModal:noDefinitionOfDoneItems")}</li>
                      )}
                    </ul>
                  ) : (
                    <AcceptanceCriteriaEditor
                      criteria={definitionOfDone}
                      onChange={setDefinitionOfDone}
                      preserveIndices
                      disableToggle={isCreateMode}
                      autoFocusNew={autoFocusNewChecklistItem}
                      onAutoFocused={() => setAutoFocusNewChecklistItem(false)}
                    />
                  )}
                </>
              )}
            </div>
          </div>

          {/* Comments - collapsed when empty in preview (the add-comment form only shows in edit mode anyway) */}
          {!isCreateMode && (comments.length > 0 || mode === "edit") && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <SectionHeader title={comments.length ? t("taskModal:comments", { count: comments.length }) : t("taskModal:commentsNoCount")} />
              {comments.length > 0 ? (
                <div className="space-y-4">
                  {comments.map((comment) => (
                    <article key={`${comment.index}-${comment.createdDate}`} className="border-l-2 border-gray-200 dark:border-gray-700 pl-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span className="font-semibold text-gray-700 dark:text-gray-200">#{comment.index}</span>
                        {comment.author ? <span>{comment.author}</span> : null}
                        {comment.createdDate ? <span>{formatStoredUtcDateForDisplay(comment.createdDate, dateFormat)}</span> : null}
                      </div>
                      <div className="prose prose-sm !max-w-none wmde-markdown" data-color-mode={theme}>
                        <MermaidMarkdown source={comment.body} />
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400">{t("taskModal:noComments")}</div>
              )}
              {mode === "edit" && !isFromOtherBranch && (
                <div className="mt-4 space-y-2">
                  <input
                    type="text"
                    value={commentAuthor}
                    onChange={(e) => setCommentAuthor(e.target.value)}
                    placeholder={t("taskModal:authorPlaceholder")}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-colors duration-200"
                  />
                  <textarea
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    rows={4}
                    placeholder={t("taskModal:addCommentPlaceholder")}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => void handleAddComment()}
                      disabled={commentSaving || commentBody.trim().length === 0}
                      className="inline-flex items-center px-4 py-2 text-sm font-medium bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50"
                    >
                      {commentSaving && (
                        <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      )}
                      {commentSaving ? t("taskModal:adding") : t("taskModal:addComment")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Sidebar - grouped into Identity / Workflow / Planning instead of one
            flat list of 8 fields, so related fields read together at a glance */}
        <div className="md:col-span-1 space-y-3">
          {/* Identity: title + read-only dates */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700/60">
            {task && (
              <MetaRow label={t("taskModal:fields.title")}>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                  }}
                  onBlur={() => {
                    if (title.trim() && title !== task.title) {
                      void handleInlineMetaUpdate({ title: title.trim() });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.currentTarget.blur();
                    }
                  }}
                  disabled={isFromOtherBranch}
                  className={`w-full h-9 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 focus:border-transparent transition-colors duration-200 ${isFromOtherBranch ? 'opacity-60 cursor-not-allowed' : ''}`}
                />
              </MetaRow>
            )}

            {task && (
              <div className="grid grid-cols-2 gap-3 px-3 py-2.5">
                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {t("taskModal:created")}
                  </div>
                  <div className="text-sm tabular-nums text-gray-700 dark:text-gray-300">
                    {formatStoredUtcDateForDisplay(task.createdDate, dateFormat)}
                  </div>
                </div>
                {task.updatedDate && (
                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      {t("taskModal:updated")}
                    </div>
                    <div className="text-sm tabular-nums text-gray-700 dark:text-gray-300">
                      {formatStoredUtcDateForDisplay(task.updatedDate, dateFormat)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Workflow: the fields you touch constantly while triaging a task */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700/60">
            <div className="grid grid-cols-2 gap-3 px-3 py-2.5">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {t("taskModal:fields.status")}
                </label>
                <StatusSelect current={status} onChange={(val) => handleInlineMetaUpdate({ status: val })} disabled={isFromOtherBranch} />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {t("taskModal:fields.priority")}
                </label>
                <Select
                  uiSize="md"
                  value={priority}
                  onChange={(e) => handleInlineMetaUpdate({ priority: e.target.value as any })}
                  disabled={isFromOtherBranch}
                >
                  <option value="">{t("common:priority.none")}</option>
                  <option value="low">{t("common:priority.low")}</option>
                  <option value="medium">{t("common:priority.medium")}</option>
                  <option value="high">{t("common:priority.high")}</option>
                </Select>
              </div>
            </div>

            <MetaRow label={t("taskModal:fields.assignee")}>
              <ChipInput
                name="assignee"
                label=""
                value={assignee}
                onChange={(value) => handleInlineMetaUpdate({ assignee: value })}
                placeholder={t("taskModal:fields.assigneePlaceholder")}
                disabled={isFromOtherBranch}
                suggestions={availableAssignees}
              />
            </MetaRow>

            <MetaRow label={t("taskModal:fields.labels")}>
              <ChipInput
                name="labels"
                label=""
                value={labels}
                onChange={(value) => handleInlineMetaUpdate({ labels: value })}
                placeholder={t("taskModal:fields.labelsPlaceholder")}
                disabled={isFromOtherBranch}
                chipColor={(l) => resolveLabelColor(l, labelColors)}
              />
            </MetaRow>
          </div>

          {/* Planning: structural relationships to other tasks/milestones - collapsed
              behind a "show more" toggle when both are empty, since these are edited
              far less often than Status/Priority/Assignee/Labels above */}
          {(planningExpanded || Boolean(milestoneSelectionValue) || dependencies.length > 0) ? (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700/60">
              <MetaRow label={t("taskModal:fields.milestone")}>
                <Select
                  uiSize="md"
                  value={milestoneSelectionValue}
                  onChange={(e) => {
                    const value = e.target.value;
                    setMilestone(value);
                    handleInlineMetaUpdate({ milestone: value.trim().length > 0 ? value : null });
                  }}
                  disabled={isFromOtherBranch}
                >
                  <option value="">{t("taskModal:fields.noMilestone")}</option>
                  {!hasMilestoneSelection && milestoneSelectionValue ? (
                    <option value={milestoneSelectionValue}>{resolveMilestoneLabel(milestoneSelectionValue)}</option>
                  ) : null}
                  {(milestoneEntities ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </Select>
              </MetaRow>

              <MetaRow label={t("taskModal:fields.dependencies")}>
                <DependencyInput
                  value={dependencies}
                  onChange={(value) => handleInlineMetaUpdate({ dependencies: value })}
                  availableTasks={availableTasks}
                  currentTaskId={task?.id}
                  label=""
                  disabled={isFromOtherBranch}
                />
              </MetaRow>
            </div>
          ) : (
            !isFromOtherBranch && (
              <button
                type="button"
                onClick={() => setPlanningExpanded(true)}
                className="w-full flex items-center gap-2 text-left px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 dark:focus-visible:ring-stone-400"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                {t("taskModal:addMilestoneOrDependency")}
              </button>
            )
          )}

        </div>
      </div>
      )}
    </Modal>
    {confirmDialog}
    </>
  );
};

const StatusSelect: React.FC<{ current: string; onChange: (v: string) => void; disabled?: boolean }> = ({ current, onChange, disabled }) => {
  const [statuses, setStatuses] = useState<string[]>([]);
  useEffect(() => {
    apiClient.fetchStatuses().then(setStatuses).catch(() => setStatuses(["To Do", "In Progress", "Done"]));
  }, []);
  return (
    <Select uiSize="md" value={current} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {statuses.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </Select>
  );
};

export default TaskDetailsModal;
