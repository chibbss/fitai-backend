import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "@/constants/theme";
import { logger } from './logger';

const ACCENT_COLOR_KEY = '@fitai_accent_color';
const DEFAULT_ACCENT_COLOR = colors.primary; // Match login/signup button color

export type AccentColor = {
    name: string;
    value: string;
};


export const ACCENT_COLORS: AccentColor[] = [
    { name: 'Default', value: colors.primary },
    { name: 'Green', value: '#16a34a' },
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Purple', value: '#a855f7' },
    { name: 'Red', value: '#ef4444' },
    { name: 'Orange', value: '#f97316' },
    { name: 'Pink', value: '#ec4899' },
    { name: 'Yellow', value: '#eab308' },
    { name: 'Teal', value: '#14b8a6' },
];

export const getAccentColor = async (): Promise<string> => {
    try {
        const color = await AsyncStorage.getItem(ACCENT_COLOR_KEY);
        return color || DEFAULT_ACCENT_COLOR;
    } catch (error) {
        logger.error('Error getting accent color:', error);
        return DEFAULT_ACCENT_COLOR;
    }
};

export const setAccentColor = async (color: string): Promise<void> => {
    try {
        await AsyncStorage.setItem(ACCENT_COLOR_KEY, color);
    } catch (error) {
        logger.error('Error setting accent color:', error);
    }
};

export const getAccentColorName = (colorValue: string): string => {
    const color = ACCENT_COLORS.find(c => c.value === colorValue);
    return color?.name || 'Green';
};

// Helper function to generate gradient colors from a base color
export const getGradientColors = (baseColor: string): [string, string] => {
    // Convert hex to RGB
    const hex = baseColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    // Create a lighter and darker variant for gradient
    const lighten = (val: number, factor: number) => Math.min(255, Math.round(val + (255 - val) * factor));
    const darken = (val: number, factor: number) => Math.max(0, Math.round(val * (1 - factor)));
    
    // Generate lighter color (start of gradient)
    const lightR = lighten(r, 0.3);
    const lightG = lighten(g, 0.3);
    const lightB = lighten(b, 0.3);
    
    // Generate darker color (end of gradient)
    const darkR = darken(r, 0.2);
    const darkG = darken(g, 0.2);
    const darkB = darken(b, 0.2);
    
    const lightColor = `#${lightR.toString(16).padStart(2, '0')}${lightG.toString(16).padStart(2, '0')}${lightB.toString(16).padStart(2, '0')}`;
    const darkColor = `#${darkR.toString(16).padStart(2, '0')}${darkG.toString(16).padStart(2, '0')}${darkB.toString(16).padStart(2, '0')}`;
    
    return [lightColor, darkColor];
};