/**
 * Класс для работы с ZIP архивами
 */
import JSZip from 'jszip';

export class ZipService {
    /**
     * Загружает ZIP архив из ArrayBuffer
     * @param {ArrayBuffer} zipBuffer - Буфер ZIP архива
     * @returns {Promise<JSZip>} Объект JSZip
     */
    static async loadZip(zipBuffer) {
        return await JSZip.loadAsync(zipBuffer);
    }

    /**
     * Извлекает файл из ZIP архива
     * @param {JSZip} zip - Объект JSZip
     * @param {string} filename - Имя файла для извлечения
     * @returns {Promise<JSZipObject|null>} Объект файла или null
     */
    static async extractFile(zip, filename) {
        const file = zip.file(filename);
        return file || null;
    }

    /**
     * Извлекает все файлы из ZIP архива
     * @param {JSZip} zip - Объект JSZip
     * @returns {Object} Объект с файлами
     */
    static extractAllFiles(zip) {
        const files = {};
        
        for (const [filename, file] of Object.entries(zip.files)) {
            if (!file.dir) {
                files[filename] = file;
            }
        }
        
        return files;
    }

    /**
     * Получает список файлов в ZIP архиве
     * @param {JSZip} zip - Объект JSZip
     * @returns {Array<string>} Массив имен файлов
     */
    static getFileList(zip) {
        const files = [];
        
        for (const [filename, file] of Object.entries(zip.files)) {
            if (!file.dir) {
                files.push(filename);
            }
        }
        
        return files;
    }

    /**
     * Проверяет, существует ли файл в ZIP архиве
     * @param {JSZip} zip - Объект JSZip
     * @param {string} filename - Имя файла для проверки
     * @returns {boolean} Существует ли файл
     */
    static fileExists(zip, filename) {
        return !!zip.file(filename);
    }

    /**
     * Получает размер файла в ZIP архиве
     * @param {JSZip} zip - Объект JSZip
     * @param {string} filename - Имя файла
     * @returns {Promise<number>} Размер файла в байтах
     */
    static async getFileSize(zip, filename) {
        const file = zip.file(filename);
        if (!file) return 0;
        
        const content = await file.async('arraybuffer');
        return content.byteLength;
    }

    /**
     * Извлекает текст из текстового файла в ZIP
     * @param {JSZip} zip - Объект JSZip
     * @param {string} filename - Имя текстового файла
     * @returns {Promise<string>} Содержимое файла
     */
    static async extractTextFile(zip, filename) {
        const file = zip.file(filename);
        if (!file) {
            throw new Error(`Файл ${filename} не найден в архиве`);
        }
        
        return await file.async('text');
    }

    /**
     * Извлекает бинарные данные из файла в ZIP
     * @param {JSZip} zip - Объект JSZip
     * @param {string} filename - Имя файла
     * @returns {Promise<ArrayBuffer>} Бинарные данные
     */
    static async extractBinaryFile(zip, filename) {
        const file = zip.file(filename);
        if (!file) {
            throw new Error(`Файл ${filename} не найден в архиве`);
        }
        
        return await file.async('arraybuffer');
    }

    /**
     * Проверяет валидность ZIP архива
     * @param {ArrayBuffer} zipBuffer - Буфер ZIP архива
     * @returns {Promise<boolean>} Валиден ли архив
     */
    static async validateZip(zipBuffer) {
        try {
            const zip = await JSZip.loadAsync(zipBuffer);
            // Проверяем, что архив не пустой
            const files = this.extractAllFiles(zip);
            return Object.keys(files).length > 0;
        } catch (error) {
            console.warn('Невалидный ZIP архив:', error.message);
            return false;
        }
    }
}
