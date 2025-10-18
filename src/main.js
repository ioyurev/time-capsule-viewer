// Конфигурация PDF.js для CDN версии
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// Импорт основных классов и утилит
import { DigitalTimeCapsule } from './core/DigitalTimeCapsule.js';
import { ArchiveProcessor } from './services/ArchiveProcessor.js';
import { PDFService } from './services/PDFService.js';
import { ZipService } from './services/ZipService.js';
import { CSVService } from './services/CSVService.js';
import { DateUtils } from './utils/dateUtils.js';
import { ValidationUtils } from './utils/validationUtils.js';
import { ArchiveItem } from './models/ArchiveItem.js';
import { ValidationError } from './models/ValidationError.js';

// Глобальная инициализация
window.ArchiveProcessor = ArchiveProcessor;
window.PDFService = PDFService;
window.ZipService = ZipService;
window.CSVService = CSVService;
window.DateUtils = DateUtils;
window.ValidationUtils = ValidationUtils;
window.ArchiveItem = ArchiveItem;
window.ValidationError = ValidationError;

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    new DigitalTimeCapsule();
});

// Экспорт для использования в других модулях при необходимости
export {
    DigitalTimeCapsule,
    ArchiveProcessor,
    PDFService,
    ZipService,
    CSVService,
    DateUtils,
    ValidationUtils,
    ArchiveItem,
    ValidationError
};
