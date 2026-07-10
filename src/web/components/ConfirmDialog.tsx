import React from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';

export type ConfirmTone = 'default' | 'danger';

interface ConfirmDialogProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation(['common']);

  const confirmButtonClass =
    tone === 'danger'
      ? 'bg-red-500 dark:bg-red-600 hover:bg-red-600 dark:hover:bg-red-700 focus:ring-red-500 dark:focus:ring-red-400'
      : 'bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-700 focus:ring-stone-500 dark:focus:ring-stone-400';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title ?? t('common:confirmDialog.defaultTitle')}
      maxWidthClass="max-w-sm"
      showCloseButton={false}
    >
      <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>
      <div className="flex justify-end gap-3 mt-6">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400"
        >
          {cancelLabel ?? t('common:cancel')}
        </button>
        <button
          onClick={onConfirm}
          autoFocus
          className={`px-4 py-2 text-sm font-medium text-white rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 ${confirmButtonClass}`}
        >
          {confirmLabel ?? t('common:confirmDialog.defaultConfirm')}
        </button>
      </div>
    </Modal>
  );
};

export default ConfirmDialog;
