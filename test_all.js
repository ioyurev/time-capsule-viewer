import JSZip from 'jszip';
import fs from 'fs/promises';
import { ImageService } from './src/services/ImageService.js';
import { DigitalTimeCapsule } from './src/core/DigitalTimeCapsule.js';
import { ArchiveValidator } from './src/core/ArchiveValidator.js';
import { PDFService } from './src/services/PDFService.js';

class ComprehensiveTest {
    constructor() {
        this.testsPassed = 0;
        this.testsFailed = 0;
        this.totalTests = 0;
    }

    logTest(name, result, details = '') {
        this.totalTests++;
        if (result) {
            this.testsPassed++;
            console.log(`✅ ${name}: ПРОЙДЕН`);
        } else {
            this.testsFailed++;
            console.log(`❌ ${name}: НЕ ПРОЙДЕН ${details}`);
        }
    }

    async run() {
        console.log('=== ЗАПУСК КОМПЛЕКСНОГО ТЕСТИРОВАНИЯ ===\n');

        try {
            // Загружаем архив
            console.log('Загрузка архива example/example.zip...');
            const zipBuffer = await fs.readFile('./example/example.zip');
            console.log('Файл ZIP прочитан, размер:', zipBuffer.length, 'байт');

            // Загружаем архив с помощью JSZip
            const zip = await JSZip.loadAsync(zipBuffer);
            console.log('ZIP архив загружен\n');

            // Тест 1: Парсинг манифеста
            await this.testManifestParsing(zip);

            // Тест 2: Валидация архива
            await this.testArchiveValidation(zip);

            // Тест 3: Обработка PDF файлов
            await this.testPDFProcessing(zip);

            // Тест 4: Обработка изображений
            await this.testImageProcessing(zip);

            // Тест 5: Обработка других файлов
            await this.testOtherFileTypes(zip);

            // Тест 6: Целостность архива
            await this.testArchiveIntegrity(zip);

            // Итоги
            console.log('\n=== РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ ===');
            console.log(`Всего тестов: ${this.totalTests}`);
            console.log(`Пройдено: ${this.testsPassed}`);
            console.log(`Провалено: ${this.testsFailed}`);
            console.log(`Процент успеха: ${((this.testsPassed / this.totalTests) * 100).toFixed(1)}%`);

            if (this.testsFailed === 0) {
                console.log('🎉 Все тесты пройдены успешно!');
            } else {
                console.log('⚠️ Некоторые тесты не пройдены');
            }

        } catch (error) {
            console.error('Критическая ошибка при тестировании:', error);
            console.error('Stack trace:', error.stack);
        }
    }

    async testManifestParsing(zip) {
        console.log('\n--- ТЕСТ 1: ПАРСИНГ МАНИФЕСТА ---');
        
        try {
            const manifestFile = zip.file('manifest.txt');
            if (!manifestFile) {
                this.logTest('Наличие манифеста', false, '- файл не найден');
                return;
            }

            const manifestText = await manifestFile.async('text');
            console.log('Манифест найден и прочитан:');
            console.log('------------------------');
            console.log(manifestText);
            console.log('------------------------');

            // Парсинг манифеста - новый формат с | разделителями
            const lines = manifestText.split('\n')
                .map(line => line.replace(/\r$/, ''))
                .filter(line => line.trim() !== '');
            
            const items = [];
            for (const line of lines) {
                const parts = line.split(' | ');
                if (parts.length >= 3) {
                    let filename = parts[0].trim();
                    let type = parts[1].trim();
                    let title = parts[2].trim();
                    let description = parts.length > 3 ? parts[3].trim() : '';
                    let date = parts.length > 4 ? parts[4].trim() : '';
                    let keywords = parts.length > 5 ? parts[5].trim() : '';
                    
                    if (filename.includes('|')) {
                        const filenameParts = filename.split('|');
                        filename = filenameParts[0].trim();
                        if (filenameParts.length > 1) {
                            type = filenameParts[1].trim() + (type ? ' ' + type : '');
                        }
                    }
                    
                    items.push({ 
                        filename, type, title, description, date, 
                        tags: keywords ? keywords.split(',').map(tag => tag.trim()) : []
                    });
                }
            }

            this.logTest('Парсинг манифеста', items.length > 0, `- найдено ${items.length} элементов`);
            
            if (items.length > 0) {
                console.log('Найденные элементы:');
                items.forEach((item, index) => {
                    console.log(`${index + 1}. ${item.filename} (${item.type}) - ${item.title}`);
                });
            }

        } catch (error) {
            this.logTest('Парсинг манифеста', false, `- ошибка: ${error.message}`);
        }
    }

    async testArchiveValidation(zip) {
        console.log('\n--- ТЕСТ 2: ВАЛИДАЦИЯ АРХИВА ---');
        
        try {
            // Сначала парсим манифест для получения элементов архива
            const manifestFile = zip.file('manifest.txt');
            if (!manifestFile) {
                this.logTest('Валидация архива', false, '- манифест не найден');
                return;
            }

            const manifestText = await manifestFile.async('text');
            const validator = new ArchiveValidator(null); // передаем null как parent для теста
            const { items, errors } = validator.parseManifest(manifestText);
            
            // Теперь вызываем валидацию с элементами архива
            validator.validateArchive(items);
            
            this.logTest('Валидация архива', errors.length === 0, 
                errors.length > 0 ? `- ошибки манифеста: ${errors.length}` : '');
            
            if (errors.length > 0) {
                console.log('Ошибки валидации:');
                errors.forEach(error => {
                    console.log(`- Строка ${error.lineNumber}: ${error.error}`);
                });
            }

        } catch (error) {
            this.logTest('Валидация архива', false, `- ошибка: ${error.message}`);
        }
    }

    async testPDFProcessing(zip) {
        console.log('\n--- ТЕСТ 3: ОБРАБОТКА PDF ФАЙЛОВ ---');
        
        try {
            // Находим PDF файлы в архиве
            const pdfFiles = Object.keys(zip.files).filter(filename => 
                filename.toLowerCase().endsWith('.pdf')
            );

            this.logTest('Наличие PDF файлов', pdfFiles.length > 0, `- найдено ${pdfFiles.length}`);
            
            if (pdfFiles.length > 0) {
                console.log('PDF файлы в архиве:');
                for (const pdfFile of pdfFiles) {
                    console.log(`- ${pdfFile}`);
                    
                    try {
                        const file = zip.file(pdfFile);
                        const arrayBuffer = await file.async('arraybuffer');
                        
                        // Извлекаем метаданные и ключевые слова из PDF
                        const metadata = await PDFService.extractMetadata(arrayBuffer);
                        const keywords = await PDFService.extractKeywords(arrayBuffer);
                        const normalizedMetadata = await PDFService.getNormalizedMetadata(arrayBuffer);
                        
                        this.logTest(`Загрузка PDF: ${pdfFile}`, true);
                        
                        console.log(`  - Наличие метаданных: ${!!metadata}`);
                        console.log(`  - Ключевые слова: ${keywords.length > 0 ? keywords.join(', ') : 'не найдены'}`);
                        console.log(`  - Нормализованные метаданные: ${normalizedMetadata.hasKeywords ? 'найдены' : 'отсутствуют'}`);
                        
                        // Тест извлечения ключевых слов
                        this.logTest(`Извлечение ключевых слов: ${pdfFile}`, true, 
                            keywords.length > 0 ? ` - найдено ${keywords.length} ключевых слов` : ' - ключевые слова отсутствуют');
                        
                        // Тест нормализованных метаданных
                        this.logTest(`Нормализация метаданных: ${pdfFile}`, true, 
                            normalizedMetadata.hasKeywords ? ' - ключевые слова извлечены' : ' - ключевые слова отсутствуют');
                        
                        if (metadata && metadata.info) {
                            console.log(`  - Заголовок: ${metadata.info.Title || 'не найден'}`);
                            console.log(`  - Автор: ${metadata.info.Author || 'не найден'}`);
                            console.log(`  - Тема: ${metadata.info.Subject || 'не найдена'}`);
                            console.log(`  - Ключевые слова: ${metadata.info.Keywords || 'не найдены'}`);
                        }

                    } catch (error) {
                        this.logTest(`Обработка PDF: ${pdfFile}`, false, `- ошибка: ${error.message}`);
                    }
                }
            }

        } catch (error) {
            this.logTest('Обработка PDF файлов', false, `- ошибка: ${error.message}`);
        }
    }

    async testImageProcessing(zip) {
        console.log('\n--- ТЕСТ 4: ОБРАБОТКА ИЗОБРАЖЕНИЙ ---');
        
        try {
            // Находим изображения в архиве
            const imageFiles = Object.keys(zip.files).filter(filename => {
                const ext = filename.toLowerCase().split('.').pop();
                return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext);
            });

            this.logTest('Наличие изображений', imageFiles.length > 0, `- найдено ${imageFiles.length}`);
            
            if (imageFiles.length > 0) {
                console.log('Изображения в архиве:');
                for (const imageFile of imageFiles) {
                    console.log(`- ${imageFile}`);
                    
                    try {
                        const file = zip.file(imageFile);
                        const uint8Array = await file.async('uint8array');
                        
                        // Извлекаем метаданные
                        const metadata = await ImageService.extractMetadata(uint8Array);
                        const hasMetadata = ImageService.hasMetadata(metadata);
                        const displayMetadata = ImageService.getDisplayMetadata(metadata);
                        
                        this.logTest(`Извлечение метаданных: ${imageFile}`, true, 
                            hasMetadata ? ' - метаданные найдены' : ' - метаданные отсутствуют');
                        
                        console.log(`  - Наличие метаданных: ${hasMetadata}`);
                        console.log(`  - Заголовок: ${displayMetadata.title || 'не найден'}`);
                        console.log(`  - Описание: ${displayMetadata.description || 'не найдено'}`);
                        console.log(`  - Ключевые слова: ${displayMetadata.keywords ? displayMetadata.keywords.join(', ') : 'не найдены'}`);
                        
                        if (metadata && metadata.raw) {
                            console.log(`  - Блоки метаданных: ${Object.keys(metadata.raw).join(', ')}`);
                        }

                    } catch (error) {
                        this.logTest(`Извлечение метаданных: ${imageFile}`, false, `- ошибка: ${error.message}`);
                    }
                }
            }

        } catch (error) {
            this.logTest('Обработка изображений', false, `- ошибка: ${error.message}`);
        }
    }

    async testOtherFileTypes(zip) {
        console.log('\n--- ТЕСТ 5: ОБРАБОТКА ДРУГИХ ТИПОВ ФАЙЛОВ ---');
        
        try {
            const otherFiles = Object.keys(zip.files).filter(filename => {
                const ext = filename.toLowerCase().split('.').pop();
                return !['pdf', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'txt', 'manifest'].includes(ext);
            });

            this.logTest('Наличие других файлов', otherFiles.length > 0, `- найдено ${otherFiles.length}`);
            
            if (otherFiles.length > 0) {
                console.log('Другие файлы в архиве:');
                for (const file of otherFiles) {
                    console.log(`- ${file} (${zip.files[file].dir ? 'папка' : 'файл'})`);
                }
            }

        } catch (error) {
            this.logTest('Обработка других файлов', false, `- ошибка: ${error.message}`);
        }
    }

    async testArchiveIntegrity(zip) {
        console.log('\n--- ТЕСТ 6: ЦЕЛОСТНОСТЬ АРХИВА ---');
        
        try {
            // Проверяем что все файлы можно прочитать
            const allFiles = Object.keys(zip.files);
            let filesReadSuccessfully = 0;
            let filesFailed = 0;

            for (const filename of allFiles) {
                if (!zip.files[filename].dir) { // Пропускаем папки
                    try {
                        const file = zip.file(filename);
                        const content = await file.async('uint8array');
                        filesReadSuccessfully++;
                    } catch (error) {
                        filesFailed++;
                        console.log(`  - Ошибка чтения ${filename}: ${error.message}`);
                    }
                }
            }

            const successRate = (filesReadSuccessfully / (filesReadSuccessfully + filesFailed)) * 100;
            this.logTest('Целостность архива', filesFailed === 0, 
                `- успешно: ${filesReadSuccessfully}, ошибки: ${filesFailed}, успех: ${successRate.toFixed(1)}%`);

        } catch (error) {
            this.logTest('Целостность архива', false, `- ошибка: ${error.message}`);
        }
    }
}

// Запуск теста
const test = new ComprehensiveTest();
test.run().then(() => {
    console.log('\n=== ТЕСТИРОВАНИЕ ЗАВЕРШЕНО ===');
}).catch((error) => {
    console.error('Тестирование завершено с ошибкой:', error);
});
