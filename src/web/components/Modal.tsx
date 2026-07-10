import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
	title: string;
	children: React.ReactNode;
	maxWidthClass?: string; // e.g., "max-w-4xl"
	disableEscapeClose?: boolean; // when true, Escape and backdrop click won't close (child can handle it)
	actions?: React.ReactNode; // optional actions rendered in header before close
	showCloseButton?: boolean; // hide when actions already provide an explicit close (e.g. Cancel)
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, maxWidthClass = "max-w-2xl", disableEscapeClose, actions, showCloseButton = true }) => {
	const { t } = useTranslation(['common']);
	const dialogRef = useRef<HTMLDivElement>(null);
	const titleRef = useRef<HTMLHeadingElement>(null);

	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && !disableEscapeClose) {
				onClose();
			}
		};

		if (isOpen) {
			if (!disableEscapeClose) {
				document.addEventListener('keydown', handleEscape);
			}
			document.body.style.overflow = 'hidden';
		}

		return () => {
			if (!disableEscapeClose) {
				document.removeEventListener('keydown', handleEscape);
			}
			document.body.style.overflow = 'unset';
		};
	}, [isOpen, onClose, disableEscapeClose]);

	// Move focus into the modal when it opens so keyboard users don't stay
	// tabbing through the page behind the backdrop. Skip it if a child already
	// claimed focus on mount (e.g. an input with autoFocus).
	useEffect(() => {
		if (!isOpen) return;
		if (dialogRef.current?.contains(document.activeElement)) return;
		titleRef.current?.focus();
	}, [isOpen]);

	if (!isOpen) return null;

	return (
		<div
			className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center z-50 p-4"
			onClick={disableEscapeClose ? undefined : onClose}
			role="presentation"
		>
			<div
				ref={dialogRef}
				className={`bg-white dark:bg-gray-800 rounded-lg shadow-2xl ${maxWidthClass} w-full max-h-[94vh] overflow-y-auto transition-colors duration-200`}
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="modal-title"
			>
				<div className="sticky top-0 z-10 flex items-center justify-between px-6 pt-4 pb-3 border-b border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 backdrop-blur supports-[backdrop-filter]:bg-white/75 supports-[backdrop-filter]:dark:bg-gray-800/75">
					<h2 id="modal-title" ref={titleRef} tabIndex={-1} className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
					<div className="flex items-center gap-2">
						{actions}
						{showCloseButton && (
							<button
								onClick={onClose}
								className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded p-1 transition-colors duration-200 text-2xl leading-none w-8 h-8 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400"
								aria-label={t('common:closeModal')}
							>
								×
							</button>
						)}
					</div>
				</div>
				<div className="px-6 pt-4 pb-6">
					{children}
				</div>
			</div>
		</div>
	);
};

export default Modal;
