import { logger } from '../logger.js';

/**
 * Класс для управления темами
 */
export class ThemeManager {
    /**
     * @param {DigitalTimeCapsule} parent - Родительский класс
     */
    constructor(parent) {
        this.parent = parent;
        this.logger = logger;
    }

    /**
     * Инициализация темы
     */
    initializeTheme() {
        const operationId = this.logger.pushOperation('initializeTheme');
        try {
            const savedTheme = localStorage.getItem('theme');
            const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            
            if (savedTheme) {
                document.body.setAttribute('data-theme', savedTheme);
                this.logger.debug('Тема загружена из localStorage', { theme: savedTheme });
            } else if (systemPrefersDark) {
                document.body.setAttribute('data-theme', 'dark');
                this.logger.debug('Тема определена по системным настройкам', { systemPrefersDark: true });
            } else {
                document.body.setAttribute('data-theme', 'light');
                this.logger.debug('Установлена светлая тема по умолчанию');
            }
            
            this.updateThemeToggleIcon();
            this.logger.info('Тема инициализирована успешно', { operationId });
        } catch (error) {
            this.logger.error('Ошибка при инициализации темы', { error: error.message, operationId });
            throw error;
        } finally {
            this.logger.popOperation();
        }
    }

    /**
     * Переключение темы
     */
    toggleTheme() {
        const currentTheme = document.body.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        this.updateThemeToggleIcon();
    }

    /**
     * Обновление иконки переключения темы
     */
    updateThemeToggleIcon() {
        const themeToggle = document.getElementById('theme-toggle');
        const currentTheme = document.body.getAttribute('data-theme');
        
        if (themeToggle) {
            themeToggle.innerHTML = currentTheme === 'dark' ? '☀️' : '🌙';
            themeToggle.setAttribute('aria-label', 
                currentTheme === 'dark' ? 'Переключить в светлую тему' : 'Переключить в темную тему'
            );
        }
    }
}
