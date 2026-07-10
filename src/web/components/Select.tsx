import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

interface SelectChangeEvent {
  target: { value: string };
}

interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'onChange' | 'children'> {
  wrapperClassName?: string;
  // 'sm' (h-8) for compact toolbars/filter bars, 'md' (h-9) for form fields
  // that sit next to other h-9 inputs (e.g. task modal sidebar, settings).
  uiSize?: 'sm' | 'md';
  onChange?: (event: SelectChangeEvent) => void;
  children: React.ReactNode;
}

// Bg tone is tied to size because it's really about context: 'sm' toolbars sit
// directly on the page background (surface 900) so the field reads one tier
// lighter at 800; 'md' form fields sit inside an already-800 panel, so they
// need to go one tier lighter again (700) to read as a recessed, interactive
// field rather than blending into the panel around them.
const SIZE_CLASSES: Record<NonNullable<SelectProps['uiSize']>, string> = {
  sm: 'h-8 py-1.5 bg-white dark:bg-gray-800',
  md: 'h-9 py-2 bg-white dark:bg-gray-700',
};

interface OptionData {
  value: string;
  label: React.ReactNode;
}

// A native <select>'s closed box can be fully restyled with CSS (border,
// chevron, height, appearance: none, ...) but the moment it's opened, the
// options list is rendered by the OS/browser itself and cannot be styled at
// all — that's a hard platform limitation, not a CSS gap. So instead of a
// real <select>, this reads <option> children the same way a <select> would
// and renders its own button + listbox, matching LabelFilterDropdown's
// pattern. Callers keep writing plain <option value="...">label</option>
// children and reading e.target.value in onChange, same as a native select.
function extractOptions(children: React.ReactNode): OptionData[] {
  return React.Children.toArray(children).flatMap((child) => {
    if (!React.isValidElement(child) || child.type !== 'option') return [];
    const props = child.props as { value?: string; children?: React.ReactNode };
    return [{ value: props.value ?? '', label: props.children }];
  });
}

const CheckIcon: React.FC = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
  </svg>
);

const Select: React.FC<SelectProps> = ({
  wrapperClassName = '',
  className = '',
  uiSize = 'sm',
  disabled,
  value,
  onChange,
  children,
  id,
  'aria-label': ariaLabel,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [canScrollMore, setCanScrollMore] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const updateScrollHint = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setCanScrollMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
  }, []);

  const options = useMemo(() => extractOptions(children), [children]);
  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === value),
    [options, value],
  );
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  useEffect(() => {
    if (isOpen) setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [isOpen, selectedIndex]);

  useEffect(() => {
    if (!isOpen) return;
    // Run after the menu has laid out so scrollHeight/clientHeight are accurate.
    const raf = requestAnimationFrame(updateScrollHint);
    return () => cancelAnimationFrame(raf);
  }, [isOpen, options.length, updateScrollHint]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const selectValue = useCallback(
    (next: string) => {
      onChange?.({ target: { value: next } });
      setIsOpen(false);
      buttonRef.current?.focus();
    },
    [onChange],
  );

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    if (!isOpen) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setIsOpen(true);
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, options.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const option = options[highlightedIndex];
      if (option) selectValue(option.value);
    }
  };

  return (
    <div className={`relative ${wrapperClassName}`}>
      <button
        type="button"
        ref={buttonRef}
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-label={ariaLabel}
        onClick={() => !disabled && setIsOpen((open) => !open)}
        onKeyDown={handleKeyDown}
        className={`w-full ${SIZE_CLASSES[uiSize]} pl-3 pr-8 text-sm border border-gray-200 dark:border-white/10 rounded-lg text-left text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200 ${disabled ? 'opacity-60 cursor-not-allowed' : ''} ${className}`}
      >
        <span className="block truncate">{selectedOption?.label ?? ''}</span>
      </button>
      <svg
        className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
      {isOpen && (
        <div
          id={menuId}
          ref={menuRef}
          className="absolute z-50 mt-1 w-full min-w-max rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-800 shadow-lg dark:shadow-none overflow-hidden"
        >
          <div
            ref={listRef}
            role="listbox"
            onScroll={updateScrollHint}
            className="max-h-64 overflow-y-auto scrollbar-hide py-1"
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isHighlighted = index === highlightedIndex;
              return (
                <div
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => selectValue(option.value)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 cursor-pointer transition-colors duration-100 ${
                    isHighlighted ? 'bg-gray-100 dark:bg-white/5' : ''
                  }`}
                >
                  <span className="w-3.5 shrink-0 text-stone-500 dark:text-stone-400">
                    {isSelected && <CheckIcon />}
                  </span>
                  <span className="truncate">{option.label}</span>
                </div>
              );
            })}
          </div>
          {canScrollMore && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pt-4 pb-1 bg-gradient-to-t from-white dark:from-gray-800 to-transparent">
              <svg className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Select;
