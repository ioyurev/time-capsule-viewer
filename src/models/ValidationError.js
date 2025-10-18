/**
 * Модель ошибки валидации
 */
export class ValidationError {
    /**
     * Создает экземпляр ошибки валидации
     * @param {Object} config - Конфигурация ошибки
     * @param {number} config.lineNumber - Номер строки с ошибкой
     * @param {string} config.line - Содержимое строки
     * @param {string} config.error - Описание ошибки
     * @param {string} config.expectedFormat - Ожидаемый формат
     * @param {Array} [config.problematicParts] - Проблемные части строки
     */
    constructor(config = {}) {
        this.lineNumber = config.lineNumber || 1;
        this.line = config.line || '';
        this.error = config.error || '';
        this.expectedFormat = config.expectedFormat || '';
        this.problematicParts = Array.isArray(config.problematicParts) ? config.problematicParts : [];
        this.timestamp = new Date().toISOString();
    }

    /**
     * Проверяет, является ли ошибка критической
     * @returns {boolean} Является ли ошибка критической
     */
    isCritical() {
        return this.error.toLowerCase().includes('не найден') || 
               this.error.toLowerCase().includes('обязательен');
    }

    /**
     * Проверяет, связана ли ошибка с форматом
     * @returns {boolean} Связана ли ошибка с форматом
     */
    isFormatError() {
        return this.error.toLowerCase().includes('формат') ||
               this.error.toLowerCase().includes('разделител');
    }

    /**
     * Проверяет, связана ли ошибка с датой
     * @returns {boolean} Связана ли ошибка с датой
     */
    isDateError() {
        return this.error.toLowerCase().includes('дата') ||
               this.error.toLowerCase().includes('date');
    }

    /**
     * Проверяет, связана ли ошибка с тегами
     * @returns {boolean} Связана ли ошибка с тегами
     */
    isTagError() {
        return this.error.toLowerCase().includes('тег') ||
               this.error.toLowerCase().includes('tag');
    }

    /**
     * Проверяет, связана ли ошибка с типом файла
     * @returns {boolean} Связана ли ошибка с типом файла
     */
    isTypeError() {
        return this.error.toLowerCase().includes('тип') ||
               this.error.toLowerCase().includes('type');
    }

    /**
     * Проверяет, связана ли ошибка с именем файла
     * @returns {boolean} Связана ли ошибка с именем файла
     */
    isFilenameError() {
        return this.error.toLowerCase().includes('файл') ||
               this.error.toLowerCase().includes('filename');
    }

    /**
     * Получает уровень серьезности ошибки
     * @returns {'error'|'warning'|'info'} Уровень серьезности
     */
    getSeverity() {
        if (this.isCritical()) return 'error';
        if (this.isFormatError()) return 'warning';
        return 'warning';
    }

    /**
     * Получает краткое описание ошибки
     * @returns {string} Краткое описание
     */
    getSummary() {
        return `Строка ${this.lineNumber}: ${this.error}`;
    }

    /**
     * Получает детальное описание ошибки
     * @returns {string} Детальное описание
     */
    getDetails() {
        return {
            lineNumber: this.lineNumber,
            line: this.line,
            error: this.error,
            expectedFormat: this.expectedFormat,
            problematicParts: this.problematicParts,
            severity: this.getSeverity(),
            timestamp: this.timestamp
        };
    }

    /**
     * Проверяет, содержит ли строка проблемные части
     * @returns {boolean} Содержит ли строка проблемные части
     */
    hasProblematicParts() {
        return this.problematicParts.length > 0;
    }

    /**
     * Получает количество проблемных частей
     * @returns {number} Количество проблемных частей
     */
    getProblematicPartsCount() {
        return this.problematicParts.length;
    }

    /**
     * Проверяет, есть ли пустые поля в проблемных частях
     * @returns {boolean} Есть ли пустые поля
     */
    hasEmptyFields() {
        return this.problematicParts.some(part => part.isEmpty);
    }

    /**
     * Проверяет, есть ли проблемные поля в проблемных частях
     * @returns {boolean} Есть ли проблемные поля
     */
    hasProblematicFields() {
        return this.problematicParts.some(part => part.isProblematic);
    }

    /**
     * Получает список проблемных полей
     * @returns {Array} Список проблемных полей
     */
    getProblematicFields() {
        return this.problematicParts.filter(part => part.isProblematic);
    }

    /**
     * Получает список пустых полей
     * @returns {Array} Список пустых полей
     */
    getEmptyFields() {
        return this.problematicParts.filter(part => part.isEmpty);
    }

    /**
     * Преобразует ошибку в объект для JSON
     * @returns {Object} Объект ошибки
     */
    toJSON() {
        return {
            lineNumber: this.lineNumber,
            line: this.line,
            error: this.error,
            expectedFormat: this.expectedFormat,
            problematicParts: [...this.problematicParts],
            timestamp: this.timestamp,
            severity: this.getSeverity()
        };
    }

    /**
     * Создает ошибку из объекта
     * @param {Object} obj - Объект для создания ошибки
     * @returns {ValidationError} Экземпляр ValidationError
     */
    static fromObject(obj) {
        return new ValidationError(obj);
    }

    /**
     * Создает ошибку для отсутствующего файла
     * @param {string} filename - Имя отсутствующего файла
     * @param {number} lineNumber - Номер строки
     * @returns {ValidationError} Ошибка валидации
     */
    static createMissingFileError(filename, lineNumber = 1) {
        return new ValidationError({
            lineNumber,
            line: filename,
            error: `Файл ${filename} не найден в архиве`,
            expectedFormat: 'Файл должен существовать в архиве',
            problematicParts: [{
                index: 0,
                part: filename,
                field: 'filename',
                isEmpty: false,
                isProblematic: true,
                expected: true
            }]
        });
    }

    /**
     * Создает ошибку для недопустимого формата даты
     * @param {string} dateValue - Значение даты
     * @param {number} lineNumber - Номер строки
     * @returns {ValidationError} Ошибка валидации
     */
    static createInvalidDateError(dateValue, lineNumber = 1) {
        return new ValidationError({
            lineNumber,
            line: dateValue,
            error: `Недопустимый формат даты: ${dateValue}`,
            expectedFormat: 'YYYY-MM-DD, YYYY/MM/DD, DD.MM.YYYY, YYYY-MM-DD HH:MM:SS или D:YYYYMMDDHHMMSS',
            problematicParts: [{
                index: 0,
                part: dateValue,
                field: 'date',
                isEmpty: false,
                isProblematic: true,
                expected: true
            }]
        });
    }

    /**
     * Создает ошибку для недопустимого типа файла
     * @param {string} typeValue - Значение типа
     * @param {number} lineNumber - Номер строки
     * @returns {ValidationError} Ошибка валидации
     */
    static createInvalidTypeError(typeValue, lineNumber = 1) {
        return new ValidationError({
            lineNumber,
            line: typeValue,
            error: `Недопустимый тип файла: ${typeValue}`,
            expectedFormat: 'Допустимые типы: НОВОСТЬ, МЕДИА, МЕМ, ФОТО, ВИДЕО, АУДИО, ДОКУМЕНТ, ТЕКСТ, КАРТИНКА, СЫЛКА, СОБЫТИЕ, ЛИЧНОЕ, ОБУЧЕНИЕ, РАБОТА, ХОББИ',
            problematicParts: [{
                index: 0,
                part: typeValue,
                field: 'type',
                isEmpty: false,
                isProblematic: true,
                expected: true
            }]
        });
    }

    /**
     * Создает ошибку для недопустимого количества тегов
     * @param {number} tagCount - Количество тегов
     * @param {number} minRequired - Минимально требуемое количество
     * @param {number} lineNumber - Номер строки
     * @returns {ValidationError} Ошибка валидации
     */
    static createInsufficientTagsError(tagCount, minRequired, lineNumber = 1) {
        return new ValidationError({
            lineNumber,
            line: `тегов: ${tagCount}`,
            error: `Недостаточно тегов: ${tagCount}, требуется минимум ${minRequired}`,
            expectedFormat: `Минимум ${minRequired} тегов`,
            problematicParts: [{
                index: 0,
                part: tagCount.toString(),
                field: 'tags',
                isEmpty: false,
                isProblematic: true,
                expected: true
            }]
        });
    }

    /**
     * Создает ошибку для недопустимого формата разделителей
     * @param {string} line - Исходная строка
     * @param {number} lineNumber - Номер строки
     * @returns {ValidationError} Ошибка валидации
     */
    static createInvalidSeparatorError(line, lineNumber = 1) {
        return new ValidationError({
            lineNumber,
            line: line,
            error: 'Неправильный формат разделителей. Используйте формат: "поле1 | поле2 | поле3" (с пробелами)',
            expectedFormat: 'filename | type | title | description | date | tags (с пробелами вокруг |)',
            problematicParts: [{
                index: 0,
                part: line,
                field: 'format',
                isEmpty: false,
                isProblematic: true,
                expected: true
            }]
        });
    }
}
