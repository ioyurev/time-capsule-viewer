import { logger } from '../logger.js';

/**
 * Класс для валидации файлов объяснений (мемов и личных достижений)
 */
export class ExplanationValidator {
    /**
     * @param {DigitalTimeCapsule} parent - Родительский класс
     */
    constructor(parent) {
        this.parent = parent;
        this.logger = logger;
    }

    /**
     * Валидация файлов объяснений для всех элементов архива
     * @param {Array} items - Массив элементов архива
     * @returns {Promise<Object>} - Результаты валидации
     */
    async validateExplanationFiles(items) {
        const operationId = this.logger.pushOperation('validateExplanationFiles', { itemsCount: items.length });
        try {
            let validPersonalExplanations = 0;
            let validMemeExplanations = 0;
            const explanationDetails = [];

            for (const item of items) {
                const itemType = item.type.toUpperCase();
                const isPersonal = itemType === 'ЛИЧНОЕ';
                const isMem = itemType === 'МЕМ';

                if (isPersonal || isMem) {
                    const explanationFile = await this.parent.findExplanationFile(item.filename);
                    
                    if (explanationFile) {
                        try {
                            const text = await explanationFile.async('text');
                            const wordCount = this.countWords(text);
                            
                            let requiredWords = isPersonal ? 100 : 50;
                            let isValid = wordCount >= requiredWords;
                            
                            if (isValid) {
                                if (isPersonal) validPersonalExplanations++;
                                if (isMem) validMemeExplanations++;
                            }

                            explanationDetails.push({
                                filename: item.filename,
                                type: itemType,
                                explanationFile: explanationFile.name,
                                wordCount: wordCount,
                                requiredWords: requiredWords,
                                isValid: isValid,
                                title: item.title || item.filename
                            });

                            this.logger.debug('Explanation file validated', { 
                                filename: item.filename, 
                                wordCount, 
                                required: requiredWords, 
                                isValid,
                                operationId 
                            });
                        } catch (error) {
                            this.logger.warn('Failed to read explanation file', { 
                                filename: item.filename, 
                                explanationFile: explanationFile.name, 
                                error: error.message, 
                                operationId 
                            });
                            
                            explanationDetails.push({
                                filename: item.filename,
                                type: itemType,
                                explanationFile: explanationFile.name,
                                wordCount: 0,
                                requiredWords: isPersonal ? 100 : 50,
                                isValid: false,
                                title: item.title || item.filename,
                                error: error.message
                            });
                        }
                    } else {
                        // Файл объяснения не найден
                        explanationDetails.push({
                            filename: item.filename,
                            type: itemType,
                            explanationFile: null,
                            wordCount: 0,
                            requiredWords: isPersonal ? 100 : 50,
                            isValid: false,
                            title: item.title || item.filename,
                            error: 'Explanation file not found'
                        });

                        this.logger.debug('Explanation file not found', { 
                            filename: item.filename, 
                            type: itemType,
                            operationId 
                        });
                    }
                }
            }

            const result = {
                validPersonalExplanations,
                validMemeExplanations,
                totalPersonalItems: items.filter(item => item.type.toUpperCase() === 'ЛИЧНОЕ').length,
                totalMemeItems: items.filter(item => item.type.toUpperCase() === 'МЕМ').length,
                explanationDetails
            };

            this.logger.info('Explanation validation completed', { 
                validPersonal: validPersonalExplanations,
                validMemes: validMemeExplanations,
                totalPersonal: result.totalPersonalItems,
                totalMemes: result.totalMemeItems,
                operationId 
            });

            return result;
        } catch (error) {
            this.logger.logError(error, { operationId });
            throw error;
        } finally {
            this.logger.popOperation();
        }
    }

    /**
     * Подсчет слов в тексте
     * @param {string} text - Текст для подсчета слов
     * @returns {number} - Количество слов
     */
    countWords(text) {
        if (!text || typeof text !== 'string') {
            return 0;
        }
        
        // Удаляем лишние пробелы и разбиваем по пробелам и знакам препинания
        // Регулярное выражение для разделения по пробелам и знакам препинания
        const words = text.trim().split(/\s+/).filter(word => word.length > 0);
        return words.length;
    }

    /**
     * Валидация отдельного файла объяснения
     * @param {Object} item - Элемент архива
     * @returns {Promise<Object>} - Результат валидации
     */
    async validateExplanationForItem(item) {
        const operationId = this.logger.pushOperation('validateExplanationForItem', { filename: item.filename });
        try {
            const itemType = item.type.toUpperCase();
            const isPersonal = itemType === 'ЛИЧНОЕ';
            const isMem = itemType === 'МЕМ';

            if (!isPersonal && !isMem) {
                return {
                    isValid: false,
                    wordCount: 0,
                    requiredWords: 0,
                    error: 'Item is not personal achievement or meme'
                };
            }

            const explanationFile = await this.parent.findExplanationFile(item.filename);
            
            if (!explanationFile) {
                return {
                    isValid: false,
                    wordCount: 0,
                    requiredWords: isPersonal ? 100 : 50,
                    error: 'Explanation file not found'
                };
            }

            try {
                const text = await explanationFile.async('text');
                const wordCount = this.countWords(text);
                const requiredWords = isPersonal ? 100 : 50;
                const isValid = wordCount >= requiredWords;

                return {
                    isValid,
                    wordCount,
                    requiredWords,
                    explanationFile: explanationFile.name,
                    textLength: text.length
                };
            } catch (error) {
                this.logger.warn('Failed to read explanation file', { 
                    filename: item.filename, 
                    error: error.message, 
                    operationId 
                });
                
                return {
                    isValid: false,
                    wordCount: 0,
                    requiredWords: isPersonal ? 100 : 50,
                    error: error.message
                };
            }
        } catch (error) {
            this.logger.logError(error, { operationId });
            return {
                isValid: false,
                wordCount: 0,
                requiredWords: 0,
                error: error.message
            };
        } finally {
            this.logger.popOperation();
        }
    }
}
