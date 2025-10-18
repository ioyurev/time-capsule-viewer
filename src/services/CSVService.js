/**
 * Класс для работы с CSV файлами
 */
import Papa from 'papaparse';

export class CSVService {
    /**
     * Парсит CSV строку в массив объектов
     * @param {string} csvText - Текст CSV файла
     * @param {Object} options - Опции парсинга
     * @returns {Array<Object>} Массив объектов из CSV
     */
    static parse(csvText, options = {}) {
        return Papa.parse(csvText, { header: true, ...options });
    }

    /**
     * Парсит CSV строку в двумерный массив
     * @param {string} csvText - Текст CSV файла
     * @param {Object} options - Опции парсинга
     * @returns {Array<Array>} Двумерный массив из CSV
     */
    static parseToArray(csvText, options = {}) {
        return Papa.parse(csvText, { header: false, ...options });
    }

    /**
     * Преобразует массив объектов в CSV строку
     * @param {Array<Object>} data - Массив объектов для преобразования
     * @param {Object} options - Опции генерации
     * @returns {string} CSV строка
     */
    static unparse(data, options = {}) {
        return Papa.unparse(data, options);
    }

    /**
     * Преобразует двумерный массив в CSV строку
     * @param {Array<Array>} data - Двумерный массив для преобразования
     * @param {Object} options - Опции генерации
     * @returns {string} CSV строка
     */
    static unparseToArray(data, options = {}) {
        return Papa.unparse(data, options);
    }

    /**
     * Валидирует CSV структуру
     * @param {string} csvText - Текст CSV файла
     * @param {Array<string>} requiredHeaders - Обязательные заголовки
     * @returns {Object} Результат валидации
     */
    static validateStructure(csvText, requiredHeaders = []) {
        try {
            const results = Papa.parse(csvText, { header: true });
            
            if (results.errors && results.errors.length > 0) {
                return {
                    isValid: false,
                    errors: results.errors,
                    message: 'Ошибки парсинга CSV'
                };
            }

            if (requiredHeaders.length > 0) {
                const headers = Object.keys(results.data[0] || {});
                const missingHeaders = requiredHeaders.filter(header => !headers.includes(header));
                
                if (missingHeaders.length > 0) {
                    return {
                        isValid: false,
                        errors: [{ type: 'MissingHeaders', message: `Отсутствуют заголовки: ${missingHeaders.join(', ')}` }],
                        missingHeaders
                    };
                }
            }

            return {
                isValid: true,
                data: results.data,
                headers: Object.keys(results.data[0] || {}),
                rowCount: results.data.length
            };
        } catch (error) {
            return {
                isValid: false,
                errors: [{ type: 'ParseError', message: error.message }],
                message: error.message
            };
        }
    }

    /**
     * Получает статистику CSV файла
     * @param {string} csvText - Текст CSV файла
     * @returns {Object} Статистика CSV
     */
    static getStatistics(csvText) {
        try {
            const results = Papa.parse(csvText, { header: true });
            
            if (results.errors && results.errors.length > 0) {
                return {
                    error: 'Ошибки парсинга CSV',
                    errors: results.errors
                };
            }

            const data = results.data;
            const headers = Object.keys(data[0] || {});

            return {
                rowCount: data.length,
                columnCount: headers.length,
                headers: headers,
                emptyRows: data.filter(row => Object.values(row).every(value => !value)).length,
                columnStats: headers.reduce((stats, header) => {
                    const values = data.map(row => row[header]);
                    const nonEmptyValues = values.filter(value => value);
                    
                    stats[header] = {
                        total: values.length,
                        nonEmpty: nonEmptyValues.length,
                        empty: values.length - nonEmptyValues.length,
                        unique: new Set(nonEmptyValues).size,
                        dataType: this.inferDataType(nonEmptyValues)
                    };
                    
                    return stats;
                }, {})
            };
        } catch (error) {
            return {
                error: error.message
            };
        }
    }

    /**
     * Определяет тип данных для массива значений
     * @param {Array} values - Массив значений
     * @returns {string} Тип данных
     */
    static inferDataType(values) {
        if (values.length === 0) return 'empty';

        const sample = values.slice(0, 10); // Проверяем только первые 10 значений для производительности
        
        const isNumeric = sample.every(value => {
            const num = Number(value);
            return !isNaN(num) && isFinite(num);
        });

        if (isNumeric) {
            return 'number';
        }

        const isDate = sample.every(value => {
            const date = new Date(value);
            return date !== 'Invalid Date' && !isNaN(date);
        });

        if (isDate) {
            return 'date';
        }

        return 'string';
    }

    /**
     * Фильтрует CSV данные по условию
     * @param {string} csvText - Текст CSV файла
     * @param {Function} filterFn - Функция фильтрации
     * @returns {Array<Object>} Отфильтрованные данные
     */
    static filter(csvText, filterFn) {
        const results = Papa.parse(csvText, { header: true });
        if (results.errors && results.errors.length > 0) {
            throw new Error('Ошибки парсинга CSV');
        }
        return results.data.filter(filterFn);
    }

    /**
     * Сортирует CSV данные
     * @param {string} csvText - Текст CSV файла
     * @param {string} column - Колонка для сортировки
     * @param {boolean} ascending - Порядок сортировки
     * @returns {Array<Object>} Отсортированные данные
     */
    static sort(csvText, column, ascending = true) {
        const results = Papa.parse(csvText, { header: true });
        if (results.errors && results.errors.length > 0) {
            throw new Error('Ошибки парсинга CSV');
        }
        
        return results.data.sort((a, b) => {
            const valueA = a[column];
            const valueB = b[column];
            
            if (ascending) {
                return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
            } else {
                return valueA < valueB ? 1 : valueA > valueB ? -1 : 0;
            }
        });
    }
}
