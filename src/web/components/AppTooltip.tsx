import { Tooltip } from 'react-tooltip';

interface ChecklistPayload {
  title: string;
  items: { text: string; checked: boolean }[];
}

interface DependenciesPayload {
  title: string;
  deps: { id: string; title?: string }[];
}

function parsePayload<T>(activeAnchor: Element | null): T | null {
  const raw = activeAnchor?.getAttribute('data-tooltip-payload');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// Single shared <Tooltip> instance for the whole app. Most anchors just use
// data-tooltip-content (plain string). A few TaskCard chips need richer,
// structured content (checklists, dependency lists) that a string can't
// express — those set data-tooltip-kind + a JSON data-tooltip-payload,
// rendered here instead of mounting a second Tooltip just for TaskCard.
export function AppTooltip() {
  return (
    <Tooltip
      id="app-tooltip"
      place="top"
      opacity={1}
      render={({ content, activeAnchor }) => {
        const variant = activeAnchor?.getAttribute('data-tooltip-kind');

        if (variant === 'checklist') {
          const payload = parsePayload<ChecklistPayload>(activeAnchor);
          if (!payload) return content;
          return (
            <div className="max-w-[224px]">
              <div className="mb-1 font-semibold text-gray-300 dark:text-gray-400">{payload.title}</div>
              <div className="space-y-1">
                {payload.items.map((item, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className={item.checked ? 'text-teal-400' : 'text-white/30'}>{item.checked ? '✓' : '○'}</span>
                    <span className="truncate">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        if (variant === 'dependencies') {
          const payload = parsePayload<DependenciesPayload>(activeAnchor);
          if (!payload) return content;
          return (
            <div className="max-w-[224px]">
              <div className="mb-1 font-semibold text-gray-300 dark:text-gray-400">{payload.title}</div>
              <div className="space-y-1">
                {payload.deps.map((dep) => (
                  <div key={dep.id} className="flex items-start gap-1.5">
                    <span className="font-mono text-gray-400 shrink-0">{dep.id}</span>
                    {dep.title && <span className="truncate">{dep.title}</span>}
                  </div>
                ))}
              </div>
            </div>
          );
        }

        return content;
      }}
    />
  );
}
