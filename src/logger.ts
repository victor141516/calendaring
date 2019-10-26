import log4js from 'log4js';

export function getLogger(category: string, level: string = 'debug') {
    const logger = log4js.getLogger(category);
    logger.level = level;
    return logger;
}