import { logger } from '../logger.js';
import { ImageService } from '../services/ImageService.js';
import { PDFService } from '../services/PDFService.js';
import { pdfMetadataCache } from '../services/PDFMetadataCache.js';
import * as pdfjsLib from 'pdfjs-dist';

// Настройка PDF.js worker - используем локальную версию из node_modules с правильным URL для Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.js', import.meta.url).href;

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
            const manifestFile = await this.parent.archiveService.extractFile('manifest.txt');
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

            // Извлечение метаданных из PDF файлов до отображения, чтобы обновить заголовки для валидации
            await this.extractPdfMetadataEarly(items);
            
            container.innerHTML = '';
            this.logger.debug('Контейнер очищен', { operationId });

            // Сначала ищем и отображаем элемент КАПСУЛА, если он есть
            const capsuleItem = items.find(item => item.type.toUpperCase() === 'КАПСУЛА');
            if (capsuleItem) {
                // Отображаем описание капсулы в отдельной секции
                const capsuleContainer = document.getElementById('capsule-container');
                if (capsuleContainer) {
                    await this.renderCapsuleDescription(capsuleItem, capsuleContainer);
                    // Секция капсулы будет показана после полной обработки архива
                }
            }
            
            // Отображение остальных элементов
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                // Пропускаем КАПСУЛА элемент, так как он уже отображен
                if (item.type.toUpperCase() === 'КАПСУЛА') continue;
                await this.renderArchiveItem(item, container, i);
                this.logger.debug('Элемент архива отображен', { index: i, filename: item.filename, operationId });
            }

            // Заполнение боковой панели информацией об архиве
            // this.parent.populateSidebar(items); // Закомментировано для отключения боковой панели
            
            // Проверка корректности архива
            this.parent.validateArchive(items);
            
            // Показываем секцию капсулы после полной обработки архива, если есть элемент КАПСУЛА
            if (capsuleItem) {
                const capsuleSection = document.getElementById('capsule-section');
                if (capsuleSection) {
                    capsuleSection.hidden = false;
                }
            }
            
            this.logger.info('Архив отображен успешно', { itemsCount: items.length, operationId });

        } catch (error) {
            this.logger.logError(error, { operationId });
            throw new Error(`Ошибка при чтении манифеста: ${error.message}`);
        } finally {
            this.logger.popOperation();
        }
    }

    /**
     * Извлечение метаданных из PDF файлов до отображения, чтобы обновить заголовки для валидации
     * @param {Array} items - Массив элементов архива
     * @returns {Promise<void>}
     */
    async extractPdfMetadataEarly(items) {
        const operationId = this.logger.pushOperation('extractPdfMetadataEarly');
        try {
            // Очищаем кэш перед новой загрузкой
            pdfMetadataCache.clearCache();
            
            // Находим все PDF файлы в архиве, исключая ЛИЧНОЕ типы (для них не извлекаем метаданные)
            const pdfItems = items.filter(item => item.filename.toLowerCase().endsWith('.pdf') && item.type.toUpperCase() !== 'ЛИЧНОЕ');
            
            if (pdfItems.length === 0) {
                this.logger.debug('Нет PDF файлов для извлечения метаданных', { operationId });
                return;
            }

            this.logger.debug('Начало извлечения метаданных из PDF файлов', { pdfCount: pdfItems.length, operationId });

            // Извлекаем метаданные для всех PDF файлов параллельно
            const pdfPromises = pdfItems.map(async (item) => {
                try {
                    const pdfFile = await this.parent.archiveService.extractFile(item.filename);
                    if (!pdfFile) {
                        this.logger.warn('PDF файл не найден в архиве', { filename: item.filename, operationId });
                        return;
                    }

                    const arrayBuffer = await pdfFile.async('arraybuffer');
                    const metadata = await PDFService.getNormalizedMetadata(arrayBuffer.slice(0));
                    
                    // Сохраняем метаданные в кэш
                    pdfMetadataCache.setMetadata(item.filename, metadata);
                    
                    // Обновляем заголовок и описание элемента архива из метаданных PDF
                    if (metadata.title && metadata.title.trim() !== '') {
                        item.title = metadata.title;
                    }
                    if (metadata.subject && metadata.subject.trim() !== '') {
                        item.description = metadata.subject;
                    } else if (metadata.author && metadata.author.trim() !== '') {
                        item.description = `Автор: ${metadata.author}`;
                    }

                    // Обновляем теги из ключевых слов PDF, если они есть и больше чем в манифесте
                    if (metadata.keywords && metadata.keywords.length > 0) {
                        // Добавляем только уникальные ключевые слова, не дублируя существующие
                        const existingKeywords = new Set(item.tags.map(tag => tag.toLowerCase().trim()));
                        const newKeywords = metadata.keywords.filter(keyword => 
                            keyword.trim() !== '' && !existingKeywords.has(keyword.toLowerCase().trim())
                        );
                        
                        if (newKeywords.length > 0) {
                            item.tags = [...item.tags, ...newKeywords];
                            this.logger.debug('Добавлены ключевые слова из PDF', { 
                                filename: item.filename, 
                                newKeywordsCount: newKeywords.length, 
                                totalTags: item.tags.length, 
                                keywords: newKeywords 
                            });
                        } else {
                            this.logger.debug('Ключевые слова из PDF уже существуют или отсутствуют', { 
                                filename: item.filename, 
                                metadataKeywordsCount: metadata.keywords.length,
                                existingTagsCount: item.tags.length
                            });
                        }
                    } else {
                        this.logger.debug('PDF не содержит ключевых слов', { 
                            filename: item.filename, 
                            hasKeywords: !!metadata.keywords, 
                            keywordsLength: metadata.keywords ? metadata.keywords.length : 0,
                            existingTagsCount: item.tags.length
                        });
                        
                        // Попробуем использовать другие метаданные как резервные теги для НОВОСТЬ типов
                        if (item.type.toUpperCase() === 'НОВОСТЬ') {
                            const fallbackTags = [];
                            
                            // Добавляем тему (Subject) как тег, если она есть
                            if (metadata.subject && metadata.subject.trim() !== '') {
                                const subjectTag = metadata.subject.trim();
                                if (!item.tags.includes(subjectTag) && !fallbackTags.includes(subjectTag)) {
                                    fallbackTags.push(subjectTag);
                                }
                            }
                            
                            // Добавляем автора как тег, если он есть
                            if (metadata.author && metadata.author.trim() !== '') {
                                const authorTag = metadata.author.trim();
                                if (!item.tags.includes(authorTag) && !fallbackTags.includes(authorTag)) {
                                    fallbackTags.push(authorTag);
                                }
                            }
                            
                            // Добавляем часть заголовка как тег, если он есть и не слишком длинный
                            if (metadata.title && metadata.title.trim() !== '' && metadata.title.length <= 50) {
                                const titleTag = metadata.title.trim();
                                if (!item.tags.includes(titleTag) && !fallbackTags.includes(titleTag)) {
                                    fallbackTags.push(titleTag);
                                }
                            }
                            
                            if (fallbackTags.length > 0) {
                                const existingKeywords = new Set(item.tags.map(tag => tag.toLowerCase().trim()));
                                const uniqueFallbackTags = fallbackTags.filter(tag => !existingKeywords.has(tag.toLowerCase().trim()));
                                
                                if (uniqueFallbackTags.length > 0) {
                                    item.tags = [...item.tags, ...uniqueFallbackTags];
                                    this.logger.debug('Добавлены резервные теги из других метаданных PDF для НОВОСТЬ', { 
                                        filename: item.filename, 
                                        fallbackTags: uniqueFallbackTags, 
                                        totalTags: item.tags.length 
                                    });
                                }
                            }
                        }
                    }

                    this.logger.debug('Метаданные PDF извлечены и применены', { 
                        filename: item.filename, 
                        title: item.title, 
                        keywordsCount: item.tags.length, 
                        operationId 
                    });
                } catch (error) {
                    this.logger.warn('Не удалось извлечь метаданные PDF для раннего обновления', { 
                        filename: item.filename, 
                        error: error.message, 
                        operationId 
                    });
                    // Не прерываем процесс из-за ошибки одного файла
                }
            });

            // Ждем завершения извлечения метаданных для всех PDF файлов
            await Promise.all(pdfPromises);
            
            this.logger.info('Метаданные PDF файлов извлечены и применены', { pdfCount: pdfItems.length, operationId });
        } catch (error) {
            this.logger.logError(error, { operationId });
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
     * @param {number} index - Индекс элемента в архиве
     * @returns {Promise<void>}
     */
    async renderArchiveItem(item, container, index) {
        const operationId = this.logger.pushOperation('renderArchiveItem', { filename: item.filename, index });
        try {
            const itemElement = document.createElement('div');
            itemElement.className = 'archive-item';
            itemElement.id = `item-${index}`;

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
                const pdfFile = await this.parent.archiveService.extractFile(item.filename);
                if (pdfFile) {
                    try {
                        const arrayBuffer = await pdfFile.async('arraybuffer');
                        const pdfDocument = await pdfjsLib.getDocument(arrayBuffer.slice(0)).promise;
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

            // Формируем HTML элемента архива в стиле app.js
            const emoji = this.parent.getItemEmoji(item.type);
            const previewId = `preview-${index}`;

            // Проверяем, является ли это мемом или личным достижением и ищем связанные файлы объяснений
            const isMem = item.type.toUpperCase() === 'МЕМ';
            const isPersonal = item.type.toUpperCase() === 'ЛИЧНОЕ';
            let explanationFile = null;
            if (isMem || isPersonal) {
                explanationFile = await this.parent.findExplanationFile(item.filename);
            }

            let explanationHtml = '';
            if (explanationFile) {
                const explanationPreviewId = `explanation-${index}`;
                const explanationTitle = isMem ? 'мема' : 'личного достижения';
                explanationHtml = `
                    <details class="content-details explanation-details explanation-details-margin-top">
                        <summary aria-label="Показать объяснение ${explanationTitle} ${this.parent.escapeHtml(displayTitle)}">
                            💡 Объяснение ${explanationTitle}
                        </summary>
                        <div class="content-preview content-preview-margin-top" id="${explanationPreviewId}">
                            <div class="loading">Загрузка объяснения...</div>
                        </div>
                    </details>
                `;
            }


            // Для PDF файлов используем специальное отображение метаданных
            if (isPdf) {
                const pdfFile = await this.parent.archiveService.extractFile(item.filename);
                if (pdfFile) {
                    try {
                        const arrayBuffer = await pdfFile.async('arraybuffer');
                        const pdfDocument = await pdfjsLib.getDocument(arrayBuffer.slice(0)).promise;
                        const metadata = await pdfDocument.getMetadata();

                        let pdfMetadataHtml = '';
                        let pdfContentHtml = '';
                        let url = '';

                        // Показываем метаданные только для не-ЛИЧНОЕ типов PDF файлов
                        if (metadata && metadata.info && item.type.toUpperCase() !== 'ЛИЧНОЕ') {
                            const info = metadata.info;
                            
                            // Получаем количество страниц из кэша метаданных
                            const cachedMetadata = pdfMetadataCache.getMetadata(item.filename);
                            const pageCount = cachedMetadata?.pageCount || 0;
                            
                            // Убираем отображение PDF метаданных - оставляем только количество страниц для внутреннего использования
                            // pdfMetadataHtml остается пустым, чтобы не отображать метаданные в UI
                        }

                        // Создаем URL для PDF
                        const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
                        url = URL.createObjectURL(blob);
                        this.parent.urlManager.addUrl(url, 'pdf');

                        pdfContentHtml = `
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

                        // Для PDF файлов используем теги из кэша метаданных для не-ЛИЧНОЕ типов, из манифеста для ЛИЧНОЕ типов
                        // Важно: item.tags уже включает ключевые слова из PDF, извлеченные в extractPdfMetadataEarly
                        let tagsHtml = '';
                        let authorHtml = '';
                        
                        if (item.type.toUpperCase() === 'ЛИЧНОЕ') {
                            // Для ЛИЧНОЕ типов используем теги из манифеста (не извлекаем из PDF)
                            tagsHtml = item.tags && item.tags.length > 0 ? item.tags.map(tag => `<span class="title-tags">${this.parent.escapeHtml(tag)}</span>`).join(' ') : '';
                        } else {
                            // Для других типов используем уже обновленные теги из item.tags (которые включают PDF keywords)
                            // Убедимся, что теги не пустые и не содержат только пробелы
                            const validTags = item.tags.filter(tag => tag && tag.trim() !== '');
                            tagsHtml = validTags.length > 0 ? validTags.map(tag => `<span class="title-tags">${this.parent.escapeHtml(tag)}</span>`).join(' ') : '';
                            
                            // Для НОВОСТЬ типов добавляем автора из PDF метаданных как отдельный span
                            if (item.type.toUpperCase() === 'НОВОСТЬ' && isPdf) {
                                const cachedMetadata = pdfMetadataCache.getMetadata(item.filename);
                                if (cachedMetadata && cachedMetadata.author && cachedMetadata.author.trim() !== '') {
                                    authorHtml = `<span class="title-author">${this.parent.escapeHtml(cachedMetadata.author)}</span>`;
                                }
                            }
                        }

                        itemElement.innerHTML = `
                            <div class="item-header">
                                <div class="item-meta">
                                    <div class="item-emoji">${emoji}</div>
                                    <div class="item-type">${this.parent.escapeHtml(item.type)}</div>
                                    <div class="item-date">${this.parent.escapeHtml(item.date)}</div>
                                </div>
                                <h3 class="item-title">${this.parent.escapeHtml(displayTitle)} ${authorHtml} ${tagsHtml}</h3>
                            </div>
                            <div class="item-description">${this.parent.escapeHtml(displayDescription)}</div>
                            <div class="content-preview content-preview-margin-top" id="${previewId}">
                                ${pdfMetadataHtml}
                                ${pdfContentHtml}
                            </div>
                            ${explanationHtml}
                        `;
                    } catch (error) {
                        // Если не удалось получить метаданные, используем обычное отображение
                        this.logger.warn('Не удалось получить метаданные PDF для отображения', { error: error.message, filename: item.filename });

                        // Создаем URL для PDF
                        const arrayBuffer = await pdfFile.async('arraybuffer');
                        const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
                        const url = URL.createObjectURL(blob);
                        this.parent.urlManager.addUrl(url, 'pdf');

                        // Для резервного отображения PDF также используем теги из кэша метаданных для не-ЛИЧНОЕ типов, и из манифеста для ЛИЧНОЕ типов
                        let tagsHtml = '';
                        if (item.type.toUpperCase() === 'ЛИЧНОЕ') {
                            // Для ЛИЧНОЕ типов используем теги из манифеста
                            tagsHtml = item.tags && item.tags.length > 0 ? item.tags.map(tag => `<span class="title-tags">${this.parent.escapeHtml(tag)}</span>`).join(' ') : '';
                        } else {
                            // Для других типов используем теги из кэша метаданных, с резервом на теги из манифеста
                            const pdfTags = pdfMetadataCache.getTags(item.filename);
                            if (pdfTags && pdfTags.length > 0) {
                                // Если есть теги в кэше, используем их
                                tagsHtml = pdfTags.map(tag => `<span class="title-tags">${this.parent.escapeHtml(tag)}</span>`).join(' ');
                            } else {
                                // Если нет тегов в кэше, используем теги из манифеста как резерв
                                tagsHtml = item.tags && item.tags.length > 0 ? item.tags.map(tag => `<span class="title-tags">${this.parent.escapeHtml(tag)}</span>`).join(' ') : '';
                            }
                        }

                        itemElement.innerHTML = `
                            <div class="item-header">
                                <div class="item-meta">
                                    <div class="item-emoji">${emoji}</div>
                                    <div class="item-type">${this.parent.escapeHtml(item.type)}</div>
                                    <div class="item-date">${this.parent.escapeHtml(item.date)}</div>
                                </div>
                                <h3 class="item-title">${this.parent.escapeHtml(displayTitle)} ${tagsHtml}</h3>
                            </div>
                            <div class="item-description">${this.parent.escapeHtml(displayDescription)}</div>
                            <details class="content-details">
                                <summary aria-label="Показать содержимое файла ${this.parent.escapeHtml(displayTitle)}">
                                    👁 Показать содержимое файла
                                </summary>
                                <div class="content-preview content-preview-margin-top" id="${previewId}">
                                    <iframe class="pdf-viewer" src="${url}"></iframe>
                                    <div class="pdf-download-section">
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
                // Для других типов файлов создаем контент и используем общий спойлер
                let contentHtml = '';
                let url = '';

                if (isImage) {
                    const imageFile = await this.parent.archiveService.extractFile(item.filename);
                    if (imageFile) {
                        const uint8Array = await imageFile.async('uint8array');
                        // Для WebP и других изображений используем правильный MIME тип
                        const imageType = fileExtension === 'webp' ? 'image/webp' : `image/${fileExtension}`;
                        const blob = new Blob([uint8Array], { type: imageType });
                        url = URL.createObjectURL(blob);
                        this.parent.urlManager.addUrl(url, 'image'); // Сохраняем для очистки

                        contentHtml = `<img src="${url}" alt="${this.parent.escapeHtml(displayTitle)}" loading="lazy">`;
                    }
                } else if (isVideo) {
                    const videoFile = await this.parent.archiveService.extractFile(item.filename);
                    if (videoFile) {
                        const uint8Array = await videoFile.async('uint8array');
                        const blob = new Blob([uint8Array], { type: 'video/mp4' }); // Для упрощения используем mp4
                        url = URL.createObjectURL(blob);
                        this.parent.urlManager.addUrl(url, 'video'); // Сохраняем для очистки

                        contentHtml = `
                            <video controls preload="metadata" class="video-full-width">
                                <source src="${url}" type="video/mp4">
                                Ваш браузер не поддерживает видео.
                            </video>
                        `;
                    }
                } else if (isAudio) {
                    const audioFile = await this.parent.archiveService.extractFile(item.filename);
                    if (audioFile) {
                        const uint8Array = await audioFile.async('uint8array');
                        const blob = new Blob([uint8Array], { type: 'audio/mpeg' }); // Для упрощения используем mp3
                        url = URL.createObjectURL(blob);
                        this.parent.urlManager.addUrl(url, 'audio'); // Сохраняем для очистки

                        contentHtml = `
                            <video controls preload="metadata" class="audio-full-width">
                                <source src="${url}" type="audio/mpeg">
                                Ваш браузер не поддерживает аудио.
                            </video>
                        `;
                    }
                } else if (isCsv) {
                    const csvFile = await this.parent.archiveService.extractFile(item.filename);
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
                            this.parent.urlManager.addUrl(csvUrl, 'csv');
                            contentHtml = `
                                <a href="${csvUrl}" download="${this.parent.escapeHtml(item.filename)}" class="download-link">
                                    📥 Скачать CSV файл (${this.parent.escapeHtml(item.filename)})
                                </a>
                            `;
                        }
                    }
                } else if (isText) {
                    const textFile = await this.parent.archiveService.extractFile(item.filename);
                    if (textFile) {
                        const textContent = await textFile.async('text');
                        contentHtml = `<pre class="text-content">${this.parent.escapeHtml(textContent)}</pre>`;
                    }
                } else {
                    // Для других типов файлов создаем ссылку для скачивания
                    const defaultFile = await this.parent.archiveService.extractFile(item.filename);
                    if (defaultFile) {
                        const uint8Array = await defaultFile.async('uint8array');
                        const blob = new Blob([uint8Array]);
                        url = URL.createObjectURL(blob);
                        this.parent.urlManager.addUrl(url, 'default'); // Сохраняем для очистки

                        contentHtml = `
                            <a href="${url}" download="${this.parent.escapeHtml(item.filename)}" class="download-link">
                                📥 Скачать файл (${this.parent.escapeHtml(item.filename)})
                            </a>
                        `;
                    }
                }

                itemElement.innerHTML = `
                    <div class="item-header">
                        <div class="item-meta">
                            <div class="item-emoji">${emoji}</div>
                            <div class="item-type">${this.parent.escapeHtml(item.type)}</div>
                            <div class="item-date">${this.parent.escapeHtml(item.date)}</div>
                        </div>
                        <h3 class="item-title">${this.parent.escapeHtml(displayTitle)} ${item.tags && item.tags.length > 0 ? item.tags.map(tag => `<span class="title-tags">${this.parent.escapeHtml(tag)}</span>`).join(' ') : ''}</h3>
                    </div>
                    <div class="item-description">${this.parent.escapeHtml(displayDescription)}</div>
                    <details class="content-details">
                        <summary aria-label="Показать содержимое файла ${this.parent.escapeHtml(displayTitle)}">
                            👁 Показать содержимое файла
                        </summary>
                        <div class="content-preview content-preview-margin-top" id="${previewId}">
                            ${contentHtml}
                        </div>
                    </details>
                    ${explanationHtml}
                `;
            }

            container.appendChild(itemElement);
            this.logger.debug('Элемент архива создан и добавлен в DOM', { filename: item.filename, type: fileExtension, index, previewId, operationId });

            // Загрузка и отображение основного контента с гарантией, что элемент в DOM
            // Используем более надежный подход с requestAnimationFrame и проверкой наличия элемента
            this.scheduleContentLoading(async () => {
                this.logger.debug('Начало загрузки контента', { filename: item.filename, index, previewId, operationId });
                await this.loadContent(item, index);
            }, previewId);
            
            // Загрузка и отображение объяснения, если это мем или личное достижение с файлом объяснения
            if (explanationFile) {
                const explanationPreviewId = `explanation-${index}`;
                this.scheduleContentLoading(async () => {
                    this.logger.debug('Начало загрузки объяснения', { filename: item.filename, index, explanationPreviewId, operationId });
                    await this.loadExplanationContent(explanationFile, explanationPreviewId);
                }, explanationPreviewId);
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
     * Планирование загрузки контента с гарантией, что элемент существует в DOM
     * @param {Function} callback - Функция загрузки контента
     * @param {string} previewId - ID элемента предпросмотра
     */
    scheduleContentLoading(callback, previewId) {
        const checkAndLoad = () => {
            // Проверяем, существует ли элемент в DOM
            const previewDiv = document.getElementById(previewId);
            if (previewDiv) {
                // Элемент найден, выполняем загрузку
                callback();
            } else {
                // Элемент еще не существует, проверяем снова через requestAnimationFrame
                if (typeof requestAnimationFrame !== 'undefined') {
                    requestAnimationFrame(checkAndLoad);
                } else {
                    // Резервный вариант для браузеров без requestAnimationFrame
                    setTimeout(checkAndLoad, 16); // ~60fps
                }
            }
        };

        // Начинаем проверку
        if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(checkAndLoad);
        } else {
            setTimeout(checkAndLoad, 16);
        }
    }

    /**
     * Загрузка и отображение содержимого файла
     * @param {Object} item - Элемент архива
     * @param {number} index - Индекс элемента (обязательно для новой системы)
     * @returns {Promise<void>}
     */
    async loadContent(item, index) {
        const operationId = this.logger.pushOperation('loadContent', { filename: item.filename, index });
        try {
            // Используем только индекс-базированные ID без резервной логики
            const previewId = `preview-${index}`;
            const previewDiv = document.getElementById(previewId);
            if (!previewDiv) {
                this.logger.warn('Элемент предпросмотра не найден', { previewId, index, operationId });
                return;
            }

            this.logger.debug('Начало загрузки контента файла', { filename: item.filename, operationId });
            
            const file = await this.parent.archiveService.extractFile(item.filename);
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
                case 'webp':
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

            if (!explanationFile) {
                this.logger.warn('Файл объяснения не найден', { previewId, operationId });
                previewDiv.innerHTML = '<p class="error">Файл объяснения не найден</p>';
                return;
            }

            const text = await explanationFile.async('text');
            previewDiv.innerHTML = `<pre class="text-content explanation-text">${this.parent.escapeHtml(text)}</pre>`;
            this.logger.debug('Файл объяснения загружен и отображен', { textLength: text.length, operationId });
        } catch (error) {
            this.logger.logError(error, { operationId });
            const previewDiv = document.getElementById(previewId); // Get previewDiv again in catch block
            if (previewDiv) {
                previewDiv.innerHTML = `<p class="error">Ошибка загрузки объяснения: ${this.parent.escapeHtml(error.message)}</p>`;
            }
        } finally {
            this.logger.popOperation();
        }
    }

    // Методы обработки файлов (скопированы из оригинального класса)
    async handleImageFile(file, item, previewDiv, parentOperationId = null) {
        const operationId = this.logger.pushOperation('handleImageFile', { filename: item.filename, parentOperationId });
        try {
            // Извлекаем метаданные изображения
            const uint8Array = await file.async('uint8array');
            const metadata = await ImageService.extractMetadata(uint8Array);
            const displayMetadata = ImageService.getDisplayMetadata(metadata);
            
            // Формируем HTML для метаданных изображения (аналогично PDF)
            let imageMetadataHtml = '';
            if (metadata && metadata.hasMetadata) {
                imageMetadataHtml = `
                    <details class="image-metadata-details">
                        <summary class="image-metadata-summary" aria-label="Показать метаданные изображения ${this.parent.escapeHtml(item.title)}">
                            📸 Метаданные изображения
                        </summary>
                        <div class="image-metadata-content">
                            <div class="metadata-grid">
                `;

                if (displayMetadata.title) {
                    imageMetadataHtml += `
                        <strong class="metadata-field-main">Заголовок:</strong>
                        <span>${this.parent.escapeHtml(displayMetadata.title)}</span>
                    `;
                }
                if (displayMetadata.description) {
                    imageMetadataHtml += `
                        <strong class="metadata-field-main">Описание:</strong>
                        <span>${this.parent.escapeHtml(displayMetadata.description)}</span>
                    `;
                }
                if (displayMetadata.author) {
                    imageMetadataHtml += `
                        <strong class="metadata-field-main">Автор:</strong>
                        <span>${this.parent.escapeHtml(displayMetadata.author)}</span>
                    `;
                }
                if (displayMetadata.keywords && displayMetadata.keywords.length > 0) {
                    imageMetadataHtml += `
                        <strong class="metadata-field-main">Ключевые слова:</strong>
                        <span>${this.parent.escapeHtml(displayMetadata.keywords.join(', '))}</span>
                    `;
                }
                if (displayMetadata.creationDate) {
                    imageMetadataHtml += `
                        <strong class="metadata-field-secondary">Дата создания:</strong>
                        <span class="metadata-field-secondary">${this.parent.escapeHtml(displayMetadata.creationDate)}</span>
                    `;
                }

                // Добавляем GPS данные если есть
                if (displayMetadata.gps) {
                    imageMetadataHtml += `
                        <strong class="metadata-field-secondary">Координаты:</strong>
                        <span class="metadata-field-secondary">${this.parent.escapeHtml(displayMetadata.gps.latitude.toFixed(6))}, ${this.parent.escapeHtml(displayMetadata.gps.longitude.toFixed(6))}</span>
                    `;
                }

                imageMetadataHtml += `
                            </div>
                        </div>
                    </details>
                `;
            }

            // Создаем URL для изображения из uint8array
            const blob = new Blob([uint8Array], { type: `image/${item.filename.split('.').pop()}` });
            const imageUrl = URL.createObjectURL(blob);
            this.parent.urlManager.addUrl(imageUrl, 'image');

            // Формируем HTML для отображения изображения и метаданных
            const imageContentHtml = `
                <details class="image-content-details">
                    <summary class="image-content-summary" aria-label="Показать содержимое изображения ${this.parent.escapeHtml(item.title)}">
                        👁 Просмотр изображения
                    </summary>
                    <div class="image-content-content">
                        <img src="${this.parent.escapeHtml(imageUrl)}" alt="${this.parent.escapeHtml(item.title)}" loading="lazy" class="image-full-width">
                        <div class="image-download-section">
                            <a href="${this.parent.escapeHtml(imageUrl)}" download="${this.parent.escapeHtml(item.filename)}" class="download-link">
                                📥 Скачать изображение
                            </a>
                        </div>
                    </div>
                </details>
            `;

            previewDiv.innerHTML = `
                ${imageMetadataHtml}
                ${imageContentHtml}
            `;
            this.logger.debug('Изображение с метаданными обработано успешно', { filename: item.filename, hasMetadata: !!metadata?.hasMetadata, operationId });
        } catch (e) {
            this.logger.debug('Ошибка при обработке изображения с метаданными, пробуем резервный метод', { error: e.message, operationId });
            try {
                // Резервный метод для больших файлов
                const imageBlob = await file.async('blob');
                const imageUrl = URL.createObjectURL(imageBlob);
                previewDiv.innerHTML = `<img src="${this.parent.escapeHtml(imageUrl)}" alt="${this.parent.escapeHtml(item.title)}" loading="lazy">`;
                this.parent.urlManager.addUrl(imageUrl, 'image');
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
                <video controls preload="metadata" class="video-full-width">
                    <source src="${this.parent.escapeHtml(videoUrl)}" type="${this.parent.escapeHtml(videoMimeType)}">
                    Ваш браузер не поддерживает видео.
                </video>
            `;
            
            this.parent.urlManager.addUrl(videoUrl, 'video');
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
                <video controls preload="metadata" class="audio-full-width">
                    <source src="${this.parent.escapeHtml(audioUrl)}" type="${this.parent.escapeHtml(audioMimeType)}">
                    Ваш браузер не поддерживает аудио.
                </video>
            `;
            
            this.parent.urlManager.addUrl(audioUrl, 'audio');
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
            
            // Создаем копию ArrayBuffer для создания data URL (остальные метаданные берем из кэша)
            const arrayBufferForDataUrl = arrayBuffer.slice(0);
            
            // Извлекаем метаданные из кэша, так как они уже были обработаны в extractPdfMetadataEarly
            const cachedMetadata = pdfMetadataCache.getMetadata(item.filename);
            let metadata = null;
            let pdfKeywords = [];
            
            if (cachedMetadata) {
                // Используем закэшированные метаданные
                metadata = {
                    info: {
                        Title: cachedMetadata.title,
                        Author: cachedMetadata.author,
                        Subject: cachedMetadata.subject,
                        Keywords: cachedMetadata.keywords ? cachedMetadata.keywords.join(', ') : null,
                        CreationDate: cachedMetadata.creationDate,
                        ModDate: cachedMetadata.modificationDate,
                        Creator: cachedMetadata.creator,
                        Producer: cachedMetadata.producer
                    }
                };
                pdfKeywords = cachedMetadata.keywords || [];
                this.logger.debug('Использованы закэшированные метаданные', { 
                    filename: item.filename, 
                    keywordsCount: pdfKeywords.length, 
                    hasInfo: !!metadata.info 
                });
            } else {
                // Если метаданные не закэшированы, загружаем PDF и извлекаем их (резервный вариант)
                const pdfDocument = await pdfjsLib.getDocument(arrayBuffer.slice(0)).promise;
                metadata = await pdfDocument.getMetadata();
                pdfKeywords = await PDFService.extractKeywords(arrayBuffer.slice(0));
                this.logger.debug('Метаданные извлечены в резервном режиме', { 
                    filename: item.filename, 
                    hasMetadata: !!metadata.info, 
                    keywordsCount: pdfKeywords.length 
                });
            }
            
            
            // Создаем data URL для iframe
            const dataUrl = `data:application/pdf;base64,${this.arrayBufferToBase64(new Uint8Array(arrayBufferForDataUrl))}`;
            this.logger.debug('Data URL создан для PDF', { operationId });
            
            // Обновляем заголовок элемента архива с тегами, учитывая тип файла
            // Но только если теги еще не были установлены в основном рендеринге
            const archiveItemElement = previewDiv.closest('.archive-item');
            if (archiveItemElement) {
                const titleElement = archiveItemElement.querySelector('.item-title');
                if (titleElement) {
                    // Проверяем, содержит ли элемент уже теги (чтобы не перезаписывать)
                    const existingTitleContent = titleElement.innerHTML;
                    if (!existingTitleContent.includes('class="title-tags"')) {
                        const currentTitle = item.title || item.filename;
                        
                        let keywordTags = '';
                        if (item.type.toUpperCase() === 'ЛИЧНОЕ') {
                            // Для ЛИЧНОЕ типов используем теги из манифеста, а не из кэша
                            keywordTags = item.tags && item.tags.length > 0 ? item.tags.map(tag => `<span class="title-tags">${this.parent.escapeHtml(tag)}</span>`).join(' ') : '';
                        } else {
                            // Для других типов используем теги из кэша метаданных, с резервом на теги из манифеста
                            const pdfTags = pdfMetadataCache.getTags(item.filename);
                            if (pdfTags && pdfTags.length > 0) {
                                // Если есть теги в кэше, используем их
                                keywordTags = pdfTags.map(tag => `<span class="title-tags">${this.parent.escapeHtml(tag)}</span>`).join(' ');
                            } else {
                                // Если нет тегов в кэше, используем теги из манифеста как резерв
                                keywordTags = item.tags && item.tags.length > 0 ? item.tags.map(tag => `<span class="title-tags">${this.parent.escapeHtml(tag)}</span>`).join(' ') : '';
                            }
                        }
                        
                        titleElement.innerHTML = `${this.parent.escapeHtml(currentTitle)} ${keywordTags}`;
                    }
                }
            }
            
            // Формируем HTML для отображения метаданных и PDF как двух отдельных спойлеров
            let metadataHtml = '';
            // Показываем метаданные только для не-ЛИЧНОЕ типов PDF файлов
            if (metadata && metadata.info && item.type.toUpperCase() !== 'ЛИЧНОЕ') {
                const info = metadata.info;
                
                // Получаем количество страниц из кэша или из PDF документа
                let pageCount = 0;
                if (cachedMetadata && cachedMetadata.pageCount) {
                    pageCount = cachedMetadata.pageCount;
                } else if (pdfDocument) {
                    pageCount = pdfDocument.numPages;
                } else {
                    // Если нет кэша и pdfDocument, пробуем получить из PDF Service
                    try {
                        const tempPdfDocument = await pdfjsLib.getDocument(arrayBuffer.slice(0)).promise;
                        pageCount = tempPdfDocument.numPages;
                    } catch (e) {
                        this.logger.warn('Не удалось получить количество страниц PDF', { error: e.message });
                        pageCount = 0;
                    }
                }
                
                // Убираем отображение PDF метаданных - оставляем только количество страниц для внутреннего использования
                // metadataHtml остается пустым, чтобы не отображать метаданные в UI
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
            this.logger.info('PDF контент успешно отображен', { filename: item.filename, keywordsCount: pdfKeywords.length, operationId });
        } catch (e) {
            this.logger.logError(e, { operationId });
            try {
                // Резервный метод для больших файлов или файлов без метаданных
                const pdfBlob = await file.async('blob');
                const pdfUrl = URL.createObjectURL(pdfBlob);
                this.logger.debug('Используется резервный метод с blob URL', { operationId });
                previewDiv.innerHTML = `
                    <iframe class="pdf-viewer" src="${this.parent.escapeHtml(pdfUrl)}"></iframe>
                    <div class="download-section-margin-top">
                        <a href="${this.parent.escapeHtml(pdfUrl)}" download="${this.parent.escapeHtml(item.filename)}" class="download-link">
                            📥 Скачать PDF
                        </a>
                    </div>
                `;
                
                this.parent.urlManager.addUrl(pdfUrl, 'pdf');
            } catch (blobError) {
                this.logger.logError(blobError, { operationId });
                // Финальный резервный метод - только ссылка для скачивания
                previewDiv.innerHTML = `
                    <p class="error">Не удалось отобразить PDF. <a href="#" onclick="event.preventDefault(); alert('PDF не может быть отображен в этом браузере. Пожалуйста, скачайте файл для просмотра.')" class="download-link">ℹ️ Информация о проблеме</a></p>
                    <div class="download-section-margin-top">
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
                this.parent.urlManager.addUrl(url, 'csv');
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
                this.parent.urlManager.addUrl(url, 'csv');
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
                this.parent.urlManager.addUrl(url, 'text');
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
            // Резервный метод - используем blob вместо base64
            const blob = await file.async('blob');
            const url = URL.createObjectURL(blob);
            previewDiv.innerHTML = `
                <a href="${this.parent.escapeHtml(url)}" download="${this.parent.escapeHtml(item.filename)}" class="download-link">
                    📥 Скачать файл (${this.parent.escapeHtml(item.filename)})
                </a>
            `;
            this.parent.urlManager.addUrl(url, 'default');
            this.logger.debug('Файл по умолчанию обработан через blob', { filename: item.filename, operationId });
        } catch (e) {
            this.logger.debug('Ошибка при обработке файла по умолчанию, пробуем резервный метод', { error: e.message, operationId });
            try {
                const uint8Array = await file.async('uint8array');
                const blob = new Blob([uint8Array]);
                const url = URL.createObjectURL(blob);
                previewDiv.innerHTML = `
                    <a href="${this.parent.escapeHtml(url)}" download="${this.parent.escapeHtml(item.filename)}" class="download-link">
                        📥 Скачать файл (${this.parent.escapeHtml(item.filename)})
                    </a>
                `;
                this.parent.urlManager.addUrl(url, 'default');
                this.logger.debug('Файл по умолчанию обработан через uint8array', { filename: item.filename, operationId });
            } catch (blobError) {
                this.logger.logError(blobError, { operationId });
                previewDiv.innerHTML = `<p class="error">Ошибка загрузки файла: ${this.parent.escapeHtml(blobError.message)}</p>`;
            }
        } finally {
            this.logger.popOperation();
        }
    }

    /**
     * Отображение описания капсулы в начале архива
     * @param {Object} capsuleItem - Элемент капсулы
     * @param {HTMLElement} container - Контейнер для отображения
     * @returns {Promise<void>}
     */
    async renderCapsuleDescription(capsuleItem, container) {
        const operationId = this.logger.pushOperation('renderCapsuleDescription', { filename: capsuleItem.filename });
        try {
            // Создаем элемент для описания капсулы
            const capsuleElement = document.createElement('div');
            capsuleElement.className = 'capsule-description';
            capsuleElement.id = 'capsule-description';

            // Формируем HTML для описания капсулы
            let capsuleHtml = `
                <div class="capsule-header">
                    <h2 class="capsule-title">📦 Описание цифровой капсулы</h2>
                </div>
                <div class="capsule-content">
                    <div class="capsule-info">
                        <div class="capsule-author">
                            <strong>Автор капсулы:</strong> 
                            <span class="author-name">${this.parent.escapeHtml(capsuleItem.author || '')}</span>
                        </div>
                        <div class="capsule-date">
                            <strong>Дата создания:</strong> 
                            <span class="date-value">${this.parent.escapeHtml(capsuleItem.date || '')}</span>
                        </div>
                    </div>
            `;

            // Пытаемся получить содержимое файла описания капсулы
            try {
                const capsuleFile = await this.parent.archiveService.extractFile(capsuleItem.filename);
                if (capsuleFile) {
                    const content = await capsuleFile.async('text');
                    capsuleHtml += `
                        <div class="capsule-text-content">
                            <h3>📜 Текстовое описание:</h3>
                            <pre class="capsule-description-text">${this.parent.escapeHtml(content)}</pre>
                        </div>
                    `;
                } else {
                    this.logger.warn('Файл описания капсулы не найден в архиве', { 
                        filename: capsuleItem.filename, 
                        operationId 
                    });
                    capsuleHtml += `
                        <div class="capsule-error">
                            <p class="error">⚠️ Файл описания капсулы не найден в архиве</p>
                        </div>
                    `;
                }
            } catch (error) {
                this.logger.warn('Не удалось прочитать файл описания капсулы', { 
                    filename: capsuleItem.filename, 
                    error: error.message, 
                    operationId 
                });
                capsuleHtml += `
                    <div class="capsule-error">
                        <p class="error">⚠️ Не удалось загрузить содержимое описания капсулы: ${this.parent.escapeHtml(error.message)}</p>
                    </div>
                `;
            }

            capsuleHtml += `
                </div>
            `;

            capsuleElement.innerHTML = capsuleHtml;
            container.appendChild(capsuleElement);

            this.logger.debug('Описание капсулы отображено', { 
                filename: capsuleItem.filename, 
                author: capsuleItem.author, 
                date: capsuleItem.date, 
                operationId 
            });
        } catch (error) {
            this.logger.logError(error, { operationId });
            // Даже если не удалось отобразить описание капсулы, не прерываем весь процесс
            this.logger.warn('Не удалось отобразить описание капсулы, продолжаем работу', { 
                error: error.message, 
                operationId 
            });
        } finally {
            this.logger.popOperation();
        }
    }
}
