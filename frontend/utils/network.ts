import NetInfo from '@react-native-community/netinfo';

export async function isConnected(): Promise<boolean> {
    const state = await NetInfo.fetch();
    return state.isConnected ?? false;
}

export function subscribeToNetworkChanges(callback: (isConnected: boolean) => void) {
    return NetInfo.addEventListener(state => {
        callback(state.isConnected ?? false);
    });
}

/**
 * Check if an error is a network-related error
 */
export function isNetworkError(error: any): boolean {
    if (!error) return false;
    
    // Check if it's a TypeError (usually network-related)
    if (error instanceof TypeError) {
        return true;
    }
    
    // Check error message for network-related keywords
    const errorMessage = error?.message || error?.toString() || '';
    const networkKeywords = [
        'network',
        'fetch',
        'timeout',
        'connection',
        'ECONNREFUSED',
        'ENOTFOUND',
        'ETIMEDOUT',
        'ERR_NETWORK',
        'Failed to fetch',
        'Network request failed',
        'NetworkError',
    ];
    
    const lowerMessage = errorMessage.toLowerCase();
    return networkKeywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()));
}

/**
 * Get a user-friendly network error message
 */
export function getNetworkErrorMessage(error: any, defaultMessage: string = 'Network error. Please check your internet connection and try again.'): string {
    if (!isNetworkError(error)) {
        return defaultMessage;
    }
    
    const errorMessage = error?.message || error?.toString() || '';
    const lowerMessage = errorMessage.toLowerCase();
    
    if (lowerMessage.includes('timeout')) {
        return 'Request timed out. Please check your internet connection and try again.';
    }
    
    if (lowerMessage.includes('failed to fetch') || lowerMessage.includes('network request failed')) {
        return 'Unable to connect to the server. Please check your internet connection.';
    }
    
    if (lowerMessage.includes('econnrefused') || lowerMessage.includes('enotfound')) {
        return 'Cannot reach the server. Please check your internet connection.';
    }
    
    return defaultMessage;
}
