/**
 * Класс для работы с PDF файлами
 */
import * as pdfjsLib from 'pdfjs-dist';

// Настройка PDF.js worker - используем версию, соответствующую установленной библиотеке pdfjs-dist: "^3.1.174"
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export class PDFService {
    /**
     * Извлекает метаданные из PDF файла
     * @param {ArrayBuffer} arrayBuffer - Буфер PDF файла
     * @returns {Promise<Object>} Метаданные PDF
     */
    static async extractMetadata(arrayBuffer) {
        try {
            const pdfDocument = await pdfjsLib.getDocument(arrayBuffer).promise;
            const metadata = await pdfDocument.getMetadata();
            return metadata;
        } catch (error) {
            console.warn('Не удалось извлечь метаданные PDF:', error.message);
            return null;
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
            const pdfDocument = await pdfjsLib.getDocument(arrayBuffer).promise;
            return pdfDocument.numPages;
        } catch (error) {
            console.warn('Не удалось получить количество страниц PDF:', error.message);
            return 0;
        }
    }
}
