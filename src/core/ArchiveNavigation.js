import { logger } from '../logger.js';
import * as pdfjsLib from 'pdfjs-dist';

// Настройка PDF.js worker - используем локальную версию из node_modules с правильным URL для Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.js', import.meta.url).href;

/**
 * Класс для навигации по архиву и управления боковой панелью
 */
export class ArchiveNavigation {
    /**
     * @param {DigitalTimeCapsule} parent - Родительский класс
     */
    constructor(parent) {
        this.parent = parent;
        this.logger = logger;
    }

    /**
     * Заполнение боковой панели информацией об архиве
     * @param {Array} items - Элементы архива
     */
    async populateSidebar(items) {
        const operationId = this.logger.pushOperation('populateSidebar', { itemsCount: items.length });
        try {
            const fileCountElement = document.getElementById('file-count');
            const fileListElement = document.getElementById('file-list');

            if (fileCountElement) {
                fileCountElement.textContent = `Файлов: ${items.length}`;
            }

            if (fileListElement) {
                fileListElement.innerHTML = '';

                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const listItem = document.createElement('li');
                    listItem.className = 'archive-nav-item';
                    
                    // Для PDF файлов получаем заголовок из метаданных, как в renderArchiveItem
                    let displayTitle = item.title; // По умолчанию используем заголовок из манифеста
                    
                    if (item.filename.toLowerCase().endsWith('.pdf')) {
                        const pdfFile = this.parent.zip.file(item.filename);
                        if (pdfFile) {
                            try {
                                const arrayBuffer = await pdfFile.async('arraybuffer');
                                const pdfDocument = await pdfjsLib.getDocument(arrayBuffer.slice(0)).promise;
                                const metadata = await pdfDocument.getMetadata();
                                
                                if (metadata && metadata.info && metadata.info.Title) {
                                    displayTitle = metadata.info.Title;
                                }
                            } catch (error) {
                                this.logger.warn('Не удалось получить метаданные PDF для боковой панели', { error: error.message, filename: item.filename });
                                // Используем заголовок из манифеста, если не удалось получить метаданные
                            }
                        }
                    }
                    
                    listItem.innerHTML = `
                        <span>${this.parent.getItemEmoji(item.type)}</span>
                        <span>${i + 1}. </span>
                        <span>${this.parent.escapeHtml(displayTitle)}</span>
                    `;
                    
                    // Добавляем обработчик клика для прокрутки к элементу архива
                    listItem.addEventListener('click', () => {
                        const targetElement = document.querySelector(`#archive-container .archive-item:nth-child(${i + 1})`);
                        if (targetElement) {
                            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            // Добавляем подсветку к элементу
                            targetElement.style.backgroundColor = '#e3f2fd';
                            setTimeout(() => {
                                targetElement.style.backgroundColor = '';
                            }, 200);
                        }
                    });

                    fileListElement.appendChild(listItem);
                }
                this.logger.debug('Боковая панель заполнена', { itemsCount: items.length, operationId });
            }
        } catch (error) {
            // Исправляем ошибку логгера - используем безопасный вызов
            try {
                this.logger.logError(error, { operationId });
            } catch (logError) {
                console.error('Ошибка при логировании в populateSidebar:', logError);
                console.error('Оригинальная ошибка:', error);
            }
        } finally {
            try {
                this.logger.popOperation();
            } catch (e) {
                // Игнорируем ошибки при завершении операции логирования
                console.warn('Ошибка при завершении операции логирования в populateSidebar:', e);
            }
        }
    }

    /**
     * Поиск файла объяснения для мема
     * @param {string} memFilename - Имя файла мема
     * @returns {Object|null} - Файл объяснения или null
     */
    findExplanationFile(memFilename) {
        const operationId = this.logger.pushOperation('findExplanationFile', { memFilename });
        try {
            const baseName = memFilename.replace(/\.[^/.]+$/, ""); // Удаляем расширение
            const baseNameLower = baseName.toLowerCase(); // Для регистронезависимого поиска
            this.logger.debug('Базовое имя файла для поиска объяснения', { baseName, memFilename, operationId });
            
            // Для новой структуры имен: {номер}_{тип}.{расширение} -> {номер}_{тип}_объяснение.txt
            // Пробуем найти файл объяснения по точному совпадению (регистронезависимо)
            const exactMatchNames = [
                `${baseName}_объяснение.txt`,
                `${baseName}_explanation.txt`,
                `${baseName}_info.txt`,
                `${baseName}_description.txt`,
                `${baseName}_details.txt`
            ];
            
            this.logger.debug('Поиск по точному совпадению', { exactMatchNames, operationId });
            
            // Регистронезависимый поиск по точному совпадению
            for (const explanationName of exactMatchNames) {
                const explanationFile = this.findFileCaseInsensitive(explanationName);
                this.logger.debug('Проверка точного совпадения', { explanationName, exists: !!explanationFile, operationId });
                if (explanationFile) {
                    this.logger.info('Файл объяснения найден по точному совпадению', { explanationName, operationId });
                    return explanationFile;
                }
            }
            
            // Если точное совпадение не найдено, ищем по частичному совпадению
            // Разбиваем базовое имя на части и ищем файлы, начинающиеся с этих частей
            const nameParts = baseName.split('_');
            this.logger.debug('Поиск по частичному совпадению', { nameParts, operationId });
            
            // Пробуем разные комбинации частей имени (начиная с наиболее полной)
            for (let i = nameParts.length; i > 0; i--) {
                const partialName = nameParts.slice(0, i).join('_');
                this.logger.debug('Проверка частичного совпадения', { partialName, operationId });
                
                const partialMatchNames = [
                    `${partialName}_объяснение.txt`,
                    `${partialName}_explanation.txt`,
                    `${partialName}_info.txt`,
                    `${partialName}_description.txt`,
                    `${partialName}_details.txt`
                ];
                
                for (const explanationName of partialMatchNames) {
                    const explanationFile = this.findFileCaseInsensitive(explanationName);
                    this.logger.debug('Проверка частичного совпадения файла', { explanationName, exists: !!explanationFile, operationId });
                    if (explanationFile) {
                        this.logger.info('Файл объяснения найден по частичному совпадению', { explanationName, partialName, operationId });
                        return explanationFile;
                    }
                }
            }
            
            // Дополнительно: ищем файлы объяснений, которые содержат часть имени мема
            const allFiles = Object.keys(this.parent.zip.files);
            const explanationFiles = allFiles.filter(f => f.toLowerCase().includes('_объяснение.txt') || f.toLowerCase().includes('_explanation.txt') || 
                f.toLowerCase().includes('_info.txt') || f.toLowerCase().includes('_description.txt') || f.toLowerCase().includes('_details.txt'));
            
            this.logger.debug('Поиск среди всех файлов объяснений', { explanationFiles, operationId });
            
            for (const explanationFile of explanationFiles) {
                const explanationBase = explanationFile.replace(/\.[^/.]+$/, ""); // Удаляем .txt
                // Проверяем, является ли базовое имя мема частью имени файла объяснения или наоборот (регистронезависимо)
                const explanationBaseLower = explanationBase.toLowerCase();
                const baseNameWithoutSuffix = explanationBaseLower.replace(/_(объяснение|explanation|info|description|details)$/i, '');
                if (explanationBaseLower.includes(baseNameLower) || baseNameLower.includes(baseNameWithoutSuffix)) {
                    this.logger.info('Файл объяснения найден по частичному соответствию', { explanationFile, baseName, explanationBase, operationId });
                    return this.parent.zip.file(explanationFile);
                }
            }
            
            this.logger.warn('Файл объяснения не найден', { baseName, operationId });
            return null;
        } catch (error) {
            this.logger.logError(error, { operationId });
            return null;
        } finally {
            this.logger.popOperation();
        }
    }

    /**
     * Вспомогательный метод для регистронезависимого поиска файла в ZIP архиве
     * @param {string} filename - Имя файла для поиска
     * @returns {Object|null} - Найденный файл или null
     */
    findFileCaseInsensitive(filename) {
        const filenameLower = filename.toLowerCase();
        const allFiles = Object.keys(this.parent.zip.files);
        const matchingFile = allFiles.find(file => file.toLowerCase() === filenameLower);
        return matchingFile ? this.parent.zip.file(matchingFile) : null;
    }

}
