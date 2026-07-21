import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LoopProgress } from '../../types';

// No heartbeat for this long: something might be stuck (a single long-running tool call,
// a crashed loop) rather than genuinely idle-but-fine. Not a hard signal, just a nudge.
const STALE_AFTER_MS = 3 * 60 * 1000;

interface LoopStatusPillProps {
  progress: LoopProgress | null;
}

export default function LoopStatusPill({ progress }: LoopStatusPillProps) {
  const { t } = useTranslation(['common']);
  const [now, setNow] = useState(() => Date.now());
  const active = Boolean(progress?.active);

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(interval);
  }, [active]);

  if (!progress || !active) return null;

  const formatDuration = (ms: number): string => {
    const seconds = Math.max(0, Math.round(ms / 1000));
    if (seconds < 60) return t('common:loopStatus.durationSeconds', { count: seconds });
    return t('common:loopStatus.durationMinutes', { count: Math.round(seconds / 60) });
  };

  const heartbeatMs = typeof progress.heartbeat === 'string' ? Date.parse(progress.heartbeat) : Number.NaN;
  const age = Number.isFinite(heartbeatMs) ? now - heartbeatMs : null;
  const needsYou = Boolean(progress.wartetAuf);
  const isStale = !needsYou && age !== null && age >= STALE_AFTER_MS;

  const tone = needsYou
    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
    : isStale
      ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
      : 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';

  const dotTone = needsYou ? 'bg-amber-500' : isStale ? 'bg-gray-400' : 'bg-green-500 animate-pulse';

  const statusText = needsYou
    ? t('common:loopStatus.needsYou')
    : isStale
      ? t('common:loopStatus.stale', { duration: formatDuration(age as number) })
      : t('common:loopStatus.calm');

  const tooltip = needsYou
    ? undefined
    : isStale
      ? t('common:loopStatus.tooltipStale', { duration: formatDuration(age as number) })
      : t('common:loopStatus.tooltipFresh');

  const issue = typeof progress.issue === 'string' ? progress.issue : undefined;

  return (
    <div
      role="status"
      data-tooltip-id={tooltip ? 'app-tooltip' : undefined}
      data-tooltip-content={tooltip}
      className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${tone} transition-colors duration-200`}
    >
      <span className={`w-2 h-2 rounded-circle shrink-0 ${dotTone}`} />
      {issue && <span className="truncate max-w-[140px]">{t('common:loopStatus.runningOn', { issue })}</span>}
      <span className="opacity-80 whitespace-nowrap">{statusText}</span>
    </div>
  );
}
