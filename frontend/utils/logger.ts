const isDev = __DEV__;

export const logger = {
    log: (...args: any[]) => {
        if (isDev) {
            console.log('[FitAI]', ...args);
        }
    },
    error: (...args: any[]) => {
        if (isDev) {
            console.error('[FitAI Error]', ...args);
        }
    },
    warn: (...args: any[]) => {
        if (isDev) {
            console.warn('[FitAI Warning]', ...args);
        }
    },
    info: (...args: any[]) => {
        if (isDev) {
            console.info('[FitAI Info]', ...args);
        }
    },
};
