import { logger } from '../logger.js';

/**
 * Класс для управления URL и очистки памяти
 */
export class UrlManager {
    /**
     * @param {DigitalTimeCapsule} parent - Родительский класс
     */
    constructor(parent) {
        this.parent = parent;
        this.logger = logger;
        this.imageUrls = [];
        this.videoUrls = [];
        this.audioUrls = [];
        this.pdfUrls = [];
        this.csvUrls = [];
        this.textUrls = [];
        this.defaultUrls = [];
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
     * Добавление URL в соответствующий массив для последующей очистки
     * @param {string} url - URL для добавления
     * @param {string} type - Тип URL ('image', 'video', 'audio', 'pdf', 'csv', 'text', 'default')
     */
    addUrl(url, type) {
        switch (type) {
            case 'image':
                this.imageUrls.push(url);
                break;
            case 'video':
                this.videoUrls.push(url);
                break;
            case 'audio':
                this.audioUrls.push(url);
                break;
            case 'pdf':
                this.pdfUrls.push(url);
                break;
            case 'csv':
                this.csvUrls.push(url);
                break;
            case 'text':
                this.textUrls.push(url);
                break;
            default:
                this.defaultUrls.push(url);
                break;
        }
    }

    /**
     * Получение массива URL определенного типа
     * @param {string} type - Тип URL
     * @returns {Array} - Массив URL
     */
    getUrls(type) {
        switch (type) {
            case 'image':
                return this.imageUrls;
            case 'video':
                return this.videoUrls;
            case 'audio':
                return this.audioUrls;
            case 'pdf':
                return this.pdfUrls;
            case 'csv':
                return this.csvUrls;
            case 'text':
                return this.textUrls;
            default:
                return this.defaultUrls;
        }
    }

    /**
     * Очистка всех URL определенного типа
     * @param {string} type - Тип URL для очистки
     */
    cleanupUrlsByType(type) {
        const urlsToCleanup = this.getUrls(type);
        urlsToCleanup.forEach(url => {
            try {
                URL.revokeObjectURL(url);
            } catch (e) {
                // Игнорируем ошибки при очистке
            }
        });
        this[`${type}Urls`] = [];
    }

    /**
     * Получение общего количества URL
     * @returns {number} - Общее количество URL
     */
    getTotalUrlCount() {
        return this.imageUrls.length + this.videoUrls.length + this.audioUrls.length +
               this.pdfUrls.length + this.csvUrls.length + this.textUrls.length +
               this.defaultUrls.length;
    }
}
