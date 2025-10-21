import { ArchiveService } from '../services/ArchiveService.js';
import { logger } from '../logger.js';
import { ArchiveValidator } from './ArchiveValidator.js';
import { ArchiveRenderer } from './ArchiveRenderer.js';
import { ArchiveNavigation } from './ArchiveNavigation.js';
import { ThemeManager } from './ThemeManager.js';
import { UrlManager } from './UrlManager.js';

/**
 * Основной класс для управления цифровой капсулой времени
 */
export class DigitalTimeCapsule {
    /**
     * Создает экземпляр DigitalTimeCapsule
     */
    constructor() {
        this.zip = null;
        this.logger = logger;
        this.logger.info('DigitalTimeCapsule инициализирован', {
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
        });
        
        // Инициализация модулей
        this.validator = new ArchiveValidator(this);
        this.renderer = new ArchiveRenderer(this);
        this.navigation = new ArchiveNavigation(this);
        this.themeManager = new ThemeManager(this);
        this.urlManager = new UrlManager(this);
        
        // Инициализация прогресс баров валидации
        setTimeout(() => {
            if (this.validator.progressManager) {
                this.validator.progressManager.initializeValidationProgress();
            }
        }, 0);
        
        this.initializeEventListeners();
        this.themeManager.initializeTheme();
        this.clearGlobalStatus(); // Очищаем глобальный статус при инициализации
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
     * @param {'info'|'success'|'error'|'loading'} statusType - Тип статуса
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
     * Инициализация событий
     */
    initializeEventListeners() {
        const operationId = this.logger.pushOperation('initializeEventListeners');
        try {
            const uploadInput = document.getElementById('zipUpload');
            const uploadDragArea = document.getElementById('uploadDragArea');
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

            // Инициализация drag and drop функциональности
            if (uploadDragArea) {
                this.initializeDragAndDrop(uploadDragArea, uploadInput);
            }

            // Обработчик переключения темы
            if (themeToggle) {
                themeToggle.addEventListener('click', () => {
                    this.themeManager.toggleTheme();
                });
                this.logger.debug('Обработчик переключения темы добавлен');
            }

            // Очистка URL при выгрузке страницы
            window.addEventListener('beforeunload', () => {
                this.urlManager.cleanupUrls();
            });

            // Очистка URL при навигации
            window.addEventListener('pagehide', () => {
                this.urlManager.cleanupUrls();
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
     * Инициализация drag and drop функциональности
     * @param {HTMLElement} dragArea - Элемент области перетаскивания
     * @param {HTMLInputElement} fileInput - Элемент input для файлов
     */
    initializeDragAndDrop(dragArea, fileInput) {
        // Обработчики событий drag and drop
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dragArea.addEventListener(eventName, this.preventDefaults, false);
            document.body.addEventListener(eventName, this.preventDefaults, false);
        });

        // Обработчики для области перетаскивания
        ['dragenter', 'dragover'].forEach(eventName => {
            dragArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                dragArea.classList.add('drag-over');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dragArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                dragArea.classList.remove('drag-over');
            }, false);
        });

        // Обработка сброса файла
        dragArea.addEventListener('drop', (e) => {
            e.preventDefault();
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileDrop(files[0], fileInput);
            }
        }, false);

        // Клик по области перетаскивания открывает выбор файла
        dragArea.addEventListener('click', () => {
            fileInput.click();
        });

        // Обновление при выборе файла через input
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.updateFilePreview(e.target.files[0]);
            }
        });
    }

    /**
     * Предотвращение действий по умолчанию для drag and drop
     * @param {Event} e - Событие
     */
    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    /**
     * Обработка сброшенного файла
     * @param {File} file - Сброшенный файл
     * @param {HTMLInputElement} fileInput - Элемент input для файлов
     */
    handleFileDrop(file, fileInput) {
        // Проверка типа файла
        if (file.type === 'application/zip' || file.name.toLowerCase().endsWith('.zip')) {
            // Создаем DataTransfer объект и добавляем файл
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;
            
            // Симулируем событие изменения
            const event = new Event('change', { bubbles: true });
            fileInput.dispatchEvent(event);
            
            // Обновляем превью файла
            this.updateFilePreview(file);
        } else {
            this.showError('Пожалуйста, выберите ZIP-файл');
        }
    }

    /**
     * Обновление превью выбранного файла
     * @param {File} file - Выбранный файл
     */
    updateFilePreview(file) {
        const filePreview = document.getElementById('uploadFilePreview');
        const fileNameElement = document.getElementById('uploadFileName');
        const fileSizeElement = document.getElementById('uploadFileSize');

        if (filePreview && fileNameElement && fileSizeElement) {
            // Обновляем информацию о файле
            fileNameElement.textContent = file.name;
            fileSizeElement.textContent = this.formatFileSize(file.size);
            
            // Показываем превью файла
            filePreview.classList.add('show');
        }
    }

    /**
     * Форматирование размера файла
     * @param {number} bytes - Размер в байтах
     * @returns {string} - Форматированный размер
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Показывает прогресс загрузки в отдельном контейнере
     * @param {string} text - Текст прогресса
     * @param {number} progress - Процент прогресса (0-100)
     */
    showUploadProgress(text, progress = 0) {
        const uploadProgress = document.getElementById('upload-progress');
        const uploadProgressText = document.getElementById('upload-progress-text');
        const uploadProgressBar = document.getElementById('upload-progress-bar');
        const uploadProgressCount = document.getElementById('upload-progress-count');

        if (uploadProgress && uploadProgressText && uploadProgressBar && uploadProgressCount) {
            // Показываем контейнер прогресса
            uploadProgress.style.display = 'flex';
            // Обновляем текст и прогресс
            uploadProgressText.textContent = text;
            this.updateUploadProgress(text, progress);
        }
    }

    /**
     * Обновляет прогресс загрузки в отдельном контейнере
     * @param {string} text - Текст прогресса
     * @param {number} progress - Процент прогресса (0-100)
     */
    updateUploadProgress(text, progress = 0) {
        const uploadProgressText = document.getElementById('upload-progress-text');
        const uploadProgressBar = document.getElementById('upload-progress-bar');
        const uploadProgressCount = document.getElementById('upload-progress-count');

        if (uploadProgressText) {
            uploadProgressText.textContent = text;
        }

        // Обновляем прогресс через прямое манипулирование DOM
        if (uploadProgressBar) {
            uploadProgressBar.style.width = `${progress}%`;
            uploadProgressBar.setAttribute('data-progress', progress);
        }

        if (uploadProgressCount) {
            uploadProgressCount.textContent = `${Math.round(progress)}%`;
        }

        // Используем ProgressManager как дополнительный метод (если доступен и элемент существует)
        if (this.validator && this.validator.progressManager && uploadProgressBar) {
            try {
                this.validator.progressManager.setProgress('upload-progress-bar', progress, 'upload-progress-count', progress, 100);
            } catch (error) {
                // Игнорируем ошибки ProgressManager
                console.debug('ProgressManager update failed:', error.message);
            }
        }

        // Логируем изменение прогресса с указанием конкретного значения
        this.logger.debug(`Обновление прогресса загрузки: ${Math.round(progress)}%`, { progress: Math.round(progress), text, timestamp: new Date().toISOString() });
    }

    /**
     * Скрывает прогресс загрузки
     */
    hideUploadProgress() {
        const uploadProgress = document.getElementById('upload-progress');
        if (uploadProgress) {
            uploadProgress.style.display = 'none';
        }
    }

    /**
     * Парсер манифеста с валидацией и сбором информации об ошибках
     * @param {string} text - Текст манифеста
     * @returns {{items: ArchiveItem[], errors: ValidationError[]}} - Объект с элементами и ошибками
     */
    parseManifest(text) {
        return this.validator.parseManifest(text);
    }

    /**
     * Проверка корректности архива
     * @param {Array} items - Элементы архива
     */
    validateArchive(items) {
        return this.validator.validateArchive(items);
    }

    /**
     * Отображение архива
     * @returns {Promise<void>}
     */
    async renderArchive() {
        return this.renderer.renderArchive();
    }

    /**
     * Заполнение боковой панели информацией об архиве
     * @param {Array} items - Элементы архива
     */
    async populateSidebar(items) {
        return this.navigation.populateSidebar(items);
    }

    /**
     * Поиск файла объяснения для мема
     * @param {string} memFilename - Имя файла мема
     * @returns {Object|null} - Файл объяснения или null
     */
    async findExplanationFile(memFilename) {
        return this.navigation.findExplanationFile(memFilename);
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

    /**
     * Очистка URL для предотвращения утечек памяти
     */
    cleanupUrls() {
        this.urlManager.cleanupUrls();
    }

    /**
     * Обработка загрузки ZIP файла
     * @param {Event} event - Событие загрузки файла
     * @returns {Promise<void>}
     */
    async handleZipUpload(event) {
        const operationId = this.logger.pushOperation('handleZipUpload');
        try {
            const file = event.target.files[0];
            if (!file) {
                this.logger.warn('Файл не выбран', { operationId });
                return;
            }

            this.logger.info('Начало загрузки ZIP файла', { 
                fileName: file.name, 
                fileSize: file.size, 
                operationId 
            });

            // Показываем индикатор загрузки с прогресс баром
            this.showUploadProgress('Загрузка и распаковка архива...', 0);
            
            // Принудительно обновляем DOM, чтобы прогресс бар был виден до начала тяжелой операции
            await new Promise(resolve => setTimeout(resolve, 0));

            // Читаем файл как ArrayBuffer
            const arrayBuffer = await file.arrayBuffer();
            this.logger.debug('ZIP файл прочитан в ArrayBuffer', { size: arrayBuffer.byteLength, operationId });

            // Создаем экземпляр ArchiveService
            this.archiveService = new ArchiveService();
            this.logger.debug('Начало загрузки архива через ArchiveService', { operationId });

            // Загружаем архив с отслеживанием прогресса (0-30%)
            await this.archiveService.loadArchive(arrayBuffer, ArchiveService.ENGINES.SEVEN_ZIP, (progress) => {
                // Масштабируем прогресс 0-100% -> 0-30% для загрузки/распаковки
                const scaledProgress = Math.round((progress * 30) / 100);
                this.updateUploadProgress('Загрузка и распаковка архива...', scaledProgress);
            });
            this.logger.info('Архив успешно загружен', { operationId });

            // Обновляем прогресс - разбор манифеста (30-40%)
            this.updateUploadProgress('Разбор манифеста...', 30);
            await new Promise(resolve => setTimeout(resolve, 0)); // Даем DOM обновиться

            // Проверяем наличие манифеста
            const manifestFile = await this.archiveService.extractFile('manifest.txt');
            if (!manifestFile) {
                const error = new Error('Файл manifest.txt не найден в архиве');
                this.logger.error('Манифест не найден', { error: error.message, operationId });
                throw error;
            }

            this.logger.debug('Файл манифеста найден', { operationId });

            // Читаем и парсим манифест
            const manifestText = await manifestFile.async('text');
            this.logger.debug('Манифест прочитан', { manifestLength: manifestText.length, operationId });

            const { items, errors } = this.parseManifest(manifestText);
            this.logger.info('Манифест разобран', { itemsCount: items.length, errorsCount: errors.length, operationId });

            // Обновляем прогресс - завершение разбора манифеста (40%)
            this.updateUploadProgress('Подготовка к валидации...', 40);
            await new Promise(resolve => setTimeout(resolve, 0)); // Даем DOM обновиться

            // Если есть ошибки в манифесте, отображаем их и завершаем загрузку
            if (errors.length > 0) {
                this.logger.warn('Найдены ошибки в манифесте', { errorsCount: errors.length, operationId });
                // Отображение ошибок будет обработано в renderArchive
            }

            // Обновляем прогресс - начало валидации (40-70%)
            this.updateUploadProgress('Валидация архива...', 40);
            await new Promise(resolve => setTimeout(resolve, 0)); // Даем DOM обновиться

            // Проверяем валидацию архива (это будет обновлять прогресс в процессе)
            await this.validateArchive(items);
            this.logger.info('Архив успешно валидирован', { itemsCount: items.length, operationId });

            // Обновляем прогресс - завершение валидации (70-90%)
            this.updateUploadProgress('Подготовка отображения...', 70);
            await new Promise(resolve => setTimeout(resolve, 0)); // Даем DOM обновиться

            // Очищаем контейнер архива
            const archiveContainer = document.getElementById('archive-container');
            if (archiveContainer) {
                archiveContainer.innerHTML = '';
            }

            // Отображаем архив
            await this.renderArchive();

            // Обновляем прогресс - завершение (90-100%)
            this.updateUploadProgress('Завершение...', 90);
            await new Promise(resolve => setTimeout(resolve, 0)); // Даем DOM обновиться

            // Показываем результат
            this.updateGlobalStatus(`Архив загружен успешно: ${items.length} файлов`, 'success');
            this.hideUploadProgress(); // Скрываем прогресс бар после завершения
            this.logger.info('ZIP файл успешно обработан', { itemsCount: items.length, operationId });

            // Показываем секции архива, валидации и боковой панели
            const archiveSection = document.getElementById('archive-section');
            const validationSection = document.getElementById('validation-section');
            const sidebar = document.getElementById('archive-sidebar');
            if (archiveSection) archiveSection.hidden = false;
            if (validationSection) validationSection.hidden = false;
            // if (sidebar) sidebar.hidden = false; // Закомментировано для отключения боковой панели

            // Автоматически схлопываем секцию загрузки и раскрываем секцию валидации
            const uploadSectionDetails = document.getElementById('upload-section-details');
            const validationDetailsContainer = document.getElementById('validation-details-container');
            if (uploadSectionDetails) uploadSectionDetails.removeAttribute('open');
            if (validationDetailsContainer) validationDetailsContainer.setAttribute('open', '');

            // Добавляем класс для центрирования контента при скрытом сайдбаре
            const container = document.querySelector('.container');
            if (container && sidebar && sidebar.hidden) {
                container.classList.add('sidebar-hidden');
            }

        } catch (error) {
            this.logger.logError(error, { operationId });
            const errorMessage = `Ошибка при обработке архива: ${error.message}`;
            this.showError(errorMessage);
            this.hideUploadProgress(); // Скрываем прогресс бар при ошибке
            throw error;
        } finally {
            this.logger.popOperation();
        }
    }

}
