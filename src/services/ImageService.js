/**
 * Класс для работы с метаданными изображений
 * Извлекает EXIF, XMP и другие метаданные из изображений
 */
import exifr from 'exifr';

export class ImageService {
    /**
     * Извлекает метаданные из изображения
     * @param {ArrayBuffer|Uint8Array|Blob|File|String} imageData - Данные изображения
     * @param {Object} options - Опции для извлечения метаданных
     * @returns {Promise<Object>} Метаданные изображения
     */
    static async extractMetadata(imageData, options = {}) {
        try {
            // По умолчанию извлекаем EXIF, XMP и GPS данные
            const defaultOptions = {
                exif: true,
                xmp: true,
                iptc: true,
                gps: true,
                icc: false, // Не извлекаем ICC профиль для уменьшения размера
                tiff: true,
                ifd0: true,
                ifd1: false, // Не извлекаем миниатюру по умолчанию
                ...options
            };

            // Извлекаем метаданные
            const metadata = await exifr.parse(imageData, defaultOptions);
            return this.normalizeMetadata(metadata);
        } catch (error) {
            console.warn('Не удалось извлечь метаданные изображения:', error.message);
            return null;
        }
    }

    /**
     * Нормализует метаданные для единообразного представления
     * @param {Object} metadata - Сырые метаданные
     * @returns {Object} Нормализованные метаданные
     */
    static normalizeMetadata(metadata) {
        if (!metadata) return {};

        const normalized = {};

        // Извлекаем основные поля: title, description, keywords
        if (metadata.xmp) {
            // XMP данные (наиболее важные для title, description, keywords)
            const xmp = metadata.xmp;
            
            // Заголовок
            if (xmp.title || xmp.Title || xmp.dc?.title) {
                normalized.title = xmp.title || xmp.Title || this.getXmpValue(xmp.dc?.title);
            }
            
            // Описание
            if (xmp.description || xmp.Description || xmp.dc?.description) {
                normalized.description = xmp.description || xmp.Description || this.getXmpValue(xmp.dc?.description);
            }
            
            // Ключевые слова
            if (xmp.subject || xmp.Subject || xmp.dc?.subject || xmp.dcterms?.subject) {
                const keywords = xmp.subject || xmp.Subject || xmp.dc?.subject || xmp.dcterms?.subject;
                normalized.keywords = Array.isArray(keywords) ? keywords : [keywords];
            }
        }

        // EXIF данные
        if (metadata.exif) {
            const exif = metadata.exif;
            
            // Дата создания
            if (exif.DateTimeOriginal) {
                normalized.creationDate = exif.DateTimeOriginal;
            }
            
            // Автор
            if (exif.Artist) {
                normalized.author = exif.Artist;
            }
        }

        // GPS данные
        if (metadata.gps) {
            const gps = metadata.gps;
            if (gps.latitude && gps.longitude) {
                normalized.gps = {
                    latitude: gps.latitude,
                    longitude: gps.longitude,
                    altitude: gps.altitude
                };
            }
        }

        // IPTC данные
        if (metadata.iptc) {
            const iptc = metadata.iptc;
            
            // Заголовок (IPTC)
            if (iptc.headline) {
                normalized.title = iptc.headline;
            }
            
            // Описание (IPTC)
            if (iptc.caption) {
                normalized.description = iptc.caption;
            }
            
            // Автор (IPTC)
            if (iptc.byline) {
                normalized.author = iptc.byline;
            }
        }

        // Добавляем все остальные данные для полноты
        normalized.raw = metadata;
        normalized.hasMetadata = Object.keys(normalized).length > 0;

        return normalized;
    }

    /**
     * Вспомогательный метод для получения значения из XMP структуры
     * @param {*} value - XMP значение
     * @returns {String} Нормализованное значение
     */
    static getXmpValue(value) {
        if (!value) return null;
        if (typeof value === 'string') return value;
        if (typeof value === 'object' && value.value) return value.value;
        if (Array.isArray(value)) return value.join(', ');
        return String(value);
    }

    /**
     * Получает основные метаданные для отображения
     * @param {Object} metadata - Нормализованные метаданные
     * @returns {Object} Метаданные для отображения
     */
    static getDisplayMetadata(metadata) {
        if (!metadata) return {};

        return {
            title: metadata.title,
            description: metadata.description,
            keywords: metadata.keywords,
            author: metadata.author,
            creationDate: metadata.creationDate,
            gps: metadata.gps,
            hasMetadata: metadata.hasMetadata
        };
    }

    /**
     * Проверяет, содержит ли изображение метаданные
     * @param {Object} metadata - Нормализованные метаданные
     * @returns {Boolean} true если метаданные есть
     */
    static hasMetadata(metadata) {
        return metadata?.hasMetadata || false;
    }

    /**
     * Получает размер изображения
     * @param {ArrayBuffer|Uint8Array|Blob|File|String} imageData - Данные изображения
     * @returns {Promise<Object>} Объект с шириной и высотой
     */
    static async getImageSize(imageData) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const objectUrl = typeof imageData === 'string' ? imageData : URL.createObjectURL(new Blob([imageData]));
            
            img.onload = () => {
                const size = {
                    width: img.width,
                    height: img.height
                };
                URL.revokeObjectURL(objectUrl);
                resolve(size);
            };
            
            img.onerror = (error) => {
                if (typeof imageData !== 'string') {
                    URL.revokeObjectURL(objectUrl);
                }
                reject(error);
            };
            
            img.src = objectUrl;
        });
    }

    /**
     * Получает все доступные метаданные в формате, подходящем для отображения
     * @param {ArrayBuffer|Uint8Array|Blob|File|String} imageData - Данные изображения
     * @returns {Promise<Object>} Полные метаданные
     */
    static async getFullMetadata(imageData) {
        try {
            const [metadata, size] = await Promise.all([
                this.extractMetadata(imageData),
                this.getImageSize(imageData).catch(() => ({ width: 0, height: 0 }))
            ]);
            
            return {
                ...metadata,
                size: size,
                hasMetadata: metadata?.hasMetadata || false
            };
        } catch (error) {
            console.warn('Ошибка при получении полных метаданных:', error.message);
            return {
                size: { width: 0, height: 0 },
                hasMetadata: false,
                raw: {}
            };
        }
    }
}
