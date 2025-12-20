import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, spacingX, spacingY } from '@/constants/theme';
import Typo from './Typo';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
        };
    }

    static getDerivedStateFromError(error: Error): State {
        return {
            hasError: true,
            error,
        };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    handleReset = () => {
        this.setState({
            hasError: false,
            error: null,
        });
    };

    render() {
        if (this.state.hasError) {
            return (
                <View style={styles.container}>
                    <View style={styles.content}>
                        <Typo size={24} fontWeight="600" color={colors.white} style={styles.title}>
                            Something went wrong
                        </Typo>
                        <Typo size={14} color={colors.neutral400} style={styles.message}>
                            {this.state.error?.message || 'An unexpected error occurred'}
                        </Typo>
                        <TouchableOpacity style={styles.button} onPress={this.handleReset}>
                            <Typo size={16} fontWeight="600" color={colors.white}>
                                Try Again
                            </Typo>
                        </TouchableOpacity>
                    </View>
                </View>
            );
        }

        return this.props.children;
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.deepCharcoal,
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacingX._20,
    },
    content: {
        alignItems: 'center',
        maxWidth: 300,
    },
    title: {
        marginBottom: spacingY._10,
        textAlign: 'center',
    },
    message: {
        marginBottom: spacingY._20,
        textAlign: 'center',
    },
    button: {
        backgroundColor: colors.accentPrimary,
        paddingHorizontal: spacingX._20,
        paddingVertical: spacingY._10,
        borderRadius: 8,
    },
});
