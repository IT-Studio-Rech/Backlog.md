import React from 'react';
import ThemeToggle from './ThemeToggle';
import RechLogo from './RechLogo';

interface NavigationProps {
    projectName: string;
}

const Navigation: React.FC<NavigationProps> = ({projectName}) => {
    return (
        <nav className="px-8 h-18 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 transition-colors duration-200">
            <div className="h-full flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{projectName || 'Loading...'}</h1>
                    <span className="text-sm text-gray-500 dark:text-gray-400">powered by</span>
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
                <ThemeToggle />
            </div>
        </nav>
    );
};

export default Navigation;