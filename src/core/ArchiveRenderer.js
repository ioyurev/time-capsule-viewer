import { logger } from '../logger.js';
import * as pdfjsLib from 'pdfjs-dist';

// Настройка PDF.js worker для Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.174/pdf.worker.min.js`;

/**
 * Класс для отображения архива и элементов архива
 */
export class ArchiveRenderer {
    /**
     * @param {DigitalTimeCapsule} parent - Родительский класс
     */
    constructor(parent) {
        this.parent = parent;
        this.logger = logger;
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
            const manifestFile = this.parent.zip.file('manifest.txt');
            if (!manifestFile) {
                const error = new Error('Файл manifest.txt не найден в архиве');
                this.logger.error('Манифест не найден', { error: error.message, operationId });
                throw error;
            }

            const manifestText = await manifestFile.async('text');
            this.logger.debug('Манифест прочитан', { manifestLength: manifestText.length, operationId });

            const { items, errors } = this.parent.parseManifest(manifestText);
            this.logger.info('Манифест разобран', { itemsCount: items.length, errorsCount: errors.length, operationId });
            
            // Если есть ошибки в манифесте, отображаем их вместо архива
            if (errors.length > 0) {
                this.displayManifestErrors(errors, container);
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
            this.parent.populateSidebar(items);
            
            // Проверка корректности архива
            this.parent.validateArchive(items);
            
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
     * @param {Array} errors - Массив ошибок
     * @param {HTMLElement} container - Контейнер для отображения
     */
    displayManifestErrors(errors, container) {
        const operationId = this.logger.pushOperation('displayManifestErrors', { errorsCount: errors.length });
        try {
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
                                    <div class="error-line">${this.parent.escapeHtml(error.line)}</div>
                                    <div class="error-message">${this.parent.escapeHtml(error.error)}</div>
                                    <div class="error-details">
                                        <div class="error-format">
                                            <strong>Ожидаемый формат:</strong> ${this.parent.escapeHtml(error.expectedFormat)}
                                        </div>
                                        ${error.problematicParts ? `
                                        <div class="error-parts">
                                            <strong>Проблемные части строки:</strong>
                                            <ul>
                                                ${error.problematicParts.map(part => `
                                                    <li class="error-part ${part.isEmpty ? 'empty' : ''} ${part.isProblematic ? 'problematic' : ''}"
                                                        data-part-index="${part.index}">
                                                        <span class="part-field">[${part.field}]</span>
                                                        <span class="part-content">${this.parent.escapeHtml(part.part)}</span>
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
     * Отображение отдельного элемента архива
     * @param {Object} item - Элемент архива
     * @param {HTMLElement} container - Контейнер для отображения
     * @returns {Promise<void>}
     */
    async renderArchiveItem(item, container) {
        const operationId = this.logger.pushOperation('renderArchiveItem', { filename: item.filename });
        try {
            const itemElement = document.createElement('div');
            itemElement.className = 'archive-item';
            itemElement.id = this.parent.generateSafeId(item.filename);

            // Определяем тип файла по расширению
            const fileExtension = item.filename.split('.').pop().toLowerCase();
            const isPdf = fileExtension === 'pdf';
            const isImage = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(fileExtension);
            const isVideo = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'].includes(fileExtension);
            const isAudio = ['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(fileExtension);
            const isCsv = fileExtension === 'csv';
            const isText = ['txt', 'md', 'log', 'json', 'xml'].includes(fileExtension);

            // Для PDF файлов пытаемся получить заголовок и описание из метаданных
            let displayTitle = item.title;
            let displayDescription = item.description;

            if (isPdf) {
                const pdfFile = this.parent.zip.file(item.filename);
                if (pdfFile) {
                    try {
                        const arrayBuffer = await pdfFile.async('arraybuffer');
                        const pdfDocument = await pdfjsLib.getDocument(arrayBuffer).promise;
                        const metadata = await pdfDocument.getMetadata();

                        if (metadata && metadata.info) {
                            if (metadata.info.Title && metadata.info.Title.trim() !== '') {
                                displayTitle = metadata.info.Title;
                            }
                            if (metadata.info.Subject && metadata.info.Subject.trim() !== '') {
                                displayDescription = metadata.info.Subject;
                            } else if (metadata.info.Author && metadata.info.Author.trim() !== '') {
                                displayDescription = `Автор: ${metadata.info.Author}`;
                            }
                        }
                    } catch (error) {
                        this.logger.warn('Не удалось получить метаданные PDF', { error: error.message, filename: item.filename });
                        // Используем заголовок и описание из манифеста, если не удалось получить метаданные
                    }
                }
            }

            // Создаем контент в зависимости от типа файла
            let contentHtml = '';
            let url = '';

            if (isPdf) {
                const pdfFile = this.parent.zip.file(item.filename);
                if (pdfFile) {
                    const arrayBuffer = await pdfFile.async('arraybuffer');
                    const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
                    url = URL.createObjectURL(blob);
                    this.parent.pdfUrls.push(url); // Сохраняем для очистки

                    contentHtml = `
                        <iframe class="pdf-viewer" src="${url}"></iframe>
                        <div style="margin-top: 10px;">
                            <a href="${url}" download="${this.parent.escapeHtml(item.filename)}" class="download-link">
                                📥 Скачать PDF
                            </a>
                        </div>
                    `;
                }
            } else if (isImage) {
                const imageFile = this.parent.zip.file(item.filename);
                if (imageFile) {
                    const uint8Array = await imageFile.async('uint8array');
                    const blob = new Blob([uint8Array], { type: `image/${fileExtension}` });
                    url = URL.createObjectURL(blob);
                    this.parent.imageUrls.push(url); // Сохраняем для очистки

                    contentHtml = `<img src="${url}" alt="${this.parent.escapeHtml(displayTitle)}" loading="lazy">`;
                }
            } else if (isVideo) {
                const videoFile = this.parent.zip.file(item.filename);
                if (videoFile) {
                    const uint8Array = await videoFile.async('uint8array');
                    const blob = new Blob([uint8Array], { type: 'video/mp4' }); // Для упрощения используем mp4
                    url = URL.createObjectURL(blob);
                    this.parent.videoUrls.push(url); // Сохраняем для очистки

                    contentHtml = `
                        <video controls preload="metadata" style="width: 100%; max-width: 800px; height: auto; margin: 10px 0; display: block;">
                            <source src="${url}" type="video/mp4">
                            Ваш браузер не поддерживает видео.
                        </video>
                    `;
                }
            } else if (isAudio) {
                const audioFile = this.parent.zip.file(item.filename);
                if (audioFile) {
                    const uint8Array = await audioFile.async('uint8array');
                    const blob = new Blob([uint8Array], { type: 'audio/mpeg' }); // Для упрощения используем mp3
                    url = URL.createObjectURL(blob);
                    this.parent.audioUrls.push(url); // Сохраняем для очистки

                    contentHtml = `
                        <video controls preload="metadata" style="width: 100%; max-width: 800px; height: auto; margin: 10px 0; display: block;">
                            <source src="${url}" type="audio/mpeg">
                            Ваш браузер не поддерживает аудио.
                        </video>
                    `;
                }
            } else if (isCsv) {
                const csvFile = this.parent.zip.file(item.filename);
                if (csvFile) {
                    const textContent = await csvFile.async('text');
                    const Papa = await import('papaparse'); // Динамический импорт
                    const results = Papa.default.parse(textContent, { header: true });
                    if (results.data.length > 0 && results.data[0]) {
                        let tableHtml = '<table class="data-table"><thead><tr>';
                        // Заголовки
                        Object.keys(results.data[0]).forEach(key => {
                            tableHtml += `<th>${this.parent.escapeHtml(key)}</th>`;
                        });
                        tableHtml += '</tr></thead><tbody>';
                        // Данные
                        results.data.forEach(row => {
                            tableHtml += '<tr>';
                            Object.values(row).forEach(cell => {
                                tableHtml += `<td>${this.parent.escapeHtml(String(cell))}</td>`;
                            });
                            tableHtml += '</tr>';
                        });
                        tableHtml += '</tbody></table>';
                        contentHtml = tableHtml;
                    } else {
                        const blob = await csvFile.async('blob');
                        const csvUrl = URL.createObjectURL(blob);
                        this.parent.csvUrls.push(csvUrl);
                        contentHtml = `
                            <a href="${csvUrl}" download="${this.parent.escapeHtml(item.filename)}" class="download-link">
                                📥 Скачать CSV файл (${this.parent.escapeHtml(item.filename)})
                            </a>
                        `;
                    }
                }
            } else if (isText) {
                const textFile = this.parent.zip.file(item.filename);
                if (textFile) {
                    const textContent = await textFile.async('text');
                    contentHtml = `<pre class="text-content">${this.parent.escapeHtml(textContent)}</pre>`;
                }
            } else {
                // Для других типов файлов создаем ссылку для скачивания
                const defaultFile = this.parent.zip.file(item.filename);
                if (defaultFile) {
                    const uint8Array = await defaultFile.async('uint8array');
                    const blob = new Blob([uint8Array]);
                    url = URL.createObjectURL(blob);
                    this.parent.defaultUrls.push(url); // Сохраняем для очистки

                    contentHtml = `
                        <a href="${url}" download="${this.parent.escapeHtml(item.filename)}" class="download-link">
                            📥 Скачать файл (${this.parent.escapeHtml(item.filename)})
                        </a>
                    `;
                }
            }

            // Формируем HTML элемента архива в стиле app.js
            const emoji = this.parent.getItemEmoji(item.type);
            const previewId = `preview-${this.parent.generateSafeId(item.filename)}`;

            // Проверяем, является ли это мемом и ищем связанные файлы объяснений
            const isMem = item.type.toUpperCase() === 'МЕМ';
            let explanationFile = null;
            if (isMem) {
                explanationFile = this.parent.findExplanationFile(item.filename);
            }

            let explanationHtml = '';
            if (isMem && explanationFile) {
                const explanationPreviewId = `explanation-${this.parent.generateSafeId(item.filename)}`;
                explanationHtml = `
                    <details class="content-details explanation-details" style="margin-top: 15px;">
                        <summary aria-label="Показать объяснение мема ${this.parent.escapeHtml(displayTitle)}">
                            💡 Объяснение мема
                        </summary>
                        <div class="content-preview" id="${explanationPreviewId}" style="margin-top: 10px;">
                            <div class="loading">Загрузка объяснения...</div>
                        </div>
                    </details>
                `;
            }

            // Для PDF файлов используем специальное отображение метаданных
            if (isPdf) {
                const pdfFile = this.parent.zip.file(item.filename);
                if (pdfFile) {
                    try {
                        const arrayBuffer = await pdfFile.async('arraybuffer');
                        const pdfDocument = await pdfjsLib.getDocument(arrayBuffer).promise;
                        const metadata = await pdfDocument.getMetadata();

                        let pdfMetadataHtml = '';
                        if (metadata && metadata.info) {
                            const info = metadata.info;
                            pdfMetadataHtml = `
                                <details class="pdf-metadata-details">
                                    <summary class="pdf-metadata-summary" aria-label="Показать метаданные PDF файла ${this.parent.escapeHtml(displayTitle)}">
                                        📄 Метаданные PDF
                                    </summary>
                                    <div class="pdf-metadata-content">
                                        <div class="metadata-grid">
                            `;

                            if (info.Title) {
                                pdfMetadataHtml += `
                                    <strong class="metadata-field-main">Заголовок:</strong>
                                    <span>${this.parent.escapeHtml(info.Title)}</span>
                                `;
                            }
                            if (info.Author) {
                                pdfMetadataHtml += `
                                    <strong class="metadata-field-main">Автор:</strong>
                                    <span>${this.parent.escapeHtml(info.Author)}</span>
                                `;
                            }
                            if (info.Subject) {
                                pdfMetadataHtml += `
                                    <strong class="metadata-field-main">Тема:</strong>
                                    <span>${this.parent.escapeHtml(info.Subject)}</span>
                                `;
                            }
                            if (info.Keywords) {
                                pdfMetadataHtml += `
                                    <strong class="metadata-field-main">Ключевые слова:</strong>
                                    <span>${this.parent.escapeHtml(info.Keywords)}</span>
                                `;
                            }

                            pdfMetadataHtml += `
                                        </div>
                                        <div class="metadata-page-count">
                                            <strong>Количество страниц:</strong> ${pdfDocument.numPages}
                                        </div>
                                    </div>
                                </details>
                            `;
                        }

                        const pdfContentHtml = `
                            <details class="pdf-content-details">
                                <summary class="pdf-content-summary" aria-label="Показать содержимое PDF файла ${this.parent.escapeHtml(displayTitle)}">
                                    👁 Просмотр PDF
                                </summary>
                                <div class="pdf-content-content">
                                    <iframe class="pdf-viewer" src="${url}"></iframe>
                                    <div class="pdf-download-section">
                                        <a href="${url}" download="${this.parent.escapeHtml(item.filename)}" class="download-link">
                                            📥 Скачать PDF
                                        </a>
                                    </div>
                                </div>
                            </details>
                        `;

                        itemElement.innerHTML = `
                            <div class="item-header">
                                <div class="item-meta">
                                    <div class="item-emoji">${emoji}</div>
                                    <div class="item-type">${this.parent.escapeHtml(item.type)}</div>
                                    <div class="item-date">${this.parent.escapeHtml(item.date)}</div>
                                </div>
                                <h3 class="item-title">${this.parent.escapeHtml(displayTitle)} ${item.tags.map(tag => `<span class="title-tags">${this.parent.escapeHtml(tag)}</span>`).join(' ')}</h3>
                            </div>
                            <div class="item-description">${this.parent.escapeHtml(displayDescription)}</div>
                            <div class="content-preview" id="${previewId}" style="margin-top: 10px;">
                                ${pdfMetadataHtml}
                                ${pdfContentHtml}
                            </div>
                            ${explanationHtml}
                        `;
                    } catch (error) {
                        // Если не удалось получить метаданные, используем обычное отображение
                        this.logger.warn('Не удалось получить метаданные PDF для отображения', { error: error.message, filename: item.filename });

                        itemElement.innerHTML = `
                            <div class="item-header">
                                <div class="item-meta">
                                    <div class="item-emoji">${emoji}</div>
                                    <div class="item-type">${this.parent.escapeHtml(item.type)}</div>
                                    <div class="item-date">${this.parent.escapeHtml(item.date)}</div>
                                </div>
                                <h3 class="item-title">${this.parent.escapeHtml(displayTitle)} ${item.tags.map(tag => `<span class="title-tags">${this.parent.escapeHtml(tag)}</span>`).join(' ')}</h3>
                            </div>
                            <div class="item-description">${this.parent.escapeHtml(displayDescription)}</div>
                            <details class="content-details">
                                <summary aria-label="Показать содержимое файла ${this.parent.escapeHtml(displayTitle)}">
                                    👁 Показать содержимое файла
                                </summary>
                                <div class="content-preview" id="${previewId}" style="margin-top: 10px;">
                                    <iframe class="pdf-viewer" src="${url}"></iframe>
                                    <div style="margin-top: 10px;">
                                        <a href="${url}" download="${this.parent.escapeHtml(item.filename)}" class="download-link">
                                            📥 Скачать PDF
                                        </a>
                                    </div>
                                </div>
                            </details>
                            ${explanationHtml}
                        `;
                    }
                }
            } else {
                // Для других типов файлов используем общий спойлер
                itemElement.innerHTML = `
                    <div class="item-header">
                        <div class="item-meta">
                            <div class="item-emoji">${emoji}</div>
                            <div class="item-type">${this.parent.escapeHtml(item.type)}</div>
                            <div class="item-date">${this.parent.escapeHtml(item.date)}</div>
                        </div>
                        <h3 class="item-title">${this.parent.escapeHtml(displayTitle)} ${item.tags.map(tag => `<span class="title-tags">${this.parent.escapeHtml(tag)}</span>`).join(' ')}</h3>
                    </div>
                    <div class="item-description">${this.parent.escapeHtml(displayDescription)}</div>
                    <details class="content-details">
                        <summary aria-label="Показать содержимое файла ${this.parent.escapeHtml(displayTitle)}">
                            👁 Показать содержимое файла
                        </summary>
                        <div class="content-preview" id="${previewId}" style="margin-top: 10px;">
                            ${contentHtml}
                        </div>
                    </details>
                    ${explanationHtml}
                `;
            }

            container.appendChild(itemElement);
            this.logger.debug('Элемент архива создан', { filename: item.filename, type: fileExtension, operationId });

            // Загрузка и отображение основного контента
            await this.loadContent(item);
            
            // Загрузка и отображение объяснения, если это мем с файлом объяснения
            if (isMem && explanationFile) {
                await this.loadExplanationContent(explanationFile, `explanation-${this.parent.generateSafeId(item.filename)}`);
            }

        } catch (error) {
            // Исправляем ошибку логгера - используем безопасный вызов
            try {
                this.logger.logError(error, { operationId });
            } catch (logError) {
                console.error('Ошибка при логировании:', logError);
                console.error('Оригинальная ошибка:', error);
            }
            // Создаем элемент с сообщением об ошибке
            const errorElement = document.createElement('div');
            errorElement.className = 'archive-item error-item';
            errorElement.innerHTML = `
                <div class="item-header">
                    <div class="item-meta">
                        <div class="item-emoji">❌</div>
                        <div class="item-type">ОШИБКА</div>
                        <div class="item-date">${this.parent.escapeHtml(item.date)}</div>
                    </div>
                    <h3 class="item-title error-title">
                        Ошибка загрузки: ${this.parent.escapeHtml(item.filename)}
                    </h3>
                </div>
                <div class="item-description">Не удалось загрузить файл: ${this.parent.escapeHtml(error.message)}</div>
            `;
            container.appendChild(errorElement);
        } finally {
            try {
                this.logger.popOperation();
            } catch (e) {
                // Игнорируем ошибки при завершении операции логирования
                console.warn('Ошибка при завершении операции логирования:', e);
            }
        }
    }

    /**
     * Загрузка и отображение содержимого файла
     * @param {Object} item - Элемент архива
     * @returns {Promise<void>}
     */
    async loadContent(item) {
        const operationId = this.logger.pushOperation('loadContent', { filename: item.filename });
        try {
            const previewId = `preview-${this.parent.generateSafeId(item.filename)}`;
            const previewDiv = document.getElementById(previewId);
            if (!previewDiv) {
                this.logger.warn('Элемент предпросмотра не найден', { previewId, operationId });
                return;
            }

            this.logger.debug('Начало загрузки контента файла', { filename: item.filename, operationId });
            
            const file = this.parent.zip.file(item.filename);
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
            previewDiv.innerHTML = `<p class="error">Ошибка загрузки файла: ${this.parent.escapeHtml(error.message)}</p>`;
        } finally {
            this.logger.popOperation();
        }
    }

    /**
     * Загрузка и отображение содержимого файла объяснения
     * @param {Object} explanationFile - Файл объяснения
     * @param {string} previewId - ID элемента предпросмотра
     * @returns {Promise<void>}
     */
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
            previewDiv.innerHTML = `<pre class="text-content explanation-text">${this.parent.escapeHtml(text)}</pre>`;
            this.logger.debug('Файл объяснения загружен и отображен', { textLength: text.length, operationId });
        } catch (error) {
            this.logger.logError(error, { operationId });
            previewDiv.innerHTML = `<p class="error">Ошибка загрузки объяснения: ${this.parent.escapeHtml(error.message)}</p>`;
        } finally {
            this.logger.popOperation();
        }
    }

    // Методы обработки файлов (скопированы из оригинального класса)
    async handleImageFile(file, item, previewDiv, parentOperationId = null) {
        const operationId = this.logger.pushOperation('handleImageFile', { filename: item.filename, parentOperationId });
        try {
            const imageData = await file.async('base64');
            const imageUrl = `data:image/${item.filename.split('.').pop()};base64,${imageData}`;
            previewDiv.innerHTML = `<img src="${this.parent.escapeHtml(imageUrl)}" alt="${this.parent.escapeHtml(item.title)}" loading="lazy">`;
            this.logger.debug('Изображение обработано успешно', { filename: item.filename, operationId });
        } catch (e) {
            this.logger.debug('Ошибка при обработке изображения, пробуем резервный метод', { error: e.message, operationId });
            try {
                // Резервный метод для больших файлов
                const imageBlob = await file.async('blob');
                const imageUrl = URL.createObjectURL(imageBlob);
                previewDiv.innerHTML = `<img src="${this.parent.escapeHtml(imageUrl)}" alt="${this.parent.escapeHtml(item.title)}" loading="lazy">`;
                this.parent.imageUrls.push(imageUrl);
                this.logger.debug('Изображение обработано через blob', { filename: item.filename, operationId });
            } catch (blobError) {
                this.logger.logError(blobError, { operationId });
                previewDiv.innerHTML = `<p class="error">Ошибка загрузки изображения: ${this.parent.escapeHtml(blobError.message)}</p>`;
            }
        } finally {
            this.logger.popOperation();
        }
    }

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
                    <source src="${this.parent.escapeHtml(videoUrl)}" type="${this.parent.escapeHtml(videoMimeType)}">
                    Ваш браузер не поддерживает видео.
                </video>
            `;
            
            this.parent.videoUrls.push(videoUrl);
            this.logger.debug('Видео обработано успешно', { filename: item.filename, operationId });
        } catch (e) {
            this.logger.debug('Ошибка при обработке видео', { error: e.message, operationId });
            previewDiv.innerHTML = `<p class="error">Ошибка видео: ${this.parent.escapeHtml(e.message)}</p>`;
        } finally {
            this.logger.popOperation();
        }
    }

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
                    <source src="${this.parent.escapeHtml(audioUrl)}" type="${this.parent.escapeHtml(audioMimeType)}">
                    Ваш браузер не поддерживает аудио.
                </video>
            `;
            
            this.parent.audioUrls.push(audioUrl);
            this.logger.debug('Аудио обработано успешно', { filename: item.filename, operationId });
        } catch (e) {
            this.logger.logError(e, { operationId });
            previewDiv.innerHTML = `<p class="error">Ошибка аудио: ${this.parent.escapeHtml(e.message)}</p>`;
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
            date = new Date(date.getTime() + (multiplier * tzOffsetMinutes * 600));
            
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
                        <summary class="pdf-metadata-summary" aria-label="Показать метаданные PDF файла ${this.parent.escapeHtml(item.title)}">
                            📄 Метаданные PDF
                        </summary>
                        <div class="pdf-metadata-content">
                            <div class="metadata-grid">
                `;
                
                if (info.Title) {
                    this.logger.debug('Заголовок PDF', { title: info.Title, operationId });
                    metadataHtml += `
                        <strong class="metadata-field-main">Заголовок:</strong>
                        <span>${this.parent.escapeHtml(info.Title)}</span>
                    `;
                }
                if (info.Author) {
                    this.logger.debug('Автор PDF', { author: info.Author, operationId });
                    metadataHtml += `
                        <strong class="metadata-field-main">Автор:</strong>
                        <span>${this.parent.escapeHtml(info.Author)}</span>
                    `;
                }
                if (info.Subject) {
                    this.logger.debug('Тема PDF', { subject: info.Subject, operationId });
                    metadataHtml += `
                        <strong class="metadata-field-main">Тема:</strong>
                        <span>${this.parent.escapeHtml(info.Subject)}</span>
                    `;
                }
                if (info.Keywords) {
                    this.logger.debug('Ключевые слова PDF', { keywords: info.Keywords, operationId });
                    metadataHtml += `
                        <strong class="metadata-field-main">Ключевые слова:</strong>
                        <span>${this.parent.escapeHtml(info.Keywords)}</span>
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
                            <span class="metadata-field-secondary">${this.parent.escapeHtml(info.CreationDate)}</span>
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
                            <span class="metadata-field-secondary">${this.parent.escapeHtml(info.ModDate)}</span>
                        `;
                    }
                }
                if (info.Creator) {
                    this.logger.debug('Создано PDF', { creator: info.Creator, operationId });
                    metadataHtml += `
                        <strong class="metadata-field-secondary">Создано:</strong>
                        <span class="metadata-field-secondary">${this.parent.escapeHtml(info.Creator)}</span>
                    `;
                }
                if (info.Producer) {
                    this.logger.debug('Обработано PDF', { producer: info.Producer, operationId });
                    metadataHtml += `
                        <strong class="metadata-field-secondary">Обработано:</strong>
                        <span class="metadata-field-secondary">${this.parent.escapeHtml(info.Producer)}</span>
                    `;
                }
                if (info.PDFFormatVersion) {
                    this.logger.debug('Версия PDF', { version: info.PDFFormatVersion, operationId });
                    metadataHtml += `
                        <strong class="metadata-field-secondary">Версия PDF:</strong>
                        <span class="metadata-field-secondary">${this.parent.escapeHtml(info.PDFFormatVersion)}</span>
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
                    <summary class="pdf-content-summary" aria-label="Показать содержимое PDF файла ${this.parent.escapeHtml(item.title)}">
                        👁 Просмотр PDF
                    </summary>
                    <div class="pdf-content-content">
                        <iframe class="pdf-viewer" src="${this.parent.escapeHtml(dataUrl)}"></iframe>
                        <div class="pdf-download-section">
                            <a href="${this.parent.escapeHtml(dataUrl)}" download="${this.parent.escapeHtml(item.filename)}" class="download-link">
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
                    <iframe class="pdf-viewer" src="${this.parent.escapeHtml(pdfUrl)}"></iframe>
                    <div style="margin-top: 10px;">
                        <a href="${this.parent.escapeHtml(pdfUrl)}" download="${this.parent.escapeHtml(item.filename)}" class="download-link">
                            📥 Скачать PDF
                        </a>
                    </div>
                `;
                
                this.parent.pdfUrls.push(pdfUrl);
            } catch (blobError) {
                this.logger.logError(blobError, { operationId });
                // Финальный резервный метод - только ссылка для скачивания
                previewDiv.innerHTML = `
                    <p class="error">Не удалось отобразить PDF. <a href="#" onclick="event.preventDefault(); alert('PDF не может быть отображен в этом браузере. Пожалуйста, скачайте файл для просмотра.')" class="download-link">ℹ️ Информация о проблеме</a></p>
                    <div style="margin-top: 10px;">
                        <a href="${this.parent.escapeHtml(URL.createObjectURL(await file.async('blob')))}" download="${this.parent.escapeHtml(item.filename)}" class="download-link">
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

    async handleCsvFile(file, item, previewDiv, parentOperationId = null) {
        const operationId = this.logger.pushOperation('handleCsvFile', { filename: item.filename, parentOperationId });
        try {
            const csvText = await file.async('text');
            const Papa = await import('papaparse'); // Динамический импорт
            const results = Papa.default.parse(csvText, { header: true });
            if (results.data.length > 0 && results.data[0]) {
                let tableHtml = '<table class="data-table"><thead><tr>';
                // Заголовки
                Object.keys(results.data[0]).forEach(key => {
                    tableHtml += `<th>${this.parent.escapeHtml(key)}</th>`;
                });
                tableHtml += '</tr></thead><tbody>';
                // Данные
                results.data.forEach(row => {
                    tableHtml += '<tr>';
                    Object.values(row).forEach(cell => {
                        tableHtml += `<td>${this.parent.escapeHtml(String(cell))}</td>`;
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
                    <a href="${this.parent.escapeHtml(url)}" download="${this.parent.escapeHtml(item.filename)}" class="download-link">
                        📥 Скачать CSV файл (${this.parent.escapeHtml(item.filename)})
                    </a>
                `;
                this.parent.csvUrls.push(url);
                this.logger.debug('CSV файл обработан как ссылка для скачивания', { filename: item.filename, operationId });
            }
        } catch (e) {
            this.logger.debug('Ошибка при обработке CSV файла, пробуем резервный метод', { error: e.message, operationId });
            try {
                const blob = await file.async('blob');
                const url = URL.createObjectURL(blob);
                previewDiv.innerHTML = `
                    <a href="${this.parent.escapeHtml(url)}" download="${this.parent.escapeHtml(item.filename)}" class="download-link">
                        📥 Скачать CSV файл (${this.parent.escapeHtml(item.filename)})
                    </a>
                `;
                this.parent.csvUrls.push(url);
                this.logger.debug('CSV файл обработан через blob', { filename: item.filename, operationId });
            } catch (blobError) {
                this.logger.logError(blobError, { operationId });
                previewDiv.innerHTML = `<p class="error">Ошибка загрузки CSV: ${this.parent.escapeHtml(blobError.message)}</p>`;
            }
        } finally {
            this.logger.popOperation();
        }
    }

    async handleTextFile(file, item, previewDiv, parentOperationId = null) {
        const operationId = this.logger.pushOperation('handleTextFile', { filename: item.filename, parentOperationId });
        try {
            const text = await file.async('text');
            previewDiv.innerHTML = `<pre class="text-content">${this.parent.escapeHtml(text)}</pre>`;
            this.logger.debug('Текстовый файл обработан успешно', { filename: item.filename, textLength: text.length, operationId });
        } catch (e) {
            this.logger.debug('Ошибка при обработке текстового файла, пробуем резервный метод', { error: e.message, operationId });
            try {
                const blob = await file.async('blob');
                const url = URL.createObjectURL(blob);
                previewDiv.innerHTML = `
                    <a href="${this.parent.escapeHtml(url)}" download="${this.parent.escapeHtml(item.filename)}" class="download-link">
                        📥 Скачать текстовый файл (${this.parent.escapeHtml(item.filename)})
                    </a>
                `;
                this.parent.textUrls.push(url);
                this.logger.debug('Текстовый файл обработан через blob', { filename: item.filename, operationId });
            } catch (blobError) {
                this.logger.logError(blobError, { operationId });
                previewDiv.innerHTML = `<p class="error">Ошибка загрузки текстового файла: ${this.parent.escapeHtml(blobError.message)}</p>`;
            }
        } finally {
            this.logger.popOperation();
        }
    }

    async handleDefaultFile(file, item, previewDiv, parentOperationId = null) {
        const operationId = this.logger.pushOperation('handleDefaultFile', { filename: item.filename, parentOperationId });
        try {
            const fileData = await file.async('base64');
            const fileUrl = `data:application/octet-stream;base64,${fileData}`;
            previewDiv.innerHTML = `
                <a href="${this.parent.escapeHtml(fileUrl)}" download="${this.parent.escapeHtml(item.filename)}" class="download-link">
                    📥 Скачать файл (${this.parent.escapeHtml(item.filename)})
                </a>
            `;
            this.logger.debug('Файл по умолчанию обработан через base64', { filename: item.filename, operationId });
        } catch (e) {
            this.logger.debug('Ошибка при обработке файла по умолчанию, пробуем резервный метод', { error: e.message, operationId });
            try {
                const blob = await file.async('blob');
                const url = URL.createObjectURL(blob);
                previewDiv.innerHTML = `
                    <a href="${this.parent.escapeHtml(url)}" download="${this.parent.escapeHtml(item.filename)}" class="download-link">
                        📥 Скачать файл (${this.parent.escapeHtml(item.filename)})
                    </a>
                `;
                this.parent.defaultUrls.push(url);
                this.logger.debug('Файл по умолчанию обработан через blob', { filename: item.filename, operationId });
            } catch (blobError) {
                this.logger.logError(blobError, { operationId });
                previewDiv.innerHTML = `<p class="error">Ошибка загрузки файла: ${this.parent.escapeHtml(blobError.message)}</p>`;
            }
        } finally {
            this.logger.popOperation();
        }
    }
}
