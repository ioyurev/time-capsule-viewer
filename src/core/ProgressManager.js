/**
 * Менеджер прогресса - централизованная система управления прогресс барами
 * Использует CSS переменные и data-атрибуты для управления состоянием прогресса
 */
export class ProgressManager {
    constructor() {
        this.progressStates = new Map();
        this.initialized = false;
        // Проверяем, доступен ли document (браузер) или используем Node.js
        if (typeof document !== 'undefined') {
            this.initializeProgressBars();
        } else {
            this.initialized = true; // В Node.js считаем инициализированным
        }
    }

    /**
     * Инициализация всех прогресс баров на странице
     */
    initializeProgressBars() {
        // Проверяем, доступен ли document (браузер)
        if (typeof document === 'undefined') return;
        
        // Инициализируем все прогресс бары с 0% значением
        const progressBars = document.querySelectorAll('.progress-bar, .general-progress-bar, .validation-progress-bar');
        progressBars.forEach((progressBar, index) => {
            const id = progressBar.id || `progress-bar-${index}`;
            if (!progressBar.id) {
                progressBar.id = id;
            }
            this.setProgress(id, 0);
        });
        this.initialized = true;
    }

    /**
     * Установка прогресса для конкретного элемента
     * @param {string} elementId - ID элемента прогресс бара
     * @param {number} percentage - Процент прогресса (0-100)
     * @param {string} textId - ID элемента текста прогресса (опционально)
     * @param {number} currentValue - Текущее значение (опционально)
     * @param {number} maxValue - Максимальное значение (опционально)
     */
    setProgress(elementId, percentage, textId = null, currentValue = 0, maxValue = 0) {
        // Проверяем, доступен ли document (браузер) или используем Node.js
        if (typeof document === 'undefined') {
            // В Node.js только сохраняем состояние, не обновляем DOM
            const clampedPercentage = Math.min(100, Math.max(0, percentage));
            const roundedPercentage = Math.round(clampedPercentage);
            
            this.progressStates.set(elementId, {
                percentage: roundedPercentage,
                currentValue: currentValue,
                maxValue: maxValue,
                timestamp: Date.now()
            });
            return;
        }

        const progressBar = document.getElementById(elementId);
        if (!progressBar) {
            console.warn(`Progress bar with ID ${elementId} not found`);
            return;
        }

        // Ограничиваем процент от 0 до 100
        const clampedPercentage = Math.min(100, Math.max(0, percentage));
        const roundedPercentage = Math.round(clampedPercentage);

        // Устанавливаем CSS переменную для ширины
        progressBar.style.setProperty('--progress-width', `${roundedPercentage}%`);

        // Обновляем data-атрибуты для отслеживания состояния
        progressBar.setAttribute('data-progress', roundedPercentage);
        progressBar.setAttribute('data-current', currentValue);
        progressBar.setAttribute('data-max', maxValue);

        // Обновляем текст прогресса если указан
        if (textId) {
            const progressText = document.getElementById(textId);
            if (progressText) {
                progressText.textContent = `${roundedPercentage}%`;
            }
        }

        // Обновляем классы для цвета в зависимости от прогресса
        this.updateProgressClasses(progressBar, roundedPercentage);

        // Сохраняем состояние
        this.progressStates.set(elementId, {
            percentage: roundedPercentage,
            currentValue: currentValue,
            maxValue: maxValue,
            timestamp: Date.now()
        });

        // Вызываем кастомное событие для отслеживания изменений
        this.dispatchProgressEvent(progressBar, roundedPercentage, currentValue, maxValue);
    }

    /**
     * Обновление классов прогресса в зависимости от значения
     * @param {HTMLElement} progressBar - Элемент прогресс бара
     * @param {number} percentage - Процент прогресса
     */
    updateProgressClasses(progressBar, percentage) {
        // Удаляем все классы прогресса
        progressBar.classList.remove('success', 'warning', 'danger', 'empty', 'full');

        // Добавляем соответствующий класс
        if (percentage === 0) {
            progressBar.classList.add('empty');
        } else if (percentage >= 80) {
            progressBar.classList.add('success');
        } else if (percentage >= 40) {
            progressBar.classList.add('warning');
        } else if (percentage > 0) {
            progressBar.classList.add('danger');
        }

        if (percentage === 100) {
            progressBar.classList.add('full');
        }
    }

    /**
     * Вызов кастомного события прогресса
     * @param {HTMLElement} progressBar - Элемент прогресс бара
     * @param {number} percentage - Процент прогресса
     * @param {number} currentValue - Текущее значение
     * @param {number} maxValue - Максимальное значение
     */
    dispatchProgressEvent(progressBar, percentage, currentValue, maxValue) {
        const event = new CustomEvent('progressUpdate', {
            detail: {
                elementId: progressBar.id,
                percentage: percentage,
                currentValue: currentValue,
                maxValue: maxValue
            }
        });
        progressBar.dispatchEvent(event);
    }

    /**
     * Обновление прогресса по значению и максимальному значению
     * @param {string} elementId - ID элемента прогресс бара
     * @param {string} textId - ID элемента текста прогресса
     * @param {number} currentValue - Текущее значение
     * @param {number} maxValue - Максимальное значение
     */
    updateProgressByValue(elementId, textId, currentValue, maxValue) {
        const percentage = maxValue > 0 ? Math.round((currentValue / maxValue) * 100) : 0;
        this.setProgress(elementId, percentage, textId, currentValue, maxValue);
    }

    /**
     * Получение текущего состояния прогресса
     * @param {string} elementId - ID элемента прогресс бара
     * @returns {Object|null} - Объект с состоянием прогресса
     */
    getProgress(elementId) {
        return this.progressStates.get(elementId) || null;
    }

    /**
     * Сброс прогресса до 0%
     * @param {string} elementId - ID элемента прогресс бара
     * @param {string} textId - ID элемента текста прогресса (опционально)
     */
    resetProgress(elementId, textId = null) {
        this.setProgress(elementId, 0, textId, 0, 0);
    }

    /**
     * Сброс всех прогресс баров
     */
    resetAllProgress() {
        this.progressStates.forEach((_, elementId) => {
            const textId = elementId.replace('-bar', '-text');
            this.resetProgress(elementId, textId);
        });
    }

    /**
     * Проверка инициализации
     * @returns {boolean} - Инициализирован ли менеджер
     */
    isInitialized() {
        return this.initialized;
    }

    /**
     * Получение всех состояний прогресса
     * @returns {Map} - Карта всех состояний прогресса
     */
    getAllProgressStates() {
        return new Map(this.progressStates);
    }

    /**
     * Установка всех прогресс баров в начальное состояние
     */
    initializeValidationProgress() {
        // Инициализируем все прогресс бары валидации
        const validationProgressBars = [
            { id: 'news-progress-bar', textId: 'news-progress-text' },
            { id: 'personal-progress-bar', textId: 'personal-progress-text' },
            { id: 'keywords-progress-bar', textId: 'keywords-progress-text' },
            { id: 'memes-progress-bar', textId: 'memes-progress-text' },
            { id: 'general-progress-bar', textId: 'general-progress-text' }
        ];

        validationProgressBars.forEach(bar => {
            this.resetProgress(bar.id, bar.textId);
        });
    }
}
