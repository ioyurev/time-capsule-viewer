/**
 * Утилиты для работы с датами
 */
export class DateUtils {
    /**
     * Парсит дату из формата PDF
     * @param {string} dateString - Строка даты в формате PDF
     * @returns {Date|null} Объект даты или null
     */
    static parsePdfDate(dateString) {
        if (!dateString || typeof dateString !== 'string') {
            return null;
        }

        // Удаляем префикс "D:" если он есть
        const cleanDate = dateString.replace(/^D:/, '');
        
        // Регулярное выражение для парсинга формата PDF даты
        // Формат: D:YYYYMMDDHHMMSSOHH'MM' где O - + или -
        const dateRegex = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})([+-])(\d{2})'(\d{2})'$/;
        const match = cleanDate.match(dateRegex);
        
        if (match) {
            const [, year, month, day, hour, minute, second, tzSign, tzHour, tzMinute] = match;
            
            // Создаем дату в UTC
            let date = new Date(Date.UTC(
                parseInt(year),
                parseInt(month) - 1, // месяцы в JavaScript начинаются с 0
                parseInt(day),
                parseInt(hour),
                parseInt(minute),
                parseInt(second)
            ));
            
            // Применяем таймзону
            const tzOffsetMinutes = parseInt(tzHour) * 60 + parseInt(tzMinute);
            const multiplier = tzSign === '+' ? -1 : 1; // в JavaScript смещение в обратную сторону
            date = new Date(date.getTime() + (multiplier * tzOffsetMinutes * 60000));
            
            return date;
        }
        
        // Если формат не совпадает, пробуем другие возможные форматы
        // Некоторые PDF могут иметь усеченные даты (например, без времени)
        const partialDateRegex = /^(\d{4})(\d{2})(\d{2})$/;
        const partialMatch = cleanDate.match(partialDateRegex);
        if (partialMatch) {
            const [, year, month, day] = partialMatch;
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        }
        
        return null;
    }

    /**
     * Проверяет корректность формата даты
     * @param {string} dateString - Строка даты
     * @returns {boolean} Корректна ли дата
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
     * Форматирует дату в русский формат
     * @param {Date} date - Объект даты
     * @param {Object} options - Опции форматирования
     * @returns {string} Отформатированная дата
     */
    static formatRussianDate(date, options = {}) {
        const defaultOptions = {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short'
        };

        const formatOptions = { ...defaultOptions, ...options };

        return date.toLocaleString('ru-RU', formatOptions);
    }

    /**
     * Форматирует дату в краткий русский формат
     * @param {Date} date - Объект даты
     * @returns {string} Отформатированная дата
     */
    static formatShortRussianDate(date) {
        return date.toLocaleString('ru-RU', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    /**
     * Форматирует дату в формат ISO
     * @param {Date} date - Объект даты
     * @returns {string} ISO строка даты
     */
    static formatISODate(date) {
        return date.toISOString().split('T')[0];
    }

    /**
     * Форматирует дату в формат YYYY-MM-DD HH:MM:SS
     * @param {Date} date - Объект даты
     * @returns {string} Отформатированная дата
     */
    static formatDateTime(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    /**
     * Вычисляет разницу между двумя датами
     * @param {Date} date1 - Первая дата
     * @param {Date} date2 - Вторая дата
     * @returns {Object} Объект с разницей
     */
    static dateDifference(date1, date2) {
        const diffTime = Math.abs(date2 - date1);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 24));
        const diffHours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60));
        const diffMinutes = Math.floor((diffTime % (1000 * 60 * 60)) / (1000 * 60));
        
        return {
            days: diffDays,
            hours: diffHours,
            minutes: diffMinutes,
            totalMilliseconds: diffTime
        };
    }

    /**
     * Проверяет, находится ли дата в пределах заданного диапазона
     * @param {Date} date - Проверяемая дата
     * @param {Date} startDate - Начальная дата диапазона
     * @param {Date} endDate - Конечная дата диапазона
     * @returns {boolean} Входит ли дата в диапазон
     */
    static isDateInRange(date, startDate, endDate) {
        return date >= startDate && date <= endDate;
    }

    /**
     * Добавляет дни к дате
     * @param {Date} date - Исходная дата
     * @param {number} days - Количество дней для добавления
     * @returns {Date} Новая дата
     */
    static addDays(date, days) {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }

    /**
     * Добавляет месяцы к дате
     * @param {Date} date - Исходная дата
     * @param {number} months - Количество месяцев для добавления
     * @returns {Date} Новая дата
     */
    static addMonths(date, months) {
        const result = new Date(date);
        result.setMonth(result.getMonth() + months);
        return result;
    }

    /**
     * Добавляет годы к дате
     * @param {Date} date - Исходная дата
     * @param {number} years - Количество лет для добавления
     * @returns {Date} Новая дата
     */
    static addYears(date, years) {
        const result = new Date(date);
        result.setFullYear(result.getFullYear() + years);
        return result;
    }
}
