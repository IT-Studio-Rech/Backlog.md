import React from 'react';
import { useTranslation } from 'react-i18next';
import ThemeToggle from './ThemeToggle';
import RechLogo from './RechLogo';
import { useLanguage } from '../contexts/LanguageContext';

interface NavigationProps {
    projectName: string;
}

const LanguageToggle: React.FC = () => {
    const { language, toggleLanguage } = useLanguage();

    return (
        <button
            onClick={toggleLanguage}
            className="px-2 py-1 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-stone-500 focus:ring-offset-2 dark:focus:ring-stone-400 dark:focus:ring-offset-gray-900"
            aria-label={language === 'de' ? 'Switch to English' : 'Auf Deutsch wechseln'}
            title={language === 'de' ? 'Switch to English' : 'Auf Deutsch wechseln'}
        >
            {language === 'de' ? 'DE' : 'EN'}
        </button>
    );
};

const Navigation: React.FC<NavigationProps> = ({projectName}) => {
    const { t } = useTranslation(['nav', 'common']);

    return (
        <nav className="px-8 h-18 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 transition-colors duration-200">
            <div className="h-full flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{projectName || t('common:loading')}</h1>
                    <span className="text-sm text-gray-500 dark:text-gray-400">{t('nav:poweredBy')}</span>
                    <a
                        href="https://rech.studio"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="rech.studio"
                        className="inline-flex items-center text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white transition-colors duration-200"
                    >
                        <RechLogo className="h-4 w-auto" />
                    </a>
                </div>
                <div className="flex items-center gap-2">
                    <LanguageToggle />
                    <ThemeToggle />
                </div>
            </div>
        </nav>
    );
};

export default Navigation;