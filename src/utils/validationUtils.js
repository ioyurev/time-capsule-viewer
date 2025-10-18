/**
 * Утилиты для валидации данных
 */
export class ValidationUtils {
    /**
     * Проверяет, является ли строка допустимым именем файла
     * @param {string} filename - Имя файла для проверки
     * @returns {boolean} Допустимо ли имя файла
     */
    static isValidFilename(filename) {
        if (typeof filename !== 'string') return false;
        
        // Проверяем на опасные символы пути
        if (filename.includes('../') || filename.includes('..\\')) {
            return false;
        }
        
        // Проверяем на недопустимые символы в именах файлов
        const invalidChars = /[<>:"/\\|?*]/;
        if (invalidChars.test(filename)) {
            return false;
        }
        
        // Проверяем, не является ли имя файлом или папкой системным
        const systemNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
        const baseName = filename.split('.')[0].toUpperCase();
        if (systemNames.includes(baseName)) {
            return false;
        }
        
        return true;
    }

    /**
     * Санитизирует имя файла
     * @param {string} filename - Имя файла для санитизации
     * @returns {string} Санитизированное имя файла
     */
    static sanitizeFilename(filename) {
        if (typeof filename !== 'string') return '';
        
        // Проверяем, что имя файла не содержит опасные символы пути
        if (filename.includes('../') || filename.includes('..\\')) {
            return '';
        }
        
        // Заменяем недопустимые символы на подчеркивания
        let sanitized = filename.replace(/[<>:"/\\|?*]/g, '_');
        
        // Удаляем символы перевода строки
        sanitized = sanitized.replace(/[\r\n]/g, '');
        
        return sanitized;
    }

    /**
     * Проверяет, является ли строка допустимым типом файла
     * @param {string} type - Тип файла для проверки
     * @returns {boolean} Допустим ли тип
     */
    static isValidType(type) {
        if (typeof type !== 'string') return false;
        
        const validTypes = [
            'НОВОСТЬ', 'МЕДИА', 'МЕМ', 'ФОТО', 'ВИДЕО', 'АУДИО', 
            'ДОКУМЕНТ', 'ТЕКСТ', 'КАРТИНКА', 'СЫЛКА', 'СОБЫТИЕ', 
            'ЛИЧНОЕ', 'ОБУЧЕНИЕ', 'РАБОТА', 'ХОББИ'
        ];
        
        return validTypes.includes(type.toUpperCase());
    }

    /**
     * Проверяет, является ли строка допустимой датой
     * @param {string} dateString - Строка даты для проверки
     * @returns {boolean} Допустима ли дата
     */
    static isValidDate(dateString) {
        if (!dateString) return false;
        
        // Проверяем основные форматы дат
        const dateRegexes = [
            /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
            /^\d{4}\/\d{2}\/\d{2}$/, // YYYY/MM/DD
            /^\d{2}\.\d{2}\.\d{4}$/, // DD.MM.YYYY
            /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, // YYYY-MM-DD HH:MM:SS
            /^D:\d{14}$/ // PDF формат даты D:YYYYMMDDHHMMSS
        ];
        
        return dateRegexes.some(regex => regex.test(dateString));
    }

    /**
     * Проверяет, является ли строка допустимым URL
     * @param {string} url - URL для проверки
     * @returns {boolean} Допустим ли URL
     */
    static isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Проверяет, является ли строка допустимым email
     * @param {string} email - Email для проверки
     * @returns {boolean} Допустим ли email
     */
    static isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Проверяет, является ли строка допустимым тегом
     * @param {string} tag - Тег для проверки
     * @returns {boolean} Допустим ли тег
     */
    static isValidTag(tag) {
        if (typeof tag !== 'string') return false;
        
        // Проверяем, что тег не пустой и не содержит недопустимые символы
        const trimmed = tag.trim();
        if (trimmed.length === 0) return false;
        
        // Проверяем на наличие запятых (разделитель тегов)
        if (trimmed.includes(',')) return false;
        
        return true;
    }

    /**
     * Валидирует массив тегов
     * @param {string[]} tags - Массив тегов для валидации
     * @returns {Object} Результат валидации
     */
    static validateTags(tags) {
        if (!Array.isArray(tags)) {
            return {
                isValid: false,
                errors: ['Теги должны быть массивом']
            };
        }

        const errors = [];
        const validTags = [];

        tags.forEach((tag, index) => {
            if (!this.isValidTag(tag)) {
                errors.push(`Тег "${tag}" под индексом ${index} недопустим`);
            } else {
                validTags.push(tag.trim());
            }
        });

        return {
            isValid: errors.length === 0,
            validTags,
            errors
        };
    }

    /**
     * Проверяет минимальное количество тегов
     * @param {string[]} tags - Массив тегов
     * @param {number} minCount - Минимальное количество тегов
     * @returns {boolean} Достаточно ли тегов
     */
    static hasMinimumTags(tags, minCount = 5) {
        if (!Array.isArray(tags)) return false;
        return tags.length >= minCount;
    }

    /**
     * Валидирует элемент архива
     * @param {Object} item - Элемент архива
     * @returns {Object} Результат валидации
     */
    static validateArchiveItem(item) {
        const errors = [];

        if (!item.filename || !this.isValidFilename(item.filename)) {
            errors.push('Недопустимое имя файла');
        }

        if (!item.type || !this.isValidType(item.type)) {
            errors.push('Недопустимый тип файла');
        }

        if (!item.date || !this.isValidDate(item.date)) {
            errors.push('Недопустимая дата');
        }

        if (!Array.isArray(item.tags)) {
            errors.push('Теги должны быть массивом');
        } else {
            const tagValidation = this.validateTags(item.tags);
            if (!tagValidation.isValid) {
                errors.push(...tagValidation.errors);
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Проверяет корректность формата манифеста
     * @param {string} manifestText - Текст манифеста
     * @returns {Object} Результат валидации
     */
    static validateManifestFormat(manifestText) {
        if (typeof manifestText !== 'string') {
            return {
                isValid: false,
                errors: ['Манифест должен быть строкой']
            };
        }

        const lines = manifestText.split('\n');
        const errors = [];
        let validItemsCount = 0;
        let invalidItemsCount = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const lineNumber = i + 1;

            if (line.startsWith('#') || line === '') continue;

            // Проверяем корректность разделителей
            const separatorCount = (line.match(/\|/g) || []).length;
            const parts = line.split('|').map(part => part.trim());

            // Проверяем, есть ли проблема с разделителями
            const hasProperSpacing = line.includes('| ') && line.includes(' |');
            if (separatorCount > 0 && !hasProperSpacing && parts.length > 1) {
                errors.push(`Неправильный формат разделителей в строке ${lineNumber}. Используйте формат: "поле1 | поле2 | поле3" (с пробелами)`);
                invalidItemsCount++;
                continue;
            }

            // Проверяем минимальное количество полей
            if (parts.length < 4) {
                errors.push(`Недостаточное количество полей в строке ${lineNumber}. Найдено: ${parts.length}, требуется: минимум 4`);
                invalidItemsCount++;
                continue;
            }

            validItemsCount++;
        }

        return {
            isValid: errors.length === 0,
            errors,
            validItemsCount,
            invalidItemsCount,
            totalItems: validItemsCount + invalidItemsCount
        };
    }

    /**
     * Экранирует HTML для безопасности
     * @param {string} text - Текст для экранирования
     * @returns {string} Экранированный текст
     */
    static escapeHtml(text) {
        if (typeof text !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
