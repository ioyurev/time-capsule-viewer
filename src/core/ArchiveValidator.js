import { logger } from '../logger.js';
import { ArchiveItem } from '../models/ArchiveItem.js';

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
                
                // Проверяем минимальное количество полей
                if (parts.length >= 4) {
                    // Определяем тип файла по расширению
                    const isPdf = parts[0].toLowerCase().endsWith('.pdf');
                    
                    let itemConfig;
                    let hasValidFormat = false;
                    let formatError = null;
                    
                    if (isPdf) {
                        // Для PDF файлов пробуем разные форматы
                        if (parts.length === 4) {
                            // Формат: имя файла | тип | дата | теги
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
                        } else if (parts.length >= 6) {
                            // Формат: имя файла | тип | заголовок | описание | дата | теги
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
                            formatError = 'Некорректный формат строки для PDF файла. Ожидаемое количество полей: 4 или 6+';
                        }
                    } else {
                        // Для не-PDF файлов ожидаем 6+ полей
                        if (parts.length >= 6) {
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
                            formatError = 'Некорректный формат строки. Ожидаемое количество полей: 6+';
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
                            expectedFormat: isPdf ? '01_Новость.pdf | НОВОСТЬ | дата | теги' : '02_Медиа.mp3 | МЕДИА | Заголовок | Описание | 2024-10-15 | тег1,тег2,тег3',
                            problematicParts: this.getProblematicParts(parts, itemConfig, line, false)
                        });
                        invalidItemsCount++;
                    }
                } else {
                    errors.push({
                        lineNumber: lineNumber,
                        line: line,
                        error: `Недостаточное количество полей. Найдено: ${parts.length}, требуется: минимум 4 для PDF или 6 для других файлов`,
                        expectedFormat: '01_Новость.pdf | НОВОСТЬ | 2024-10-20 | тег1,тег2,тег3 (для PDF) или 02_Медиа.mp3 | МЕДИА | Заголовок | Описание | 2024-10-15 | тег1,тег2,тег3 (для других файлов)',
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
        const expectedFormat = isPdf ? 4 : 6; // PDF: 4 поля, другие: 6+ полей
        
        if (isSeparatorError) {
            // Если ошибка в разделителях, помечаем всю строку как проблемную
            for (let i = 0; i < parts.length; i++) {
                problematic.push({
                    index: i,
                    part: parts[i],
                    field: i === 0 ? 'filename' : i === 1 ? 'type' : i === 2 ? (isPdf ? 'date' : 'title') : i === 3 ? (isPdf ? 'tags' : 'description') : i === 4 ? 'date' : 'tags',
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
            
            if (isPdf) {
                // Для PDF файлов
                if (i === 0) {
                    field = 'filename';
                    isProblematic = !item || !item.filename;
                } else if (i === 1) {
                    field = 'type';
                    isProblematic = !item || !item.type;
                } else if (i === 2) {
                    field = 'date';
                    isDateField = true;
                    isProblematic = !item || !item.date || !this.isValidDate(part);
                } else if (i === 3) {
                    field = 'tags';
                    isProblematic = false; // теги могут быть пустыми
                } else {
                    // Дополнительные поля для PDF
                    field = i === 4 ? 'title' : i === 5 ? 'description' : 'extra';
                    isProblematic = true; // если больше 4 полей для PDF - это ошибка
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
                    field = 'title';
                    isProblematic = !item || !item.title;
                } else if (i === 3) {
                    field = 'description';
                    isProblematic = !item || !item.description;
                } else if (i === 4) {
                    field = 'date';
                    isDateField = true;
                    isProblematic = !item || !item.date || !this.isValidDate(part);
                } else if (i === 5) {
                    field = 'tags';
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
            
            problematic.push({
                index: i,
                part: part,
                field: field,
                isEmpty: isEmpty,
                isProblematic: isProblematic,
                expected: i < expectedFormat
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
    validateArchive(items) {
        const operationId = this.logger.pushOperation('validateArchive', { itemsCount: items.length });
        try {
            const validationSection = document.getElementById('validation-section');
            const validationDetailsContainer = document.getElementById('validation-details-container');
            const newsCountElement = document.getElementById('news-count');
            const mediaCountElement = document.getElementById('media-count');
            const personalCountElement = document.getElementById('personal-count');
            const keywordsStatusElement = document.getElementById('keywords-status');
            const newsStatusElement = document.getElementById('news-status');
            const mediaStatusElement = document.getElementById('media-status');
            const personalStatusElement = document.getElementById('personal-status');
            const keywordsValidationStatusElement = document.getElementById('keywords-validation-status');
            const validationFilesListElement = document.getElementById('validation-files-list');

            if (!validationSection) return;

            // Подсчет файлов по типам
            let newsCount = 0;
            let mediaCount = 0;
            let personalCount = 0;
            let filesWithValidKeywords = 0;
            let totalFiles = items.length;

            items.forEach((item, index) => {
                const itemType = item.type.toUpperCase();
                if (itemType === 'НОВОСТЬ') newsCount++;
                else if (itemType === 'МЕДИА') mediaCount++;
                else if (itemType === 'ЛИЧНОЕ') personalCount++;

                // Проверка количества ключевых слов
                if (item.getTagCount() >= 5) {
                    filesWithValidKeywords++;
                }
            });

            // Обновление счетчиков
            if (newsCountElement) newsCountElement.textContent = `${newsCount}/5`;
            if (mediaCountElement) mediaCountElement.textContent = `${mediaCount}/5`;
            if (personalCountElement) personalCountElement.textContent = `${personalCount}/2`;
            if (keywordsStatusElement) keywordsStatusElement.textContent = `${filesWithValidKeywords}/${totalFiles}`;

            // Обновление статусов
            if (newsStatusElement) newsStatusElement.textContent = newsCount >= 5 ? '✅' : '❌';
            if (mediaStatusElement) mediaStatusElement.textContent = mediaCount >= 5 ? '✅' : '❌';
            if (personalStatusElement) personalStatusElement.textContent = personalCount >= 2 ? '✅' : '❌';
            if (keywordsValidationStatusElement) {
                keywordsValidationStatusElement.textContent = filesWithValidKeywords === totalFiles ? '✅' : '❌';
            }

            // Формирование списка файлов с индикацией тегов
            if (validationFilesListElement) {
                let filesHtml = '<h4>Файлы в архиве:</h4>';
                items.forEach((item, index) => {
                    const hasValidTags = item.hasMinimumTags(5);
                    const tagStatus = hasValidTags ? '✅' : '❌';
                    const tagCount = item.getTagCount();
                    const requiredTags = 5;
                    
                    filesHtml += `
                        <div class="validation-file-item">
                            <div class="validation-file-header">
                                <span class="validation-file-name">${this.parent.escapeHtml(item.title || item.filename)}</span>
                                <span class="validation-file-type">${this.parent.escapeHtml(item.type)}</span>
                                <span class="validation-file-status">${tagStatus}</span>
                            </div>
                            <div class="validation-file-tags">
                                Теги: ${tagCount}/${requiredTags} ${!hasValidTags ? `(необходимо еще ${requiredTags - tagCount})` : ''}
                            </div>
                        </div>
                    `;
                });
                validationFilesListElement.innerHTML = filesHtml;
            }

            // Показываем секцию проверки
            validationSection.hidden = false;
            validationDetailsContainer.removeAttribute('hidden');
            
            this.logger.debug('Проверка архива завершена', { 
                newsCount, mediaCount, personalCount, filesWithValidKeywords, totalFiles, operationId 
            });

        } catch (error) {
            this.logger.logError(error, { operationId });
        } finally {
            this.logger.popOperation();
        }
    }
}
