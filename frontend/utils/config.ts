import Constants from 'expo-constants';
import { logger } from './logger';

// 🚨 Set to true when backend is unavailable
export const MOCK_MODE = true;

// Fallback API URL - Render deployment
const FALLBACK_API_URL = 'https://fitai-api.onrender.com';

export const getApiUrl = (): string => {
    // Priority 1: Environment Variable (most flexible for cloud builds)
    const envUrl = process.env.EXPO_PUBLIC_API_URL;
    if (envUrl) {
        if (__DEV__) logger.log('✅ Using API URL from process.env:', envUrl);
        return envUrl.replace(/\/$/, '');
    }

    // Priority 2: Constants (from app.config.js extra block)
    const constantsUrl = Constants.expoConfig?.extra?.apiUrl;
    if (constantsUrl) {
        if (__DEV__) logger.log('✅ Using API URL from Constants:', constantsUrl);
        return constantsUrl.replace(/\/$/, '');
    }

    // Final fallback
    if (__DEV__) logger.warn('🌐 Using Fallback API URL:', FALLBACK_API_URL);
    return FALLBACK_API_URL;
};

export const API_URL = getApiUrl();

// Debug log (only in development)
if (__DEV__) {
    logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.log('🌐 API_URL initialized:', API_URL);
    logger.log('🤖 MOCK_MODE:', MOCK_MODE ? 'ENABLED' : 'DISABLED');
    logger.log('📋 Constants.expoConfig?.extra?.apiUrl:', Constants.expoConfig?.extra?.apiUrl);
    logger.log('📋 process.env.EXPO_PUBLIC_API_URL:', process.env.EXPO_PUBLIC_API_URL);
    logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}