import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  type SearchResult,
  type SearchResultType,
  type TaskSearchResult,
  type DocumentSearchResult,
  type DecisionSearchResult,
} from '../../types';
import { apiClient } from '../lib/api';
import { parseSearchCommandQuery } from '../utils/search-command-query';
import { sanitizeUrlTitle } from '../utils/urlHelpers';

interface CommandPaletteProps {
  onNewTask: () => void;
}

const stripIdPrefix = (id: string): string => id.replace(/^[a-zA-Z]+-/, '');

const hasTaskSearchFilters = (parsedQuery: ReturnType<typeof parseSearchCommandQuery>): boolean => {
  return Boolean(
    parsedQuery.status ||
      parsedQuery.priority ||
      parsedQuery.assignee ||
      (parsedQuery.labels && parsedQuery.labels.length > 0) ||
      (parsedQuery.modifiedFiles && parsedQuery.modifiedFiles.length > 0),
  );
};

type PaletteItem =
  | { kind: 'action'; id: string; label: string; onSelect: () => void }
  | { kind: 'result'; id: string; result: SearchResult };

const Icons = {
  Search: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
    </svg>
  ),
  Plus: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  Task: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  ),
  Document: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  Decision: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 12l2 2 4-4" />
    </svg>
  ),
};

const CommandPalette: React.FC<CommandPaletteProps> = ({ onNewTask }) => {
  const { t } = useTranslation(['nav']);
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setResults([]);
    setSelectedIndex(0);
  }, []);

  // Global Cmd+K / Ctrl+K toggle, reachable from any route — not tied to the
  // sidebar (which keeps its own separate, always-visible inline search).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => {
          if (prev) {
            setQuery('');
            setResults([]);
            setSelectedIndex(0);
            return false;
          }
          return true;
        });
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    document.body.style.overflow = 'hidden';
    const timer = setTimeout(() => inputRef.current?.focus(), 10);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Debounced unified search — same endpoint/timing as the sidebar search.
  useEffect(() => {
    if (!isOpen) return undefined;
    const trimmed = query.trim();
    if (trimmed === '') {
      setResults([]);
      setIsSearching(false);
      return undefined;
    }
    let cancelled = false;
    setIsSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const parsedQuery = parseSearchCommandQuery(trimmed);
        const types: SearchResultType[] | undefined =
          parsedQuery.types ?? (hasTaskSearchFilters(parsedQuery) ? ['task'] : undefined);
        const searchResults = await apiClient.search({ ...parsedQuery, types, limit: 15 });
        if (!cancelled) setResults(searchResults);
      } catch (err) {
        console.error('Command palette search failed:', err);
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, isOpen]);

  const sortedResults = useMemo(() => {
    return [...results]
      .filter((result) => result.score === null || result.score <= 0.45)
      .sort((a, b) => {
        const scoreA = a.score ?? Number.POSITIVE_INFINITY;
        const scoreB = b.score ?? Number.POSITIVE_INFINITY;
        return scoreA - scoreB;
      })
      .slice(0, 8);
  }, [results]);

  const getResultLink = useCallback((result: SearchResult): string => {
    if (result.type === 'document') {
      const doc = (result as DocumentSearchResult).document;
      return `/documentation/${stripIdPrefix(doc.id)}/${sanitizeUrlTitle(doc.title)}`;
    }
    if (result.type === 'decision') {
      const decision = (result as DecisionSearchResult).decision;
      return `/decisions/${stripIdPrefix(decision.id)}/${sanitizeUrlTitle(decision.title)}`;
    }
    const task = (result as TaskSearchResult).task;
    return `/?highlight=${encodeURIComponent(task.id)}`;
  }, []);

  const getResultTitle = (result: SearchResult): string => {
    if (result.type === 'document') return (result as DocumentSearchResult).document.title;
    if (result.type === 'decision') return (result as DecisionSearchResult).decision.title;
    return (result as TaskSearchResult).task.title;
  };

  const getResultIcon = (type: SearchResultType) => {
    if (type === 'document') return <span className="text-green-500"><Icons.Document /></span>;
    if (type === 'decision') return <span className="text-stone-500"><Icons.Decision /></span>;
    return <span className="text-purple-500"><Icons.Task /></span>;
  };

  const items: PaletteItem[] = useMemo(() => {
    const actionItem: PaletteItem = {
      kind: 'action',
      id: 'new-task',
      label: t('nav:commandPaletteNewTask'),
      onSelect: () => {
        onNewTask();
        close();
      },
    };
    const resultItems: PaletteItem[] = sortedResults.map((result, index) => ({
      kind: 'result',
      id: `${result.type}-${index}`,
      result,
    }));
    return [actionItem, ...resultItems];
  }, [sortedResults, t, onNewTask, close]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items.length, query]);

  const activateItem = useCallback((item: PaletteItem) => {
    if (item.kind === 'action') {
      item.onSelect();
      return;
    }
    navigate(getResultLink(item.result));
    close();
  }, [navigate, getResultLink, close]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % items.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[selectedIndex];
      if (item) activateItem(item);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 pt-[15vh] px-4"
      onClick={close}
      role="presentation"
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/10 rounded-xl shadow-2xl dark:shadow-none overflow-hidden animate-command-palette-in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label={t('nav:commandPaletteLabel')}
      >
        <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100 dark:border-white/10">
          <span className="text-gray-400 dark:text-gray-500 shrink-0"><Icons.Search /></span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('nav:commandPalettePlaceholder')}
            className="flex-1 bg-transparent border-none outline-none text-base text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
          />
          {isSearching && (
            <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{t('nav:searching')}</span>
          )}
        </div>

        <div className="max-h-[400px] overflow-y-auto py-1.5">
          {items.map((item, index) => {
            const isSelected = index === selectedIndex;
            if (item.kind === 'action') {
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => activateItem(item)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100 ${
                    isSelected ? 'bg-gray-100 dark:bg-white/5' : ''
                  }`}
                >
                  <span className={isSelected ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}>
                    <Icons.Plus />
                  </span>
                  <span className="text-sm text-gray-900 dark:text-gray-100">{item.label}</span>
                </button>
              );
            }

            const title = getResultTitle(item.result);
            return (
              <button
                key={item.id}
                type="button"
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => activateItem(item)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100 ${
                  isSelected ? 'bg-gray-100 dark:bg-white/5' : ''
                }`}
              >
                {getResultIcon(item.result.type)}
                <span className="flex-1 text-sm text-gray-900 dark:text-gray-100 truncate">{title}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                  {t(`nav:resultType.${item.result.type}`)}
                </span>
              </button>
            );
          })}

          {query.trim() !== '' && sortedResults.length === 0 && !isSearching && (
            <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
              {t('nav:commandPaletteEmpty')}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-100 dark:border-white/10 text-[11px] font-mono text-gray-400 dark:text-gray-500">
          <span>{t('nav:commandPaletteHintNavigate')}</span>
          <span>{t('nav:commandPaletteHintOpen')}</span>
          <span>{t('nav:commandPaletteHintClose')}</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
