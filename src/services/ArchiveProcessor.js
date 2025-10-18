/**
 * @typedef {import('../core/DigitalTimeCapsule.js').ArchiveItem} ArchiveItem
 * @typedef {import('../core/DigitalTimeCapsule.js').ValidationError} ValidationError
 */

/**
 * Класс для обработки архивов цифровой капсулы времени
 */
export class ArchiveProcessor {
    /**
     * Извлекает файлы из ZIP архива
     * @param {ArrayBuffer} zipBuffer - Буфер ZIP архива
     * @returns {Promise<Object>} Объект с файлами и манифестом
     */
    static async extractFiles(zipBuffer) {
        const zip = await JSZip.loadAsync(zipBuffer);
        const files = {};
        
        // Извлекаем все файлы
        for (const [filename, file] of Object.entries(zip.files)) {
            if (!file.dir) {
                files[filename] = file;
            }
        }
        
        return {
            zip,
            files,
            manifest: files['manifest.txt']
        };
    }

    /**
     * Валидирует структуру архива
     * @param {Object} archiveFiles - Объект с файлами архива
     * @param {ArchiveItem[]} items - Элементы архива
     * @returns {Array<ValidationError>} Массив ошибок валидации
     */
    static validateArchiveStructure(archiveFiles, items) {
        const errors = [];
        
        // Проверяем, что все файлы из манифеста существуют в архиве
        items.forEach((item, index) => {
            if (!archiveFiles[item.filename]) {
                errors.push({
                    lineNumber: index + 1,
                    line: `${item.filename} | ${item.type} | ${item.title} | ${item.description} | ${item.date} | ${item.tags.join(',')}`,
                    error: `Файл ${item.filename} не найден в архиве`,
                    expectedFormat: 'Файл должен существовать в архиве',
                    problematicParts: [{
                        index: 0,
                        part: item.filename,
                        field: 'filename',
                        isEmpty: false,
                        isProblematic: true,
                        expected: true
                    }]
                });
            }
        });
        
        // Проверяем наличие обязательных файлов
        const manifestFile = archiveFiles['manifest.txt'];
        if (!manifestFile) {
            errors.push({
                lineNumber: 1,
                line: 'manifest.txt',
                error: 'Файл manifest.txt не найден в архиве',
                expectedFormat: 'Файл manifest.txt обязателен для архива',
                problematicParts: [{
                    index: 0,
                    part: 'manifest.txt',
                    field: 'required_file',
                    isEmpty: false,
                    isProblematic: true,
                    expected: true
                }]
            });
        }
        
        return errors;
    }

    /**
     * Проверяет требования к архиву
     * @param {ArchiveItem[]} items - Элементы архива
     * @returns {Object} Объект с результатами проверки
     */
    static validateArchiveRequirements(items) {
        const requirements = {
            newsCount: 0,
            mediaCount: 0,
            personalCount: 0,
            filesWithValidTags: 0,
            totalFiles: items.length,
            isValid: true
        };

        items.forEach(item => {
            const itemType = item.type.toUpperCase();
            if (itemType === 'НОВОСТЬ') requirements.newsCount++;
            else if (itemType === 'МЕДИА') requirements.mediaCount++;
            else if (itemType === 'ЛИЧНОЕ') requirements.personalCount++;

            if (item.tags.length >= 5) {
                requirements.filesWithValidTags++;
            }
        });

        // Проверяем требования
        requirements.isValid = 
            requirements.newsCount >= 5 &&
            requirements.mediaCount >= 5 &&
            requirements.personalCount >= 2 &&
            requirements.filesWithValidTags === requirements.totalFiles;

        return requirements;
    }

    /**
     * Получает статистику архива
     * @param {ArchiveItem[]} items - Элементы архива
     * @returns {Object} Статистика архива
     */
    static getArchiveStatistics(items) {
        const stats = {
            totalFiles: items.length,
            fileTypes: {},
            dateRange: { min: null, max: null },
            tagCount: 0,
            filesByType: {}
        };

        items.forEach(item => {
            // Подсчет типов файлов
            const type = item.type.toUpperCase();
            stats.fileTypes[type] = (stats.fileTypes[type] || 0) + 1;
            stats.filesByType[type] = stats.filesByType[type] || [];
            stats.filesByType[type].push(item);

            // Подсчет тегов
            stats.tagCount += item.tags.length;

            // Диапазон дат
            const date = new Date(item.date);
            if (stats.dateRange.min === null || date < stats.dateRange.min) {
                stats.dateRange.min = date;
            }
            if (stats.dateRange.max === null || date > stats.dateRange.max) {
                stats.dateRange.max = date;
            }
        });

        return stats;
    }
}
