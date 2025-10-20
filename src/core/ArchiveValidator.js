import { logger } from '../logger.js';
import { ArchiveItem } from '../models/ArchiveItem.js';
import { ProgressManager } from './ProgressManager.js';
import { pdfMetadataCache } from '../services/PDFMetadataCache.js';
import { ExplanationValidator } from './ExplanationValidator.js';

/**
 * @typedef {Object} ValidationError
 * @property {number} lineNumber - Номер строки с ошибкой
 * @property {string} line - Содержимое строки
 * @property {string} error - Описание ошибки
 * @property {string} expectedFormat - Ожидаемый формат
 * @property {Array} problematicParts - Проблемные части строки
 */

/**
 * Класс для валидации архива и парсинга манифеста
 */
export class ArchiveValidator {
    /**
     * @param {DigitalTimeCapsule} parent - Родительский класс
     */
    constructor(parent) {
        this.parent = parent;
        this.logger = logger;
        this.progressManager = new ProgressManager();
        this.explanationValidator = new ExplanationValidator(parent);
    }

    /**
     * Парсер манифеста с валидацией и сбором информации об ошибках
     * @param {string} text - Текст манифеста
     * @returns {{items: ArchiveItem[], errors: ValidationError[]}} - Объект с элементами и ошибками
     */
    parseManifest(text) {
        const operationId = this.logger.pushOperation('parseManifest', { textLength: text.length });
        try {
            const items = [];
            const errors = [];
            const lines = text.split('\n');
            let validItemsCount = 0;
            let invalidItemsCount = 0;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                const lineNumber = i + 1;
                
                if (line.startsWith('#') || line === '') continue;
                
                // Проверяем корректность разделителей
                const separatorCount = (line.match(/\|/g) || []).length;
                const parts = line.split('|').map(part => part.trim());
                
                // Проверяем, есть ли проблема с разделителями (например, отсутствие пробелов)
                const hasProperSpacing = line.includes('| ') && line.includes(' |');
                if (separatorCount > 0 && !hasProperSpacing && parts.length > 1) {
                    // Проверяем, может быть проблема с форматом разделителей
                    const correctedLine = line.replace(/\|/g, ' | ');
                    const correctedParts = correctedLine.split('|').map(part => part.trim());
                    if (correctedParts.length !== parts.length) {
                        // Есть проблема с форматом разделителей
                        errors.push({
                            lineNumber: lineNumber,
                            line: line,
                            error: 'Неправильный формат разделителей. Используйте формат: "поле1 | поле2 | поле3" (с пробелами)',
                            expectedFormat: 'filename | type | title | description | date | tags (с пробелами вокруг |)',
                            problematicParts: this.getProblematicParts(parts, null, line, true)
                        });
                        invalidItemsCount++;
                        continue;
                    }
                }
                
                // Определяем тип файла по расширению
                const isPdf = parts[0].toLowerCase().endsWith('.pdf');
                
                // Проверяем минимальное количество полей в зависимости от типа файла
                // Для ЛИЧНОЕ и МЕМ разрешаем 5 полей, для КАПСУЛА - 4 поля, для остальных не-PDF - 6+
                const isPersonalOrMem = !isPdf && parts.length === 5 && this.sanitizeString(parts[1]).toUpperCase().match(/^(ЛИЧНОЕ|МЕМ)$/);
                const isCapsule = !isPdf && parts.length === 4 && this.sanitizeString(parts[1]).toUpperCase() === 'КАПСУЛА';
                if ((isPdf && parts.length >= 3) || isPersonalOrMem || isCapsule || (!isPdf && parts.length >= 6)) {
                    let itemConfig;
                    let hasValidFormat = false;
                    let formatError = null;
                    
                    if (isPdf) {
                        // Для PDF файлов пробуем разные форматы
                        if (parts.length === 3) {
                            // Формат: имя файла | тип | дата (теги будут извлекаться из PDF метаданных)
                            const date = this.sanitizeString(parts[2]);
                            
                            // Проверяем, выглядит ли второе поле как дата
                            const isDateValid = this.isValidDate(date);
                            
                            if (this.sanitizeFilename(parts[0]) && this.sanitizeString(parts[1]) && isDateValid) {
                                itemConfig = {
                                    filename: this.sanitizeFilename(parts[0]),
                                    type: this.sanitizeString(parts[1]),
                                    title: '', // будет заполнен из PDF метаданных
                                    description: '', // будет заполнен из PDF метаданных
                                    date: date,
                                    tags: [] // теги будут извлекаться из PDF
                                };
                                hasValidFormat = true;
                            } else {
                                formatError = 'Некорректный формат строки для PDF файла. Ожидаемый формат: имя_файла | тип | дата';
                            }
                        } else if (parts.length === 4) {
                            // Формат: имя файла | тип | дата | теги (устаревший формат, но поддерживаем для совместимости)
                            const date = this.sanitizeString(parts[2]);
                            const tags = parts[3].split(',').map(tag => this.sanitizeString(tag.trim()));
                            
                            // Проверяем, выглядит ли второе поле как дата
                            const isDateValid = this.isValidDate(date);
                            
                            if (this.sanitizeFilename(parts[0]) && this.sanitizeString(parts[1]) && isDateValid) {
                                itemConfig = {
                                    filename: this.sanitizeFilename(parts[0]),
                                    type: this.sanitizeString(parts[1]),
                                    title: '', // будет заполнен из PDF метаданных
                                    description: '', // будет заполнен из PDF метаданных
                                    date: date,
                                    tags: tags
                                };
                                hasValidFormat = true;
                            } else {
                                formatError = 'Некорректный формат строки для PDF файла. Ожидаемый формат: имя_файла | тип | дата | теги';
                            }
                        } else if (parts.length === 5) {
                            // Формат для ЛИЧНОЕ: имя файла | тип | дата | заголовок | теги
                            const type = this.sanitizeString(parts[1]);
                            const date = this.sanitizeString(parts[2]);
                            const title = this.sanitizeString(parts[3]);
                            const tags = parts[4].split(',').map(tag => this.sanitizeString(tag.trim()));
                            
                            // Проверяем, выглядит ли второе поле как дата
                            const isDateValid = this.isValidDate(date);
                            
                            if (this.sanitizeFilename(parts[0]) && type && isDateValid) {
                                itemConfig = {
                                    filename: this.sanitizeFilename(parts[0]),
                                    type: type,
                                    title: title,
                                    description: '', // описание не предусмотрено для 5-полевого формата
                                    date: date,
                                    tags: tags
                                };
                                hasValidFormat = true;
                            } else {
                                formatError = 'Некорректный формат строки для PDF файла. Ожидаемый формат: имя_файла | тип | дата | заголовок | теги';
                            }
                        } else if (parts.length >= 6) {
                            // Формат: имя файла | тип | заголовок | описание | дата | теги (для совместимости)
                            const date = this.sanitizeString(parts[4]);
                            const isDateValid = this.isValidDate(date);
                            
                            if (this.sanitizeFilename(parts[0]) && this.sanitizeString(parts[1]) && isDateValid) {
                                itemConfig = {
                                    filename: this.sanitizeFilename(parts[0]),
                                    type: this.sanitizeString(parts[1]),
                                    title: this.sanitizeString(parts[2]),
                                    description: this.sanitizeString(parts[3]),
                                    date: date,
                                    tags: parts[5].split(',').map(tag => this.sanitizeString(tag.trim()))
                                };
                                hasValidFormat = true;
                            } else {
                                formatError = 'Некорректный формат строки для PDF файла. Ожидаемый формат: имя_файла | тип | заголовок | описание | дата | теги';
                            }
                        } else {
                            formatError = 'Некорректный формат строки для PDF файла. Ожидаемое количество полей: 3, 4, 5 или 6+';
                        }
                    } else {
                        // Для не-PDF файлов ожидаем 6+ полей, 5 полей для ЛИЧНОЕ и МЕМ, 4 поля для КАПСУЛА
                        if (parts.length === 4) {
                            // Формат для КАПСУЛА: имя файла | КАПСУЛА | дата | автор (как у остальных типов файлов)
                            const type = this.sanitizeString(parts[1]);
                            const typeUpper = type.toUpperCase();
                            
                            if (typeUpper === 'КАПСУЛА') {
                                const date = this.sanitizeString(parts[2]);
                                const author = this.sanitizeString(parts[3]);
                                const isDateValid = this.isValidDate(date);
                                
                                if (this.sanitizeFilename(parts[0]) && type && author && isDateValid) {
                                    itemConfig = {
                                        filename: this.sanitizeFilename(parts[0]),
                                        type: type,
                                        title: '', // будет заполнен из содержимого файла
                                        description: '', // будет заполнен из содержимого файла
                                        date: date,
                                        tags: [],
                                        author: author // специальное поле для КАПСУЛА
                                    };
                                    hasValidFormat = true;
                                } else {
                                    formatError = 'Некорректный формат строки для КАПСУЛА файла. Ожидаемый формат: имя_файла | КАПСУЛА | дата | автор';
                                }
                            } else {
                                formatError = 'Некорректный формат строки. Для типа КАПСУЛА ожидается формат: имя_файла | КАПСУЛА | дата | автор. Для других типов ожидается 5 или 6+ полей.';
                            }
                        } else if (parts.length === 5) {
                            // Единый формат для ЛИЧНОЕ и МЕМ: имя файла | тип | дата | заголовок | теги
                            const type = this.sanitizeString(parts[1]);
                            const typeUpper = type.toUpperCase();
                            
                            if (typeUpper === 'ЛИЧНОЕ' || typeUpper === 'МЕМ') {
                                // Формат: имя файла | тип | дата | заголовок | теги
                                const date = this.sanitizeString(parts[2]);
                                const title = this.sanitizeString(parts[3]);
                                const tags = parts[4].split(',').map(tag => this.sanitizeString(tag.trim()));
                                
                                const isDateValid = this.isValidDate(date);
                                
                                if (this.sanitizeFilename(parts[0]) && type && isDateValid) {
                                    itemConfig = {
                                        filename: this.sanitizeFilename(parts[0]),
                                        type: type,
                                        title: title,
                                        description: '', // описание не предусмотрено для 5-полевого формата
                                        date: date,
                                        tags: tags
                                    };
                                    hasValidFormat = true;
                                } else {
                                    formatError = `Некорректный формат строки для ${typeUpper} файла. Ожидаемый формат: имя_файла | ${typeUpper} | дата | заголовок | теги`;
                                }
                            } else {
                                formatError = 'Некорректный формат строки. Для типа ЛИЧНОЕ или МЕМ ожидается формат: имя_файла | тип | дата | заголовок | теги. Для других типов ожидается 4 или 6+ полей.';
                            }
                        } else if (parts.length >= 6) {
                            const date = this.sanitizeString(parts[4]);
                            const isDateValid = this.isValidDate(date);
                            
                            if (this.sanitizeFilename(parts[0]) && this.sanitizeString(parts[1]) && this.sanitizeString(parts[2]) && this.sanitizeString(parts[3]) && isDateValid) {
                                itemConfig = {
                                    filename: this.sanitizeFilename(parts[0]),
                                    type: this.sanitizeString(parts[1]),
                                    title: this.sanitizeString(parts[2]),
                                    description: this.sanitizeString(parts[3]),
                                    date: date,
                                    tags: parts[5].split(',').map(tag => this.sanitizeString(tag.trim()))
                                };
                                hasValidFormat = true;
                            } else {
                                formatError = 'Некорректный формат строки. Ожидаемый формат: имя_файла | тип | заголовок | описание | дата | теги';
                            }
                        } else {
                            formatError = 'Некорректный формат строки. Ожидаемое количество полей: 4 (для КАПСУЛА), 5 (для ЛИЧНОЕ или МЕМ) или 6+ (для других типов)';
                        }
                    }

                    if (hasValidFormat && itemConfig) {
                        const item = new ArchiveItem(itemConfig);
                        items.push(item);
                        validItemsCount++;
                    } else if (formatError) {
                        errors.push({
                            lineNumber: lineNumber,
                            line: line,
                            error: formatError,
                            expectedFormat: isPdf ? '01_Новость.pdf | НОВОСТЬ | 2024-10-20 (или с тегами: 01_Новость.pdf | НОВОСТЬ | 2024-10-20 | тег1,тег2,тег3)' : '02_Медиа.mp3 | МЕДИА | Заголовок | Описание | 2024-10-15 | тег1,тег2,тег3',
                            problematicParts: this.getProblematicParts(parts, itemConfig, line, false)
                        });
                        invalidItemsCount++;
                    }
                } else {
                    errors.push({
                        lineNumber: lineNumber,
                        line: line,
                        error: `Недостаточное количество полей. Найдено: ${parts.length}, требуется: минимум 3 для PDF или 6 для других файлов (4 для КАПСУЛА, 5 для ЛИЧНОЕ и МЕМ)`,
                        expectedFormat: isPdf ? '01_Новость.pdf | НОВОСТЬ | 2024-10-20 (или с тегами: 01_Новость.pdf | НОВОСТЬ | 2024-10-20 | тег1,тег2,тег3)' : '02_Медиа.mp3 | МЕДИА | Заголовок | Описание | 2024-10-15 | тег1,тег2,тег3 (или 4 поля для КАПСУЛА: файл | КАПСУЛА | дата | автор, или 5 полей для ЛИЧНОЕ и МЕМ: файл | тип | дата | заголовок | теги)',
                        problematicParts: this.getProblematicParts(parts, null, line, false)
                    });
                    invalidItemsCount++;
                }
            }

            this.logger.info('Манифест разобран', { 
                validItems: validItemsCount, 
                invalidItems: invalidItemsCount, 
                totalLines: lines.length,
                errorsCount: errors.length,
                operationId 
            });

            return { items, errors };
        } catch (error) {
            this.logger.logError(error, { operationId });
            throw error;
        } finally {
            this.logger.popOperation();
        }
    }

    /**
     * Вспомогательный метод для проверки корректности формата даты
     * @param {string} dateString - Строка даты
     * @returns {boolean} - Корректна ли дата
     */
    isValidDate(dateString) {
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
     * Вспомогательный метод для определения проблемных частей строки
     * @param {string[]} parts - Части строки
     * @param {ArchiveItem} item - Элемент архива
     * @param {string} originalLine - Оригинальная строка
     * @param {boolean} isSeparatorError - Ошибка в разделителях
     * @returns {Array} - Массив проблемных частей
     */
    getProblematicParts(parts, item, originalLine, isSeparatorError = false) {
        const problematic = [];
        const isPdf = parts[0].toLowerCase().endsWith('.pdf');
        const isPersonalType = parts.length === 5 && this.sanitizeString(parts[1]).toUpperCase() === 'ЛИЧНОЕ';
        const isMemType = parts.length === 5 && this.sanitizeString(parts[1]).toUpperCase() === 'МЕМ';
        const expectedFormat = isPersonalType || isMemType ? 5 : (isPdf ? 4 : 6); // ЛИЧНОЕ и МЕМ: 5 полей, PDF: 4 поля, другие: 6+ полей
        
        if (isSeparatorError) {
            // Если ошибка в разделителях, помечаем всю строку как проблемную
            const isPersonalType = parts.length === 5 && this.sanitizeString(parts[1]).toUpperCase() === 'ЛИЧНОЕ';
            const isMemType = parts.length === 5 && this.sanitizeString(parts[1]).toUpperCase() === 'МЕМ';
            for (let i = 0; i < parts.length; i++) {
                problematic.push({
                    index: i,
                    part: parts[i],
                    field: i === 0 ? 'filename' : i === 1 ? 'type' : i === 2 ? (isPersonalType || isMemType ? 'date' : (isPdf ? 'date' : 'title')) : i === 3 ? (isPersonalType || isMemType ? 'title' : (isPdf ? 'tags' : 'description')) : i === 4 ? (isPersonalType || isMemType ? 'tags' : 'date') : 'tags',
                    isEmpty: parts[i] === '',
                    isProblematic: true,
                    expected: i < expectedFormat
                });
            }
            return problematic;
        }
        
        // Проверяем каждое поле в строке
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            let field = '';
            let isProblematic = false;
            let isEmpty = part === '';
            let isDateField = false;
            let isPersonalType = parts.length === 5 && this.sanitizeString(parts[1]).toUpperCase() === 'ЛИЧНОЕ';
            let isMemType = parts.length === 5 && this.sanitizeString(parts[1]).toUpperCase() === 'МЕМ';
            let isCapsuleType = parts.length === 4 && this.sanitizeString(parts[1]).toUpperCase() === 'КАПСУЛА';
            
            if (isPdf) {
                // Для PDF файлов
                if (i === 0) {
                    field = 'filename';
                    isProblematic = !item || !item.filename;
                } else if (i === 1) {
                    field = 'type';
                    isProblematic = !item || !item.type;
                } else if (i === 2) {
                    field = isPersonalType ? 'date' : 'date';
                    isDateField = true;
                    isProblematic = !item || !item.date || !this.isValidDate(part);
                } else if (i === 3) {
                    field = isPersonalType ? 'title' : 'tags';
                    isProblematic = isPersonalType ? (!item || !item.title) : false; // теги могут быть пустыми
                } else if (i === 4) {
                    field = isPersonalType ? 'tags' : 'title';
                    isProblematic = isPersonalType ? false : (!item || !item.title); // теги могут быть пустыми для ЛИЧНОЕ
                } else {
                    // Дополнительные поля для PDF
                    field = i === 5 ? 'description' : 'extra';
                    isProblematic = true; // если больше 5 полей для PDF с 5-полевым форматом - это ошибка
                }
            } else {
                // Для не-PDF файлов
                if (i === 0) {
                    field = 'filename';
                    isProblematic = !item || !item.filename;
                } else if (i === 1) {
                    field = 'type';
                    isProblematic = !item || !item.type;
                } else if (i === 2) {
                    if (isCapsuleType) {
                        field = 'date';
                        isDateField = true;
                        isProblematic = !item || !item.date || !this.isValidDate(part);
                    } else {
                        field = isPersonalType || isMemType ? 'date' : 'title';
                        isDateField = isPersonalType || isMemType;
                        isProblematic = (isPersonalType || isMemType) ? (!item || !item.date || !this.isValidDate(part)) : (!item || !item.title);
                    }
                } else if (i === 3) {
                    if (isCapsuleType) {
                        field = 'author';
                        isProblematic = !item || !item.author;
                    } else {
                        field = isPersonalType || isMemType ? 'title' : 'description';
                        isProblematic = (isPersonalType || isMemType) ? (!item || !item.title) : (!item || !item.description);
                    }
                } else if (i === 4) {
                    field = isPersonalType || isMemType ? 'tags' : 'date';
                    isDateField = !(isPersonalType || isMemType);
                    isProblematic = (isPersonalType || isMemType) ? false : (!item || !item.date || !this.isValidDate(part)); // теги могут быть пустыми для ЛИЧНОЕ и МЕМ
                } else if (i === 5) {
                    field = isPersonalType || isMemType ? 'extra' : 'tags';
                    isProblematic = false; // теги могут быть пустыми
                } else {
                    // Дополнительные теги для не-PDF - не проблема
                    field = 'extra_tags';
                    isProblematic = false;
                }
            }
            
            // Дополнительная проверка для полей, которые должны содержать конкретные типы данных
            if (isDateField && part && !this.isValidDate(part)) {
                isProblematic = true;
            }
            
            // Обновляем expectedFormat для 5-полевого формата ЛИЧНОЕ и МЕМ
            const currentExpectedFormat = isPersonalType || isMemType ? 5 : (isPdf ? 4 : 6);
            
            problematic.push({
                index: i,
                part: part,
                field: field,
                isEmpty: isEmpty,
                isProblematic: isProblematic,
                expected: i < currentExpectedFormat
            });
        }
        
        // Если полей меньше ожидаемого, добавляем информацию о недостающих полях
        if (parts.length < expectedFormat) {
            for (let i = parts.length; i < expectedFormat; i++) {
                let field = '';
                if (isPdf) {
                    if (i === 0) field = 'filename';
                    else if (i === 1) field = 'type';
                    else if (i === 2) field = 'date';
                    else if (i === 3) field = 'tags';
                } else {
                    if (i === 0) field = 'filename';
                    else if (i === 1) field = 'type';
                    else if (i === 2) field = 'title';
                    else if (i === 3) field = 'description';
                    else if (i === 4) field = 'date';
                    else if (i === 5) field = 'tags';
                }
                
                problematic.push({
                    index: i,
                    part: '',
                    field: field,
                    isEmpty: true,
                    isProblematic: true,
                    expected: true,
                    missing: true
                });
            }
        }
        
        return problematic;
    }

    /**
     * Санитизация строк для предотвращения XSS
     * @param {string} str - Строка для санитизации
     * @returns {string} - Очищенная строка
     */
    sanitizeString(str) {
        if (typeof str !== 'string') return '';
        
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Санитизация имен файлов - НЕ изменяем оригинальные имена файлов, только проверяем на безопасность
     * @param {string} filename - Имя файла для санитизации
     * @returns {string} - Очищенное имя файла
     */
    sanitizeFilename(filename) {
        if (typeof filename !== 'string') return '';

        // Проверяем, что имя файла не содержит опасные символы пути
        if (filename.includes('../') || filename.includes('..\\')) {
            this.logger.warn('Потенциально опасное имя файла', { filename });
            return '';
        }

        // Возвращаем оригинальное имя файла, только удаляем символы перевода строки
        return filename.replace(/[\r\n]/g, '');
    }

    /**
     * Проверка корректности архива
     * @param {ArchiveItem[]} items - Элементы архива
     */
    async validateArchive(items) {
        const operationId = this.logger.pushOperation('validateArchive', { itemsCount: items.length });
        try {
            // Браузерный режим - обновляем DOM элементы
            const validationSection = document.getElementById('validation-section');
            const validationDetailsContainer = document.getElementById('validation-details-container');
            const newsCountElement = document.getElementById('news-count');
            const personalCountElement = document.getElementById('personal-count');
            const keywordsStatusElement = document.getElementById('keywords-status');
            const memesCountElement = document.getElementById('memes-count');
            const newsStatusElement = document.getElementById('news-status');
            const personalStatusElement = document.getElementById('personal-status');
            const keywordsValidationStatusElement = document.getElementById('keywords-validation-status');
            const memesStatusElement = document.getElementById('memes-status');
            const validationFilesListElement = document.getElementById('validation-files-list');

            if (!validationSection) return;

            // Подсчет файлов по типам
            let newsCount = 0;
            let personalCount = 0;
            let filesWithValidKeywords = 0;
            let memesCount = 0; // Подсчет мемов
            let totalFiles = items.length;
            let nonPdfFiles = 0; // Количество файлов, не являющихся PDF (для проверки тегов)

            items.forEach((item, index) => {
                const itemType = item.type.toUpperCase();
                const isPdf = item.filename.toLowerCase().endsWith('.pdf');
                
                if (itemType === 'НОВОСТЬ') newsCount++;
                else if (itemType === 'ЛИЧНОЕ') personalCount++;
                else if (itemType === 'МЕМ') memesCount++; // Добавляем подсчет мемов

                // Подсчет файлов для проверки ключевых слов
                if (isPdf) {
                    const isPdfNews = item.type.toUpperCase() === 'НОВОСТЬ';
                    const isPdfPersonal = item.type.toUpperCase() === 'ЛИЧНОЕ';
                    // Для ЛИЧНОЕ типов не используем кэш метаданных, только предоставленные теги
                    if (isPdfPersonal) {
                        // Для ЛИЧНОЕ: требуется 5 тегов
                        if (item.title && item.title.trim() !== '' && item.tags.length >= 5) {
                            filesWithValidKeywords++;
                        }
                    } else {
                        // Для других PDF файлов (включая НОВОСТЬ): используем теги из item.tags
                        // Важно: item.tags уже включает ключевые слова из PDF, извлеченные в extractPdfMetadataEarly
                        // Поэтому не нужно снова добавлять теги из кэша, чтобы избежать дублирования
                        const totalTags = item.tags.length;
                        if (item.title && item.title.trim() !== '' && 
                            (isPdfNews ? totalTags >= 5 : totalTags >= 5)) {
                            filesWithValidKeywords++;
                        }
                    }
                } else {
                    // Для не-PDF файлов проверяем тип ЛИЧНОЕ отдельно
                    const isPersonal = item.type.toUpperCase() === 'ЛИЧНОЕ';
                    const isCapsule = item.type.toUpperCase() === 'КАПСУЛА';
                    
                    if (isCapsule) {
                        // Для КАПСУЛА не требуем тегов, просто увеличиваем счетчик (файл уже есть)
                        filesWithValidKeywords++;
                    } else if (isPersonal) {
                        // Для ЛИЧНОЕ: требуется 5 тегов
                        if (item.title && item.title.trim() !== '' && item.tags.length >= 5) {
                            filesWithValidKeywords++;
                        }
                    } else {
                        // Для других типов: требуется 5 тегов
                        if (item.getTagCount() >= 5) {
                            filesWithValidKeywords++;
                        }
                    }
                }
            });

            // Валидация файлов объяснений
            const explanationResults = await this.explanationValidator.validateExplanationFiles(items);
            const { validPersonalExplanations, validMemeExplanations } = explanationResults;

            // Обновление счетчиков
            if (newsCountElement) newsCountElement.textContent = `${newsCount}/5`;
            if (memesCountElement) memesCountElement.textContent = `${memesCount}/5`; // Обновляем счетчик мемов
            if (personalCountElement) personalCountElement.textContent = `${personalCount}/2`;
            if (keywordsStatusElement) keywordsStatusElement.textContent = `${filesWithValidKeywords}/${totalFiles}`;

            // Обновление счетчиков для объяснений
            const memeExplanationsCountElement = document.getElementById('meme-explanations-count');
            const personalExplanationsCountElement = document.getElementById('personal-explanations-count');
            if (memeExplanationsCountElement) memeExplanationsCountElement.textContent = `${validMemeExplanations}/${explanationResults.totalMemeItems}`;
            if (personalExplanationsCountElement) personalExplanationsCountElement.textContent = `${validPersonalExplanations}/${explanationResults.totalPersonalItems}`;

            // Обновление статусов
            if (newsStatusElement) newsStatusElement.textContent = newsCount >= 5 ? '✅' : '❌';
            if (memesStatusElement) memesStatusElement.textContent = memesCount >= 5 ? '✅' : '❌'; // Обновляем статус мемов
            if (personalStatusElement) personalStatusElement.textContent = personalCount >= 2 ? '✅' : '❌';
            if (keywordsValidationStatusElement) {
                // Для статуса ключевых слов используем только не-PDF файлы
                keywordsValidationStatusElement.textContent = filesWithValidKeywords === totalFiles ? '✅' : '❌';
            }

            // Обновление статусов для объяснений
            const memeExplanationsStatusElement = document.getElementById('meme-explanations-status');
            const personalExplanationsStatusElement = document.getElementById('personal-explanations-status');
            if (memeExplanationsStatusElement) memeExplanationsStatusElement.textContent = validMemeExplanations >= explanationResults.totalMemeItems ? '✅' : '❌';
            if (personalExplanationsStatusElement) personalExplanationsStatusElement.textContent = validPersonalExplanations >= explanationResults.totalPersonalItems ? '✅' : '❌';

            // Проверяем наличие обязательного файла КАПСУЛА
            const hasCapsuleDescription = items.some(item => item.type.toUpperCase() === 'КАПСУЛА');
            
            // Обновление прогресс баров
            this.updateProgressBar('news-progress-bar', 'news-progress-text', newsCount, 5);
            this.updateProgressBar('memes-progress-bar', 'memes-progress-text', memesCount, 5); // Добавляем прогресс бар для мемов
            this.updateProgressBar('personal-progress-bar', 'personal-progress-text', personalCount, 2);
            this.updateProgressBar('keywords-progress-bar', 'keywords-progress-text', filesWithValidKeywords, totalFiles);
            this.updateProgressBar('meme-explanations-progress-bar', 'meme-explanations-progress-text', validMemeExplanations, explanationResults.totalMemeItems);
            this.updateProgressBar('personal-explanations-progress-bar', 'personal-explanations-progress-text', validPersonalExplanations, explanationResults.totalPersonalItems);
            this.updateProgressBar('capsule-progress-bar', 'capsule-progress-text', hasCapsuleDescription ? 1 : 0, 1);

            // Обновление счетчика и статуса для капсулы
            const capsuleCountElement = document.getElementById('capsule-count');
            const capsuleStatusElement = document.getElementById('capsule-status');
            if (capsuleCountElement) {
                capsuleCountElement.textContent = `${hasCapsuleDescription ? 1 : 0}/1`;
            }
            if (capsuleStatusElement) {
                capsuleStatusElement.textContent = hasCapsuleDescription ? '✅' : '❌';
            }

            // Формирование списка файлов с индикацией тегов и слов в объяснениях
            if (validationFilesListElement) {
                let filesHtml = '<h4>Файлы в архиве:</h4>';
                for (let index = 0; index < items.length; index++) {
                    const item = items[index];
                    const isPdf = item.filename.toLowerCase().endsWith('.pdf');
                    const isPdfNews = isPdf && item.type.toUpperCase() === 'НОВОСТЬ';
                    const isPdfPersonal = isPdf && item.type.toUpperCase() === 'ЛИЧНОЕ';
                    const itemType = item.type.toUpperCase();
                    const isPersonal = itemType === 'ЛИЧНОЕ';
                    const isMem = itemType === 'МЕМ';
                    const isCapsule = itemType === 'КАПСУЛА';
                    
                    // Пропускаем файл КАПСУЛА в детальном списке, так как он не требует тегов
                    if (isCapsule) {
                        continue; // Пропускаем этот элемент в детальном списке
                    }
                    
                    let tagCount, requiredTags, hasValidTags;
                    
                    if (isPdfPersonal) {
                        // Для ЛИЧНОЕ: требуется 5 тегов
                        tagCount = item.tags.length;
                        requiredTags = 5;
                        hasValidTags = item.title && item.title.trim() !== '' && tagCount >= requiredTags;
                    } else if (isPdf) {
                        // Для других PDF файлов (включая НОВОСТЬ): используем кэш метаданных
                        // Важно: item.tags уже включает ключевые слова из PDF, извлеченные в extractPdfMetadataEarly
                        // Поэтому не нужно снова добавлять теги из кэша, чтобы избежать дублирования
                        const totalTags = item.tags.length;
                        tagCount = totalTags;
                        requiredTags = isPdfNews ? 5 : 5;
                        hasValidTags = item.title && item.title.trim() !== '' && (isPdfNews ? totalTags >= 5 : totalTags >= 5);
                    } else {
                        // Для не-PDF файлов
                        if (isPersonal) {
                            // Для ЛИЧНОЕ: требуется 5 тегов
                            tagCount = item.tags.length;
                            requiredTags = 5;
                            hasValidTags = item.title && item.title.trim() !== '' && tagCount >= requiredTags;
                        } else {
                            // Для других типов: требуется 5 тегов
                            tagCount = item.getTagCount();
                            requiredTags = 5;
                            hasValidTags = item.hasMinimumTags(5);
                        }
                    }
                    
                    const tagStatus = hasValidTags ? '✅' : '❌';
                    const progressPercentage = requiredTags > 0 ? (tagCount / requiredTags) * 100 : 10;
                    
                    // Проверяем наличие и слов в файле объяснения для ЛИЧНОЕ и МЕМ типов
                    let wordCount = 0;
                    let requiredWords = 0;
                    let hasValidWords = false;
                    let explanationFile = null;
                    
                    if (isPersonal || isMem) {
                        explanationFile = await this.parent.findExplanationFile(item.filename);
                        if (explanationFile) {
                            // Получаем текст файла объяснения и считаем слова
                            // Это асинхронная операция, но для отображения в синхронной функции
                            // мы можем использовать промисы или предварительно собрать информацию
                            requiredWords = isPersonal ? 100 : 50;
                        }
                    }
                    
                    // Для отображения слов в каждом файле, нужно получить информацию о них
                    // Создаем HTML для отображения слов (будет обновлено асинхронно)
                    let wordCountDisplay = '';
                    if (isPersonal || isMem) {
                        if (explanationFile) {
                            // Для асинхронного получения слов, создаем placeholder
                            wordCountDisplay = `
                                <div class="validation-file-words-progress" id="words-progress-${index}">
                                    <span>Слова:</span>
                                    <span class="word-count-placeholder">Загрузка...</span>
                                    <div class="validation-file-words-progress-bar">
                                        <div class="validation-file-words-progress-fill" style="--progress-width: 0%;"></div>
                                    </div>
                                    <span class="validation-file-words-status">⏳</span>
                                </div>
                            `;
                        } else {
                            wordCountDisplay = `
                                <div class="validation-file-words-progress" id="words-progress-${index}">
                                    <span>Слова:</span>
                                    <span class="word-count-placeholder">Нет файла</span>
                                    <div class="validation-file-words-progress-bar">
                                        <div class="validation-file-words-progress-fill" style="--progress-width: 0%;"></div>
                                    </div>
                                    <span class="validation-file-words-status">❌</span>
                                </div>
                            `;
                        }
                    }
                    
                    filesHtml += `
                        <div class="validation-file-item" data-item-index="${index}" data-item-type="${itemType}">
                            <div class="validation-file-header">
                                <span class="validation-file-name">${this.parent.escapeHtml(item.title || item.filename)}</span>
                                <span class="validation-file-type">${this.parent.escapeHtml(item.type)}${isPdf ? ' (PDF)' : ''}</span>
                            </div>
                            <div class="validation-file-tags-container">
                                <div class="validation-file-tags-progress">
                                    <span>Теги:</span>
                                    <span>${tagCount}/${requiredTags}</span>
                                    <div class="validation-file-tags-progress-bar">
                                        <div class="validation-file-tags-progress-fill" style="--progress-width: ${progressPercentage}%;"></div>
                                    </div>
                                    <span class="validation-file-status">${tagStatus}</span>
                                    ${!hasValidTags ? 
                                        `<span class="validation-file-tags-remaining">(необходимо еще ${requiredTags - tagCount})</span>` : 
                                        ''}
                                </div>
                                ${wordCountDisplay}
                            </div>
                        </div>
                    `;
                }
                validationFilesListElement.innerHTML = filesHtml;
                
                // Асинхронно обновляем информацию о словах в объяснениях
                this.updateExplanationWordCounts(items, validationFilesListElement);
            }
            
            // Рассчитываем общий прогресс валидации
            // Логика: 5 (новости) + 2 (личные) + 5 (мемы) + количество файлов с валидными тегами
            // + количество личных достижений с валидными объяснениями + количество мемов с валидными объяснениями
            // + 1 (обязательный файл КАПСУЛА)
            // Когда все валидно: 5 + 2 + 5 + 12 + 2 + 5 + 1 = 27
            let totalRequired = 5 + 2 + 5 + items.length + explanationResults.totalPersonalItems + explanationResults.totalMemeItems + 1; // базовые категории + файлы с валидными тегами + объяснения + КАПСУЛА
            let totalAchieved = Math.min(newsCount, 5) + Math.min(personalCount, 2) + Math.min(memesCount, 5) + filesWithValidKeywords + validPersonalExplanations + validMemeExplanations + (hasCapsuleDescription ? 1 : 0);
            const overallPercentage = totalRequired > 0 ? Math.round((totalAchieved / totalRequired) * 100) : 0;

            // Обновляем общий прогресс бар
            this.updateProgressBar('general-progress-bar', 'general-progress-text', totalAchieved, totalRequired);
            
            // Обновляем общий счетчик
            const generalCountElement = document.getElementById('general-validation-count');
            if (generalCountElement) {
                generalCountElement.textContent = `${totalAchieved}/${totalRequired}`;
            }

            // Обновляем общий статус
            const generalStatusElement = document.getElementById('general-validation-status');
            if (generalStatusElement) {
                generalStatusElement.textContent = overallPercentage >= 100 ? '✅' : '❌';
            }

            // Обновляем класс прогресс бара в зависимости от общего прогресса
            // Теперь это будет handled автоматически ProgressManager
            // но мы можем обновить классы вручную если нужно
            const generalProgressBar = document.getElementById('general-progress-bar');
            if (generalProgressBar) {
                // Прогресс бар будет обновлен через ProgressManager, но классы нужно обновить отдельно
                generalProgressBar.classList.remove('success', 'warning', 'danger', 'empty', 'full');
                if (overallPercentage === 0) {
                    generalProgressBar.classList.add('empty');
                } else if (overallPercentage >= 80) {
                    generalProgressBar.classList.add('success');
                } else if (overallPercentage >= 40) {
                    generalProgressBar.classList.add('warning');
                } else if (overallPercentage > 0) {
                    generalProgressBar.classList.add('danger');
                }
                if (overallPercentage === 100) {
                    generalProgressBar.classList.add('full');
                }
            }

            // Если общий прогресс 100%, сворачиваем секцию валидации
            if (validationDetailsContainer && overallPercentage >= 10) {
                validationDetailsContainer.removeAttribute('open');
            }

        } catch (error) {
            this.logger.logError(error, { operationId });
        } finally {
            this.logger.popOperation();
        }
    }

    /**
     * Обновление прогресс бара
     * @param {string} progressBarId - ID элемента прогресс бара
     * @param {string} progressTextId - ID элемента текста прогресса
     * @param {number} currentValue - Текущее значение
     * @param {number} maxValue - Максимальное значение
     */
    updateProgressBar(progressBarId, progressTextId, currentValue, maxValue) {
        // Используем ProgressManager для управления прогресс баром
        this.progressManager.updateProgressByValue(progressBarId, progressTextId, currentValue, maxValue);
    }

    /**
     * Асинхронное обновление информации о словах в файлах объяснений для каждого элемента
     * @param {Array} items - Массив элементов архива
     * @param {HTMLElement} validationFilesListElement - Элемент списка файлов валидации
     */
    async updateExplanationWordCounts(items, validationFilesListElement) {
        const operationId = this.logger.pushOperation('updateExplanationWordCounts', { itemsCount: items.length });
        try {
            // Обрабатываем каждый элемент архива для получения информации о словах в объяснениях
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const itemType = item.type.toUpperCase();
                const isPersonal = itemType === 'ЛИЧНОЕ';
                const isMem = itemType === 'МЕМ';

                if (isPersonal || isMem) {
                    const explanationFile = await this.parent.findExplanationFile(item.filename);
                    
                    if (explanationFile) {
                        try {
                            const text = await explanationFile.async('text');
                            const wordCount = this.explanationValidator.countWords(text);
                            const requiredWords = isPersonal ? 100 : 50;
                            const isValid = wordCount >= requiredWords;
                            const progressPercentage = requiredWords > 0 ? Math.min(100, (wordCount / requiredWords) * 100) : 100;

                            // Обновляем отображение для конкретного элемента
                            const wordsProgressElement = document.getElementById(`words-progress-${i}`);
                            if (wordsProgressElement) {
                                const wordCountSpan = wordsProgressElement.querySelector('.word-count-placeholder') || 
                                                     wordsProgressElement.querySelector('span:nth-child(2)');
                                const progressBarFill = wordsProgressElement.querySelector('.validation-file-words-progress-fill');
                                const statusSpan = wordsProgressElement.querySelector('.validation-file-words-status');

                                if (wordCountSpan) wordCountSpan.textContent = `${wordCount}/${requiredWords}`;
                                if (progressBarFill) progressBarFill.style.setProperty('--progress-width', `${progressPercentage}%`);
                                if (statusSpan) statusSpan.textContent = isValid ? '✅' : '❌';
                                
                                // Добавляем класс для индикации валидности
                                wordsProgressElement.classList.toggle('words-valid', isValid);
                                wordsProgressElement.classList.toggle('words-invalid', !isValid);
                            }

                            this.logger.debug('Word count updated for explanation file', { 
                                filename: item.filename, 
                                wordCount, 
                                required: requiredWords, 
                                isValid,
                                operationId 
                            });
                        } catch (error) {
                            this.logger.warn('Failed to read explanation file for word count', { 
                                filename: item.filename, 
                                error: error.message, 
                                operationId 
                            });
                            
                            // Обновляем статус ошибки
                            const wordsProgressElement = document.getElementById(`words-progress-${i}`);
                            if (wordsProgressElement) {
                                const wordCountSpan = wordsProgressElement.querySelector('.word-count-placeholder') || 
                                                     wordsProgressElement.querySelector('span:nth-child(2)');
                                const statusSpan = wordsProgressElement.querySelector('.validation-file-words-status');

                                if (wordCountSpan) wordCountSpan.textContent = 'Ошибка';
                                if (statusSpan) statusSpan.textContent = '❌';
                                wordsProgressElement.classList.add('words-error');
                            }
                        }
                    } else {
                        // Если файла объяснения нет, обновляем статус
                        const wordsProgressElement = document.getElementById(`words-progress-${i}`);
                        if (wordsProgressElement) {
                            const statusSpan = wordsProgressElement.querySelector('.validation-file-words-status');
                            if (statusSpan) statusSpan.textContent = '❌';
                            wordsProgressElement.classList.add('words-missing');
                        }
                    }
                }
            }

            this.logger.info('Explanation word counts updated for all items', { operationId });
        } catch (error) {
            this.logger.logError(error, { operationId });
        } finally {
            this.logger.popOperation();
        }
    }
}
