/**
 * @typedef {Object} ArchiveItem
 * @property {string} filename - Имя файла в архиве
 * @property {string} type - Тип файла
 * @property {string} title - Заголовок
 * @property {string} description - Описание
 * @property {string} date - Дата
 * @property {string[]} tags - Теги
 */

/**
 * @typedef {Object} ValidationError
 * @property {number} lineNumber - Номер строки с ошибкой
 * @property {string} line - Содержимое строки
 * @property {string} error - Описание ошибки
 * @property {string} expectedFormat - Ожидаемый формат
 * @property {Array} problematicParts - Проблемные части строки
 */

/**
 * Основной класс для управления цифровой капсулой времени
 */
export class DigitalTimeCapsule {
    /**
     * Создает экземпляр DigitalTimeCapsule
     */
    constructor() {
        this.zip = null;
        this.imageUrls = [];
        this.videoUrls = [];
        this.audioUrls = [];
        this.pdfUrls = [];
        this.csvUrls = [];
        this.textUrls = [];
        this.defaultUrls = [];
        
        // Инициализация логгера
        this.logger = window.logger || console;
        this.logger.info('DigitalTimeCapsule инициализирован', {
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
        });
        
        this.initializeEventListeners();
        this.initializeTheme();
        this.clearGlobalStatus(); // Очищаем глобальный статус при инициализации
    }

    /**
     * Инициализация событий
     */
    initializeEventListeners() {
        const operationId = this.logger.pushOperation('initializeEventListeners');
        try {
            const uploadInput = document.getElementById('zipUpload');
            const themeToggle = document.getElementById('theme-toggle');
            
            if (uploadInput) {
                uploadInput.addEventListener('change', (event) => {
                    this.logger.trackUserAction('file_selected', { 
                        fileName: event.target.files[0]?.name,
                        fileSize: event.target.files[0]?.size
                    });
                    this.handleZipUpload(event)
                        .catch(error => this.showError(`Ошибка загрузки: ${error.message}`));
                });
                this.logger.debug('Обработчик загрузки ZIP файла добавлен');
            }

            // Обработчик переключения темы
            if (themeToggle) {
                themeToggle.addEventListener('click', () => {
                    this.toggleTheme();
                });
                this.logger.debug('Обработчик переключения темы добавлен');
            }

            // Очистка URL при выгрузке страницы
            window.addEventListener('beforeunload', () => {
                this.cleanupUrls();
            });

            // Очистка URL при навигации
            window.addEventListener('pagehide', () => {
                this.cleanupUrls();
            });

            this.logger.info('События инициализированы успешно', { operationId });
        } catch (error) {
            this.logger.error('Ошибка при инициализации событий', { error: error.message, operationId });
            throw error;
        } finally {
            this.logger.popOperation();
        }
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

    /**
     * Обработка загрузки ZIP-файла
     * @param {Event} event - Событие загрузки файла
     * @returns {Promise<void>}
     */
    async handleZipUpload(event) {
        const operationId = this.logger.pushOperation('handleZipUpload', {
            fileName: event.target.files[0]?.name,
            fileSize: event.target.files[0]?.size
        });
        try {
            const file = event.target.files[0];
            if (!file) {
                this.logger.warn('Файл не выбран', { operationId });
                return;
            }

            const uploadStatus = document.getElementById('upload-status');
            const globalUploadStatus = document.getElementById('global-upload-status');
            
            // Проверка типа файла
            if (!file.name.toLowerCase().endsWith('.zip')) {
                this.logger.warn('Выбран не ZIP файл', { fileName: file.name, operationId });
                this.showError('Пожалуйста, выберите ZIP-файл');
                return;
            }

            // Проверка размера файла (ограничение 100MB)
            if (file.size > 10 * 1024 * 1024) {
                this.logger.warn('Файл слишком большой', { fileSize: file.size, operationId });
                this.showError('Файл слишком большой. Максимальный размер 100MB');
                return;
            }

            // Обновляем статус в обоих местах - локальный и глобальный
            if (uploadStatus) {
                uploadStatus.textContent = 'Загрузка и обработка архива...';
                uploadStatus.className = 'upload-status';
            }
            this.updateGlobalStatus('Загрузка и обработка архива...', '');

            // Чтение файла в ArrayBuffer
            const arrayBuffer = await this.readFileAsArrayBuffer(file);
            this.logger.debug('ZIP файл прочитан', { fileSize: file.size, arrayBufferLength: arrayBuffer.byteLength, operationId });
            
            // Загрузка ZIP-архива
            this.zip = await JSZip.loadAsync(arrayBuffer);
            this.logger.debug('ZIP архив загружен', { filesCount: Object.keys(this.zip.files).length, operationId });
            
            // Отображение архива
            await this.renderArchive();
            this.logger.info('Архив обработан', { operationId });
            
            // Проверяем, были ли ошибки в манифесте
            const manifestFile = this.zip.file('manifest.txt');
            if (manifestFile) {
                const manifestText = await manifestFile.async('text');
                const { items, errors } = this.parseManifest(manifestText);
                
                if (errors.length > 0) {
                    // Если есть ошибки в манифесте, не показываем сообщение об успешной загрузке
                    if (uploadStatus) {
                        uploadStatus.textContent = `Найдено ${errors.length} ошибок в манифесте. Проверьте архив.`;
                        uploadStatus.className = 'upload-status error';
                    }
                    this.updateGlobalStatus(`Найдено ${errors.length} ошибок в манифесте. Проверьте архив.`, 'error');
                } else {
                    // Если ошибок нет, показываем успешное сообщение
                    if (uploadStatus) {
                        uploadStatus.textContent = 'Архив успешно загружен!';
                        uploadStatus.className = 'upload-status success';
                    }
                    this.updateGlobalStatus('Архив успешно загружен!', 'success');
                }
            }

            // Показать секцию архива
            const archiveSection = document.getElementById('archive-section');
            if (archiveSection) {
                archiveSection.hidden = false;
                this.logger.debug('Секция архива показана', { operationId });
            }
            
            // Показать боковую панель архива
            const archiveSidebar = document.getElementById('archive-sidebar');
            if (archiveSidebar) {
                archiveSidebar.hidden = false;
                this.logger.debug('Боковая панель архива показана', { operationId });
            }

            // Свернуть секцию загрузки после обработки
            const uploadSectionDetails = document.getElementById('upload-section-details');
            if (uploadSectionDetails) {
                uploadSectionDetails.removeAttribute('open');
            }

        } catch (error) {
            this.logger.logError(error, { operationId });
            this.showError(`Ошибка обработки ZIP-файла: ${error.message}`);
        } finally {
            this.logger.popOperation();
        }
    }

    /**
     * Чтение файла как ArrayBuffer с обработкой ошибок
     * @param {File} file - Файл для чтения
     * @returns {Promise<ArrayBuffer>} - ArrayBuffer файла
     */
    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Ошибка чтения файла'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Отображение архива
     * @returns {Promise<void>}
     */
    async renderArchive() {
        const operationId = this.logger.pushOperation('renderArchive');
        try {
            const container = document.getElementById('archive-container');
            if (!container) {
                this.logger.warn('Контейнер архива не найден', { operationId });
                return;
            }

            this.logger.debug('Начало отображения архива', { operationId });

            // Чтение манифеста
            const manifestFile = this.zip.file('manifest.txt');
            if (!manifestFile) {
                const error = new Error('Файл manifest.txt не найден в архиве');
                this.logger.error('Манифест не найден', { error: error.message, operationId });
                throw error;
            }

            const manifestText = await manifestFile.async('text');
            this.logger.debug('Манифест прочитан', { manifestLength: manifestText.length, operationId });

            const { items, errors } = this.parseManifest(manifestText);
            this.logger.info('Манифест разобран', { itemsCount: items.length, errorsCount: errors.length, operationId });
            
            // Если есть ошибки в манифесте, отображаем их вместо архива
            if (errors.length > 0) {
                this.displayManifestErrors(errors);
                return;
            }
            
            container.innerHTML = '';
            this.logger.debug('Контейнер очищен', { operationId });
            
            // Отображение каждого элемента
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                await this.renderArchiveItem(item, container);
                this.logger.debug('Элемент архива отображен', { index: i, filename: item.filename, operationId });
            }

            // Заполнение боковой панели информацией об архиве
            this.populateSidebar(items);
            
            // Проверка корректности архива
            this.validateArchive(items);
            
            this.logger.info('Архив отображен успешно', { itemsCount: items.length, operationId });

        } catch (error) {
            this.logger.logError(error, { operationId });
            throw new Error(`Ошибка при чтении манифеста: ${error.message}`);
        } finally {
            this.logger.popOperation();
        }
    }

    /**
     * Отображение ошибок парсинга манифеста
     * @param {ValidationError[]} errors - Массив ошибок
     */
    displayManifestErrors(errors) {
        const operationId = this.logger.pushOperation('displayManifestErrors', { errorsCount: errors.length });
        try {
            const container = document.getElementById('archive-container');
            if (!container) {
                this.logger.warn('Контейнер архива не найден', { operationId });
                return;
            }

            // Очищаем контейнер и показываем ошибки
            container.innerHTML = `
                <div class="manifest-errors-container">
                    <h2 class="error-title">❌ Ошибки в манифесте архива</h2>
                    <p class="error-description">Найдено ${errors.length} ошибок в файле manifest.txt. Архив не может быть загружен до исправления этих ошибок.</p>
                    
                    <div class="errors-list">
                        ${errors.map((error, index) => `
                            <div class="error-item" data-error-index="${index}">
                                <div class="error-header">
                                    <span class="error-line-number">Строка ${error.lineNumber}</span>
                                    <span class="error-toggle" onclick="this.parentElement.parentElement.querySelector('.error-details').classList.toggle('expanded')">▼</span>
                                </div>
                                <div class="error-content">
                                    <div class="error-line">${this.escapeHtml(error.line)}</div>
                                    <div class="error-message">${this.escapeHtml(error.error)}</div>
                                    <div class="error-details">
                                        <div class="error-format">
                                            <strong>Ожидаемый формат:</strong> ${this.escapeHtml(error.expectedFormat)}
                                        </div>
                                        ${error.problematicParts ? `
                                        <div class="error-parts">
                                            <strong>Проблемные части строки:</strong>
                                            <ul>
                                                ${error.problematicParts.map(part => `
                                                    <li class="error-part ${part.isEmpty ? 'empty' : ''} ${part.isProblematic ? 'problematic' : ''}"
                                                        data-part-index="${part.index}">
                                                        <span class="part-field">[${part.field}]</span>
                                                        <span class="part-content">${this.escapeHtml(part.part)}</span>
                                                        <span class="part-status">${part.isEmpty ? ' (пустое)' : part.isProblematic ? ' (ошибка)' : ''}</span>
                                                    </li>
                                                `).join('')}
                                            </ul>
                                        </div>
                                        ` : ''}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;

            // Показываем секцию архива (если она была скрыта)
            const archiveSection = document.getElementById('archive-section');
            if (archiveSection) {
                archiveSection.hidden = false;
            }

            this.logger.info('Ошибки манифеста отображены', { errorsCount: errors.length, operationId });
        } catch (error) {
            this.logger.logError(error, { operationId });
        } finally {
            this.logger.popOperation();
        }
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
                    
                    let item;
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
                                item = {
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
                                item = {
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
                                item = {
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

                    if (hasValidFormat && item) {
                        items.push(item);
                        validItemsCount++;
                    } else if (formatError) {
                        errors.push({
                            lineNumber: lineNumber,
                            line: line,
                            error: formatError,
                            expectedFormat: isPdf ? '01_Новость.pdf | НОВОСТЬ | дата | теги' : '02_Медиа.mp3 | МЕДИА | Заголовок | Описание | 2024-10-15 | тег1,тег2,тег3',
                            problematicParts: this.getProblematicParts(parts, item, line, false)
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
     * Получение эмодзи для типа элемента
     * @param {string} type - Тип элемента
     * @returns {string} - Соответствующий эмодзи
     */
    getItemEmoji(type) {
        const typeMap = {
            'НОВОСТЬ': '📰',
            'МЕДИА': '🎬',
            'МЕМ': '😂',
            'ФОТО': '📸',
            'ВИДЕО': '🎥',
            'АУДИО': '🎵',
            'ДОКУМЕНТ': '📄',
            'ТЕКСТ': '📝',
            'КАРТИНКА': '🖼️',
            'СЫЛКА': '🔗',
            'СОБЫТИЕ': '📅',
            'ЛИЧНОЕ': '👤',
            'ОБУЧЕНИЕ': '📚',
            'РАБОТА': '💼',
            'ХОББИ': '🎨'
        };
        return typeMap[type.toUpperCase()] || '📁';
    }

    /**
     * Показ ошибки
     * @param {string} message - Сообщение об ошибке
     */
    showError(message) {
        this.updateGlobalStatus(message, 'error');
        this.logger.error(message);
    }

    /**
     * Очистка глобального статуса
     */
    clearGlobalStatus() {
        const globalUploadStatus = document.getElementById('global-upload-status');
        if (globalUploadStatus) {
            globalUploadStatus.textContent = '';
            globalUploadStatus.className = 'upload-status';
            // Добавляем класс hidden для скрытия элемента при отсутствии сообщения
            globalUploadStatus.style.display = 'none';
        }
    }

    /**
     * Обновление глобального статуса
     * @param {string} message - Сообщение
     * @param {'info'|'success'|'error'} statusType - Тип статуса
     */
    updateGlobalStatus(message, statusType = 'info') {
        const globalUploadStatus = document.getElementById('global-upload-status');
        if (globalUploadStatus) {
            globalUploadStatus.textContent = message;
            globalUploadStatus.className = `upload-status ${statusType}`;
            // Показываем элемент при наличии сообщения
            globalUploadStatus.style.display = message ? 'block' : 'none';
        }
    }

    /**
     * Генерация безопасного ID для HTML элементов
     * @param {string} filename - Имя файла
     * @returns {string} - Безопасный ID
     */
    generateSafeId(filename) {
        if (typeof filename !== 'string') return 'unknown';
        
        // Удаляем расширение файла для генерации ID
        const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
        
        // Заменяем все символы, кроме букв, цифр, подчеркиваний и дефисов, на подчеркивания
        // Также заменяем пробелы на подчеркивания
        let safeId = nameWithoutExt.replace(/[^\w\u0400-\u04FF\u00C0-\u00FF-]/g, '_');
        
        // Удаляем множественные подчеркивания и дефисы
        safeId = safeId.replace(/[_-]+/g, '_');
        
        // Удаляем начальные и конечные подчеркивания/дефисы
        safeId = safeId.replace(/^[_-]|[_-]$/g, '');
        
        // Если результат пустой, используем 'file'
        if (!safeId) safeId = 'file';
        
        // Добавляем префикс, чтобы избежать конфликта с цифрами в начале
        if (/^\d/.test(safeId)) {
            safeId = 'file_' + safeId;
        }
        
        return safeId;
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
                if (item.tags.length >= 5) {
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
                    const hasValidTags = item.tags.length >= 5;
                    const tagStatus = hasValidTags ? '✅' : '❌';
                    const tagCount = item.tags.length;
                    const requiredTags = 5;
                    
                    filesHtml += `
                        <div class="validation-file-item">
                            <div class="validation-file-header">
                                <span class="validation-file-name">${this.escapeHtml(item.title || item.filename)}</span>
                                <span class="validation-file-type">${this.escapeHtml(item.type)}</span>
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

    /**
     * Заполнение боковой панели информацией об архиве
     * @param {ArchiveItem[]} items - Элементы архива
     */
    async populateSidebar(items) {
        const operationId = this.logger.pushOperation('populateSidebar', { itemsCount: items.length });
        try {
            const fileCountElement = document.getElementById('file-count');
            const fileListElement = document.getElementById('file-list');

            if (fileCountElement) {
                fileCountElement.textContent = `Файлов: ${items.length}`;
            }

            if (fileListElement) {
                fileListElement.innerHTML = '';

                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const listItem = document.createElement('li');
                    listItem.className = 'archive-nav-item';
                    
                    // Для PDF файлов получаем заголовок из метаданных, как в renderArchiveItem
                    let displayTitle = item.title; // По умолчанию используем заголовок из манифеста
                    
                    if (item.filename.toLowerCase().endsWith('.pdf')) {
                        const pdfFile = this.zip.file(item.filename);
                        if (pdfFile) {
                            try {
                                const arrayBuffer = await pdfFile.async('arraybuffer');
                                const pdfDocument = await pdfjsLib.getDocument(arrayBuffer).promise;
                                const metadata = await pdfDocument.getMetadata();
                                
                                if (metadata && metadata.info && metadata.info.Title) {
                                    displayTitle = metadata.info.Title;
                                }
                            } catch (error) {
                                this.logger.warn('Не удалось получить метаданные PDF для боковой панели', { error: error.message, filename: item.filename });
                                // Используем заголовок из манифеста, если не удалось получить метаданные
                            }
                        }
                    }
                    
                    listItem.innerHTML = `
                        <span>${this.getItemEmoji(item.type)}</span>
                        <span>${i + 1}. </span>
                        <span>${this.escapeHtml(displayTitle)}</span>
                    `;
                    
                    // Добавляем обработчик клика для прокрутки к элементу архива
                    listItem.addEventListener('click', () => {
                        const targetElement = document.querySelector(`#archive-container .archive-item:nth-child(${i + 1})`);
                        if (targetElement) {
                            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            // Добавляем подсветку к элементу
                            targetElement.style.backgroundColor = '#e3f2fd';
                            setTimeout(() => {
                                targetElement.style.backgroundColor = '';
                            }, 200);
                        }
                    });

                    fileListElement.appendChild(listItem);
                }
                this.logger.debug('Боковая панель заполнена', { itemsCount: items.length, operationId });
            }
        } catch (error) {
            this.logger.logError(error, { operationId });
        } finally {
            this.logger.popOperation();
        }
    }

    /**
     * Очистка URL для предотвращения утечек памяти
     */
    cleanupUrls() {
        const operationId = this.logger.pushOperation('cleanupUrls');
        try {
            [...this.imageUrls, ...this.videoUrls, ...this.audioUrls, 
             ...this.pdfUrls, ...this.csvUrls, ...this.textUrls, ...this.defaultUrls]
            .forEach(url => {
                try {
                    URL.revokeObjectURL(url);
                    this.logger.debug('URL очищен', { url, operationId });
                } catch (e) {
                    this.logger.debug('Ошибка при очистке URL', { error: e.message, url, operationId });
                }
            });
            
            this.imageUrls = [];
            this.videoUrls = [];
            this.audioUrls = [];
            this.pdfUrls = [];
            this.csvUrls = [];
            this.textUrls = [];
            this.defaultUrls = [];
            this.logger.info('URL очистка завершена', { operationId });
        } catch (error) {
            this.logger.logError(error, { operationId });
        } finally {
            this.logger.popOperation();
        }
    }

    /**
     * Экранирование HTML для безопасности
     * @param {string} text - Текст для экранирования
     * @returns {string} - Экранированный текст
     */
    escapeHtml(text) {
        if (typeof text !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
