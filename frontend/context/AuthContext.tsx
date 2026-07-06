import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { API_URL, MOCK_MODE } from '@/utils/config';
import { User } from '@supabase/supabase-js';

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    signOut: async () => { },
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // 🚨 MOCK MODE: Set dummy user
        if (MOCK_MODE) {
            console.log('🤖 MOCK MODE: Using dummy user for AuthContext');
            setUser({
                id: 'mock-user-id',
                email: 'mock@example.com',
                app_metadata: {},
                user_metadata: {},
                aud: 'authenticated',
                created_at: new Date().toISOString()
            } as any);
            setIsLoading(false);
            return;
        }

        // Get initial session with error handling for invalid tokens
        supabase.auth.getSession()
            .then(({ data: { session }, error }) => {
                if (error) {
                    // Handle invalid refresh token error
                    if (error.message?.includes('Invalid Refresh Token') ||
                        error.message?.includes('refresh_token_not_found')) {
                        console.log('[AuthContext] Invalid refresh token, clearing session');
                        // Clear invalid session
                        supabase.auth.signOut().catch(() => {
                            // Ignore signOut errors
                        });
                        setUser(null);
                    } else {
                        console.error('[AuthContext] Session error:', error);
                        setUser(null);
                    }
                } else {
                    setUser(session?.user ?? null);
                }
                setIsLoading(false);
            })
            .catch((error) => {
                console.error('[AuthContext] Failed to get session:', error);
                // On any error, clear user and continue
                setUser(null);
                setIsLoading(false);
            });

        // Listen for auth changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
            // Filter out token refresh errors
            if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
                setUser(session?.user ?? null);
                setIsLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const signOut = async () => {
        await supabase.auth.signOut();
        setUser(null);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                isAuthenticated: !!user,
                isLoading,
                signOut,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);

