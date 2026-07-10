import React from 'react';
import { useTranslation } from 'react-i18next';
import { type Task } from '../../types';
import { getLabelChipStyle, resolveLabelColor } from '../utils/labelColors';

interface TaskCardProps {
  task: Task;
  onUpdate: (taskId: string, updates: Partial<Task>) => void;
  onEdit: (task: Task) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  status?: string;
  laneId?: string;
  // id -> title, so the dependencies tooltip can show real titles instead of bare IDs
  taskTitleById?: Record<string, string>;
  onContextMenu?: (task: Task, x: number, y: number) => void;
  labelColors?: Record<string, string>;
}

// Deterministic per-person color so the same assignee reads consistently across
// cards, instead of every avatar chip sharing one flat neutral tint.
const AVATAR_PALETTE = [
  { light: 'bg-teal-100 text-teal-700', dark: 'dark:bg-teal-500/15 dark:text-teal-300' },
  { light: 'bg-sky-100 text-sky-700', dark: 'dark:bg-sky-500/15 dark:text-sky-300' },
  { light: 'bg-violet-100 text-violet-700', dark: 'dark:bg-violet-500/15 dark:text-violet-300' },
  { light: 'bg-amber-100 text-amber-700', dark: 'dark:bg-amber-500/15 dark:text-amber-300' },
  { light: 'bg-rose-100 text-rose-700', dark: 'dark:bg-rose-500/15 dark:text-rose-300' },
  { light: 'bg-emerald-100 text-emerald-700', dark: 'dark:bg-emerald-500/15 dark:text-emerald-300' },
];

const getAvatarColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length] ?? AVATAR_PALETTE[0]!;
};

const TaskCard: React.FC<TaskCardProps> = ({ task, onEdit, onDragStart, onDragEnd, status, laneId, taskTitleById, onContextMenu, labelColors }) => {
  const { t } = useTranslation(['board', 'common']);
  const [isDragging, setIsDragging] = React.useState(false);
  const [showBranchTooltip, setShowBranchTooltip] = React.useState(false);
  const dragCloneRef = React.useRef<HTMLElement | null>(null);

  // Check if task is from another branch (read-only)
  const isFromOtherBranch = Boolean(task.branch);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    // Prevent dragging cross-branch tasks
    if (isFromOtherBranch) {
      e.preventDefault();
      setShowBranchTooltip(true);
      setTimeout(() => setShowBranchTooltip(false), 3000);
      return;
    }

    e.dataTransfer.setData('text/plain', task.id);
    if (status) {
      e.dataTransfer.setData('text/status', status);
    }
    if (laneId !== undefined) {
      e.dataTransfer.setData('text/lane', laneId);
    }
    e.dataTransfer.effectAllowed = 'move';

    // Use an isolated clone as the drag ghost instead of the browser's
    // automatic snapshot: some browsers stack extra translucency on top of
    // our own dimmed styling (making the ghost look nearly invisible), and
    // the auto-snapshot's capture region can bleed into whatever sits right
    // below the card. Cloning just this element into a detached, off-screen
    // node guarantees the ghost is exactly this card, at full opacity, with
    // nothing else in frame.
    const cardElement = e.currentTarget;
    const rect = cardElement.getBoundingClientRect();
    const clone = cardElement.cloneNode(true) as HTMLElement;
    clone.style.position = 'fixed';
    clone.style.top = '-9999px';
    clone.style.left = '-9999px';
    clone.style.width = `${rect.width}px`;
    clone.style.margin = '0';
    clone.style.pointerEvents = 'none';
    document.body.appendChild(clone);
    dragCloneRef.current = clone;
    e.dataTransfer.setDragImage(clone, e.clientX - rect.left, e.clientY - rect.top);

    // Deferred so the browser finishes reading the (still full-opacity) card
    // for the drag operation before we dim the card left behind in the column.
    setTimeout(() => setIsDragging(true), 0);
    onDragStart?.();
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    dragCloneRef.current?.remove();
    dragCloneRef.current = null;
    onDragEnd?.();
  };

  const formatRelativeDate = (dateStr: string) => {
    // Handle both date-only and datetime formats
    const hasTime = dateStr.includes(" ") || dateStr.includes("T");
    const date = new Date(dateStr.replace(" ", "T") + (hasTime ? ":00Z" : "T00:00:00Z"));
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t('common:relativeDate.today');
    if (diffDays === 1) return t('common:relativeDate.yesterday');
    if (diffDays < 7) return t('common:relativeDate.daysAgo', { count: diffDays });
    if (diffDays < 30) return t('common:relativeDate.weeksAgo', { count: Math.floor(diffDays / 7) });
    if (diffDays < 365) return t('common:relativeDate.monthsAgo', { count: Math.floor(diffDays / 30) });
    return t('common:relativeDate.yearsAgo', { count: Math.floor(diffDays / 365) });
  };

  const truncateName = (name: string, max = 15) => (name.length > max ? `${name.slice(0, max)}…` : name);

  const getPriorityBars = (priority?: string) => {
    switch (priority) {
      case 'high': return { active: 3, bar: 'bg-red-500 dark:bg-red-400', label: t('common:priorityBadge.high') };
      case 'medium': return { active: 2, bar: 'bg-amber-500 dark:bg-amber-400', label: t('common:priorityBadge.medium') };
      case 'low': return { active: 1, bar: 'bg-stone-500 dark:bg-stone-400', label: t('common:priorityBadge.low') };
      default: return null;
    }
  };

  return (
    <div className="relative">
      {/* Branch tooltip when trying to drag cross-branch task */}
      {showBranchTooltip && isFromOtherBranch && (
        <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 z-50 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-md shadow-lg whitespace-nowrap">
          <div className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {t('board:switchBranchToMove', { branch: task.branch })}
          </div>
          <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-gray-900 dark:bg-gray-700"></div>
        </div>
      )}

      <div
        className={`bg-white dark:bg-gray-700 border border-gray-200 dark:border-white/10 rounded-lg p-4 mb-2 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 dark:focus-visible:ring-stone-400 ${
          isFromOtherBranch
            ? 'opacity-75 cursor-not-allowed border-dashed'
            : 'cursor-pointer hover:shadow-md dark:hover:shadow-none hover:border-stone-500 dark:hover:border-white/20 dark:hover:bg-white/[0.04]'
        } ${
          isDragging ? 'opacity-60 ring-2 ring-stone-500/40 shadow-xl' : ''
        }`}
        draggable={!isFromOtherBranch}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClick={() => onEdit(task)}
        onContextMenu={(e) => {
          if (!onContextMenu) return;
          e.preventDefault();
          onContextMenu(task, e.clientX, e.clientY);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onEdit(task);
          }
        }}
        role="button"
        tabIndex={0}
      >
        {/* Cross-branch indicator banner */}
        {isFromOtherBranch && (
          <div className="flex items-center gap-1.5 mb-2 px-2 py-1 -mx-1 -mt-1 bg-sky-50 dark:bg-sky-900/20 border-b border-sky-200 dark:border-sky-800 rounded-t text-xs text-sky-700 dark:text-sky-300">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span className="truncate">
              {t('board:fromBranch', { branch: task.branch })}
            </span>
          </div>
        )}

        {/* Header row with priority indicator and task ID */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs tabular-nums text-gray-400 dark:text-gray-500 font-mono transition-colors duration-200">{task.id}</span>
          {(() => {
            const priority = getPriorityBars(task.priority);
            return priority ? (
              <span
                className="flex items-end gap-0.5 shrink-0"
                aria-label={priority.label}
                data-tooltip-id="app-tooltip"
                data-tooltip-content={priority.label}
              >
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={`w-[3px] rounded-sm transition-colors duration-200 ${
                      i < priority.active ? priority.bar : 'bg-gray-200 dark:bg-white/10'
                    }`}
                    style={{ height: `${6 + i * 4}px` }}
                  />
                ))}
              </span>
            ) : null;
          })()}
        </div>

        {/* Title */}
        <h4 className={`font-semibold text-[15px] leading-snug line-clamp-2 transition-colors duration-200 ${
          isFromOtherBranch
            ? 'text-gray-600 dark:text-gray-400'
            : 'text-gray-900 dark:text-gray-100'
        }`}>
          {task.title}
        </h4>

        {/* Labels (left) + acceptance-criteria progress / dependencies (right),
            sharing one row instead of stacking as separate lines */}
        {(task.labels.length > 0 || (task.acceptanceCriteriaItems?.length ?? 0) > 0 || task.dependencies.length > 0) && (
          <div className="flex items-start flex-wrap gap-2 mt-2">
            {task.labels.length > 0 && (
              <div className="flex flex-wrap gap-1 min-w-0">
                {task.labels.slice(0, 3).map(label => {
                  const style = getLabelChipStyle(resolveLabelColor(label, labelColors));
                  return (
                    <span
                      key={label}
                      style={style}
                      className={`inline-block px-1.5 py-0.5 text-[10px] rounded transition-colors duration-200 ${
                        style ? '' : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      {label}
                    </span>
                  );
                })}
                {task.labels.length > 3 && (
                  <span className="inline-block px-1.5 py-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                    +{task.labels.length - 3}
                  </span>
                )}
              </div>
            )}

            {((task.acceptanceCriteriaItems?.length ?? 0) > 0 || task.dependencies.length > 0) && (
              <div className="flex items-center gap-2 shrink-0 ml-auto text-[10px] tabular-nums text-gray-400 dark:text-gray-500 transition-colors duration-200">
                {task.acceptanceCriteriaItems && task.acceptanceCriteriaItems.length > 0 && (() => {
                  const items = task.acceptanceCriteriaItems;
                  const total = items.length;
                  const done = items.filter((item) => item.checked).length;
                  const complete = done === total;
                  return (
                    <span className="relative group">
                      <span
                        className={`flex items-center gap-1 ${complete ? 'text-teal-600 dark:text-teal-400' : ''}`}
                        aria-label={t('common:acceptanceCriteriaProgress')}
                      >
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {done}/{total}
                      </span>
                      <span className="pointer-events-none absolute right-0 top-full mt-1.5 w-56 rounded-md bg-gray-900 dark:bg-gray-950 px-2.5 py-2 text-[11px] text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 z-20">
                        <span className="mb-1 block font-semibold text-gray-300 dark:text-gray-400">
                          {t('common:acceptanceCriteriaProgress')}
                        </span>
                        <span className="block space-y-1">
                          {items.map((item) => (
                            <span key={item.index} className="flex items-start gap-1.5">
                              {item.checked ? (
                                <svg className="w-3 h-3 mt-0.5 shrink-0 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <span className="w-3 h-3 mt-0.5 shrink-0 rounded-full border border-white/30" />
                              )}
                              <span className="truncate">{item.text}</span>
                            </span>
                          ))}
                        </span>
                      </span>
                    </span>
                  );
                })()}
                {task.dependencies.length > 0 && (
                  <span className="relative group">
                    <span className="flex items-center gap-1" aria-label={t('common:dependenciesCount', { count: task.dependencies.length })}>
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      {task.dependencies.length}
                    </span>
                    <span className="pointer-events-none absolute right-0 top-full mt-1.5 w-56 rounded-md bg-gray-900 dark:bg-gray-950 px-2.5 py-2 text-[11px] text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 z-20">
                      <span className="mb-1 block font-semibold text-gray-300 dark:text-gray-400">
                        {t('common:dependenciesCount', { count: task.dependencies.length })}
                      </span>
                      <span className="block space-y-1">
                        {task.dependencies.map((depId) => (
                          <span key={depId} className="flex items-start gap-1.5">
                            <span className="font-mono text-gray-400 shrink-0">{depId}</span>
                            {taskTitleById?.[depId] && <span className="truncate">{taskTitleById[depId]}</span>}
                          </span>
                        ))}
                      </span>
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer with date and assignee */}
        <div className="flex items-center justify-between gap-2 text-[10px] text-gray-400 dark:text-gray-500 mt-2 pt-2 border-t border-gray-100 dark:border-white/10 transition-colors duration-200">
          <span className="shrink-0">{formatRelativeDate(task.createdDate)}</span>
          {task.assignee.length > 0 ? (() => {
            const name = task.assignee[0] ?? '';
            const color = getAvatarColor(name);
            return (
              <span className="relative group min-w-0">
                <span
                  className={`flex items-center h-5 px-1.5 rounded text-[10px] font-medium truncate ${color.light} ${color.dark}`}
                >
                  {truncateName(name)}
                </span>
                <span className="pointer-events-none absolute bottom-full right-0 mb-1.5 whitespace-nowrap rounded-md bg-gray-900 dark:bg-gray-950 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 z-20">
                  {task.assignee.join(', ')}
                </span>
              </span>
            );
          })() : (
            <span
              className="flex items-center justify-center w-5 h-5 rounded-full border border-dashed border-gray-200 dark:border-white/10 text-gray-300 dark:text-white/20 shrink-0"
              aria-label={t('board:unassigned')}
              data-tooltip-id="app-tooltip"
              data-tooltip-content={t('board:unassigned')}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskCard;
