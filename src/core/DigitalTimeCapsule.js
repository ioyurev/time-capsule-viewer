import JSZip from 'jszip';
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
        
        this.initializeEventListeners();
        this.themeManager.initializeTheme();
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
    findExplanationFile(memFilename) {
        return this.navigation.findExplanationFile(memFilename);
    }

    /**
     * Генерация безопасного ID для HTML элементов
     * @param {string} filename - Имя файла
     * @returns {string} - Безопасный ID
     */
    generateSafeId(filename) {
        return this.navigation.generateSafeId(filename);
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

            // Показываем индикатор загрузки
            this.updateGlobalStatus('Загрузка и распаковка архива...', 'info');

            // Читаем файл как ArrayBuffer
            const arrayBuffer = await file.arrayBuffer();
            this.logger.debug('ZIP файл прочитан в ArrayBuffer', { size: arrayBuffer.byteLength, operationId });

            // Создаем экземпляр JSZip
            this.zip = new JSZip();
            this.logger.debug('Начало распаковки ZIP архива', { operationId });

            // Загружаем архив
            await this.zip.loadAsync(arrayBuffer);
            this.logger.info('ZIP архив успешно загружен', { operationId });

            // Проверяем наличие манифеста
            const manifestFile = this.zip.file('manifest.txt');
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

            // Если есть ошибки в манифесте, отображаем их и завершаем загрузку
            if (errors.length > 0) {
                this.logger.warn('Найдены ошибки в манифесте', { errorsCount: errors.length, operationId });
                // Отображение ошибок будет обработано в renderArchive
            }

            // Очищаем контейнер архива
            const archiveContainer = document.getElementById('archive-container');
            if (archiveContainer) {
                archiveContainer.innerHTML = '';
            }

            // Отображаем архив
            await this.renderArchive();

            // Показываем результат
            this.updateGlobalStatus(`Архив загружен успешно: ${items.length} файлов`, 'success');
            this.logger.info('ZIP файл успешно обработан', { itemsCount: items.length, operationId });

            // Показываем секции архива и валидации
            const archiveSection = document.getElementById('archive-section');
            const validationSection = document.getElementById('validation-section');
            if (archiveSection) archiveSection.hidden = false;
            if (validationSection) validationSection.hidden = false;

        } catch (error) {
            this.logger.logError(error, { operationId });
            const errorMessage = `Ошибка при обработке архива: ${error.message}`;
            this.showError(errorMessage);
            throw error;
        } finally {
            this.logger.popOperation();
        }
    }
}
