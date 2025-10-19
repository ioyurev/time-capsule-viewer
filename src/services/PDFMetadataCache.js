/**
 * Класс для кэширования метаданных PDF файлов
 */
export class PDFMetadataCache {
    constructor() {
        this.cache = new Map();
    }

    /**
     * Сохранить метаданные PDF файла в кэш
     * @param {string} filename - Имя файла
     * @param {Object} metadata - Метаданные PDF
     */
    setMetadata(filename, metadata) {
        this.cache.set(filename, metadata);
    }

    /**
     * Получить метаданные PDF файла из кэша
     * @param {string} filename - Имя файла
     * @returns {Object|null} Метаданные PDF или null если не найдены
     */
    getMetadata(filename) {
        return this.cache.get(filename) || null;
    }

    /**
     * Проверить, есть ли метаданные в кэше
     * @param {string} filename - Имя файла
     * @returns {boolean} Есть ли метаданные в кэше
     */
    hasMetadata(filename) {
        return this.cache.has(filename);
    }

    /**
     * Очистить кэш
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Получить все закэшированные метаданные
     * @returns {Map} Кэш метаданных
     */
    getAllMetadata() {
        return this.cache;
    }

    /**
     * Получить количество тегов для файла из кэша
     * @param {string} filename - Имя файла
     * @returns {number} Количество тегов
     */
    getTagCount(filename) {
        const metadata = this.getMetadata(filename);
        return metadata && metadata.keywords ? metadata.keywords.length : 0;
    }

    /**
     * Получить теги для файла из кэша
     * @param {string} filename - Имя файла
     * @returns {Array} Массив тегов
     */
    getTags(filename) {
        const metadata = this.getMetadata(filename);
        return metadata && metadata.keywords ? metadata.keywords : [];
    }

    /**
     * Получить заголовок для файла из кэша
     * @param {string} filename - Имя файла
     * @returns {string} Заголовок
     */
    getTitle(filename) {
        const metadata = this.getMetadata(filename);
        return metadata && metadata.title ? metadata.title : '';
    }

    /**
     * Получить описание для файла из кэша
     * @param {string} filename - Имя файла
     * @returns {string} Описание
     */
    getDescription(filename) {
        const metadata = this.getMetadata(filename);
        if (metadata) {
            if (metadata.subject && metadata.subject.trim() !== '') {
                return metadata.subject;
            } else if (metadata.author && metadata.author.trim() !== '') {
                return `Автор: ${metadata.author}`;
            }
        }
        return '';
    }
}

// Глобальный экземпляр кэша для использования в разных частях приложения
export const pdfMetadataCache = new PDFMetadataCache();
