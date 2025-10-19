/**
 * Класс для работы с PDF файлами
 */
import * as pdfjsLib from 'pdfjs-dist';

// Настройка PDF.js worker - используем локальную версию из node_modules с правильным URL для Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.js', import.meta.url).href;

export class PDFService {
    /**
     * Извлекает метаданные из PDF файла
     * @param {ArrayBuffer} arrayBuffer - Буфер PDF файла
     * @returns {Promise<Object>} Метаданные PDF
     */
    static async extractMetadata(arrayBuffer) {
        try {
            // Создаем копию ArrayBuffer чтобы избежать detachment ошибок
            const bufferCopy = arrayBuffer.slice(0);
            const pdfDocument = await pdfjsLib.getDocument(bufferCopy).promise;
            const metadata = await pdfDocument.getMetadata();
            return metadata;
        } catch (error) {
            console.warn('Не удалось извлечь метаданные PDF:', error.message);
            return null;
        }
    }

    /**
     * Извлекает ключевые слова из PDF метаданных
     * @param {ArrayBuffer} arrayBuffer - Буфер PDF файла
     * @returns {Promise<Array>} Массив ключевых слов
     */
    static async extractKeywords(arrayBuffer) {
        try {
            // Создаем копию ArrayBuffer чтобы избежать detachment ошибок
            const bufferCopy = arrayBuffer.slice(0);
            const pdfDocument = await pdfjsLib.getDocument(bufferCopy).promise;
            const metadata = await pdfDocument.getMetadata();
            
            const keywords = [];
            
            // Извлекаем ключевые слова из основных полей PDF метаданных
            if (metadata && metadata.info) {
                // Keywords из DocumentInfo
                if (metadata.info.Keywords) {
                    const metaKeywords = metadata.info.Keywords;
                    if (typeof metaKeywords === 'string') {
                        // Разделяем по запятым и очищаем
                        const keywordList = metaKeywords.split(',')
                            .map(kw => kw.trim())
                            .filter(kw => kw.length > 0);
                        keywords.push(...keywordList);
                    } else if (Array.isArray(metaKeywords)) {
                        keywords.push(...metaKeywords);
                    }
                }
                
            }
            
            // Извлекаем ключевые слова из XMP данных
            if (metadata && metadata.xmp) {
                const xmp = metadata.xmp;
                
                // Keywords из XMP
                if (xmp['pdf:Keywords'] || xmp['xmp:Keywords'] || xmp['dc:subject']) {
                    const xmpKeywords = xmp['pdf:Keywords'] || xmp['xmp:Keywords'] || xmp['dc:subject'];
                    if (typeof xmpKeywords === 'string') {
                        const keywordList = xmpKeywords.split(',')
                            .map(kw => kw.trim())
                            .filter(kw => kw.length > 0);
                        keywords.push(...keywordList);
                    } else if (Array.isArray(xmpKeywords)) {
                        keywords.push(...xmpKeywords);
                    } else if (typeof xmpKeywords === 'object' && xmpKeywords.length) {
                        // Если это объект с дочерними элементами
                        for (const item of xmpKeywords) {
                            if (typeof item === 'string') {
                                keywords.push(item);
                            }
                        }
                    }
                }
            }
            
            // Удаляем дубликаты и возвращаем уникальные ключевые слова
            return [...new Set(keywords.filter(kw => kw && typeof kw === 'string' && kw.trim().length > 0))];
        } catch (error) {
            console.warn('Не удалось извлечь ключевые слова из PDF:', error.message);
            return [];
        }
    }

    /**
     * Получает нормализованные метаданные PDF для отображения
     * @param {ArrayBuffer} arrayBuffer - Буфер PDF файла
     * @returns {Promise<Object>} Нормализованные метаданные
     */
    static async getNormalizedMetadata(arrayBuffer) {
        try {
            // Создаем копии ArrayBuffer для каждого вызова чтобы избежать detachment ошибок
            const [metadata, keywords, pageCount] = await Promise.all([
                this.extractMetadata(arrayBuffer.slice(0)),
                this.extractKeywords(arrayBuffer.slice(0)),
                this.getPagesCount(arrayBuffer.slice(0))
            ]);
            
            return {
                title: metadata?.info?.Title || '',
                author: metadata?.info?.Author || '',
                subject: metadata?.info?.Subject || '',
                keywords: keywords,
                creationDate: metadata?.info?.CreationDate || '',
                modificationDate: metadata?.info?.ModDate || '',
                creator: metadata?.info?.Creator || '',
                producer: metadata?.info?.Producer || '',
                pageCount: pageCount,
                hasKeywords: keywords.length > 0
            };
        } catch (error) {
            console.warn('Не удалось получить нормализованные метаданные PDF:', error.message);
            return {
                title: '',
                author: '',
                subject: '',
                keywords: [],
                creationDate: '',
                modificationDate: '',
                creator: '',
                producer: '',
                pageCount: 0,
                hasKeywords: false
            };
        }
    }

    /**
     * Парсит дату из формата PDF
     * @param {string} dateString - Строка даты в формате PDF
     * @returns {Date|null} Объект даты или null
     */
    static parsePdfDate(dateString) {
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

    /**
     * Преобразует ArrayBuffer в base64
     * @param {ArrayBuffer} buffer - Буфер для преобразования
     * @returns {string} Base64 строка
     */
    static arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * Создает URL для отображения PDF
     * @param {ArrayBuffer} arrayBuffer - Буфер PDF файла
     * @returns {string} URL для PDF
     */
    static createPdfUrl(arrayBuffer) {
        const base64 = this.arrayBufferToBase64(arrayBuffer);
        return `data:application/pdf;base64,${base64}`;
    }

    /**
     * Получает количество страниц в PDF
     * @param {ArrayBuffer} arrayBuffer - Буфер PDF файла
     * @returns {Promise<number>} Количество страниц
     */
    static async getPagesCount(arrayBuffer) {
        try {
            // Создаем копию ArrayBuffer чтобы избежать detachment ошибок
            const bufferCopy = arrayBuffer.slice(0);
            const pdfDocument = await pdfjsLib.getDocument(bufferCopy).promise;
            return pdfDocument.numPages;
        } catch (error) {
            console.warn('Не удалось получить количество страниц PDF:', error.message);
            return 0;
        }
    }
}
