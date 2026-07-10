import React, { createContext, useContext, useEffect, useState } from 'react';
import i18n from '../i18n';

type Language = 'de' | 'en';

interface LanguageContextType {
	language: Language;
	toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const useLanguage = () => {
	const context = useContext(LanguageContext);
	if (context === undefined) {
		throw new Error('useLanguage must be used within a LanguageProvider');
	}
	return context;
};

interface LanguageProviderProps {
	children: React.ReactNode;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
	const [language, setLanguage] = useState<Language>(() => {
		// German is the primary language: default unless the user has explicitly
		// switched to English before. Deliberately NOT browser-locale-detected.
		const saved = localStorage.getItem('backlog-language');
		return saved === 'en' ? 'en' : 'de';
	});

	useEffect(() => {
		document.documentElement.lang = language;
		localStorage.setItem('backlog-language', language);
		void i18n.changeLanguage(language);
	}, [language]);

	const toggleLanguage = () => {
		setLanguage((prev) => (prev === 'de' ? 'en' : 'de'));
	};

	return (
		<LanguageContext.Provider value={{ language, toggleLanguage }}>
			{children}
		</LanguageContext.Provider>
	);
};
