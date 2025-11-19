import React, { useEffect, useState } from 'react';
import {
    View,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScreenWrapper from '@/components/ScreenWrapper';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import { workoutApi } from '@/utils/api';
import Typo from '@/components/Typo';
import * as Icons from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Insight {
    exercise: string;
    status: 'new' | 'progress' | 'regression' | 'maintained' | 'pr';
    message: string;
    delta_pct?: number | null;
    weight_increase?: number | null;
}

interface InsightsData {
    session_id: string;
    insights: Insight[];
    overall_message: string;
    avg_volume_change_pct: number;
    exercise_count: number;
}

const InsightsScreen = () => {
    const router = useRouter();
    const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
    const [insights, setInsights] = useState<InsightsData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (sessionId) {
            fetchInsights();
        }
    }, [sessionId]);

    const fetchInsights = async () => {
        if (!sessionId) return;
        
        setIsLoading(true);
        try {
            const data = await workoutApi.getInsights(sessionId);
            setInsights(data);
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to load insights');
            router.back();
        } finally {
            setIsLoading(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pr':
                return colors.green;
            case 'progress':
                return colors.primary;
            case 'regression':
                return colors.rose;
            case 'new':
                return '#3B82F6';
            default:
                return colors.neutral400;
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'pr':
                return 'Trophy';
            case 'progress':
                return 'TrendUp';
            case 'regression':
                return 'TrendDown';
            case 'new':
                return 'Sparkle';
            default:
                return 'CheckCircle';
        }
    };

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <ScreenWrapper showPattern={false}>
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Typo size={16} color={colors.neutral600} style={styles.loadingText}>
                            Analyzing your workout...
                        </Typo>
                    </View>
                </ScreenWrapper>
            </SafeAreaView>
        );
    }

    if (!insights) {
        return null;
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <ScreenWrapper showPattern={false}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={() => router.back()}
                        style={styles.backButton}
                    >
                        <Icons.ArrowLeft size={24} color={colors.black} weight="bold" />
                    </TouchableOpacity>
                    <Typo size={20} fontWeight="600" color={colors.black}>
                        Workout Insights
                    </Typo>
                    <TouchableOpacity
                        onPress={() => {
                            if (sessionId) {
                                router.push({
                                    pathname: '/workout-log' as any,
                                    params: { sessionId },
                                });
                            }
                        }}
                        style={styles.editButton}
                    >
                        <Icons.PencilSimple size={20} color={colors.primary} weight="bold" />
                    </TouchableOpacity>
                </View>

                <ScrollView
                    style={styles.content}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                >
                    {/* Overall Message */}
                    <LinearGradient
                        colors={[colors.primaryLight, colors.primary]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.overallCard}
                    >
                        <Icons.ChartLineUp size={32} color={colors.white} weight="fill" />
                        <Typo size={18} fontWeight="600" color={colors.white} style={styles.overallMessage}>
                            {insights.overall_message}
                        </Typo>
                        <Typo size={14} color={colors.white} style={styles.overallSubtext}>
                            {insights.exercise_count} exercises logged
                        </Typo>
                    </LinearGradient>

                    {/* Individual Insights */}
                    <View style={styles.insightsSection}>
                        <Typo size={16} fontWeight="600" color={colors.black} style={styles.sectionTitle}>
                            Exercise Breakdown
                        </Typo>
                        {insights.insights.map((insight, index) => {
                            const IconComponent = Icons[getStatusIcon(insight.status) as keyof typeof Icons] as React.ComponentType<any>;
                            const statusColor = getStatusColor(insight.status);
                            
                            return (
                                <View key={index} style={styles.insightCard}>
                                    <View style={[styles.statusIndicator, { backgroundColor: statusColor }]}>
                                        <IconComponent size={20} color={colors.white} weight="fill" />
                                    </View>
                                    <View style={styles.insightContent}>
                                        <Typo size={16} fontWeight="600" color={colors.black}>
                                            {insight.exercise}
                                        </Typo>
                                        <Typo size={14} color={colors.neutral600} style={styles.insightMessage}>
                                            {insight.message}
                                        </Typo>
                                        {insight.delta_pct !== null && insight.delta_pct !== undefined && (
                                            <View style={styles.metricRow}>
                                                <Typo size={12} color={colors.neutral500}>
                                                    Volume change:
                                                </Typo>
                                                <Typo
                                                    size={12}
                                                    color={insight.delta_pct > 0 ? colors.green : colors.rose}
                                                    fontWeight="600"
                                                >
                                                    {insight.delta_pct > 0 ? '+' : ''}
                                                    {insight.delta_pct.toFixed(1)}%
                                                </Typo>
                                            </View>
                                        )}
                                        {insight.weight_increase !== null && insight.weight_increase !== undefined && (
                                            <View style={styles.metricRow}>
                                                <Typo size={12} color={colors.neutral500}>
                                                    Weight increase:
                                                </Typo>
                                                <Typo size={12} color={colors.green} fontWeight="600">
                                                    +{insight.weight_increase.toFixed(1)}kg
                                                </Typo>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            );
                        })}
                    </View>

                    {/* Average Volume Change */}
                    {insights.avg_volume_change_pct !== 0 && (
                        <View style={styles.summaryCard}>
                            <Typo size={14} color={colors.neutral600} style={styles.summaryLabel}>
                                Average Volume Change
                            </Typo>
                            <Typo
                                size={24}
                                fontWeight="700"
                                color={insights.avg_volume_change_pct > 0 ? colors.green : colors.rose}
                            >
                                {insights.avg_volume_change_pct > 0 ? '+' : ''}
                                {insights.avg_volume_change_pct.toFixed(1)}%
                            </Typo>
                        </View>
                    )}
                </ScrollView>

                {/* Action Buttons */}
                <View style={styles.footer}>
                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => router.push('/calendar' as any)}
                    >
                        <Icons.Calendar size={20} color={colors.primary} />
                        <Typo size={14} color={colors.primary} fontWeight="600">
                            View Calendar
                        </Typo>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.actionButton, styles.primaryButton]}
                        onPress={() => router.push('/chatscreen' as any)}
                    >
                        <Typo size={14} color={colors.white} fontWeight="600">
                            Chat with FitAI
                        </Typo>
                        <Icons.ChatCircle size={20} color={colors.white} />
                    </TouchableOpacity>
                </View>
            </ScreenWrapper>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.white,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacingX._20,
        paddingVertical: spacingY._15,
        borderBottomWidth: 1,
        borderBottomColor: colors.neutral100,
    },
    backButton: {
        padding: spacingX._5,
    },
    editButton: {
        padding: spacingX._5,
    },
    placeholder: {
        width: 34,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: spacingY._15,
    },
    loadingText: {
        marginTop: spacingY._10,
    },
    content: {
        flex: 1,
        paddingHorizontal: spacingX._20,
    },
    scrollContent: {
        paddingBottom: spacingY._20,
    },
    overallCard: {
        marginTop: spacingY._20,
        padding: spacingX._20,
        borderRadius: radius._20,
        alignItems: 'center',
        gap: spacingY._10,
    },
    overallMessage: {
        textAlign: 'center',
        marginTop: spacingY._5,
    },
    overallSubtext: {
        opacity: 0.9,
    },
    insightsSection: {
        marginTop: spacingY._25,
    },
    sectionTitle: {
        marginBottom: spacingY._15,
    },
    insightCard: {
        flexDirection: 'row',
        backgroundColor: colors.neutral50,
        borderRadius: radius._15,
        padding: spacingX._15,
        marginBottom: spacingY._12,
        borderWidth: 1,
        borderColor: colors.neutral200,
    },
    statusIndicator: {
        width: 40,
        height: 40,
        borderRadius: radius._10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacingX._12,
    },
    insightContent: {
        flex: 1,
    },
    insightMessage: {
        marginTop: spacingY._5,
        marginBottom: spacingY._10,
    },
    metricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: spacingY._5,
    },
    summaryCard: {
        backgroundColor: colors.neutral50,
        borderRadius: radius._15,
        padding: spacingX._20,
        marginTop: spacingY._20,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.neutral200,
    },
    summaryLabel: {
        marginBottom: spacingY._5,
    },
    footer: {
        flexDirection: 'row',
        gap: spacingX._10,
        paddingHorizontal: spacingX._20,
        paddingVertical: spacingY._15,
        borderTopWidth: 1,
        borderTopColor: colors.neutral100,
        backgroundColor: colors.white,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacingX._10,
        paddingVertical: spacingY._12,
        borderRadius: radius._15,
        backgroundColor: colors.neutral50,
        borderWidth: 1,
        borderColor: colors.neutral200,
    },
    primaryButton: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
});

export default InsightsScreen;