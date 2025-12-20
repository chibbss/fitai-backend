const isDev = __DEV__;

export const perf = {
    start: (label: string) => {
        if (isDev) {
            console.time(`[Perf] ${label}`);
        }
        // Return a function to end the performance measurement
        return () => {
            if (isDev) {
                console.timeEnd(`[Perf] ${label}`);
            }
        };
    },
    end: (label: string) => {
        if (isDev) {
            console.timeEnd(`[Perf] ${label}`);
        }
    },
    mark: (label: string) => {
        if (isDev && performance?.mark) {
            performance.mark(label);
        }
    },
    measure: (name: string, startMark: string, endMark: string) => {
        if (isDev && performance?.measure) {
            performance.measure(name, startMark, endMark);
        }
    },
};
