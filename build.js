#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Конфигурация сборки
const config = {
    srcDir: 'src',
    distDir: 'dist',
    publicDir: 'public',
    libDir: 'lib',
    filesToCopy: [
        'index.html',
        'styles.css',
        'src/logger.js'
    ],
    exampleFiles: [
        'example/manifest.txt',
        'example/01_Новость.pdf',
        'example/02_Медиа.mp3',
        'example/03_Мем.png',
        'example/03_Мем_объяснение.txt',
        'example/example.zip',
        'example/example_error.zip'
    ]
};

// Создание директории сборки
function createDistDir() {
    if (!fs.existsSync(config.distDir)) {
        fs.mkdirSync(config.distDir, { recursive: true });
    }
}

// Копирование файлов
function copyFiles() {
    config.filesToCopy.forEach(file => {
        const srcPath = path.join(__dirname, file);
        const destPath = path.join(__dirname, config.distDir, path.basename(file));
        
        if (fs.existsSync(srcPath)) {
            const content = fs.readFileSync(srcPath, 'utf8');
            fs.writeFileSync(destPath, content);
            console.log(`Скопирован файл: ${file}`);
        }
    });
}

// Копирование примеров
function copyExamples() {
    const examplesDistDir = path.join(config.distDir, 'example');
    if (!fs.existsSync(examplesDistDir)) {
        fs.mkdirSync(examplesDistDir, { recursive: true });
    }
    
    config.exampleFiles.forEach(file => {
        const srcPath = path.join(__dirname, file);
        const destPath = path.join(__dirname, config.distDir, file);
        
        if (fs.existsSync(srcPath)) {
            const content = fs.readFileSync(srcPath, 'utf8');
            fs.writeFileSync(destPath, content);
            console.log(`Скопирован пример: ${file}`);
        }
    });
}

// Создание объединенного JS файла
function createBundle() {
    const bundlePath = path.join(config.distDir, 'bundle.js');
    let bundleContent = '';
    
    // Добавляем внешние зависимости
    const libFiles = [
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.0/papaparse.min.js'
    ];
    
    // Добавляем внутренние модули
    const modules = [
        'src/logger.js',
        'src/core/DigitalTimeCapsule.js',
        'src/services/ArchiveProcessor.js',
        'src/services/PDFService.js',
        'src/services/ZipService.js',
        'src/services/CSVService.js',
        'src/utils/dateUtils.js',
        'src/utils/validationUtils.js',
        'src/models/ArchiveItem.js',
        'src/models/ValidationError.js',
        'src/main.js'
    ];
    
    modules.forEach(module => {
        const modulePath = path.join(__dirname, module);
        if (fs.existsSync(modulePath)) {
            let content = fs.readFileSync(modulePath, 'utf8');
            // Убираем export/import для объединения
            content = content.replace(/export\s+class\s+/g, 'class ');
            content = content.replace(/export\s+\{\s*.*?\s*\};?/g, '');
            content = content.replace(/import\s+.*?\s+from\s+.*?[\r\n]/g, '');
            content = content.replace(/export\s+{\s*.*?\s*};?/g, '');
            bundleContent += `\n\n// ${module}\n${content}`;
        }
    });
    
    fs.writeFileSync(bundlePath, bundleContent);
    console.log('Создан объединенный файл: bundle.js');
}

// Обновление HTML для использования бандла
function updateHTML() {
    const htmlPath = path.join(config.distDir, 'index.html');
    if (fs.existsSync(htmlPath)) {
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');
        
        // Заменяем модульный импорт на бандл
        htmlContent = htmlContent.replace(
            /<script type="module" src="src\/main\.js"><\/script>/,
            '<script src="bundle.js"></script>'
        );
        
        fs.writeFileSync(htmlPath, htmlContent);
        console.log('HTML обновлен для использования бандла');
    }
}

// Основная функция сборки
function build() {
    console.log('Начинается сборка проекта...');
    
    createDistDir();
    copyFiles();
    copyExamples();
    createBundle();
    updateHTML();
    
    console.log('Сборка завершена! Результат в папке:', config.distDir);
}

// Запуск сборки
build();
