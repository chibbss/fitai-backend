import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { colors } from '@/constants/theme';
import { MOCK_MODE } from '@/utils/config';

interface AuthGuardProps {
    children: React.ReactNode;
}

export const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
    const { isAuthenticated, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        // 🚨 MOCK MODE: Bypass auth check
        if (MOCK_MODE) return;

        if (!isLoading && !isAuthenticated) {
            router.replace('/welcome');
        }
    }, [isAuthenticated, isLoading, router]);

    if (isLoading && !MOCK_MODE) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.deepCharcoal }}>
                <ActivityIndicator size="large" color={colors.white} />
            </View>
        );
    }

    if (!isAuthenticated && !MOCK_MODE) {
        return null;
    }

    return <>{children}</>;
};

