import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../lib/api';
import { SuccessToast } from './SuccessToast';
import Select from './Select';
import type { BacklogConfig } from '../../types';
import { pickDefaultLabelColor } from '../utils/labelColors';

const Settings: React.FC = () => {
	const { t } = useTranslation(['settings', 'common']);
	const [config, setConfig] = useState<BacklogConfig | null>(null);
	const [originalConfig, setOriginalConfig] = useState<BacklogConfig | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showSuccess, setShowSuccess] = useState(false);
	const [statuses, setStatuses] = useState<string[]>([]);
	const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

	useEffect(() => {
		loadConfig();
		loadStatuses();
	}, []);

	const loadConfig = async () => {
		try {
			setLoading(true);
			const data = await apiClient.fetchConfig();
			setConfig(data);
			setOriginalConfig(data);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : t('settings:loadError'));
		} finally {
			setLoading(false);
		}
	};

	const loadStatuses = async () => {
		try {
			const data = await apiClient.fetchStatuses();
			setStatuses(data);
		} catch (err) {
			console.error('Failed to load statuses:', err);
		}
	};

	const handleInputChange = (field: keyof BacklogConfig, value: any) => {
		if (!config) return;
		
		setConfig({
			...config,
			[field]: value
		});

		// Clear validation error for this field
		if (validationErrors[field]) {
			setValidationErrors({
				...validationErrors,
				[field]: ''
			});
		}
	};

	const normalizeDefinitionOfDone = (items: string[] | undefined): string[] | undefined => {
		const normalized = (items ?? []).map((item) => item.trim()).filter((item) => item.length > 0);
		return normalized.length > 0 ? normalized : undefined;
	};

	const validateConfig = (): boolean => {
		const errors: Record<string, string> = {};

		if (!config) return false;

		// Validate project name
		if (!config.projectName.trim()) {
			errors.projectName = t('settings:project.projectName.error');
		}

		// Validate port number
		if (config.defaultPort && (config.defaultPort < 1 || config.defaultPort > 65535)) {
			errors.defaultPort = t('settings:webUi.defaultPort.error');
		}


		setValidationErrors(errors);
		return Object.keys(errors).length === 0;
	};

	const handleSave = async () => {
		if (!config || !validateConfig()) return;

		try {
			setSaving(true);
			const normalizedConfig = {
				...config,
				definitionOfDone: normalizeDefinitionOfDone(config.definitionOfDone),
			};
			await apiClient.updateConfig(normalizedConfig);
			setConfig(normalizedConfig);
			setOriginalConfig(normalizedConfig);
			setShowSuccess(true);
			setTimeout(() => setShowSuccess(false), 3000);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : t('settings:saveError'));
		} finally {
			setSaving(false);
		}
	};

	const handleCancel = () => {
		setConfig(originalConfig);
		setValidationErrors({});
	};

	const hasUnsavedChanges = JSON.stringify(config) !== JSON.stringify(originalConfig);

	if (loading) {
		return (
			<div className="w-full px-6 py-8">
				<div className="flex items-center justify-center py-12">
					<div className="text-lg text-gray-600 dark:text-gray-300">{t('settings:loadingSettings')}</div>
				</div>
			</div>
		);
	}

	if (!config) {
		return (
			<div className="w-full px-6 py-8">
				<div className="flex items-center justify-center py-12">
					<div className="text-red-600 dark:text-red-400">{t('settings:loadError')}</div>
				</div>
			</div>
		);
	}

	return (
		<div className="w-full px-6 py-8 transition-colors duration-200">
			<div className="max-w-4xl mx-auto">
				<h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8">{t('settings:title')}</h1>

				{error && (
					<div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
						<p className="text-sm text-red-700 dark:text-red-400">{error}</p>
					</div>
				)}

				<div className="space-y-8">
					{/* Project Settings */}
					<div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
						<h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('settings:project.title')}</h2>
						<div className="space-y-4">
							<div>
								<label htmlFor="projectName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									{t('settings:project.projectName.label')}
								</label>
								<input
									id="projectName"
									type="text"
									value={config.projectName}
									onChange={(e) => handleInputChange('projectName', e.target.value)}
									className={`w-full px-3 py-2 border rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200 ${
										validationErrors.projectName 
											? 'border-red-500 dark:border-red-400' 
											: 'border-gray-300 dark:border-gray-600'
									}`}
								/>
								{validationErrors.projectName && (
									<p className="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.projectName}</p>
								)}
							</div>

							<div>
								<label htmlFor="dateFormat" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									{t('settings:project.dateFormat.label')}
								</label>
								<Select
									id="dateFormat"
									value={config.dateFormat}
									onChange={(e) => handleInputChange('dateFormat', e.target.value)}
									uiSize="md"
								>
									<option value="yyyy-mm-dd">yyyy-mm-dd</option>
									<option value="dd/mm/yyyy">dd/mm/yyyy</option>
									<option value="mm/dd/yyyy">mm/dd/yyyy</option>
								</Select>
								<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
									{t('settings:project.dateFormat.help')}
								</p>
							</div>
						</div>
					</div>

					{/* Workflow Settings */}
					<div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
						<h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('settings:workflow.title')}</h2>
						<div className="space-y-4">
							<div>
								<label className="flex items-center justify-between">
									<span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings:workflow.autoCommit.label')}</span>
									<div className="relative inline-flex items-center cursor-pointer">
										<input
											type="checkbox"
											checked={config.autoCommit}
											onChange={(e) => handleInputChange('autoCommit', e.target.checked)}
											className="sr-only peer"
										/>
										<div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-500 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-circle peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-circle after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
									</div>
								</label>
								<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
									{t('settings:workflow.autoCommit.help')}
								</p>
							</div>

							<div>
								<label className="flex items-center justify-between">
									<span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings:workflow.remoteOperations.label')}</span>
									<div className="relative inline-flex items-center cursor-pointer">
										<input
											type="checkbox"
											checked={config.remoteOperations}
											onChange={(e) => handleInputChange('remoteOperations', e.target.checked)}
											className="sr-only peer"
										/>
										<div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-500 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-circle peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-circle after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
									</div>
								</label>
								<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
									{t('settings:workflow.remoteOperations.help')}
								</p>
							</div>

							<div>
								<label htmlFor="defaultStatus" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									{t('settings:workflow.defaultStatus.label')}
								</label>
								<Select
									id="defaultStatus"
									value={config.defaultStatus}
									onChange={(e) => handleInputChange('defaultStatus', e.target.value)}
									uiSize="md"
								>
									{statuses.map(status => (
										<option key={status} value={status}>{status}</option>
									))}
								</Select>
								<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
									{t('settings:workflow.defaultStatus.help')}
								</p>
							</div>

							<div>
								<label htmlFor="defaultEditor" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									{t('settings:workflow.defaultEditor.label')}
								</label>
								<input
									id="defaultEditor"
									type="text"
									value={config.defaultEditor}
									onChange={(e) => handleInputChange('defaultEditor', e.target.value)}
									className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200"
									placeholder={t('settings:workflow.defaultEditor.placeholder')}
								/>
								<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
									{t('settings:workflow.defaultEditor.help')}
								</p>
							</div>
						</div>
					</div>

					{/* Definition of Done Defaults */}
					<div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
						<h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('settings:definitionOfDone.title')}</h2>
						<p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
							{t('settings:definitionOfDone.description')}
						</p>
						<div className="space-y-3">
							{(config.definitionOfDone ?? []).map((item, index) => (
								<div key={`definition-of-done-${index}`} className="flex items-center gap-2">
									<input
										type="text"
										value={item}
										onChange={(e) => {
											const next = [...(config.definitionOfDone ?? [])];
											next[index] = e.target.value;
											handleInputChange('definitionOfDone', next);
										}}
										className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200"
										placeholder={t('settings:definitionOfDone.itemPlaceholder')}
									/>
									<button
										type="button"
										onClick={() => {
											const next = (config.definitionOfDone ?? []).filter((_, idx) => idx !== index);
											handleInputChange('definitionOfDone', next);
										}}
										className="px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:underline"
									>
										{t('common:remove')}
									</button>
								</div>
							))}
							<button
								type="button"
								onClick={() => handleInputChange('definitionOfDone', [...(config.definitionOfDone ?? []), ""])}
								className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
							>
								{t('settings:definitionOfDone.addItem')}
							</button>
						</div>
					</div>

					{/* Labels & Colors */}
					<div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
						<h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('settings:labels.title')}</h2>
						<p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
							{t('settings:labels.description')}
						</p>
						<div className="space-y-3">
							{config.labels.map((label, index) => {
								const color = config.labelColors?.[label] ?? pickDefaultLabelColor(label || `label-${index}`);
								return (
									<div key={`label-${index}`} className="flex items-center gap-2">
										<input
											type="color"
											value={color}
											onChange={(e) => {
												const nextColors = { ...(config.labelColors ?? {}) };
												nextColors[label] = e.target.value;
												handleInputChange('labelColors', nextColors);
											}}
											className="h-9 w-10 shrink-0 rounded border border-gray-300 dark:border-gray-600 bg-transparent cursor-pointer"
											title={t('settings:labels.colorPickerTitle')}
										/>
										<input
											type="text"
											value={label}
											onChange={(e) => {
												const newName = e.target.value;
												const nextLabels = [...config.labels];
												nextLabels[index] = newName;
												const nextColors = { ...(config.labelColors ?? {}) };
												if (label !== newName && label in nextColors) {
													nextColors[newName] = nextColors[label] as string;
													delete nextColors[label];
												}
												setConfig({ ...config, labels: nextLabels, labelColors: nextColors });
											}}
											className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200"
											placeholder={t('settings:labels.itemPlaceholder')}
										/>
										<button
											type="button"
											onClick={() => {
												const nextLabels = config.labels.filter((_, idx) => idx !== index);
												const nextColors = { ...(config.labelColors ?? {}) };
												delete nextColors[label];
												setConfig({ ...config, labels: nextLabels, labelColors: nextColors });
											}}
											className="px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:underline"
										>
											{t('common:remove')}
										</button>
									</div>
								);
							})}
							<button
								type="button"
								onClick={() => handleInputChange('labels', [...config.labels, ""])}
								className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
							>
								{t('settings:labels.addItem')}
							</button>
						</div>
					</div>

							</button>
						</div>
					</div>

					{/* Web UI Settings */}
					<div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
						<h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('settings:webUi.title')}</h2>
						<div className="space-y-4">
							<div>
								<label htmlFor="defaultPort" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									{t('settings:webUi.defaultPort.label')}
								</label>
								<input
									id="defaultPort"
									type="number"
									min="1"
									max="65535"
									value={config.defaultPort || 6420}
									onChange={(e) => handleInputChange('defaultPort', parseInt(e.target.value) || 6420)}
									className={`w-full px-3 py-2 border rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200 ${
										validationErrors.defaultPort 
											? 'border-red-500 dark:border-red-400' 
											: 'border-gray-300 dark:border-gray-600'
									}`}
								/>
								{validationErrors.defaultPort && (
									<p className="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.defaultPort}</p>
								)}
							</div>

							<div>
								<label className="flex items-center justify-between">
									<span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings:webUi.autoOpenBrowser.label')}</span>
									<div className="relative inline-flex items-center cursor-pointer">
										<input
											type="checkbox"
											checked={config.autoOpenBrowser}
											onChange={(e) => handleInputChange('autoOpenBrowser', e.target.checked)}
											className="sr-only peer"
										/>
										<div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-500 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-circle peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-circle after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
									</div>
								</label>
								<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
									{t('settings:webUi.autoOpenBrowser.help')}
								</p>
							</div>

							<div>
								<label className="flex items-center justify-between">
									<span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings:webUi.hideEmptyColumns.label')}</span>
									<div className="relative inline-flex items-center cursor-pointer">
										<input
											type="checkbox"
											checked={config.hideEmptyColumns ?? false}
											onChange={(e) => handleInputChange('hideEmptyColumns', e.target.checked)}
											className="sr-only peer"
										/>
										<div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-500 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-circle peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-circle after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
									</div>
								</label>
								<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
									{t('settings:webUi.hideEmptyColumns.help')}
								</p>
							</div>
						</div>
					</div>

					{/* Advanced Settings */}
					<div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
						<h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('settings:advanced.title')}</h2>
						<div className="space-y-4">
							<div>
								<label htmlFor="maxColumnWidth" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									{t('settings:advanced.maxColumnWidth.label')}
								</label>
								<input
									id="maxColumnWidth"
									type="number"
									min="20"
									max="200"
									value={config.maxColumnWidth}
									onChange={(e) => handleInputChange('maxColumnWidth', parseInt(e.target.value) || 80)}
									className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200"
								/>
								<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
									{t('settings:advanced.maxColumnWidth.help')}
								</p>
							</div>

							<div>
								<label htmlFor="taskResolutionStrategy" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									{t('settings:advanced.taskResolutionStrategy.label')}
								</label>
								<Select
									id="taskResolutionStrategy"
									value={config.taskResolutionStrategy}
									onChange={(e) => handleInputChange('taskResolutionStrategy', e.target.value as 'most_recent' | 'most_progressed')}
									uiSize="md"
								>
									<option value="most_recent">{t('settings:advanced.taskResolutionStrategy.mostRecent')}</option>
									<option value="most_progressed">{t('settings:advanced.taskResolutionStrategy.mostProgressed')}</option>
								</Select>
								<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
									{t('settings:advanced.taskResolutionStrategy.help')}
								</p>
							</div>

							<div>
								<label htmlFor="zeroPaddedIds" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									{t('settings:advanced.zeroPaddedIds.label')}
								</label>
								<input
									id="zeroPaddedIds"
									type="number"
									min="0"
									max="10"
									value={config.zeroPaddedIds || 0}
									onChange={(e) => handleInputChange('zeroPaddedIds', parseInt(e.target.value) || 0)}
									className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200"
								/>
								<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
									{t('settings:advanced.zeroPaddedIds.help')}
								</p>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									{t('settings:advanced.taskPrefix.label')} <span className="text-gray-400 dark:text-gray-500 font-normal">{t('settings:advanced.taskPrefix.readOnly')}</span>
								</label>
								<input
									type="text"
									value={(config.prefixes?.task || 'task').toUpperCase()}
									disabled
									className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
								/>
								<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
									{t('settings:advanced.taskPrefix.help')}
								</p>
							</div>
						</div>
					</div>

					{/* Save/Cancel Buttons */}
						<div className="flex items-center justify-end space-x-4">
							<button
								onClick={handleCancel}
								disabled={!hasUnsavedChanges || saving}
								className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 disabled:opacity-50 transition-colors duration-200"
							>
								{t('common:cancel')}
							</button>
							<button
								onClick={handleSave}
								disabled={!hasUnsavedChanges || saving}
								className="px-4 py-2 bg-blue-500 dark:bg-blue-600 text-white rounded-lg hover:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:focus:ring-blue-500 disabled:opacity-50 transition-colors duration-200"
							>
								{saving ? t('common:saving') : t('settings:actions.saveChanges')}
							</button>
						</div>
				</div>
			</div>

			{/* Success Toast */}
			{showSuccess && (
				<SuccessToast
					message={t('settings:saveSuccess')}
					onDismiss={() => setShowSuccess(false)}
				/>
			)}
		</div>
	);
};

export default Settings;
