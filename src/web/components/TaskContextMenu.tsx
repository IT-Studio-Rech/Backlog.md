import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Task } from '../../types';

export interface TaskContextMenuTarget {
  task: Task;
  x: number;
  y: number;
}

type SubmenuKey = 'status' | 'priority' | 'copy';

interface TaskContextMenuProps {
  target: TaskContextMenuTarget;
  statuses: string[];
  onClose: () => void;
  onChangeStatus: (task: Task, status: string) => void;
  onChangePriority: (task: Task, priority: 'high' | 'medium' | 'low' | '') => void;
  onArchive: (task: Task) => void;
  onCopyId: (task: Task) => void;
  onCopyLink: (task: Task) => void;
}

// Same panel chrome as TaskColumn's kebab menu (border/bg/shadow/hover), but
// positioned at the cursor instead of anchored to a button. Submenus open as
// flyouts on hover, like a native right-click menu, instead of requiring a
// click to drill in.
const ITEM_CLASS =
  'w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors duration-150';

const ITEM_CLASS_DANGER =
  'w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 transition-colors duration-150';

const PANEL_CLASS =
  'w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/10 rounded-md shadow-lg dark:shadow-none z-50 py-1';

const PRIORITY_VALUES: Array<'high' | 'medium' | 'low' | ''> = ['high', 'medium', 'low', ''];

// Delay before a flyout closes on mouse-leave, so moving the cursor
// diagonally from the row into the flyout doesn't accidentally close it.
const SUBMENU_CLOSE_DELAY_MS = 200;

const ChevronRightIcon: React.FC = () => (
  <svg className="w-3.5 h-3.5 ml-auto text-gray-400 dark:text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const CheckIcon: React.FC = () => (
  <svg className="ml-auto w-3.5 h-3.5 text-stone-500 dark:text-stone-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
  </svg>
);

// Mounts only while its parent renders it (i.e. while the submenu is open), so
// it always measures fresh: positions itself to the right of the anchor row,
// flipping to the left or clamping vertically if it would overflow the viewport.
const Flyout: React.FC<{
  anchorRef: React.RefObject<HTMLElement | null>;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  children: React.ReactNode;
}> = ({ anchorRef, onMouseEnter, onMouseLeave, children }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: -9999, left: -9999 });

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const anchorRect = anchor.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const margin = 8;
    let left = anchorRect.right - 2;
    if (left + panelRect.width + margin > window.innerWidth) {
      left = anchorRect.left - panelRect.width + 2;
    }
    let top = anchorRect.top;
    if (top + panelRect.height + margin > window.innerHeight) {
      top = Math.max(margin, window.innerHeight - panelRect.height - margin);
    }
    setPosition({ top, left });
  }, [anchorRef]);

  return (
    <div
      ref={panelRef}
      role="menu"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ position: 'fixed', top: position.top, left: position.left }}
      className={PANEL_CLASS}
    >
      {children}
    </div>
  );
};

const TaskContextMenu: React.FC<TaskContextMenuProps> = ({
  target,
  statuses,
  onClose,
  onChangeStatus,
  onChangePriority,
  onArchive,
  onCopyId,
  onCopyLink,
}) => {
  const { t } = useTranslation(['board', 'common']);
  const [position, setPosition] = useState({ top: -9999, left: -9999 });
  const [openSubmenu, setOpenSubmenu] = useState<SubmenuKey | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const statusRowRef = useRef<HTMLButtonElement>(null);
  const priorityRowRef = useRef<HTMLButtonElement>(null);
  const copyRowRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  const cancelScheduledClose = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleClose = () => {
    cancelScheduledClose();
    closeTimerRef.current = window.setTimeout(() => setOpenSubmenu(null), SUBMENU_CLOSE_DELAY_MS);
  };

  const openNow = (key: SubmenuKey) => {
    cancelScheduledClose();
    setOpenSubmenu(key);
  };

  useEffect(() => cancelScheduledClose, []);

  // Root panel's own size never changes (no drill-down anymore), so it only
  // needs to be clamped once against the click coordinates.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    let left = target.x;
    let top = target.y;
    if (left + rect.width + margin > window.innerWidth) {
      left = Math.max(margin, target.x - rect.width);
    }
    if (top + rect.height + margin > window.innerHeight) {
      top = Math.max(margin, target.y - rect.height);
    }
    setPosition({ top, left });
  }, [target]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const handleScroll = () => onClose();
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  return (
    <div ref={menuRef} role="menu" style={{ position: 'fixed', top: position.top, left: position.left }} className={PANEL_CLASS}>
      <div
        className="relative"
        onMouseEnter={() => openNow('status')}
        onMouseLeave={scheduleClose}
        onFocus={() => openNow('status')}
      >
        <button ref={statusRowRef} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={openSubmenu === 'status'} className={ITEM_CLASS}>
          {t('board:contextMenu.changeStatus')}
          <ChevronRightIcon />
        </button>
        {openSubmenu === 'status' && (
          <Flyout anchorRef={statusRowRef} onMouseEnter={cancelScheduledClose} onMouseLeave={scheduleClose}>
            {statuses.map((status) => (
              <button
                key={status}
                type="button"
                role="menuitem"
                className={ITEM_CLASS}
                onClick={() => {
                  onChangeStatus(target.task, status);
                  onClose();
                }}
              >
                <span className="truncate">{status}</span>
                {status === target.task.status && <CheckIcon />}
              </button>
            ))}
          </Flyout>
        )}
      </div>

      <div
        className="relative"
        onMouseEnter={() => openNow('priority')}
        onMouseLeave={scheduleClose}
        onFocus={() => openNow('priority')}
      >
        <button ref={priorityRowRef} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={openSubmenu === 'priority'} className={ITEM_CLASS}>
          {t('board:contextMenu.changePriority')}
          <ChevronRightIcon />
        </button>
        {openSubmenu === 'priority' && (
          <Flyout anchorRef={priorityRowRef} onMouseEnter={cancelScheduledClose} onMouseLeave={scheduleClose}>
            {PRIORITY_VALUES.map((value) => {
              const isSelected = (target.task.priority ?? '') === value;
              return (
                <button
                  key={value || 'none'}
                  type="button"
                  role="menuitem"
                  className={ITEM_CLASS}
                  onClick={() => {
                    onChangePriority(target.task, value);
                    onClose();
                  }}
                >
                  <span className="truncate">{t(`common:priority.${value || 'none'}`)}</span>
                  {isSelected && <CheckIcon />}
                </button>
              );
            })}
          </Flyout>
        )}
      </div>

      <div className="my-1 border-t border-gray-200 dark:border-white/10" />

      <div
        className="relative"
        onMouseEnter={() => openNow('copy')}
        onMouseLeave={scheduleClose}
        onFocus={() => openNow('copy')}
      >
        <button ref={copyRowRef} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={openSubmenu === 'copy'} className={ITEM_CLASS}>
          {t('board:contextMenu.copyIdOrLink')}
          <ChevronRightIcon />
        </button>
        {openSubmenu === 'copy' && (
          <Flyout anchorRef={copyRowRef} onMouseEnter={cancelScheduledClose} onMouseLeave={scheduleClose}>
            <button
              type="button"
              role="menuitem"
              className={ITEM_CLASS}
              onClick={() => {
                onCopyId(target.task);
                onClose();
              }}
            >
              {t('board:contextMenu.copyId')}
            </button>
            <button
              type="button"
              role="menuitem"
              className={ITEM_CLASS}
              onClick={() => {
                onCopyLink(target.task);
                onClose();
              }}
            >
              {t('board:contextMenu.copyLink')}
            </button>
          </Flyout>
        )}
      </div>

      <div className="my-1 border-t border-gray-200 dark:border-white/10" />

      <button
        type="button"
        role="menuitem"
        className={ITEM_CLASS_DANGER}
        onMouseEnter={() => setOpenSubmenu(null)}
        onFocus={() => setOpenSubmenu(null)}
        onClick={() => {
          onArchive(target.task);
          onClose();
        }}
      >
        {t('board:contextMenu.archive')}
      </button>
    </div>
  );
};

export default TaskContextMenu;
