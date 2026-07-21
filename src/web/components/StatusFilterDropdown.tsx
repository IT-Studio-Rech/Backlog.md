import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { isTerminalStatus } from "../../utils/terminal-status.ts";

interface StatusFilterDropdownProps {
	availableStatuses: string[];
	selected: string[];
	onChange: (statuses: string[]) => void;
	menuId: string;
	className?: string;
}

export default function StatusFilterDropdown({
	availableStatuses,
	selected,
	onChange,
	menuId,
	className = "min-w-[140px]",
}: StatusFilterDropdownProps) {
	const { t } = useTranslation(["common"]);
	const [isOpen, setIsOpen] = useState(false);
	const [canScrollMore, setCanScrollMore] = useState(false);
	const buttonRef = useRef<HTMLButtonElement | null>(null);
	const menuRef = useRef<HTMLDivElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);

	// The "Offen" quick option always means "every status except the terminal
	// (last configured) one" — it stays correct even if the customer renames
	// or reorders statuses, since it derives from isTerminalStatus rather than
	// a hardcoded status name.
	const openStatuses = availableStatuses.filter((status) => !isTerminalStatus(status, availableStatuses));

	const updateScrollHint = () => {
		const el = listRef.current;
		if (!el) return;
		setCanScrollMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
	};

	useEffect(() => {
		if (!isOpen) return;
		const raf = requestAnimationFrame(updateScrollHint);
		return () => cancelAnimationFrame(raf);
	}, [isOpen, availableStatuses.length, selected.length]);

	useEffect(() => {
		if (!isOpen) return;
		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;
			if (
				buttonRef.current &&
				menuRef.current &&
				!buttonRef.current.contains(target) &&
				!menuRef.current.contains(target)
			) {
				setIsOpen(false);
			}
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setIsOpen(false);
				buttonRef.current?.focus();
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [isOpen]);

	const toggleStatus = (status: string) => {
		const next = selected.includes(status) ? selected.filter((item) => item !== status) : [...selected, status];
		onChange(next);
	};

	const selectOpenStatuses = () => {
		onChange(openStatuses);
		setIsOpen(false);
	};

	const summary =
		selected.length === 0
			? t("common:statusFilter.all")
			: selected.length === 1
				? selected[0]
				: t("common:statusFilter.selectedCount", { count: selected.length });

	return (
		<div className="relative">
			<button
				type="button"
				ref={buttonRef}
				onClick={() => setIsOpen((open) => !open)}
				aria-expanded={isOpen}
				aria-controls={menuId}
				aria-label={t("common:statusFilter.ariaLabel")}
				className={`${className} h-8 py-1.5 pl-3 pr-8 text-sm border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200 text-left`}
			>
				<span className="block truncate">{summary}</span>
			</button>
			<svg
				className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
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
					className="absolute z-50 mt-2 w-[220px] rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-800 shadow-lg dark:shadow-none overflow-hidden"
				>
					{openStatuses.length > 0 && (
						<button
							type="button"
							className="w-full text-left px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400"
							onClick={selectOpenStatuses}
						>
							{t("common:statusFilter.openQuickOption")}
						</button>
					)}
					<div ref={listRef} onScroll={updateScrollHint} className="max-h-56 overflow-y-auto scrollbar-hide">
						{availableStatuses.length === 0 ? (
							<div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
								{t("common:statusFilter.noStatuses")}
							</div>
						) : (
							availableStatuses.map((status) => {
								const isSelected = selected.includes(status);
								return (
									<label
										key={status}
										className="flex items-center gap-2 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
									>
										<input
											type="checkbox"
											checked={isSelected}
											onChange={() => toggleStatus(status)}
											className="h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400"
										/>
										<span className="truncate">{status}</span>
									</label>
								);
							})
						)}
						{selected.length > 0 && (
							<button
								type="button"
								className="w-full text-left px-3 py-2 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 border-t border-gray-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400"
								onClick={() => {
									onChange([]);
									setIsOpen(false);
								}}
							>
								{t("common:statusFilter.clear")}
							</button>
						)}
					</div>
					{canScrollMore && (
						<div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pt-4 pb-1 bg-gradient-to-t from-white dark:from-gray-800 to-transparent">
							<svg
								className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 animate-bounce"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
							</svg>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
