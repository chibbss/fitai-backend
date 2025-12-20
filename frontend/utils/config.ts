import Constants from 'expo-constants';
import { logger } from './logger';

// 🚨 Set to true when backend is unavailable
export const MOCK_MODE = false;

// Production API URL - Render deployment
const RENDER_API_URL = 'https://fitai-api.onrender.com';

export const getApiUrl = (): string => {
    // Check Constants first (from app.config.js)
    const constantsUrl = Constants.expoConfig?.extra?.apiUrl;
    
    if (constantsUrl && constantsUrl !== 'http://192.168.100.142:8000') {
        if (__DEV__) {
            logger.log('✅ Using API URL from Constants:', constantsUrl);
        }
        return constantsUrl.replace(/\/$/, '');
    }
    
    // Fallback to process.env (but filter out old local IP)
    const envUrl = process.env.EXPO_PUBLIC_API_URL;
    if (envUrl && envUrl !== 'http://192.168.100.142:8000') {
        if (__DEV__) {
            logger.warn('⚠️ Using process.env fallback:', envUrl);
        }
        return envUrl.replace(/\/$/, '');
    }
    
    // Final fallback - use Render URL (production)
    if (__DEV__) {
        logger.log('🌐 Using Render API URL (production):', RENDER_API_URL);
    }
    return RENDER_API_URL.replace(/\/$/, ''); 
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