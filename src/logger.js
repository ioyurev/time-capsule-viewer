// Структурированная система логирования для цифровой капсулы времени
export class Logger {
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
        try {
            const savedLevel = localStorage.getItem('logLevel');
            if (savedLevel && Logger.LOG_LEVELS.hasOwnProperty(savedLevel.toUpperCase())) {
                return Logger.LOG_LEVELS[savedLevel.toUpperCase()];
            }
        } catch (error) {
            // localStorage недоступен или другая ошибка
            console.warn('localStorage not available, using default log level');
        }
        return Logger.LOG_LEVELS.DEBUG; // По умолчанию теперь DEBUG
    }

    // Установка уровня логирования
    setLogLevel(level) {
        if (typeof level === 'string') {
            level = Logger.LOG_LEVELS[level.toUpperCase()];
        }
        if (level !== undefined) {
            this.logLevel = level;
            // Проверяем доступность localStorage перед использованием
            if (typeof localStorage !== 'undefined') {
                try {
                    localStorage.setItem('logLevel', Object.keys(Logger.LOG_LEVELS).find(key => Logger.LOG_LEVELS[key] === level));
                } catch (error) {
                    console.warn('localStorage not available for setting log level:', error);
                }
            }
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
        try {
            this.log(Logger.LOG_LEVELS.ERROR, message, context);
        } catch (e) {
            console.error('Ошибка при логировании:', e);
            console.error('Сообщение:', message, 'Контекст:', context);
        }
    }

    warn(message, context = {}) {
        try {
            this.log(Logger.LOG_LEVELS.WARN, message, context);
        } catch (e) {
            console.warn('Ошибка при логировании:', e);
            console.warn('Сообщение:', message, 'Контекст:', context);
        }
    }

    info(message, context = {}) {
        try {
            this.log(Logger.LOG_LEVELS.INFO, message, context);
        } catch (e) {
            console.info('Ошибка при логировании:', e);
            console.info('Сообщение:', message, 'Контекст:', context);
        }
    }

    debug(message, context = {}) {
        try {
            this.log(Logger.LOG_LEVELS.DEBUG, message, context);
        } catch (e) {
            console.log('Ошибка при логировании:', e);
            console.log('Сообщение:', message, 'Контекст:', context);
        }
    }

    trace(message, context = {}) {
        try {
            this.log(Logger.LOG_LEVELS.TRACE, message, context);
        } catch (e) {
            console.log('Ошибка при логировании:', e);
            console.log('Сообщение:', message, 'Контекст:', context);
        }
    }

    // Управление стеком операций
    pushOperation(operationName, context = {}) {
        try {
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
        } catch (e) {
            console.error('Ошибка при начале операции:', e);
            console.error('Название операции:', operationName, 'Контекст:', context);
            return null;
        }
    }

    popOperation() {
        try {
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
            return null;
        } catch (e) {
            console.error('Ошибка при завершении операции:', e);
            return null;
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
        try {
            this.error(`Ошибка: ${error.message || error}`, {
                ...context,
                stack: error.stack,
                name: error.name,
                fileName: error.fileName,
                lineNumber: error.lineNumber
            });
        } catch (e) {
            console.error('Критическая ошибка при логировании ошибки:', e);
            console.error('Оригинальная ошибка:', error);
            console.error('Контекст:', context);
        }
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
export const logger = new Logger();

// Добавление логгера в глобальный объект window для отладки (только в браузере)
if (typeof window !== 'undefined') {
    window.logger = logger;
}
