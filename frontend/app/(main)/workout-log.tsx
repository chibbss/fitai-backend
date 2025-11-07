import React, { useState } from 'react';
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
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScreenWrapper from '@/components/ScreenWrapper';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import { workoutApi } from '@/utils/api';
import Typo from '@/components/Typo';
import Input from '@/components/Input';
import * as Icons from 'phosphor-react-native';
import WorkoutForm from '@/components/WorkoutForm';
import { verticalScale } from '@/utils/styling';

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
    const [isLoading, setIsLoading] = useState(false);
    const [workoutData, setWorkoutData] = useState<WorkoutData>({
        exercises: [],
    });

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

    const handleSubmit = async () => {
        // Validate
        if (workoutData.exercises.length === 0) {
            Alert.alert('Error', 'Please add at least one exercise');
            return;
        }

        const invalidExercises = workoutData.exercises.filter(
            ex => !ex.exercise_name.trim()
        );
        if (invalidExercises.length > 0) {
            Alert.alert('Error', 'Please enter exercise names for all exercises');
            return;
        }

        setIsLoading(true);
        try {
            const result = await workoutApi.logWorkout({
                ...workoutData,
                occurred_at: workoutData.occurred_at || new Date().toISOString(),
            });

            // Navigate to insights screen with session_id
            router.push({
                pathname: '/insights' as any,
                params: { sessionId: result.session_id },
            });
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to log workout');
            setIsLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScreenWrapper showPattern={false}>
                    <View style={styles.whiteBackground}>
                        {/* Header */}
                        <View style={styles.header}>
                            <TouchableOpacity
                                onPress={() => router.back()}
                                style={styles.backButton}
                            >
                                <Icons.CaretLeft size={26} color={colors.primary} weight="bold" />
                            </TouchableOpacity>
                            <Typo size={24} fontWeight="700" color={colors.black}>
                                Log Workout
                            </Typo>
                            <View style={styles.placeholder} />
                        </View>

                        <ScrollView
                            style={styles.content}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                        >
                            {/* Session Info */}
                            <View style={styles.section}>
                                <Typo size={16} fontWeight="600" color={colors.black} style={styles.sectionTitle}>
                                    Session Details
                                </Typo>

                                <View style={styles.inputGroup}>
                                    <Typo size={14} color={colors.neutral600} style={styles.label}>
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
                                    <Typo size={14} color={colors.neutral600} style={styles.label}>
                                        Session Type (optional)
                                    </Typo>
                                    <View style={styles.typeButtons}>
                                        {['strength', 'cardio', 'flexibility', 'mixed'].map((type) => (
                                            <TouchableOpacity
                                                key={type}
                                                style={[
                                                    styles.typeButton,
                                                    workoutData.session_type === type && styles.typeButtonActive,
                                                ]}
                                                onPress={() =>
                                                    setWorkoutData(prev => ({ ...prev, session_type: type }))
                                                }
                                            >
                                                <Typo
                                                    size={14}
                                                    color={
                                                        workoutData.session_type === type
                                                            ? colors.white
                                                            : colors.neutral600
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
                                    <Typo size={16} fontWeight="600" color={colors.black}>
                                        Exercises
                                    </Typo>
                                    <TouchableOpacity
                                        onPress={handleAddExercise}
                                        style={styles.addButton}
                                    >
                                        <Icons.Plus size={20} color={colors.primary} weight="bold" />
                                        <Typo size={14} color={colors.primary} fontWeight="600">
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
                                        <Icons.Barbell size={48} color={colors.neutral300} />
                                        <Typo size={14} color={colors.neutral400} style={styles.emptyText}>
                                            No exercises added yet. Tap "Add" to get started.
                                        </Typo>
                                    </View>
                                )}
                            </View>

                            {/* Notes */}
                            <View style={styles.section}>
                                <Typo size={16} fontWeight="600" color={colors.black} style={styles.sectionTitle}>
                                    Notes (optional)
                                </Typo>
                                <Input
                                    placeholder="How did the workout feel?"
                                    value={workoutData.notes || ''}
                                    onChangeText={(text) =>
                                        setWorkoutData(prev => ({ ...prev, notes: text }))
                                    }
                                    multiline
                                    numberOfLines={4}
                                    containerStyle={[styles.inputContainer, styles.notesInput]}
                                    inputStyle={styles.notesText}
                                />
                            </View>
                        </ScrollView>

                        {/* Submit Button */}
                        <View style={styles.footer}>
                            <TouchableOpacity
                                style={[
                                    styles.submitButton,
                                    (isLoading || workoutData.exercises.length === 0) && styles.submitButtonDisabled,
                                ]}
                                onPress={handleSubmit}
                                disabled={isLoading || workoutData.exercises.length === 0}
                            >
                                {isLoading ? (
                                    <ActivityIndicator color={colors.white} />
                                ) : (
                                    <>
                                        <Typo size={16} color={colors.white} fontWeight="600">
                                            Log Workout
                                        </Typo>
                                        <Icons.CheckCircle size={20} color={colors.white} weight="fill" />
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
        backgroundColor: colors.white,

    },
    whiteBackground: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: colors.white,
        paddingTop: Platform.OS === 'ios' ? Dimensions.get('window').height * 0.06 : 40,
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
    placeholder: {
        width: 34,
    },
    content: {
        flex: 1,
        paddingHorizontal: spacingX._20,
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
        backgroundColor: colors.neutral50,
        borderColor: colors.neutral200,
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
        backgroundColor: colors.neutral100,
        borderWidth: 1,
        borderColor: colors.neutral200,
    },
    typeButtonActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
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
        backgroundColor: colors.primaryLight,
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
        minHeight: 80,
    },
    footer: {
        paddingHorizontal: spacingX._20,
        paddingVertical: spacingY._15,
        borderTopWidth: 1,
        borderTopColor: colors.neutral100,
        backgroundColor: colors.white,
    },
    submitButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacingX._10,
        paddingVertical: spacingY._15,
        borderRadius: radius._15,
        backgroundColor: colors.primary,
    },
    submitButtonDisabled: {
        opacity: 0.5,
    },
});

export default WorkoutLogScreen;