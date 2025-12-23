import React, { useState, useEffect } from 'react';
import {
    View,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScreenWrapper from '@/components/ScreenWrapper';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import { workoutApi } from '@/utils/api';
import Typo from '@/components/Typo';
import Input from '@/components/Input';
import * as Icons from 'phosphor-react-native';
import WorkoutForm from '@/components/WorkoutForm';
import { verticalScale } from '@/utils/styling';
import { useTheme } from '@/context/ThemeContext';
import { alert } from '@/utils/alert';
import { AuthGuard } from '@/components/AuthGuard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/context/AuthContext';
import { invalidateCache } from '@/utils/dataCache';

interface Exercise {
    exercise_name: string;
    exercise_category?: string;
    sets?: number;
    reps?: number[];
    weights?: string[];
    duration_seconds?: number;
    distance_meters?: number;
    notes?: string;
}

interface WorkoutData {
    session_name?: string;
    session_type?: string;
    occurred_at?: string;
    duration_minutes?: number;
    notes?: string;
    exercises: Exercise[];
    metadata?: Record<string, any>;
}

const WorkoutLogScreen = () => {
    const router = useRouter();
    const params = useLocalSearchParams<{ sessionId?: string }>();
    const sessionId = params.sessionId;
    const isEditMode = !!sessionId;
    const { colors: themeColors } = useTheme();
    const { user } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingWorkout, setIsLoadingWorkout] = useState(isEditMode);
    const [workoutData, setWorkoutData] = useState<WorkoutData>({
        exercises: [],
    });

    const draftStorageKey = user?.id ? `workout_log_draft_${user.id}` : null;

    // Load workout data if in edit mode
    useEffect(() => {
        if (isEditMode && sessionId) {
            const loadWorkout = async () => {
                setIsLoadingWorkout(true);
                try {
                    const workout = await workoutApi.getWorkoutDetails(sessionId);
                    setWorkoutData(transformFromApiFormat(workout));
                } catch (error: any) {
                    alert.error(error.message || 'Failed to load workout', 'Error');
                    router.back();
                } finally {
                    setIsLoadingWorkout(false);
                }
            };
            loadWorkout();
        }
    }, [isEditMode, sessionId]);

    // Load draft workout for new sessions (non-edit mode)
    useEffect(() => {
        if (isEditMode || !draftStorageKey) return;

        const loadDraft = async () => {
            try {
                const storedDraft = await AsyncStorage.getItem(draftStorageKey);
                if (storedDraft) {
                    const parsed: WorkoutData = JSON.parse(storedDraft);
                    setWorkoutData({
                        ...parsed,
                        exercises: parsed.exercises || [],
                    });
                }
            } catch (error) {
                console.warn('[WorkoutLog] Failed to load draft workout', error);
            }
        };

        loadDraft();
        // Only run when switching between edit/new or user changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEditMode, draftStorageKey]);

    // Persist draft workout when editing a new session (non-edit mode)
    useEffect(() => {
        if (isEditMode || !draftStorageKey) return;

        const timeoutId = setTimeout(async () => {
            try {
                await AsyncStorage.setItem(draftStorageKey, JSON.stringify(workoutData));
            } catch (error) {
                console.warn('[WorkoutLog] Failed to save draft workout', error);
            }
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [workoutData, isEditMode, draftStorageKey]);

    const handleAddExercise = () => {
        setWorkoutData(prev => ({
            ...prev,
            exercises: [
                ...prev.exercises,
                {
                    exercise_name: '',
                    sets: 3,
                    reps: [],
                    weights: [],
                },
            ],
        }));
    };

    const handleUpdateExercise = (index: number, exercise: Partial<Exercise>) => {
        setWorkoutData(prev => ({
            ...prev,
            exercises: prev.exercises.map((ex, i) =>
                i === index ? { ...ex, ...exercise } : ex
            ),
        }));
    };

    const handleRemoveExercise = (index: number) => {
        setWorkoutData(prev => ({
            ...prev,
            exercises: prev.exercises.filter((_, i) => i !== index),
        }));
    };

    // Transform local WorkoutData format to API format
    const transformToApiFormat = (data: WorkoutData): any => {
        return {
            session_name: data.session_name,
            session_type: data.session_type,  // Add this
            notes: data.notes,
            duration_minutes: data.duration_minutes,  // Add this if you have it
            exercises: data.exercises.map(ex => ({
                exercise_name: ex.exercise_name,  // Changed from "name"
                exercise_category: ex.exercise_category,  // Add this
                sets: ex.sets || (ex.reps?.length || 0),  // Integer, not array
                reps: ex.reps || [],  // Flat array of integers
                weights: ex.weights || [],  // Flat array of strings
                duration_seconds: ex.duration_seconds,
                notes: ex.notes,
            })),
        };
    };

    // Transform API format to local WorkoutData format
    const transformFromApiFormat = (data: any): WorkoutData => {
        return {
            session_name: data.session_name,
            session_type: data.session_type,
            occurred_at: data.occurred_at,
            duration_minutes: data.duration_minutes,
            notes: data.notes,
            exercises: (data.exercises || []).map((ex: any) => ({
                exercise_name: ex.name || ex.exercise_name || '',
                exercise_category: ex.exercise_category,
                sets: ex.sets?.length || 0,
                reps: ex.sets?.map((s: any) => s.reps).filter((r: any) => r !== undefined) || [],
                weights: ex.sets?.map((s: any) => s.weight?.toString()).filter((w: any) => w !== undefined) || [],
                duration_seconds: ex.sets?.[0]?.duration,
                notes: ex.notes,
            })),
            metadata: data.metadata || {},
        };
    };

    const handleSubmit = async () => {
        // Validate
        if (workoutData.exercises.length === 0) {
            alert.warning('Please add at least one exercise', 'Error');
            return;
        }

        const invalidExercises = workoutData.exercises.filter(
            ex => !ex.exercise_name.trim()
        );
        if (invalidExercises.length > 0) {
            alert.warning('Please enter exercise names for all exercises', 'Error');
            return;
        }

        setIsLoading(true);
        try {
            const apiData = transformToApiFormat(workoutData);
            if (isEditMode && sessionId) {
                // Update existing workout
                await workoutApi.updateWorkout(sessionId, apiData);
                
                // Invalidate caches after editing workout (stats/calendar might change)
                if (user?.id) {
                    await invalidateCache(user.id, 'calendar_stats');
                    const today = new Date();
                    const monthKey = `${today.getFullYear()}-${today.getMonth()}`;
                    await invalidateCache(user.id, `calendar_${monthKey}`);
                    await invalidateCache(user.id, 'weeklySummary_current');
                }
                
                alert.success('Workout updated successfully');
                router.back();
            } else {
                // Create new workout
                await workoutApi.logWorkout(apiData);

                // Invalidate caches to force fresh fetch after logging workout
                if (user?.id) {
                    // Invalidate calendar stats cache (stats will be stale after new workout)
                    await invalidateCache(user.id, 'calendar_stats');
                    
                    // Invalidate current month calendar cache (new workout added)
                    const today = new Date();
                    const monthKey = `${today.getFullYear()}-${today.getMonth()}`;
                    await invalidateCache(user.id, `calendar_${monthKey}`);
                    
                    // Invalidate weekly summary cache
                    await invalidateCache(user.id, 'weeklySummary_current');
                    // Invalidate specific week cache
                    const day = today.getDay();
                    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
                    const monday = new Date(today);
                    monday.setDate(diff);
                    const mondayISO = monday.toISOString().split('T')[0];
                    await invalidateCache(user.id, `weeklySummary_${mondayISO}`);
                }

                // Show success alert
                alert.success('Workout logged', 'Success');
                // Clear any saved draft after successful log
                try {
                    if (draftStorageKey) {
                        await AsyncStorage.removeItem(draftStorageKey);
                    }
                } catch (error) {
                    console.warn('[WorkoutLog] Failed to clear draft after log', error);
                }
                // Clear the form after successful log
                setWorkoutData({
                    exercises: [],
                });
                setIsLoading(false);
            }
        } catch (error: any) {
            alert.error(error.message || (isEditMode ? 'Failed to update workout' : 'Failed to log workout'));
            setIsLoading(false);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScreenWrapper showPattern={false}>
                    <View style={[styles.whiteBackground, { backgroundColor: themeColors.background }]}>
                        {/* Header */}
                        <View style={styles.header}>
                            <TouchableOpacity
                                onPress={() => router.back()}
                                style={styles.backButton}
                            >
                                <Icons.CaretLeft size={26} color={themeColors.textPrimary} weight="bold" />
                            </TouchableOpacity>
                            <Typo size={24} fontWeight="700" color={themeColors.textPrimary}>
                                {isEditMode ? 'Edit Workout' : 'Log Workout'}
                            </Typo>
                            <View style={styles.placeholder} />
                        </View>

                        {isLoadingWorkout ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color={colors.primary} />
                                <Typo size={14} color={colors.neutral600} style={styles.loadingText}>
                                    Loading workout...
                                </Typo>
                            </View>
                        ) : (
                        <ScrollView
                            style={styles.content}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            contentContainerStyle={styles.scrollContent}
                        >
                            {/* Session Info */}
                            <View style={styles.section}>
                                <Typo size={16} fontWeight="600" color={themeColors.textPrimary} style={styles.sectionTitle}>
                                    Session Details
                                </Typo>

                                <View style={styles.inputGroup}>
                                    <Typo size={14} color={themeColors.textSecondary} style={styles.label}>
                                        Session Name (optional)
                                    </Typo>
                                    <Input
                                        placeholder="e.g., Push Day, Morning Run"
                                        value={workoutData.session_name || ''}
                                        onChangeText={(text) =>
                                            setWorkoutData(prev => ({ ...prev, session_name: text }))
                                        }
                                        containerStyle={styles.inputContainer}
                                    />
                                </View>

                                <View style={styles.inputGroup}>
                                    <Typo size={14} color={themeColors.textSecondary} style={styles.label}>
                                        Session Type (optional)
                                    </Typo>
                                    <View style={styles.typeButtons}>
                                        {['strength', 'cardio', 'flexibility', 'mixed'].map((type) => (
                                            <TouchableOpacity
                                                key={type}
                                                style={[
                                                    styles.typeButton,
                                                    { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border },
                                                    workoutData.session_type === type && { backgroundColor: themeColors.accentPrimary, borderColor: themeColors.accentPrimary,  },
                                                ]}
                                                onPress={() =>
                                                    setWorkoutData(prev => ({ 
                                                        ...prev, 
                                                        session_type: prev.session_type === type ? undefined : type 
                                                    }))
                                                }
                                            >
                                                <Typo
                                                    size={14}
                                                    color={
                                                        workoutData.session_type === type
                                                            ? themeColors.background
                                                            : themeColors.textSecondary
                                                    }
                                                >
                                                    {type.charAt(0).toUpperCase() + type.slice(1)}
                                                </Typo>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            </View>

                            {/* Exercises */}
                            <View style={styles.section}>
                                <View style={styles.exercisesHeader}>
                                    <Typo size={16} fontWeight="600" color={themeColors.textPrimary}>
                                        Exercises
                                    </Typo>
                                    <TouchableOpacity
                                        onPress={handleAddExercise}
                                        style={[styles.addButton, { backgroundColor: themeColors.accentPrimary }]}
                                    >
                                        <Icons.Plus size={20} color={themeColors.background} weight="bold" />
                                        <Typo size={14} color={themeColors.background} fontWeight="600">
                                            Add
                                        </Typo>
                                    </TouchableOpacity>
                                </View>

                                {workoutData.exercises.map((exercise, index) => (
                                    <WorkoutForm
                                        key={index}
                                        exercise={exercise}
                                        index={index}
                                        onUpdate={(updated) => handleUpdateExercise(index, updated)}
                                        onRemove={() => handleRemoveExercise(index)}
                                    />
                                ))}

                                {workoutData.exercises.length === 0 && (
                                    <View style={styles.emptyState}>
                                        <Icons.Barbell size={48} color={themeColors.textSecondary} />
                                        <Typo size={14} color={themeColors.textSecondary} style={styles.emptyText}>
                                            No exercises added yet. Tap "Add" to get started.
                                        </Typo>
                                    </View>
                                )}
                            </View>

                            {/* Notes */}
                            <View style={styles.section}>
                                <Typo size={16} fontWeight="600" color={themeColors.textPrimary} style={styles.sectionTitle}>
                                    Notes (optional)
                                </Typo>
                                <Input
                                    placeholder="How did the workout feel?"
                                    value={workoutData.notes || ''}
                                    onChangeText={(text) =>
                                        setWorkoutData(prev => ({ ...prev, notes: text }))
                                    }
                                    multiline
                                    containerStyle={[styles.inputContainer, styles.notesInput]}
                                    inputStyle={styles.notesText}
                                />
                            </View>
                        </ScrollView>
                        )}

                        {/* Submit Button */}
                        <View style={[styles.footer, { backgroundColor: themeColors.background, borderTopColor: themeColors.accentPrimary }]}>
                            <TouchableOpacity
                                style={[
                                    styles.submitButton,
                                    { backgroundColor: themeColors.accentPrimary },
                                    (isLoading || workoutData.exercises.length === 0) && styles.submitButtonDisabled,
                                ]}
                                onPress={handleSubmit}
                                disabled={isLoading || workoutData.exercises.length === 0}
                            >
                                {isLoading ? (
                                    <ActivityIndicator color={themeColors.textPrimary} />
                                ) : (
                                    <>
                                        <Typo size={16} color={themeColors.background} fontWeight="600">
                                            {isEditMode ? 'Update Workout' : 'Log Workout'}
                                        </Typo>
                                        <Icons.CheckCircle size={20} color={themeColors.background} weight="fill" />
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </ScreenWrapper>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        // Remove: backgroundColor: colors.white,
    },
    whiteBackground: {
        ...StyleSheet.absoluteFillObject,
        // Remove: backgroundColor: colors.white,
        paddingTop: Platform.OS === 'ios' ? Dimensions.get('window').height * 0.06 : 40,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacingX._20,
        paddingVertical: spacingY._15,
        // Remove border bottom to match calendar:
        // borderBottomWidth: 1,
        // borderBottomColor: colors.neutral100,
    },
    backButton: {
        padding: spacingX._5,
    },
    placeholder: {
        width: 34,
    },
    content: {
        flex: 1,
        paddingHorizontal: spacingX._20,
    },
    scrollContent: {
        paddingBottom: spacingY._30,
    },
    section: {
        marginTop: spacingY._20,
    },
    sectionTitle: {
        marginBottom: spacingY._12,
    },
    inputGroup: {
        marginBottom: spacingY._15,
    },
    label: {
        marginBottom: spacingY._5,
    },
    inputContainer: {
        // These will be handled by Input component, but you can override if needed
        // backgroundColor: themeColors.cardBackground,
        // borderColor: themeColors.border,
    },
    typeButtons: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacingX._10,
    },
    typeButton: {
        paddingHorizontal: spacingX._15,
        paddingVertical: spacingY._10,
        borderRadius: radius._10,
        // Remove hardcoded colors - will be set inline with theme colors
        // backgroundColor: colors.neutral100,
        borderWidth: 1,
        // borderColor: colors.neutral200,
    },
    // Remove typeButtonActive - handled inline
    exercisesHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacingY._15,
    },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacingX._5,
        paddingHorizontal: spacingX._12,
        paddingVertical: spacingY._10,
        borderRadius: radius._10,
        // Remove: backgroundColor: colors.primaryLight,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacingY._40,
    },
    emptyText: {
        marginTop: spacingY._10,
        textAlign: 'center',
    },
    notesInput: {
        minHeight: 100,
    },
    notesText: {
        textAlignVertical: 'top',
    },
    footer: {
        paddingHorizontal: spacingX._20,
        paddingVertical: spacingY._15,
        borderTopWidth: 1,
        // Remove hardcoded colors - will be set inline
        // borderTopColor: colors.neutral100,
        // backgroundColor: colors.white,
    },
    submitButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacingX._10,
        paddingVertical: spacingY._15,
        borderRadius: radius._15,
        // Remove: backgroundColor: colors.primary,
    },
    submitButtonDisabled: {
        opacity: 0.5,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: spacingY._40,
    },
    loadingText: {
        marginTop: spacingY._15,
    },
});

const WorkoutLogScreenComponent = WorkoutLogScreen;

export default function ProtectedWorkoutLogScreen() {
    return (
        <AuthGuard>
            <WorkoutLogScreenComponent />
        </AuthGuard>
    );
}
