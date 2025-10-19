//Старая версия приложения для референса

// Конфигурация PDF.js для CDN версии
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// Импорт логгера (глобальная переменная из src/logger.js)
// Класс для управления цифровой капсулой времени
class DigitalTimeCapsule {
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

    // Инициализация темы
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

    // Переключение темы
    toggleTheme() {
        const currentTheme = document.body.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        this.updateThemeToggleIcon();
    }

    // Обновление иконки переключения темы
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

    // Инициализация событий
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

    // Переключение темы
    toggleTheme() {
        const operationId = this.logger.pushOperation('toggleTheme');
        try {
            const currentTheme = document.body.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            
            document.body.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            this.updateThemeToggleIcon();
            
            this.logger.trackUserAction('theme_changed', { from: currentTheme, to: newTheme });
            this.logger.info('Тема изменена', { currentTheme, newTheme, operationId });
        } catch (error) {
            this.logger.error('Ошибка при переключении темы', { error: error.message, operationId });
            throw error;
        } finally {
            this.logger.popOperation();
        }
    }

    // Обработка загрузки ZIP-файла
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

    // Чтение файла как ArrayBuffer с обработкой ошибок
    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Ошибка чтения файла'));
            reader.readAsArrayBuffer(file);
        });
    }

    // Отображение архива
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

    // Отображение ошибок парсинга манифеста
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

    // Парсер манифеста с валидацией и сбором информации об ошибках
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

    // Вспомогательный метод для проверки корректности формата даты
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

    // Вспомогательный метод для определения проблемных частей строки
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

    // Санитизация строк для предотвращения XSS
    sanitizeString(str) {
        if (typeof str !== 'string') return '';
        
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Санитизация имен файлов - НЕ изменяем оригинальные имена файлов, только проверяем на безопасность
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


    // Получение эмодзи для типа элемента
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
            'ССЫЛКА': '🔗',
            'СОБЫТИЕ': '📅',
            'ЛИЧНОЕ': '👤',
            'ОБУЧЕНИЕ': '📚',
            'РАБОТА': '💼',
            'ХОББИ': '🎨'
        };
        return typeMap[type.toUpperCase()] || '📁';
    }

    // Отображение элемента архива
    async renderArchiveItem(item, container) {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'archive-item';
        
        // Создание безопасного HTML, используем оригинальное имя файла для ID без изменений
        const previewId = `preview-${this.generateSafeId(item.filename)}`;
        const explanationPreviewId = `explanation-${this.generateSafeId(item.filename)}`;
        
        const emoji = this.getItemEmoji(item.type);
        
        // Проверяем, является ли это мемом и ищем связанные файлы объяснений
        const isMem = item.type.toUpperCase() === 'МЕМ';
        let explanationFile = null;
        if (isMem) {
            explanationFile = this.findExplanationFile(item.filename);
        }
        
        // Для PDF файлов будем использовать метаданные из файла вместо манифеста
        if (item.filename.toLowerCase().endsWith('.pdf')) {
            // Загружаем PDF файл, чтобы получить метаданные
            const pdfFile = this.zip.file(item.filename);
            if (pdfFile) {
                try {
                    const arrayBuffer = await pdfFile.async('arraybuffer');
                    const pdfDocument = await pdfjsLib.getDocument(arrayBuffer).promise;
                    const metadata = await pdfDocument.getMetadata();
                    
                    let displayTitle = item.title; // По умолчанию используем заголовок из манифеста
                    let displayDescription = item.description; // По умолчанию используем описание из манифеста
                    
                    if (metadata && metadata.info) {
                        // Используем заголовок из PDF метаданных вместо манифеста
                        if (metadata.info.Title) {
                            displayTitle = metadata.info.Title;
                        }
                        
                        // Используем тему из PDF метаданных вместо описания из манифеста
                        if (metadata.info.Subject) {
                            displayDescription = metadata.info.Subject;
                        } else if (metadata.info.Title) {
                            // Если темы нет, но есть заголовок, используем заголовок как описание
                            displayDescription = metadata.info.Title;
                        }
                    }
                    
                    let explanationHtml = '';
                    if (isMem && explanationFile) {
                        explanationHtml = `
                            <details class="content-details explanation-details" style="margin-top: 15px;">
                                <summary aria-label="Показать объяснение мема ${this.escapeHtml(displayTitle)}">
                                    💡 Объяснение мема
                                </summary>
                                <div class="content-preview" id="${explanationPreviewId}" style="margin-top: 10px;">
                                    <div class="loading">Загрузка объяснения...</div>
                                </div>
                            </details>
                        `;
                    }
                    
                    itemDiv.innerHTML = `
                        <div class="item-header">
                            <div class="item-meta">
                                <div class="item-emoji">${emoji}</div>
                                <div class="item-type">${this.escapeHtml(item.type)}</div>
                                <div class="item-date">${this.escapeHtml(item.date)}</div>
                            </div>
                            <h3 class="item-title">${this.escapeHtml(displayTitle)} ${item.tags.map(tag => `<span class="title-tags">${this.escapeHtml(tag)}</span>`).join(' ')}</h3>
                        </div>
                        <div class="item-description">${this.escapeHtml(displayDescription)}</div>
                        <div class="content-preview" id="${previewId}" style="margin-top: 10px;">
                            <div class="loading">Загрузка контента...</div>
                        </div>
                        ${explanationHtml}
                    `;
                } catch (error) {
                    // Если не удалось получить метаданные PDF, используем данные из манифеста
                    this.logger.warn('Не удалось получить метаданные PDF, используем данные из манифеста', { error: error.message, filename: item.filename });
                    
                    let explanationHtml = '';
                    if (isMem && explanationFile) {
                        explanationHtml = `
                            <details class="content-details explanation-details" style="margin-top: 15px;">
                                <summary aria-label="Показать объяснение мема ${this.escapeHtml(item.title)}">
                                    💡 Объяснение мема
                                </summary>
                                <div class="content-preview" id="${explanationPreviewId}" style="margin-top: 10px;">
                                    <div class="loading">Загрузка объяснения...</div>
                                </div>
                            </details>
                        `;
                    }
                    
                    itemDiv.innerHTML = `
                        <div class="item-header">
                            <div class="item-meta">
                                <div class="item-emoji">${emoji}</div>
                                <div class="item-type">${this.escapeHtml(item.type)}</div>
                                <div class="item-date">${this.escapeHtml(item.date)}</div>
                            </div>
                            <h3 class="item-title">${this.escapeHtml(item.title)} ${item.tags.map(tag => `<span class="title-tags">${this.escapeHtml(tag)}</span>`).join(' ')}</h3>
                        </div>
                        <div class="item-description">${this.escapeHtml(item.description)}</div>
                        <div class="content-preview" id="${previewId}" style="margin-top: 10px;">
                            <div class="loading">Загрузка контента...</div>
                        </div>
                        ${explanationHtml}
                    `;
                }
            } else {
                // Если PDF файл не найден, используем стандартный подход
                let explanationHtml = '';
                if (isMem && explanationFile) {
                    explanationHtml = `
                        <details class="content-details explanation-details" style="margin-top: 15px;">
                            <summary aria-label="Показать объяснение мема ${this.escapeHtml(item.title)}">
                                💡 Объяснение мема
                            </summary>
                            <div class="content-preview" id="${explanationPreviewId}" style="margin-top: 10px;">
                                <div class="loading">Загрузка объяснения...</div>
                            </div>
                        </details>
                    `;
                }
                
                itemDiv.innerHTML = `
                    <div class="item-header">
                        <div class="item-meta">
                            <div class="item-emoji">${emoji}</div>
                            <div class="item-type">${this.escapeHtml(item.type)}</div>
                            <div class="item-date">${this.escapeHtml(item.date)}</div>
                        </div>
                        <h3 class="item-title">${this.escapeHtml(item.title)} ${item.tags.map(tag => `<span class="title-tags">${this.escapeHtml(tag)}</span>`).join(' ')}</h3>
                    </div>
                    <div class="item-description">${this.escapeHtml(item.description)}</div>
                    <div class="content-preview" id="${previewId}" style="margin-top: 10px;">
                        <div class="loading">Загрузка контента...</div>
                    </div>
                    ${explanationHtml}
                `;
            }
        } else {
            // Для других типов файлов сохраняем общий спойлер
            let explanationHtml = '';
            if (isMem && explanationFile) {
                explanationHtml = `
                    <details class="content-details explanation-details" style="margin-top: 15px;">
                        <summary aria-label="Показать объяснение мема ${this.escapeHtml(item.title)}">
                            💡 Объяснение мема
                        </summary>
                        <div class="content-preview" id="${explanationPreviewId}" style="margin-top: 10px;">
                            <div class="loading">Загрузка объяснения...</div>
                        </div>
                    </details>
                `;
            }
            
            itemDiv.innerHTML = `
                <div class="item-header">
                    <div class="item-meta">
                        <div class="item-emoji">${emoji}</div>
                        <div class="item-type">${this.escapeHtml(item.type)}</div>
                        <div class="item-date">${this.escapeHtml(item.date)}</div>
                    </div>
                    <h3 class="item-title">${this.escapeHtml(item.title)} ${item.tags.map(tag => `<span class="title-tags">${this.escapeHtml(tag)}</span>`).join(' ')}</h3>
                </div>
                <div class="item-description">${this.escapeHtml(item.description)}</div>
                <details class="content-details">
                    <summary aria-label="Показать содержимое файла ${this.escapeHtml(item.title)}">
                        👁 Показать содержимое файла
                    </summary>
                    <div class="content-preview" id="${previewId}" 
                         style="margin-top: 10px;">
                        <div class="loading">Загрузка контента...</div>
                    </div>
                </details>
                ${explanationHtml}
            `;
        }
        
        container.appendChild(itemDiv);
        
        // Загрузка и отображение основного контента
        await this.loadContent(item);
        
        // Загрузка и отображение объяснения, если это мем с файлом объяснения
        if (isMem && explanationFile) {
            await this.loadExplanationContent(explanationFile, explanationPreviewId);
        }
    }

    // Поиск файла объяснения для мема
    findExplanationFile(memFilename) {
        const operationId = this.logger.pushOperation('findExplanationFile', { memFilename });
        try {
            const baseName = memFilename.replace(/\.[^/.]+$/, ""); // Удаляем расширение
            this.logger.debug('Базовое имя файла для поиска объяснения', { baseName, memFilename, operationId });
            
            // Для новой структуры имен: {номер}_{тип}.{расширение} -> {номер}_{тип}_объяснение.txt
            // Пробуем найти файл объяснения по точному совпадению
            const exactMatchNames = [
                `${baseName}_объяснение.txt`,
                `${baseName}_explanation.txt`,
                `${baseName}_info.txt`,
                `${baseName}_description.txt`,
                `${baseName}_details.txt`
            ];
            
            this.logger.debug('Поиск по точному совпадению', { exactMatchNames, operationId });
            
            for (const explanationName of exactMatchNames) {
                this.logger.debug('Проверка точного совпадения', { explanationName, exists: !!this.zip.file(explanationName), operationId });
                if (this.zip.file(explanationName)) {
                    this.logger.info('Файл объяснения найден по точному совпадению', { explanationName, operationId });
                    return this.zip.file(explanationName);
                }
            }
            
            // Если точное совпадение не найдено, ищем по частичному совпадению
            // Разбиваем базовое имя на части и ищем файлы, начинающиеся с этих частей
            const nameParts = baseName.split('_');
            this.logger.debug('Поиск по частичному совпадению', { nameParts, operationId });
            
            // Пробуем разные комбинации частей имени (начиная с наиболее полной)
            for (let i = nameParts.length; i > 0; i--) {
                const partialName = nameParts.slice(0, i).join('_');
                this.logger.debug('Проверка частичного совпадения', { partialName, operationId });
                
                const partialMatchNames = [
                    `${partialName}_объяснение.txt`,
                    `${partialName}_explanation.txt`,
                    `${partialName}_info.txt`,
                    `${partialName}_description.txt`,
                    `${partialName}_details.txt`
                ];
                
                for (const explanationName of partialMatchNames) {
                    this.logger.debug('Проверка частичного совпадения файла', { explanationName, exists: !!this.zip.file(explanationName), operationId });
                    if (this.zip.file(explanationName)) {
                        this.logger.info('Файл объяснения найден по частичному совпадению', { explanationName, partialName, operationId });
                        return this.zip.file(explanationName);
                    }
                }
            }
            
            // Дополнительно: ищем файлы объяснений, которые содержат часть имени мема
            const allFiles = Object.keys(this.zip.files);
            const explanationFiles = allFiles.filter(f => f.includes('_объяснение.txt') || f.includes('_explanation.txt') || 
                f.includes('_info.txt') || f.includes('_description.txt') || f.includes('_details.txt'));
            
            this.logger.debug('Поиск среди всех файлов объяснений', { explanationFiles, operationId });
            
            for (const explanationFile of explanationFiles) {
                const explanationBase = explanationFile.replace(/\.[^/.]+$/, ""); // Удаляем .txt
                // Проверяем, является ли базовое имя мема частью имени файла объяснения или наоборот
                if (explanationBase.includes(baseName) || baseName.includes(explanationBase.replace(/_(объяснение|explanation|info|description|details)$/, ''))) {
                    this.logger.info('Файл объяснения найден по частичному соответствию', { explanationFile, baseName, explanationBase, operationId });
                    return this.zip.file(explanationFile);
                }
            }
            
            this.logger.warn('Файл объяснения не найден', { baseName, operationId });
            return null;
        } catch (error) {
            this.logger.logError(error, { operationId });
            return null;
        } finally {
            this.logger.popOperation();
        }
    }

    // Загрузка и отображение содержимого файла объяснения
    async loadExplanationContent(explanationFile, previewId) {
        const operationId = this.logger.pushOperation('loadExplanationContent');
        try {
            const previewDiv = document.getElementById(previewId);
            if (!previewDiv) {
                this.logger.warn('Элемент предпросмотра объяснения не найден', { previewId, operationId });
                return;
            }

            this.logger.debug('Начало загрузки файла объяснения', { operationId });

            const text = await explanationFile.async('text');
            previewDiv.innerHTML = `<pre class="text-content explanation-text">${this.escapeHtml(text)}</pre>`;
            this.logger.debug('Файл объяснения загружен и отображен', { textLength: text.length, operationId });
        } catch (error) {
            this.logger.logError(error, { operationId });
            previewDiv.innerHTML = `<p class="error">Ошибка загрузки объяснения: ${this.escapeHtml(error.message)}</p>`;
        } finally {
            this.logger.popOperation();
        }
    }

    // Экранирование HTML для безопасности
    escapeHtml(text) {
        if (typeof text !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Загрузка и отображение содержимого файла
    async loadContent(item) {
        const operationId = this.logger.pushOperation('loadContent', { filename: item.filename });
        try {
            const previewId = `preview-${this.generateSafeId(item.filename)}`;
            const previewDiv = document.getElementById(previewId);
            if (!previewDiv) {
                this.logger.warn('Элемент предпросмотра не найден', { previewId, operationId });
                return;
            }

            this.logger.debug('Начало загрузки контента файла', { filename: item.filename, operationId });
            
            const file = this.zip.file(item.filename);
            if (!file) {
                this.logger.warn('Файл не найден в архиве', { filename: item.filename, operationId });
                previewDiv.innerHTML = '<p class="error">Файл не найден в архиве</p>';
                return;
            }
            
            this.logger.debug('Файл найден, начинаем обработку', { filename: item.filename, operationId });

            const fileExt = item.filename.split('.').pop().toLowerCase();
            this.logger.debug('Расширение файла определено', { fileExt, operationId });
            
            switch (fileExt) {
                case 'jpg':
                case 'jpeg':
                case 'png':
                case 'gif':
                case 'svg':
                    await this.handleImageFile(file, item, previewDiv, operationId);
                    break;
                    
                case 'mp4':
                case 'webm':
                case 'avi':
                case 'mov':
                case 'wmv':
                case 'flv':
                    await this.handleVideoFile(file, item, previewDiv, operationId);
                    break;
                    
                case 'mp3':
                case 'wav':
                case 'ogg':
                    await this.handleAudioFile(file, item, previewDiv, operationId);
                    break;
                    
                case 'pdf':
                    await this.handlePdfFile(file, item, previewDiv, operationId);
                    break;
                    
                case 'csv':
                    await this.handleCsvFile(file, item, previewDiv, operationId);
                    break;
                    
                case 'txt':
                    await this.handleTextFile(file, item, previewDiv, operationId);
                    break;
                    
                default:
                    await this.handleDefaultFile(file, item, previewDiv, operationId);
            }
        } catch (error) {
            this.logger.logError(error, { operationId });
            previewDiv.innerHTML = `<p class="error">Ошибка загрузки файла: ${this.escapeHtml(error.message)}</p>`;
        } finally {
            this.logger.popOperation();
        }
    }

    // Обработка изображений
    async handleImageFile(file, item, previewDiv, parentOperationId = null) {
        const operationId = this.logger.pushOperation('handleImageFile', { filename: item.filename, parentOperationId });
        try {
            const imageData = await file.async('base64');
            const imageUrl = `data:image/${item.filename.split('.').pop()};base64,${imageData}`;
            previewDiv.innerHTML = `<img src="${this.escapeHtml(imageUrl)}" alt="${this.escapeHtml(item.title)}" loading="lazy">`;
            this.logger.debug('Изображение обработано успешно', { filename: item.filename, operationId });
        } catch (e) {
            this.logger.debug('Ошибка при обработке изображения, пробуем резервный метод', { error: e.message, operationId });
            try {
                // Резервный метод для больших файлов
                const imageBlob = await file.async('blob');
                const imageUrl = URL.createObjectURL(imageBlob);
                previewDiv.innerHTML = `<img src="${this.escapeHtml(imageUrl)}" alt="${this.escapeHtml(item.title)}" loading="lazy">`;
                this.imageUrls.push(imageUrl);
                this.logger.debug('Изображение обработано через blob', { filename: item.filename, operationId });
            } catch (blobError) {
                this.logger.logError(blobError, { operationId });
                previewDiv.innerHTML = `<p class="error">Ошибка загрузки изображения: ${this.escapeHtml(blobError.message)}</p>`;
            }
        } finally {
            this.logger.popOperation();
        }
    }

    // Обработка видео
    async handleVideoFile(file, item, previewDiv, parentOperationId = null) {
        const operationId = this.logger.pushOperation('handleVideoFile', { filename: item.filename, parentOperationId });
        try {
            const videoBlob = await file.async('blob');
            const videoUrl = URL.createObjectURL(videoBlob);
            
            let videoMimeType = 'video/' + item.filename.split('.').pop().toLowerCase();
            const mimeTypes = {
                'mp4': 'video/mp4',
                'avi': 'video/x-msvideo',
                'mov': 'video/quicktime',
                'wmv': 'video/x-ms-wmv',
                'flv': 'video/x-flv',
                'webm': 'video/webm'
            };
            
            videoMimeType = mimeTypes[videoMimeType.split('/')[1]] || videoMimeType;
            
            previewDiv.innerHTML = `
                <video controls preload="metadata" style="width: 100%; max-width: 800px; height: auto; margin: 10px 0; display: block;">
                    <source src="${this.escapeHtml(videoUrl)}" type="${this.escapeHtml(videoMimeType)}">
                    Ваш браузер не поддерживает видео.
                </video>
            `;
            
            this.videoUrls.push(videoUrl);
            this.logger.debug('Видео обработано успешно', { filename: item.filename, operationId });
        } catch (e) {
            this.logger.debug('Ошибка при обработке видео', { error: e.message, operationId });
            previewDiv.innerHTML = `<p class="error">Ошибка видео: ${this.escapeHtml(e.message)}</p>`;
        } finally {
            this.logger.popOperation();
        }
    }

    // Обработка аудио
    async handleAudioFile(file, item, previewDiv, parentOperationId = null) {
        const operationId = this.logger.pushOperation('handleAudioFile', { filename: item.filename, parentOperationId });
        try {
            const audioBlob = await file.async('blob');
            const audioUrl = URL.createObjectURL(audioBlob);
            
            let fileExt = item.filename.split('.').pop().toLowerCase();
            const mimeTypes = {
                'mp3': 'audio/mpeg',
                'wav': 'audio/wav',
                'ogg': 'audio/ogg',
                'm4a': 'audio/mp4',
                'aac': 'audio/aac',
                'flac': 'audio/flac'
            };
            
            let audioMimeType = mimeTypes[fileExt] || 'audio/' + fileExt;
            
            // Используем video элемент для аудио файлов, так как он лучше работает
            previewDiv.innerHTML = `
                <video controls preload="metadata" style="width: 100%; max-width: 800px; height: auto; margin: 10px 0; display: block;">
                    <source src="${this.escapeHtml(audioUrl)}" type="${this.escapeHtml(audioMimeType)}">
                    Ваш браузер не поддерживает аудио.
                </video>
            `;
            
            this.audioUrls.push(audioUrl);
            this.logger.debug('Аудио обработано успешно', { filename: item.filename, operationId });
        } catch (e) {
            this.logger.logError(e, { operationId });
            previewDiv.innerHTML = `<p class="error">Ошибка аудио: ${this.escapeHtml(e.message)}</p>`;
        } finally {
            this.logger.popOperation();
        }
    }

    // Парсинг даты из формата PDF
    parsePdfDate(dateString) {
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

    // Обработка PDF
    async handlePdfFile(file, item, previewDiv, parentOperationId = null) {
        const operationId = this.logger.pushOperation('handlePdfFile', { filename: item.filename, parentOperationId });
        try {
            this.logger.debug('Начало обработки PDF файла', { filename: item.filename, operationId });
            
            // Получаем ArrayBuffer из файла ZIP
            const arrayBuffer = await file.async('arraybuffer');
            this.logger.debug('ArrayBuffer получен', { size: arrayBuffer.byteLength, operationId });
            
            // Создаем копию ArrayBuffer для data URL до использования в PDF.js
            const arrayBufferCopy = arrayBuffer.slice(0);
            const uint8Array = new Uint8Array(arrayBufferCopy);
            const dataUrl = `data:application/pdf;base64,${this.arrayBufferToBase64(uint8Array)}`;
            this.logger.debug('Data URL создан для PDF', { operationId });
            
            // Загружаем PDF документ с помощью PDF.js (используем оригинальный ArrayBuffer)
            const pdfDocument = await pdfjsLib.getDocument(arrayBuffer).promise;
            this.logger.debug('PDF документ загружен', { pages: pdfDocument.numPages, operationId });
            
            // Извлекаем метаданные
            const metadata = await pdfDocument.getMetadata();
            this.logger.debug('Метаданные извлечены', { hasMetadata: !!metadata.info, operationId });
            
            // Формируем HTML для отображения метаданных и PDF как двух отдельных спойлеров
            let metadataHtml = '';
            if (metadata && metadata.info) {
                const info = metadata.info;
                this.logger.debug('Обработка метаданных PDF', { metadataKeys: Object.keys(info), operationId });
                metadataHtml = `
                    <details class="pdf-metadata-details">
                        <summary class="pdf-metadata-summary" aria-label="Показать метаданные PDF файла ${this.escapeHtml(item.title)}">
                            📄 Метаданные PDF
                        </summary>
                        <div class="pdf-metadata-content">
                            <div class="metadata-grid">
                `;
                
                if (info.Title) {
                    this.logger.debug('Заголовок PDF', { title: info.Title, operationId });
                    metadataHtml += `
                        <strong class="metadata-field-main">Заголовок:</strong>
                        <span>${this.escapeHtml(info.Title)}</span>
                    `;
                }
                if (info.Author) {
                    this.logger.debug('Автор PDF', { author: info.Author, operationId });
                    metadataHtml += `
                        <strong class="metadata-field-main">Автор:</strong>
                        <span>${this.escapeHtml(info.Author)}</span>
                    `;
                }
                if (info.Subject) {
                    this.logger.debug('Тема PDF', { subject: info.Subject, operationId });
                    metadataHtml += `
                        <strong class="metadata-field-main">Тема:</strong>
                        <span>${this.escapeHtml(info.Subject)}</span>
                    `;
                }
                if (info.Keywords) {
                    this.logger.debug('Ключевые слова PDF', { keywords: info.Keywords, operationId });
                    metadataHtml += `
                        <strong class="metadata-field-main">Ключевые слова:</strong>
                        <span>${this.escapeHtml(info.Keywords)}</span>
                    `;
                }
                if (info.CreationDate) {
                    const creationDate = this.parsePdfDate(info.CreationDate);
                    if (creationDate && !isNaN(creationDate.getTime())) {
                        this.logger.debug('Дата создания PDF', { creationDate: creationDate.toISOString(), operationId });
                        metadataHtml += `
                            <strong class="metadata-field-secondary">Дата создания:</strong>
                            <span class="metadata-field-secondary">${creationDate.toLocaleString('ru-RU', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                                timeZoneName: 'short'
                            })}</span>
                        `;
                    } else {
                        this.logger.warn('Некорректная дата создания PDF', { rawDate: info.CreationDate, operationId });
                        metadataHtml += `
                            <strong class="metadata-field-secondary">Дата создания:</strong>
                            <span class="metadata-field-secondary">${this.escapeHtml(info.CreationDate)}</span>
                        `;
                    }
                }
                if (info.ModDate) {
                    const modDate = this.parsePdfDate(info.ModDate);
                    if (modDate && !isNaN(modDate.getTime())) {
                        this.logger.debug('Дата изменения PDF', { modDate: modDate.toISOString(), operationId });
                        metadataHtml += `
                            <strong class="metadata-field-secondary">Дата изменения:</strong>
                            <span class="metadata-field-secondary">${modDate.toLocaleString('ru-RU', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                                timeZoneName: 'short'
                            })}</span>
                        `;
                    } else {
                        this.logger.warn('Некорректная дата изменения PDF', { rawDate: info.ModDate, operationId });
                        metadataHtml += `
                            <strong class="metadata-field-secondary">Дата изменения:</strong>
                            <span class="metadata-field-secondary">${this.escapeHtml(info.ModDate)}</span>
                        `;
                    }
                }
                if (info.Creator) {
                    this.logger.debug('Создано PDF', { creator: info.Creator, operationId });
                    metadataHtml += `
                        <strong class="metadata-field-secondary">Создано:</strong>
                        <span class="metadata-field-secondary">${this.escapeHtml(info.Creator)}</span>
                    `;
                }
                if (info.Producer) {
                    this.logger.debug('Обработано PDF', { producer: info.Producer, operationId });
                    metadataHtml += `
                        <strong class="metadata-field-secondary">Обработано:</strong>
                        <span class="metadata-field-secondary">${this.escapeHtml(info.Producer)}</span>
                    `;
                }
                if (info.PDFFormatVersion) {
                    this.logger.debug('Версия PDF', { version: info.PDFFormatVersion, operationId });
                    metadataHtml += `
                        <strong class="metadata-field-secondary">Версия PDF:</strong>
                        <span class="metadata-field-secondary">${this.escapeHtml(info.PDFFormatVersion)}</span>
                    `;
                }
                
                metadataHtml += `
                            </div>
                            <div class="metadata-page-count">
                                <strong>Количество страниц:</strong> ${pdfDocument.numPages}
                            </div>
                        </div>
                    </details>
                `;
            }
            
            // Создаем отдельный спойлер для PDF содержимого
            const pdfContentHtml = `
                <details class="pdf-content-details">
                    <summary class="pdf-content-summary" aria-label="Показать содержимое PDF файла ${this.escapeHtml(item.title)}">
                        👁 Просмотр PDF
                    </summary>
                    <div class="pdf-content-content">
                        <iframe class="pdf-viewer" src="${this.escapeHtml(dataUrl)}"></iframe>
                        <div class="pdf-download-section">
                            <a href="${this.escapeHtml(dataUrl)}" download="${this.escapeHtml(item.filename)}" class="download-link">
                                📥 Скачать PDF
                            </a>
                        </div>
                    </div>
                </details>
            `;
            
            previewDiv.innerHTML = `
                ${metadataHtml}
                ${pdfContentHtml}
            `;
            this.logger.info('PDF контент успешно отображен', { filename: item.filename, operationId });
        } catch (e) {
            this.logger.logError(e, { operationId });
            try {
                // Резервный метод для больших файлов или файлов без метаданных
                const pdfBlob = await file.async('blob');
                const pdfUrl = URL.createObjectURL(pdfBlob);
                this.logger.debug('Используется резервный метод с blob URL', { operationId });
                previewDiv.innerHTML = `
                    <iframe class="pdf-viewer" src="${this.escapeHtml(pdfUrl)}"></iframe>
                    <div style="margin-top: 10px;">
                        <a href="${this.escapeHtml(pdfUrl)}" download="${this.escapeHtml(item.filename)}" class="download-link">
                            📥 Скачать PDF
                        </a>
                    </div>
                `;
                
                this.pdfUrls.push(pdfUrl);
            } catch (blobError) {
                this.logger.logError(blobError, { operationId });
                // Финальный резервный метод - только ссылка для скачивания
                previewDiv.innerHTML = `
                    <p class="error">Не удалось отобразить PDF. <a href="#" onclick="event.preventDefault(); alert('PDF не может быть отображен в этом браузере. Пожалуйста, скачайте файл для просмотра.')" class="download-link">ℹ️ Информация о проблеме</a></p>
                    <div style="margin-top: 10px;">
                        <a href="${this.escapeHtml(URL.createObjectURL(await file.async('blob')))}" download="${this.escapeHtml(item.filename)}" class="download-link">
                            📥 Скачать PDF
                        </a>
                    </div>
                `;
            }
        } finally {
            this.logger.popOperation();
        }
    }

    // Вспомогательный метод для преобразования ArrayBuffer в base64
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    // Обработка CSV
    async handleCsvFile(file, item, previewDiv, parentOperationId = null) {
        const operationId = this.logger.pushOperation('handleCsvFile', { filename: item.filename, parentOperationId });
        try {
            const csvText = await file.async('text');
            const results = Papa.parse(csvText, { header: true });
            if (results.data.length > 0 && results.data[0]) {
                let tableHtml = '<table class="data-table"><thead><tr>';
                // Заголовки
                Object.keys(results.data[0]).forEach(key => {
                    tableHtml += `<th>${this.escapeHtml(key)}</th>`;
                });
                tableHtml += '</tr></thead><tbody>';
                // Данные
                results.data.forEach(row => {
                    tableHtml += '<tr>';
                    Object.values(row).forEach(cell => {
                        tableHtml += `<td>${this.escapeHtml(String(cell))}</td>`;
                    });
                    tableHtml += '</tr>';
                });
                tableHtml += '</tbody></table>';
                previewDiv.innerHTML = tableHtml;
                this.logger.debug('CSV файл обработан как таблица', { filename: item.filename, rows: results.data.length, operationId });
            } else {
                const blob = await file.async('blob');
                const url = URL.createObjectURL(blob);
                previewDiv.innerHTML = `
                    <a href="${this.escapeHtml(url)}" download="${this.escapeHtml(item.filename)}" class="download-link">
                        📥 Скачать CSV файл (${this.escapeHtml(item.filename)})
                    </a>
                `;
                this.csvUrls.push(url);
                this.logger.debug('CSV файл обработан как ссылка для скачивания', { filename: item.filename, operationId });
            }
        } catch (e) {
            this.logger.debug('Ошибка при обработке CSV файла, пробуем резервный метод', { error: e.message, operationId });
            try {
                const blob = await file.async('blob');
                const url = URL.createObjectURL(blob);
                previewDiv.innerHTML = `
                    <a href="${this.escapeHtml(url)}" download="${this.escapeHtml(item.filename)}" class="download-link">
                        📥 Скачать CSV файл (${this.escapeHtml(item.filename)})
                    </a>
                `;
                this.csvUrls.push(url);
                this.logger.debug('CSV файл обработан через blob', { filename: item.filename, operationId });
            } catch (blobError) {
                this.logger.logError(blobError, { operationId });
                previewDiv.innerHTML = `<p class="error">Ошибка загрузки CSV: ${this.escapeHtml(blobError.message)}</p>`;
            }
        } finally {
            this.logger.popOperation();
        }
    }

    // Обработка текстовых файлов
    async handleTextFile(file, item, previewDiv, parentOperationId = null) {
        const operationId = this.logger.pushOperation('handleTextFile', { filename: item.filename, parentOperationId });
        try {
            const text = await file.async('text');
            previewDiv.innerHTML = `<pre class="text-content">${this.escapeHtml(text)}</pre>`;
            this.logger.debug('Текстовый файл обработан успешно', { filename: item.filename, textLength: text.length, operationId });
        } catch (e) {
            this.logger.debug('Ошибка при обработке текстового файла, пробуем резервный метод', { error: e.message, operationId });
            try {
                const blob = await file.async('blob');
                const url = URL.createObjectURL(blob);
                previewDiv.innerHTML = `
                    <a href="${this.escapeHtml(url)}" download="${this.escapeHtml(item.filename)}" class="download-link">
                        📥 Скачать текстовый файл (${this.escapeHtml(item.filename)})
                    </a>
                `;
                this.textUrls.push(url);
                this.logger.debug('Текстовый файл обработан через blob', { filename: item.filename, operationId });
            } catch (blobError) {
                this.logger.logError(blobError, { operationId });
                previewDiv.innerHTML = `<p class="error">Ошибка загрузки текстового файла: ${this.escapeHtml(blobError.message)}</p>`;
            }
        } finally {
            this.logger.popOperation();
        }
    }

    // Обработка файлов по умолчанию
    async handleDefaultFile(file, item, previewDiv, parentOperationId = null) {
        const operationId = this.logger.pushOperation('handleDefaultFile', { filename: item.filename, parentOperationId });
        try {
            const fileData = await file.async('base64');
            const fileUrl = `data:application/octet-stream;base64,${fileData}`;
            previewDiv.innerHTML = `
                <a href="${this.escapeHtml(fileUrl)}" download="${this.escapeHtml(item.filename)}" class="download-link">
                    📥 Скачать файл (${this.escapeHtml(item.filename)})
                </a>
            `;
            this.logger.debug('Файл по умолчанию обработан через base64', { filename: item.filename, operationId });
        } catch (e) {
            this.logger.debug('Ошибка при обработке файла по умолчанию, пробуем резервный метод', { error: e.message, operationId });
            try {
                const blob = await file.async('blob');
                const url = URL.createObjectURL(blob);
                previewDiv.innerHTML = `
                    <a href="${this.escapeHtml(url)}" download="${this.escapeHtml(item.filename)}" class="download-link">
                        📥 Скачать файл (${this.escapeHtml(item.filename)})
                    </a>
                `;
                this.defaultUrls.push(url);
                this.logger.debug('Файл по умолчанию обработан через blob', { filename: item.filename, operationId });
            } catch (blobError) {
                this.logger.logError(blobError, { operationId });
                previewDiv.innerHTML = `<p class="error">Ошибка загрузки файла: ${this.escapeHtml(blobError.message)}</p>`;
            }
        } finally {
            this.logger.popOperation();
        }
    }

    // Показ ошибки
    showError(message) {
        this.updateGlobalStatus(message, 'error');
        this.logger.error(message);
    }

    // Очистка глобального статуса
    clearGlobalStatus() {
        const globalUploadStatus = document.getElementById('global-upload-status');
        if (globalUploadStatus) {
            globalUploadStatus.textContent = '';
            globalUploadStatus.className = 'upload-status';
            // Добавляем класс hidden для скрытия элемента при отсутствии сообщения
            globalUploadStatus.style.display = 'none';
        }
    }

    // Обновление глобального статуса
    updateGlobalStatus(message, statusType = 'info') {
        const globalUploadStatus = document.getElementById('global-upload-status');
        if (globalUploadStatus) {
            globalUploadStatus.textContent = message;
            globalUploadStatus.className = `upload-status ${statusType}`;
            // Показываем элемент при наличии сообщения
            globalUploadStatus.style.display = message ? 'block' : 'none';
        }
    }

    // Генерация безопасного ID для HTML элементов
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

    // Санитизация имен файлов - НЕ изменяем оригинальные имена файлов, только проверяем на безопасность
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

    // Проверка корректности архива
    validateArchive(items) {
        const operationId = this.logger.pushOperation('validateArchive', { itemsCount: items.length });
        try {
            const validationSection = document.getElementById('validation-section');
            const validationDetailsContainer = document.getElementById('validation-details-container');
            const newsCountElement = document.getElementById('news-count');
            const personalCountElement = document.getElementById('personal-count');
            const keywordsStatusElement = document.getElementById('keywords-status');
            const newsStatusElement = document.getElementById('news-status');
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

    // Заполнение боковой панели информацией об архиве
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

    // Очистка URL для предотвращения утечек памяти
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
}

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    new DigitalTimeCapsule();
});
