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
    const [alert, setAlert] = useState<AlertOptions & { visible: boolean } | null>(null);

    const showAlert = useCallback((options: AlertOptions) => {
        setAlert({ ...options, visible: true });
    }, []);

    // Set the alert function for the utility
    React.useEffect(() => {
        setAlertFunction(showAlert);
    }, [showAlert]);

    const hideAlert = useCallback(() => {
        setAlert(null);
    }, []);

    return (
        <AlertContext.Provider value={{ showAlert, hideAlert }}>
            {children}
            {alert && (
                <CustomAlert
                    visible={alert.visible}
                    title={alert.title}
                    message={alert.message}
                    type={alert.type}
                    buttons={alert.buttons || [{ text: 'OK' }]}
                    onDismiss={hideAlert}
                />
            )}
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