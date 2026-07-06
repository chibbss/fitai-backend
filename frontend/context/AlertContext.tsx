import React, { createContext, useContext, useState, useCallback } from 'react';
import CustomAlert, { AlertType } from '@/components/CustomAlert';
import { setAlertFunction } from '@/utils/alert';

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

interface AlertContextType {
    showAlert: (options: AlertOptions) => void;
    hideAlert: () => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const AlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [alert, setAlert] = useState<AlertOptions | null>(null);
    const [visible, setVisible] = useState(false);
    const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

    const showAlert = useCallback((options: AlertOptions) => {
        if (!options.message) {
            console.warn('[AlertProvider] Attempted to show alert with empty message:', options);
            return;
        }

        // Cancel any pending "clear" timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        console.log('[AlertProvider] Showing alert:', options.title || 'No Title', '-', options.message);
        setAlert(options);
        setVisible(true);
    }, []);

    // Set the alert function for the utility
    React.useEffect(() => {
        setAlertFunction(showAlert);
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [showAlert]);

    const hideAlert = useCallback(() => {
        console.log('[AlertProvider] Hiding alert...');
        setVisible(false);

        // Cancel any existing timeout before starting a new one
        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        // Delay clearing the data so the exit animation has content to show
        // Match the animation duration in CustomAlert (currently 200ms) plus a small buffer
        timeoutRef.current = setTimeout(() => {
            setAlert(null);
            timeoutRef.current = null;
        }, 250);
    }, []);

    return (
        <AlertContext.Provider value={{ showAlert, hideAlert }}>
            {children}
            <CustomAlert
                visible={visible}
                title={alert?.title}
                message={alert?.message || ''}
                type={alert?.type}
                buttons={alert?.buttons}
                onDismiss={hideAlert}
            />
        </AlertContext.Provider>
    );
};

export const useAlert = () => {
    const context = useContext(AlertContext);
    if (!context) {
        throw new Error('useAlert must be used within AlertProvider');
    }
    return context;
};