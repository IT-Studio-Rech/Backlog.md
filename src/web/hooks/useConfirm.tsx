import { useCallback, useRef, useState } from 'react';
import ConfirmDialog, { type ConfirmTone } from '../components/ConfirmDialog';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

interface ConfirmState extends ConfirmOptions {
  isOpen: boolean;
}

// Drop-in, Promise-based replacement for window.confirm() so call sites keep
// the same `if (!(await confirm(...))) return;` shape but get the app's own
// branded dialog instead of the native browser confirm box.
export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ ...options, isOpen: true });
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setState((prev) => (prev ? { ...prev, isOpen: false } : prev));
  }, []);

  const confirmDialog = state ? (
    <ConfirmDialog
      isOpen={state.isOpen}
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      tone={state.tone}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null;

  return { confirm, confirmDialog };
}
