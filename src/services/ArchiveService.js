import JSZip from 'jszip';
import initSevenZip from '7z-wasm?init'; // Используем Vite's WASM initialization с ?init суффиксом


/**
 * Адаптер для JSZip (закомментирован для отката при необходимости)
 *
class JSZipAdapter {
    constructor() {
        this.zip = null;
    }

    async loadArchive(buffer) {
        this.zip = new JSZip();
        await this.zip.loadAsync(buffer);
        return this;
    }

    async extractFile(filename) {
        if (!this.zip) throw new Error('Archive not loaded');
        const file = this.zip.file(filename);
        if (!file) return null;
        
        // Возвращаем объект с методом async для совместимости
        return {
            name: filename,
            async: async (type) => {
                return await file.async(type);
            }
        };
    }

    extractAllFiles() {
        if (!this.zip) throw new Error('Archive not loaded');
        const files = {};
        
        for (const [filename, file] of Object.entries(this.zip.files)) {
            if (!file.dir) {
                files[filename] = file;
            }
        }
        
        return files;
    }

    getFileList() {
        if (!this.zip) throw new Error('Archive not loaded');
        const files = [];
        
        for (const [filename, file] of Object.entries(this.zip.files)) {
            if (!file.dir) {
                files.push(filename);
            }
        }
        
        return files;
    }

    fileExists(filename) {
        if (!this.zip) throw new Error('Archive not loaded');
        return !!this.zip.file(filename);
    }

    async getFileSize(filename) {
        if (!this.zip) throw new Error('Archive not loaded');
        const file = this.zip.file(filename);
        if (!file) return 0;
        
        const content = await file.async('arraybuffer');
        return content.byteLength;
    }

    async extractTextFile(filename) {
        if (!this.zip) throw new Error('Archive not loaded');
        const file = this.zip.file(filename);
        if (!file) {
            throw new Error(`Файл ${filename} не найден в архиве`);
        }
        
        return await file.async('text');
    }

    async extractBinaryFile(filename) {
        if (!this.zip) throw new Error('Archive not loaded');
        const file = this.zip.file(filename);
        if (!file) {
            throw new Error(`Файл ${filename} не найден в архиве`);
        }
        
        return await file.async('arraybuffer');
    }

    async validateArchive(buffer) {
        try {
            const zip = await JSZip.loadAsync(buffer);
            const files = this.extractAllFilesFromInstance(zip);
            return Object.keys(files).length > 0;
        } catch (error) {
            console.warn('Невалидный архив:', error.message);
            return false;
        }
    }

    extractAllFilesFromInstance(zipInstance) {
        const files = {};
        
        for (const [filename, file] of Object.entries(zipInstance.files)) {
            if (!file.dir) {
                files[filename] = file;
            }
        }
        
        return files;
    }
}
*/

/**
 * Адаптер для 7z-wasm
 */
class SevenZipAdapter {
    constructor(onProgress = null) {
        this.sevenZip = null;
        this.loaded = false;
        this.onProgress = onProgress;
    }

    async loadArchive(buffer) {
        try {
            // Инициализируем 7z-wasm экземпляр с помощью Vite's WASM initialization
            this.sevenZip = await initSevenZip();
            this.loaded = true;
            
            // Создаем временный файл в виртуальной файловой системе
            const archiveName = `archive_${Date.now()}.7z`;
            this.sevenZip.FS.writeFile(archiveName, new Uint8Array(buffer));
            
            // Сначала получаем список файлов для отслеживания прогресса
            let totalFiles = 0;
            if (this.onProgress) {
                try {
                    // Получаем список файлов в архиве
                    this.sevenZip.FS.mkdir('/list_temp');
                    const listResult = this.sevenZip.callMain(['l', archiveName]);
                    
                    if (listResult === 0) {
                        // Читаем список файлов для определения общего количества файлов
                        const listOutput = this.sevenZip.FS.readdir('/list_temp');
                        // Получаем содержимое списка файлов для подсчета
                        const listFile = '/list_temp/list.txt';
                        try {
                            this.sevenZip.FS.writeFile(listFile, '');
                            const listContent = this.sevenZip.FS.readFile(listFile, { encoding: 'utf8' });
                            // Подсчитываем файлы в архиве (это может потребовать дополнительной обработки)
                            // Пока устанавливаем начальный прогресс
                            this.onProgress(0);
                        } catch (readError) {
                            // Если не можем прочитать список, просто отправляем 0%
                            this.onProgress(0);
                        }
                    }
                } catch (listError) {
                    console.warn('Could not get file list for progress tracking:', listError.message);
                    this.onProgress(0);
                }
            }

            // Извлекаем архив с отслеживанием прогресса
            this.sevenZip.FS.mkdir('/extracted');
            
            // Для более точного отслеживания прогресса, мы будем использовать таймер
            // чтобы отправлять промежуточные обновления, так как 7z-wasm не предоставляет
            // встроенный механизм отслеживания прогресса
            let progress = 0;
            const progressInterval = setInterval(() => {
                if (this.onProgress && progress < 95) {
                    progress += 2; // Увеличиваем прогресс на 2% каждые 100ms для более плавного обновления
                    this.onProgress(progress);
                }
            }, 100); // Обновляем прогресс каждые 100ms

            try {
                const result = this.sevenZip.callMain(['x', '-y', archiveName, '-o/extracted']);
                
                if (result !== 0) {
                    throw new Error(`7z extraction failed with code: ${result}`);
                }
            } finally {
                // Останавливаем интервал прогресса
                clearInterval(progressInterval);
                // Убедимся, что отправляем 100% в конце, если не достигли
                if (this.onProgress && progress < 100) {
                    this.onProgress(100);
                }
            }

            // Отправляем 100% прогресс после завершения
            if (this.onProgress) {
                this.onProgress(100);
            }
            
            return this;
        } catch (error) {
            console.error('Error loading 7z archive:', error);
            throw error;
        }
    }

    async extractFile(filename) {
        if (!this.loaded) throw new Error('Archive not loaded');
        
        try {
            const path = `/extracted/${filename}`;
            const stat = this.sevenZip.FS.analyzePath(path);
            
            if (stat.exists && !stat.object.isFolder) {
                const fileContent = this.sevenZip.FS.readFile(path);
                return {
                    name: filename,
                    async: async (type) => {
                        try {
                            if (type === 'text') {
                                return new TextDecoder('utf-8').decode(fileContent);
                            } else if (type === 'arraybuffer') {
                                return fileContent.buffer;
                            } else if (type === 'uint8array') {
                                return fileContent;
                            }
                            return fileContent;
                        } catch (error) {
                            console.warn(`Error reading file ${filename}:`, error.message);
                            throw error;
                        }
                    }
                };
            }
            return null;
        } catch (error) {
            console.warn(`File ${filename} not found in archive:`, error.message);
            return null;
        }
    }

    extractAllFiles() {
        if (!this.loaded) throw new Error('Archive not loaded');
        
        try {
            const files = {};
            const contents = this.sevenZip.FS.readdir('/extracted');
            
            for (const item of contents) {
                if (item !== '.' && item !== '..') {
                    const path = `/extracted/${item}`;
                    const stat = this.sevenZip.FS.analyzePath(path);
                    if (stat.exists && !stat.object.isFolder) {
                        const fileContent = this.sevenZip.FS.readFile(path);
                        files[item] = {
                            name: item,
                            async: async (type) => {
                                try {
                                    if (type === 'text') {
                                        return new TextDecoder('utf-8').decode(fileContent);
                                    } else if (type === 'arraybuffer') {
                                        return fileContent.buffer;
                                    } else if (type === 'uint8array') {
                                        return fileContent;
                                    }
                                    return fileContent;
                                } catch (error) {
                                    console.warn(`Error reading file ${item}:`, error.message);
                                    throw error;
                                }
                            }
                        };
                    }
                }
            }
            
            return files;
        } catch (error) {
            console.warn('Error extracting all files:', error.message);
            return {};
        }
    }

    getFileList() {
        if (!this.loaded) throw new Error('Archive not loaded');
        
        try {
            const contents = this.sevenZip.FS.readdir('/extracted');
            return contents.filter(item => item !== '.' && item !== '..');
        } catch (error) {
            console.warn('Error getting file list:', error.message);
            return [];
        }
    }

    fileExists(filename) {
        if (!this.loaded) throw new Error('Archive not loaded');
        
        try {
            const path = `/extracted/${filename}`;
            const stat = this.sevenZip.FS.analyzePath(path);
            return stat.exists && !stat.object.isFolder;
        } catch (error) {
            return false;
        }
    }

    async getFileSize(filename) {
        if (!this.loaded) throw new Error('Archive not loaded');
        
        try {
            const file = await this.extractFile(filename);
            if (!file) return 0;
            
            const content = await file.async('arraybuffer');
            return content.byteLength;
        } catch (error) {
            return 0;
        }
    }

    async extractTextFile(filename) {
        if (!this.loaded) throw new Error('Archive not loaded');
        
        const file = await this.extractFile(filename);
        if (!file) {
            throw new Error(`Файл ${filename} не найден в архиве`);
        }
        
        return await file.async('text');
    }

    async extractBinaryFile(filename) {
        if (!this.loaded) throw new Error('Archive not loaded');
        
        const file = await this.extractFile(filename);
        if (!file) {
            throw new Error(`Файл ${filename} не найден в архиве`);
        }
        
        return await file.async('arraybuffer');
    }

    async validateArchive(buffer) {
        try {
            // For 7z validation, we'll use the same approach as loadArchive but with validation only
            const sevenZip = await initSevenZip();
            
            // Create temporary file for validation
            const archiveName = `validate_${Date.now()}.7z`;
            sevenZip.FS.writeFile(archiveName, new Uint8Array(buffer));
            
            // Send progress if callback is provided
            if (this.onProgress) {
                this.onProgress(0);
            }

            // Try to list the archive contents to validate it
            sevenZip.FS.mkdir('/validate_list');
            const result = sevenZip.callMain(['l', archiveName]); // Use 'l' for list only
            
            if (result === 0) {
                // If listing succeeded, try to extract to validate content
                sevenZip.FS.mkdir('/validate_extract');
                const extractResult = sevenZip.callMain(['x', '-y', archiveName, '-o/validate_extract']);
                if (extractResult === 0) {
                    const contents = sevenZip.FS.readdir('/validate_extract');
                    const files = contents.filter(item => item !== '.' && item !== '..');
                    
                    // Send progress if callback is provided
                    if (this.onProgress) {
                        this.onProgress(100);
                    }
                    
                    return files.length > 0;
                }
            }

            // Send progress if callback is provided
            if (this.onProgress) {
                this.onProgress(100);
            }

            return false;
        } catch (error) {
            console.warn('Невалидный архив:', error.message);
            return false;
        }
    }
}

/**
 * Адаптер для JS7z
 * Закомментирован из-за проблем с билдом из-за top-level await в js7z-tools
 */
/*
class JS7zAdapter {
    constructor() {
        this.js7z = null;
        this.fs = null;
        this.archiveName = null;
        this.extractedFiles = new Map(); // Кэш извлеченных файлов
    }

    async loadArchive(buffer) {
        // Динамически загружаем JS7z экземпляр
        const { default: JS7z } = await import('js7z-tools');
        this.js7z = await JS7z();
        this.fs = this.js7z.FS;
        
        // Создаем уникальное имя архива
        this.archiveName = `archive_${Date.now()}.tmp`;
        
        // Записываем буфер в виртуальную файловую систему JS7z
        this.fs.writeFile(this.archiveName, new Uint8Array(buffer));
        
        // Извлекаем все файлы из архива в виртуальную файловую систему
        // Используем команду 7z для извлечения: 7z x archive.tmp -o/extracted/
        this.js7z.FS.mkdir('/extracted');
        this.js7z.callMain(['x', '-y', this.archiveName, '-o/extracted']);
        
        // Собираем информацию о всех извлеченных файлах
        this.extractedFiles.clear();
        const contents = this.fs.readdir('/extracted');
        
        for (const item of contents) {
            if (item !== '.' && item !== '..') {
                const path = `/extracted/${item}`;
                const stat = this.fs.analyzePath(path);
                if (!stat.object.isFolder && !stat.object.isDevice) {
                    // Читаем содержимое файла и сохраняем в кэше
                    const fileContent = this.fs.readFile(path);
                    this.extractedFiles.set(item, fileContent);
                }
            }
        }
        
        return this;
    }

    async extractFile(filename) {
        if (!this.js7z) throw new Error('Archive not loaded');
        
        try {
            // Проверяем, существует ли файл в кэше извлеченных файлов
            if (this.extractedFiles.has(filename)) {
                const fileContent = this.extractedFiles.get(filename);
                return {
                    name: filename,
                    async: async (type) => {
                        try {
                            if (type === 'text') {
                                // Для текста конвертируем бинарные данные в строку UTF-8
                                if (fileContent instanceof Uint8Array) {
                                    return new TextDecoder('utf-8').decode(fileContent);
                                } else if (typeof fileContent === 'string') {
                                    return fileContent;
                                } else {
                                    return new TextDecoder('utf-8').decode(new Uint8Array(fileContent));
                                }
                            } else if (type === 'arraybuffer') {
                                // Для ArrayBuffer возвращаем буфер
                                if (fileContent instanceof ArrayBuffer) {
                                    return fileContent;
                                } else if (fileContent instanceof Uint8Array) {
                                    return fileContent.buffer;
                                } else if (typeof fileContent === 'string') {
                                    return new TextEncoder().encode(fileContent).buffer;
                                } else {
                                    return new Uint8Array(fileContent).buffer;
                                }
                            } else if (type === 'uint8array') {
                                // Для Uint8Array возвращаем массив
                                if (fileContent instanceof Uint8Array) {
                                    return fileContent;
                                } else if (fileContent instanceof ArrayBuffer) {
                                    return new Uint8Array(fileContent);
                                } else if (typeof fileContent === 'string') {
                                    return new TextEncoder().encode(fileContent);
                                } else {
                                    return new Uint8Array(fileContent);
                                }
                            }
                            return fileContent;
                        } catch (error) {
                            console.warn(`Error reading file ${filename}:`, error.message);
                            throw error;
                        }
                    }
                };
            }
            return null;
        } catch (error) {
            console.warn(`File ${filename} not found in archive:`, error.message);
            return null;
        }
    }

    extractAllFiles() {
        if (!this.js7z) throw new Error('Archive not loaded');
        
        try {
            const files = {};
            
            for (const [filename, fileContent] of this.extractedFiles) {
                files[filename] = {
                    name: filename,
                    async: async (type) => {
                        try {
                            if (type === 'text') {
                                // Для текста конвертируем бинарные данные в строку UTF-8
                                if (fileContent instanceof Uint8Array) {
                                    return new TextDecoder('utf-8').decode(fileContent);
                                } else if (typeof fileContent === 'string') {
                                    return fileContent;
                                } else {
                                    return new TextDecoder('utf-8').decode(new Uint8Array(fileContent));
                                }
                            } else if (type === 'arraybuffer') {
                                // Для ArrayBuffer возвращаем буфер
                                if (fileContent instanceof ArrayBuffer) {
                                    return fileContent;
                                } else if (fileContent instanceof Uint8Array) {
                                    return fileContent.buffer;
                                } else if (typeof fileContent === 'string') {
                                    return new TextEncoder().encode(fileContent).buffer;
                                } else {
                                    return new Uint8Array(fileContent).buffer;
                                }
                            } else if (type === 'uint8array') {
                                // Для Uint8Array возвращаем массив
                                if (fileContent instanceof Uint8Array) {
                                    return fileContent;
                                } else if (fileContent instanceof ArrayBuffer) {
                                    return new Uint8Array(fileContent);
                                } else if (typeof fileContent === 'string') {
                                    return new TextEncoder().encode(fileContent);
                                } else {
                                    return new Uint8Array(fileContent);
                                }
                            }
                            return fileContent;
                        } catch (error) {
                            console.warn(`Error reading file ${filename}:`, error.message);
                            throw error;
                        }
                    }
                };
            }
            
            return files;
        } catch (error) {
            console.warn('Error extracting all files:', error.message);
            return {};
        }
    }

    getFileList() {
        if (!this.js7z) throw new Error('Archive not loaded');
        
        try {
            return Array.from(this.extractedFiles.keys());
        } catch (error) {
            console.warn('Error getting file list:', error.message);
            return [];
        }
    }

    fileExists(filename) {
        if (!this.js7z) throw new Error('Archive not loaded');
        
        try {
            return this.extractedFiles.has(filename);
        } catch (error) {
            return false;
        }
    }

    async getFileSize(filename) {
        if (!this.js7z) throw new Error('Archive not loaded');
        
        try {
            if (!this.extractedFiles.has(filename)) return 0;
            
            const file = await this.extractFile(filename);
            if (!file) return 0;
            
            const content = await file.async('arraybuffer');
            return content.byteLength;
        } catch (error) {
            return 0;
        }
    }

    async extractTextFile(filename) {
        if (!this.js7z) throw new Error('Archive not loaded');
        
        const file = await this.extractFile(filename);
        if (!file) {
            throw new Error(`Файл ${filename} не найден в архиве`);
        }
        
        return await file.async('text');
    }

    async extractBinaryFile(filename) {
        if (!this.js7z) throw new Error('Archive not loaded');
        
        const file = await this.extractFile(filename);
        if (!file) {
            throw new Error(`Файл ${filename} не найден в архиве`);
        }
        
        return await file.async('arraybuffer');
    }

    async validateArchive(buffer) {
        try {
            const adapter = await this.loadArchive(buffer);
            const files = adapter.extractAllFiles();
            return Object.keys(files).length > 0;
        } catch (error) {
            console.warn('Невалидный архив:', error.message);
            return false;
        }
    }
}
*/

/**
 * Универсальный сервис для работы с архивами
 */
export class ArchiveService {
    constructor(engine = '7z') {
        this.engine = engine;
        this.adapter = null;
    }

    static get ENGINES() {
        return {
            SEVEN_ZIP: '7z',      // 7z-wasm engine
            JS7Z: 'js7z',         // js7z-tools engine
            JSZIP: 'jszip'        // JSZip engine (для ZIP)
        };
    }

    async loadArchive(buffer, engine = ArchiveService.ENGINES.SEVEN_ZIP, onProgress = null) {
        switch (engine) {
            case ArchiveService.ENGINES.SEVEN_ZIP:
                this.adapter = new SevenZipAdapter(onProgress);
                break;
            case ArchiveService.ENGINES.JS7Z:
                // JS7z engine is commented out due to build issues with top-level await
                // this.adapter = new JS7zAdapter();
                // break;
            case ArchiveService.ENGINES.JSZIP:
                // Для поддержки JSZip при необходимости
                // this.adapter = new JSZipAdapter();
                // break;
            default:
                // fallback to SevenZip
                this.adapter = new SevenZipAdapter(onProgress);
                break;
        }
        return await this.adapter.loadArchive(buffer);
    }

    async extractFile(filename) {
        if (!this.adapter) {
            throw new Error('Archive not loaded');
        }
        try {
            const file = await this.adapter.extractFile(filename);
            return file;
        } catch (error) {
            console.warn(`Failed to extract file ${filename}:`, error.message);
            return null;
        }
    }

    extractAllFiles() {
        if (!this.adapter) throw new Error('Archive not loaded');
        return this.adapter.extractAllFiles();
    }

    getFileList() {
        if (!this.adapter) throw new Error('Archive not loaded');
        return this.adapter.getFileList();
    }

    fileExists(filename) {
        if (!this.adapter) throw new Error('Archive not loaded');
        return this.adapter.fileExists(filename);
    }

    async getFileSize(filename) {
        if (!this.adapter) throw new Error('Archive not loaded');
        return await this.adapter.getFileSize(filename);
    }

    async extractTextFile(filename) {
        if (!this.adapter) throw new Error('Archive not loaded');
        return await this.adapter.extractTextFile(filename);
    }

    async extractBinaryFile(filename) {
        if (!this.adapter) throw new Error('Archive not loaded');
        return await this.adapter.extractBinaryFile(filename);
    }

    async validateArchive(buffer, engine = ArchiveService.ENGINES.SEVEN_ZIP, onProgress = null) {
        switch (engine) {
            case ArchiveService.ENGINES.SEVEN_ZIP:
                const sevenZipAdapter = new SevenZipAdapter(onProgress);
                return await sevenZipAdapter.validateArchive(buffer);
            case ArchiveService.ENGINES.JS7Z:
                // JS7z validation is commented out due to build issues with top-level await
                // const { default: JS7z } = await import('js7z-tools');
                // const js7z = await JS7z();
                // const fs = js7z.FS;
                
                // const archiveName = `validate_${Date.now()}.tmp`;
                // fs.writeFile(archiveName, new Uint8Array(buffer));
                
                // js7z.FS.mkdir('/validate_extracted');
                // const result = js7z.callMain(['x', '-y', archiveName, '-o/validate_extracted']);
                
                // if (result === 0) {
                //     const contents = fs.readdir('/validate_extracted');
                //     const files = contents.filter(item => item !== '.' && item !== '..');
                //     return files.length > 0;
                // }
                // return false;
            case ArchiveService.ENGINES.JSZIP:
                // For JSZip validation
                const zip = await JSZip.loadAsync(buffer);
                const zipFiles = {};
                for (const [filename, file] of Object.entries(zip.files)) {
                    if (!file.dir) {
                        zipFiles[filename] = file;
                    }
                }
                return Object.keys(zipFiles).length > 0;
            default:
                // fallback to SevenZip
                const fallbackAdapter = new SevenZipAdapter(onProgress);
                return await fallbackAdapter.validateArchive(buffer);
        }
    }

    // Методы для переключения движков
    setEngine(engine) {
        this.engine = engine;
    }

    getCurrentEngine() {
        return this.engine;
    }
}
