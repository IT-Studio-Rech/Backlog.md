import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type AcceptanceCriterion } from "../../types";

interface Props {
  criteria: AcceptanceCriterion[];
  onChange: (criteria: AcceptanceCriterion[]) => void;
  preserveIndices?: boolean;
  disableToggle?: boolean;
  autoFocusNew?: boolean;
  onAutoFocused?: () => void;
}

const AcceptanceCriteriaEditor: React.FC<Props> = ({
  criteria: initial,
  onChange,
  preserveIndices = false,
  disableToggle = false,
  autoFocusNew = false,
  onAutoFocused,
}) => {
  const { t } = useTranslation(["common"]);
  const [criteria, setCriteria] = useState<AcceptanceCriterion[]>(initial || []);
  const [newCriterion, setNewCriterion] = useState("");

  // Refs to auto-resize textareas
  const itemRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});
  const newRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setCriteria(initial || []);
  }, [initial]);

  // Auto-resize helper
  const autoResize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  // Resize when criteria change (e.g., initial load or edits)
  useEffect(() => {
    Object.values(itemRefs.current).forEach((el) => autoResize(el));
  }, [criteria]);

  // Resize new criterion textarea when text changes
  useEffect(() => {
    autoResize(newRef.current);
  }, [newCriterion]);

  // Jump straight to the "add new" row and focus it when opened via the tab's
  // "+" shortcut, instead of leaving the user to scroll and click it.
  //
  // For a task with little content below this row, the scroll container may
  // not have enough natural room to actually center it - scrollIntoView just
  // clamps to whatever it can already scroll to. So: measure exactly how much
  // extra room is missing (not a guessed flat amount), add only that much as
  // temporary padding, scroll, then remove the padding once the user leaves
  // this field (blur) rather than on a fixed timer or immediately - removing
  // it while the current scroll position still depends on it makes the
  // browser re-clamp scrollTop back down instantly, silently undoing the
  // scroll. A permanent buffer would dodge that, but then the modal always
  // has dead scrollable space below its real content - worse than the bug.
  useEffect(() => {
    if (!autoFocusNew) return;
    const el = newRef.current;
    if (!el) {
      onAutoFocused?.();
      return;
    }

    let scrollParent: HTMLElement | null = el.parentElement;
    while (scrollParent && scrollParent !== document.body) {
      const overflowY = getComputedStyle(scrollParent).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") break;
      scrollParent = scrollParent.parentElement;
    }

    if (scrollParent) {
      const parent = scrollParent;
      const originalPaddingBottom = parent.style.paddingBottom;

      const elRect = el.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      const elCenter = elRect.top - parentRect.top + parent.scrollTop + elRect.height / 2;
      const targetScrollTop = elCenter - parent.clientHeight / 2;
      const maxScrollTop = parent.scrollHeight - parent.clientHeight;
      const shortfall = targetScrollTop - maxScrollTop;

      if (shortfall > 0) {
        const currentPadding = Number.parseFloat(originalPaddingBottom || "0") || 0;
        parent.style.paddingBottom = `${currentPadding + shortfall}px`;
      }

      parent.scrollTo({ top: Math.max(0, targetScrollTop), behavior: "smooth" });

      el.addEventListener(
        "blur",
        () => {
          parent.style.paddingBottom = originalPaddingBottom;
        },
        { once: true },
      );
    } else {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    // preventScroll matters here: a plain focus() triggers the browser's own
    // "scroll just enough to reveal this" behavior, which fires right after our
    // smooth scroll starts and snaps it back to the edge instead of center.
    el.focus({ preventScroll: true });
    // Calling this flips the parent's autoFocusNew prop back to false on the
    // next render, which would re-run *this exact effect* (it's in the
    // dependency array) and fire React's cleanup for the previous run first.
    // Deliberately not returning a cleanup function here: the blur listener
    // above is the only thing that should ever undo the padding - if an
    // effect-cleanup also called it, it would fire on that very next render,
    // wiping the padding out mid-scroll before the animation ever got there.
    onAutoFocused?.();
  }, [autoFocusNew, onAutoFocused]);

  const handleToggle = (index: number, checked: boolean) => {
    if (disableToggle) return;
    const updated = criteria.map((c) => (c.index === index ? { ...c, checked } : c));
    setCriteria(updated);
    onChange(updated);
  };

  const handleTextChange = (index: number, text: string) => {
    const updated = criteria.map((c) => (c.index === index ? { ...c, text } : c));
    setCriteria(updated);
    onChange(updated);
  };

  const handleRemove = (index: number) => {
    const filtered = criteria.filter((c) => c.index !== index);
    const updated = preserveIndices ? filtered : filtered.map((c, i) => ({ ...c, index: i + 1 }));
    setCriteria(updated);
    onChange(updated);
  };

  const handleAdd = () => {
    const text = newCriterion.trim();
    if (!text) return;
    const nextIndex = preserveIndices
      ? Math.max(0, ...criteria.map((item) => item.index)) + 1
      : criteria.length + 1;
    const updated = [...criteria, { checked: false, text, index: nextIndex }];
    setCriteria(updated);
    setNewCriterion("");
    onChange(updated);
  };

  // Shared textarea treatment: borderless at rest (the surrounding SectionHeader
  // card already provides the boundary), a soft background highlight only while
  // focused - avoids the "card inside a card" look a bordered input box gave here.
  const textareaClass =
    "flex-1 px-2 py-1 text-sm bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-md focus:outline-none focus:ring-0 focus:bg-gray-50 dark:focus:bg-white/5 transition-colors duration-150 resize-none overflow-hidden leading-5";

  return (
    <ul className="divide-y divide-gray-100 dark:divide-white/10">
      {criteria.map((c) => (
        <li key={c.index} className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
          <input
            type="checkbox"
            className="mt-1.5 h-4 w-4 text-blue-600 border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 shrink-0"
            checked={c.checked}
            onChange={(e) => handleToggle(c.index, e.target.checked)}
            disabled={disableToggle}
          />
          <textarea
            ref={(el) => { itemRefs.current[c.index] = el; }}
            rows={1}
            value={c.text}
            onChange={(e) => handleTextChange(c.index, e.target.value)}
            onInput={(e) => autoResize(e.currentTarget)}
            className={textareaClass}
          />
          <button
            type="button"
            onClick={() => handleRemove(c.index)}
            className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 shrink-0"
            data-tooltip-id="app-tooltip"
            data-tooltip-content={t("common:remove")}
            aria-label={t("common:remove")}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </li>
      ))}
      <li className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
        <span className="mt-1.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <textarea
          ref={newRef}
          rows={1}
          value={newCriterion}
          onChange={(e) => setNewCriterion(e.target.value)}
          onInput={(e) => autoResize(e.currentTarget)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder={t("common:acceptanceCriteriaEditor.newItemPlaceholder")}
          className={textareaClass}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!newCriterion.trim()}
          className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-stone-600 dark:hover:text-stone-400 hover:bg-stone-50 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent rounded-md transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 shrink-0"
          data-tooltip-id="app-tooltip"
          data-tooltip-content={t("common:add")}
          aria-label={t("common:add")}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </li>
    </ul>
  );
};

export default AcceptanceCriteriaEditor;
