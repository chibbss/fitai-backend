import { AlertType } from '@/components/CustomAlert';

interface AlertButton {
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
}

interface AlertOptions {
    title?: string;
    message: string;
    type?: AlertType;
    buttons?: AlertButton[];
}

// This will be set by the AlertProvider
let alertFunction: ((options: AlertOptions) => void) | null = null;

export const setAlertFunction = (fn: (options: AlertOptions) => void) => {
    alertFunction = fn;
};

export const alert = {
    /**
     * Show a custom alert
     */
    show: (options: AlertOptions) => {
        console.log('[Alert] show called:', options);
        console.log('[Alert] alertFunction exists:', !!alertFunction);
        
        if (alertFunction) {
            try {
                alertFunction(options);
            } catch (error) {
                console.error('[Alert] Error calling alertFunction:', error);
                // Fallback to native alert
                const { Alert } = require('react-native');
                Alert.alert(options.title || '', options.message, options.buttons);
            }
        } else {
            console.warn('[Alert] alertFunction not set, falling back to native Alert');
            // Fallback to native alert if provider not initialized
            const { Alert } = require('react-native');
            Alert.alert(options.title || '', options.message, options.buttons);
        }
    },

    /**
     * Show success alert
     */
    success: (message: string, title?: string) => {
        alert.show({ message, title, type: 'success' });
    },

    /**
     * Show error alert
     */
    error: (message: string, title?: string) => {
        alert.show({ message, title, type: 'error' });
    },

    /**
     * Show warning alert
     */
    warning: (message: string, title?: string) => {
        alert.show({ message, title, type: 'warning' });
    },

    /**
     * Show info alert
     */
    info: (message: string, title?: string) => {
        alert.show({ message, title, type: 'info' });
    },

    /**
     * Show alert with custom buttons (replaces Alert.alert)
     */
    alert: (
        title: string | undefined,
        message: string,
        buttons?: AlertButton[]
    ) => {
        alert.show({ title, message, buttons: buttons || [{ text: 'OK' }] });
    },
};