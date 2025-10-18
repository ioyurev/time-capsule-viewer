// Структурированная система логирования для цифровой капсулы времени
class Logger {
    constructor() {
        this.logLevel = this.getLogLevelFromStorage();
        this.enabled = true;
        this.operationStack = [];
        this.performanceMarks = new Map();
    }

    // Уровни логирования
    static LOG_LEVELS = {
        NONE: 0,
        ERROR: 1,
        WARN: 2,
        INFO: 3,
        DEBUG: 4,
        TRACE: 5
    };

    // Получение уровня логирования из localStorage
    getLogLevelFromStorage() {
        const savedLevel = localStorage.getItem('logLevel');
        if (savedLevel && Logger.LOG_LEVELS.hasOwnProperty(savedLevel.toUpperCase())) {
            return Logger.LOG_LEVELS[savedLevel.toUpperCase()];
        }
        return Logger.LOG_LEVELS.INFO; // По умолчанию
    }

    // Установка уровня логирования
    setLogLevel(level) {
        if (typeof level === 'string') {
            level = Logger.LOG_LEVELS[level.toUpperCase()];
        }
        if (level !== undefined) {
            this.logLevel = level;
            localStorage.setItem('logLevel', Object.keys(Logger.LOG_LEVELS).find(key => Logger.LOG_LEVELS[key] === level));
        }
    }

    // Проверка, должен ли лог быть записан
    shouldLog(level) {
        return this.enabled && level <= this.logLevel;
    }

    // Создание структурированного лога
    log(level, message, context = {}) {
        if (!this.shouldLog(level)) return;

        const timestamp = new Date().toISOString();
        const operationId = this.getCurrentOperationId();
        const logEntry = {
            timestamp,
            level: Object.keys(Logger.LOG_LEVELS).find(key => Logger.LOG_LEVELS[key] === level),
            message,
            operationId,
            context: {
                ...context,
                userAgent: navigator.userAgent,
                url: window.location.href
            }
        };

        // Вывод в консоль с цветами для разных уровней
        this.outputToConsole(logEntry);
    }

    // Вывод в консоль с цветами
    outputToConsole(logEntry) {
        const { level, timestamp, message, context } = logEntry;
        const formattedMessage = `[${timestamp}] ${level} - ${message}`;

        switch (level) {
            case 'ERROR':
                console.error('%c' + formattedMessage, 'color: #d32f2f; font-weight: bold', context);
                break;
            case 'WARN':
                console.warn('%c' + formattedMessage, 'color: #ff9800; font-weight: bold', context);
                break;
            case 'INFO':
                console.info('%c' + formattedMessage, 'color: #2196f3', context);
                break;
            case 'DEBUG':
                console.log('%c' + formattedMessage, 'color: #9e9e9e', context);
                break;
            case 'TRACE':
                console.log('%c' + formattedMessage, 'color: #607d8b', context);
                break;
        }
    }

    // Методы для разных уровней логирования
    error(message, context = {}) {
        this.log(Logger.LOG_LEVELS.ERROR, message, context);
    }

    warn(message, context = {}) {
        this.log(Logger.LOG_LEVELS.WARN, message, context);
    }

    info(message, context = {}) {
        this.log(Logger.LOG_LEVELS.INFO, message, context);
    }

    debug(message, context = {}) {
        this.log(Logger.LOG_LEVELS.DEBUG, message, context);
    }

    trace(message, context = {}) {
        this.log(Logger.LOG_LEVELS.TRACE, message, context);
    }

    // Управление стеком операций
    pushOperation(operationName, context = {}) {
        const operationId = this.generateOperationId();
        const operation = {
            id: operationId,
            name: operationName,
            startTime: Date.now(),
            context
        };
        this.operationStack.push(operation);
        this.debug(`Начало операции: ${operationName}`, { operationId, ...context });
        return operationId;
    }

    popOperation() {
        if (this.operationStack.length > 0) {
            const operation = this.operationStack.pop();
            const duration = Date.now() - operation.startTime;
            this.debug(`Завершение операции: ${operation.name}`, {
                operationId: operation.id,
                duration: `${duration}ms`,
                ...operation.context
            });
            return operation;
        }
    }

    getCurrentOperationId() {
        if (this.operationStack.length > 0) {
            return this.operationStack[this.operationStack.length - 1].id;
        }
        return null;
    }

    generateOperationId() {
        return 'op_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Методы для производительности
    markPerformance(operationName) {
        const markId = `${operationName}_${Date.now()}`;
        this.performanceMarks.set(markId, Date.now());
        this.debug(`Производительность - Метка: ${operationName}`, { markId });
        return markId;
    }

    measurePerformance(markId, operationName) {
        if (this.performanceMarks.has(markId)) {
            const startTime = this.performanceMarks.get(markId);
            const duration = Date.now() - startTime;
            this.performanceMarks.delete(markId);
            this.info(`Производительность - ${operationName}`, { duration: `${duration}ms` });
            return duration;
        }
    }

    // Методы для трассировки пользовательских действий
    trackUserAction(action, context = {}) {
        this.info(`Пользовательское действие: ${action}`, {
            ...context,
            action,
            timestamp: new Date().toISOString()
        });
    }

    // Методы для анализа ошибок
    logError(error, context = {}) {
        this.error(`Ошибка: ${error.message || error}`, {
            ...context,
            stack: error.stack,
            name: error.name,
            fileName: error.fileName,
            lineNumber: error.lineNumber
        });
    }

    // Включение/выключение логирования
    enable() {
        this.enabled = true;
    }

    disable() {
        this.enabled = false;
    }

    // Очистка
    clear() {
        this.operationStack = [];
        this.performanceMarks.clear();
    }

    // Получение статистики логирования
    getStats() {
        return {
            logLevel: Object.keys(Logger.LOG_LEVELS).find(key => Logger.LOG_LEVELS[key] === this.logLevel),
            operationsInStack: this.operationStack.length,
            performanceMarks: this.performanceMarks.size,
            enabled: this.enabled
        };
    }
}

// Глобальный экземпляр логгера
const logger = new Logger();

// Добавление логгера в глобальный объект window для отладки
window.logger = logger;
