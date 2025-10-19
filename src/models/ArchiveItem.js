/**
 * Модель элемента архива
 */
export class ArchiveItem {
    /**
     * Создает экземпляр элемента архива
     * @param {Object} config - Конфигурация элемента
     * @param {string} config.filename - Имя файла в архиве
     * @param {string} config.type - Тип файла
     * @param {string} config.title - Заголовок
     * @param {string} config.description - Описание
     * @param {string} config.date - Дата
     * @param {string[]} config.tags - Теги
     * @param {string} config.author - Автор (для типа КАПСУЛА)
     */
    constructor(config = {}) {
        this.filename = config.filename || '';
        this.type = config.type || '';
        this.title = config.title || '';
        this.description = config.description || '';
        this.date = config.date || '';
        this.tags = Array.isArray(config.tags) ? config.tags : [];
        this.author = config.author || ''; // Добавляем поле author для типа КАПСУЛА
        
        // Валидация при создании
        this.validate();
    }

    /**
     * Валидирует элемент архива
     * @returns {Object} Результат валидации
     */
    validate() {
        const errors = [];

        if (!this.filename) {
            errors.push('Имя файла обязательно');
        }

        if (!this.type) {
            errors.push('Тип файла обязателен');
        }

        if (!this.date) {
            errors.push('Дата обязательна');
        }

        if (!Array.isArray(this.tags)) {
            errors.push('Теги должны быть массивом');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Проверяет, является ли элемент новостью
     * @returns {boolean} Является ли элемент новостью
     */
    isNews() {
        return this.type.toUpperCase() === 'НОВОСТЬ';
    }

    /**
     * Проверяет, является ли элемент медиафайлом
     * @returns {boolean} Является ли элемент медиафайлом
     */
    isMedia() {
        return this.type.toUpperCase() === 'МЕДИА';
    }

    /**
     * Проверяет, является ли элемент личным файлом
     * @returns {boolean} Является ли элемент личным файлом
     */
    isPersonal() {
        return this.type.toUpperCase() === 'ЛИЧНОЕ';
    }

    /**
     * Проверяет, является ли элемент мемом
     * @returns {boolean} Является ли элемент мемом
     */
    isMeme() {
        return this.type.toUpperCase() === 'МЕМ';
    }

    /**
     * Проверяет, является ли элемент PDF файлом
     * @returns {boolean} Является ли файл PDF
     */
    isPdf() {
        return this.filename.toLowerCase().endsWith('.pdf');
    }

    /**
     * Проверяет, является ли элемент изображением
     * @returns {boolean} Является ли файл изображением
     */
    isImage() {
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg'];
        return imageExtensions.some(ext => this.filename.toLowerCase().endsWith(ext));
    }

    /**
     * Проверяет, является ли элемент аудио
     * @returns {boolean} Является ли файл аудио
     */
    isAudio() {
        const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
        return audioExtensions.some(ext => this.filename.toLowerCase().endsWith(ext));
    }

    /**
     * Проверяет, является ли элемент видео
     * @returns {boolean} Является ли файл видео
     */
    isVideo() {
        const videoExtensions = ['.mp4', '.webm', '.avi', '.mov', '.wmv', '.flv'];
        return videoExtensions.some(ext => this.filename.toLowerCase().endsWith(ext));
    }

    /**
     * Проверяет, является ли элемент описанием капсулы
     * @returns {boolean} Является ли элемент описанием капсулы
     */
    isCapsule() {
        return this.type.toUpperCase() === 'КАПСУЛА';
    }

    /**
     * Проверяет, является ли элемент текстовым файлом
     * @returns {boolean} Является ли файл текстовым
     */
    isText() {
        return this.filename.toLowerCase().endsWith('.txt');
    }

    /**
     * Проверяет, является ли элемент CSV файлом
     * @returns {boolean} Является ли файл CSV
     */
    isCsv() {
        return this.filename.toLowerCase().endsWith('.csv');
    }

    /**
     * Получает расширение файла
     * @returns {string} Расширение файла
     */
    getFileExtension() {
        const parts = this.filename.split('.');
        return parts.length > 1 ? '.' + parts.pop().toLowerCase() : '';
    }

    /**
     * Проверяет, достаточно ли тегов
     * @param {number} minCount - Минимальное количество тегов
     * @returns {boolean} Достаточно ли тегов
     */
    hasMinimumTags(minCount = 5) {
        return this.tags.length >= minCount;
    }

    /**
     * Получает количество тегов
     * @returns {number} Количество тегов
     */
    getTagCount() {
        return this.tags.length;
    }

    /**
     * Добавляет тег
     * @param {string} tag - Тег для добавления
     */
    addTag(tag) {
        if (typeof tag === 'string' && !this.tags.includes(tag.trim())) {
            this.tags.push(tag.trim());
        }
    }

    /**
     * Удаляет тег
     * @param {string} tag - Тег для удаления
     */
    removeTag(tag) {
        this.tags = this.tags.filter(t => t !== tag);
    }

    /**
     * Проверяет наличие тега
     * @param {string} tag - Тег для проверки
     * @returns {boolean} Содержит ли элемент тег
     */
    hasTag(tag) {
        return this.tags.includes(tag);
    }

    /**
     * Получает эмодзи для типа элемента
     * @returns {string} Эмодзи для типа
     */
    getTypeEmoji() {
        const typeMap = {
            'НОВОСТЬ': '📰',
            'МЕДИА': '🎬',
            'МЕМ': '😂',
            'ФОТО': '📸',
            'ВИДЕО': '🎥',
            'АУДИО': '🎵',
            'ДОКУМЕНТ': '📄',
            'ТЕКСТ': '📝',
            'КАРТИНКА': '🖼️',
            'СЫЛКА': '🔗',
            'СОБЫТИЕ': '📅',
            'ЛИЧНОЕ': '👤',
            'ОБУЧЕНИЕ': '📚',
            'РАБОТА': '💼',
            'ХОББИ': '🎨'
        };
        return typeMap[this.type.toUpperCase()] || '📁';
    }

    /**
     * Преобразует элемент в объект для JSON
     * @returns {Object} Объект элемента
     */
    toJSON() {
        return {
            filename: this.filename,
            type: this.type,
            title: this.title,
            description: this.description,
            date: this.date,
            tags: [...this.tags],
            author: this.author // Добавляем author в JSON
        };
    }

    /**
     * Создает элемент из объекта
     * @param {Object} obj - Объект для создания элемента
     * @returns {ArchiveItem} Экземпляр ArchiveItem
     */
    static fromObject(obj) {
        return new ArchiveItem(obj);
    }

    /**
     * Создает элемент из строки манифеста
     * @param {string} line - Строка манифеста
     * @returns {ArchiveItem} Экземпляр ArchiveItem
     */
    static fromManifestLine(line) {
        const parts = line.split('|').map(part => part.trim());
        
        if (parts.length < 4) {
            throw new Error('Недостаточно полей в строке манифеста');
        }

        const filename = parts[0];
        const type = parts[1];
        const isPdf = filename.toLowerCase().endsWith('.pdf');
        const isCapsule = type.toUpperCase() === 'КАПСУЛА';
        
        let title, description, date, tags, author;
        
        if (isCapsule && parts.length === 4) {
            // Формат КАПСУЛА: имя файла | КАПСУЛА | автор | дата
            author = parts[2];
            date = parts[3];
            title = '';
            description = '';
            tags = [];
        } else if (isPdf && parts.length === 4) {
            // Формат PDF: имя файла | тип | дата | теги
            date = parts[2];
            tags = parts[3].split(',').map(tag => tag.trim());
            title = '';
            description = '';
        } else if (parts.length >= 6) {
            // Формат: имя файла | тип | заголовок | описание | дата | теги
            title = parts[2];
            description = parts[3];
            date = parts[4];
            tags = parts[5].split(',').map(tag => tag.trim());
        } else {
            throw new Error('Некорректный формат строки манифеста');
        }

        return new ArchiveItem({
            filename,
            type,
            title,
            description,
            date,
            tags,
            author // Добавляем author для КАПСУЛА
        });
    }
}
