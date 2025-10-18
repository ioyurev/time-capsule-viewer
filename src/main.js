// Импорт основных классов и утилит
import { DigitalTimeCapsule } from './core/DigitalTimeCapsule.js';

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    new DigitalTimeCapsule();
});

// Экспорт для использования в других модулях при необходимости
export {
    DigitalTimeCapsule
};
