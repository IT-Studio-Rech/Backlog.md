import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolveLabelColor } from "../utils/labelColors";

interface LabelFilterDropdownProps {
	availableLabels: string[];
	selectedLabels: string[];
	onChange: (labels: string[]) => void;
	menuId: string;
	className?: string;
	labelColors?: Record<string, string>;
}

export default function LabelFilterDropdown({
	availableLabels,
	selectedLabels,
	onChange,
	menuId,
	className = "min-w-[200px]",
	labelColors,
}: LabelFilterDropdownProps) {
	const { t } = useTranslation(["common"]);
	const [isOpen, setIsOpen] = useState(false);
	const [canScrollMore, setCanScrollMore] = useState(false);
	const buttonRef = useRef<HTMLButtonElement | null>(null);
	const menuRef = useRef<HTMLDivElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);

	const updateScrollHint = () => {
		const el = listRef.current;
		if (!el) return;
		setCanScrollMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
	};

	useEffect(() => {
		if (!isOpen) return;
		const raf = requestAnimationFrame(updateScrollHint);
		return () => cancelAnimationFrame(raf);
	}, [isOpen, availableLabels.length, selectedLabels.length]);

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

	const toggleLabel = (label: string) => {
		const next = selectedLabels.includes(label)
			? selectedLabels.filter((item) => item !== label)
			: [...selectedLabels, label];
		onChange(next);
	};

	return (
		<div className="relative">
			<button
				type="button"
				ref={buttonRef}
				onClick={() => setIsOpen((open) => !open)}
				aria-expanded={isOpen}
				aria-controls={menuId}
				className={`${className} h-8 py-1.5 pl-3 pr-8 text-sm border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200 text-left`}
			>
				<div className="flex items-center justify-between gap-2">
					<span className="truncate">{t("common:labelFilter.label")}</span>
					<span className="truncate max-w-[70px] shrink-0 text-xs text-gray-500 dark:text-gray-400">
						{selectedLabels.length === 0
							? t("common:labelFilter.all")
							: selectedLabels.length === 1
								? selectedLabels[0]
								: t("common:labelFilter.selectedCount", { count: selectedLabels.length })}
					</span>
				</div>
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
					<div ref={listRef} onScroll={updateScrollHint} className="max-h-56 overflow-y-auto scrollbar-hide">
						{availableLabels.length === 0 ? (
							<div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">{t("common:labelFilter.noLabels")}</div>
						) : (
							availableLabels.map((label) => {
								const isSelected = selectedLabels.includes(label);
								const color = resolveLabelColor(label, labelColors);
								return (
									<label
										key={label}
										className="flex items-center gap-2 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
									>
										<input
											type="checkbox"
											checked={isSelected}
											onChange={() => toggleLabel(label)}
											className="h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400"
										/>
										{color && (
											<span
												className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
												style={{ backgroundColor: color }}
												aria-hidden="true"
											/>
										)}
										<span className="truncate">{label}</span>
									</label>
								);
							})
						)}
						{selectedLabels.length > 0 && (
							<button
								type="button"
								className="w-full text-left px-3 py-2 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 border-t border-gray-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400"
								onClick={() => {
									onChange([]);
									setIsOpen(false);
								}}
							>
								{t("common:labelFilter.clear")}
							</button>
						)}
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
}
