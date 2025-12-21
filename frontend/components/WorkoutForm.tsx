import React, { useState } from 'react';
import {
    View,
    TextInput,
    TouchableOpacity,
    StyleSheet,
} from 'react-native';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import Typo from './Typo';
import * as Icons from 'phosphor-react-native';
import { verticalScale } from '@/utils/styling';
import { useTheme } from '@/context/ThemeContext';

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

interface WorkoutFormProps {
    exercise: Exercise;
    index: number;
    onUpdate: (exercise: Partial<Exercise>) => void;
    onRemove: () => void;
}

const WorkoutForm: React.FC<WorkoutFormProps> = ({
    exercise,
    index,
    onUpdate,
    onRemove
}) => {
    const { colors: themeColors } = useTheme();
    const [isExpanded, setIsExpanded] = useState(true);

    const handleSetRepsChange = (setIndex: number, value: string) => {
        const newReps = [...(exercise.reps || [])];
        while (newReps.length <= setIndex) {
            newReps.push(0);
        }
        newReps[setIndex] = parseInt(value) || 0;
        onUpdate({ reps: newReps });
    };

    const handleSetWeightChange = (setIndex: number, value: string) => {
        const newWeights = [...(exercise.weights || [])];
        while (newWeights.length <= setIndex) {
            newWeights.push('');
        }
        newWeights[setIndex] = value;
        onUpdate({ weights: newWeights });
    };

    const handleSetsChange = (sets: number) => {
        const newSets = Math.max(1, Math.min(10, sets));
        onUpdate({ sets: newSets });

        // Adjust reps and weights arrays
        const currentReps = exercise.reps || [];
        const currentWeights = exercise.weights || [];
        const newReps = [...currentReps];
        const newWeights = [...currentWeights];

        while (newReps.length < newSets) {
            newReps.push(0);
        }
        while (newWeights.length < newSets) {
            newWeights.push('');
        }

        onUpdate({
            sets: newSets,
            reps: newReps.slice(0, newSets),
            weights: newWeights.slice(0, newSets),
        });
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.expandButton}
                    onPress={() => setIsExpanded(!isExpanded)}
                >
                    <Icons.CaretDown
                        size={16}
                        color={colors.neutral600}
                        style={[styles.caret, !isExpanded && styles.caretCollapsed]}
                    />
                    <Typo size={16} fontWeight="600" color={colors.black}>
                        Exercise {index + 1}
                    </Typo>
                </TouchableOpacity>

                <TouchableOpacity onPress={onRemove} style={styles.removeButton}>
                    <Icons.Trash size={18} color={colors.rose} />
                </TouchableOpacity>
            </View>

            {isExpanded && (
                <View style={styles.content}>
                    {/* Exercise Name */}
                    <View style={styles.inputGroup}>
                        <Typo size={14} color={colors.neutral600} style={styles.label}>
                            Exercise Name *
                        </Typo>
                        <TextInput
                            style={styles.textInput}
                            placeholder="e.g., Bench Press, Squat"
                            value={exercise.exercise_name}
                            onChangeText={(text) => onUpdate({ exercise_name: text })}
                            placeholderTextColor={colors.neutral400}
                        />
                    </View>

                    {/* Category */}
                    <View style={styles.inputGroup}>
                        <Typo size={14} color={colors.neutral600} style={styles.label}>
                            Category (optional)
                        </Typo>
                        <View style={styles.categoryButtons}>
                            {['chest', 'back', 'legs', 'shoulders', 'arms', 'cardio'].map((cat) => (
                                <TouchableOpacity
                                    key={cat}
                                    style={[
                                        styles.categoryButton,
                                        exercise.exercise_category === cat && {
                                            backgroundColor: themeColors.accentPrimary,
                                            borderColor: themeColors.accentPrimary,
                                        },
                                    ]}
                                    onPress={() => onUpdate({ exercise_category: cat })}
                                >
                                    <Typo
                                        size={12}
                                        color={
                                            exercise.exercise_category === cat
                                                ? themeColors.background
                                                : colors.neutral600
                                        }
                                    >
                                        {cat}
                                    </Typo>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Sets */}
                    <View style={styles.inputGroup}>
                        <Typo size={14} color={colors.neutral600} style={styles.label}>
                            Sets
                        </Typo>
                        <View style={styles.setsControl}>
                            <TouchableOpacity
                                style={styles.controlButton}
                                onPress={() => handleSetsChange((exercise.sets || 3) - 1)}
                            >
                                <Icons.Minus size={16} color={colors.neutral600} />
                            </TouchableOpacity>
                            <Typo size={16} fontWeight="600" color={colors.black}>
                                {exercise.sets || 3}
                            </Typo>
                            <TouchableOpacity
                                style={styles.controlButton}
                                onPress={() => handleSetsChange((exercise.sets || 3) + 1)}
                            >
                                <Icons.Plus size={16} color={colors.neutral600} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/*Sets table*/}
                    {(exercise.sets || 3) > 0 && (
                        <View style={styles.setsTable}>
                            <View style={styles.setsTableHeader}>
                                <Typo size={12} color={colors.neutral600} style={styles.tableHeader}>
                                    Set
                                </Typo>
                                <Typo size={12} color={colors.neutral600} style={styles.tableHeader}>
                                    Reps
                                </Typo>
                                <Typo size={12} color={colors.neutral600} style={styles.tableHeader}>
                                    Weight
                                </Typo>
                            </View>

                            {Array.from({ length: exercise.sets || 3 }).map((_, setIndex) => (
                                <View key={setIndex} style={styles.setsTableRow}>
                                    <Typo size={14} color={colors.neutral600} style={styles.tableCell}>
                                        {setIndex + 1}
                                    </Typo>

                                    <TextInput
                                        style={[styles.tableInput, styles.tableCell]}
                                        placeholder="0"
                                        keyboardType="numeric"
                                        value={
                                            exercise.reps?.[setIndex]
                                                ? exercise.reps[setIndex].toString()
                                                : ''
                                        }
                                        onChangeText={(text) => handleSetRepsChange(setIndex, text)}
                                        placeholderTextColor={colors.neutral400}
                                    />
                                    <TextInput
                                        style={[styles.tableInput, styles.tableCell]}
                                        placeholder="0kg"
                                        value={exercise.weights?.[setIndex] || ''}
                                        onChangeText={(text) => handleSetWeightChange(setIndex, text)}
                                        placeholderTextColor={colors.neutral400}
                                    />
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            )}
        </View>
    )
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.neutral50,
        borderRadius: radius._15,
        padding: spacingX._15,
        marginBottom: spacingY._15,
        borderWidth: 1,
        borderColor: colors.neutral200,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    expandButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacingX._10,
        flex: 1,
    },
    caret: {
        transform: [{ rotate: '0deg' }],
    },
    caretCollapsed: {
        transform: [{ rotate: '-90deg' }],
    },
    removeButton: {
        padding: spacingX._5,
    },
    content: {
        marginTop: spacingY._15,
    },
    inputGroup: {
        marginBottom: spacingY._15,
    },
    label: {
        marginBottom: spacingY._5,
    },
    textInput: {
        backgroundColor: colors.white,
        borderRadius: radius._10,
        paddingHorizontal: spacingX._15,
        paddingVertical: spacingY._12,
        borderWidth: 1,
        borderColor: colors.neutral200,
        fontSize: 16,
        color: colors.black,
    },
    categoryButtons: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacingX._10,
    },
    categoryButton: {
        paddingHorizontal: spacingX._12,
        paddingVertical: spacingY._10,
        borderRadius: radius._10,
        backgroundColor: colors.white,
        borderWidth: 1,
        borderColor: colors.neutral200,
    },
    setsControl: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacingX._15,
    },
    controlButton: {
        width: 36,
        height: 36,
        borderRadius: radius._10,
        backgroundColor: colors.white,
        borderWidth: 1,
        borderColor: colors.neutral200,
        alignItems: 'center',
        justifyContent: 'center',
    },
    setsTable: {
        marginTop: spacingY._10,
        backgroundColor: colors.white,
        borderRadius: radius._10,
        padding: spacingX._10,
    },
    setsTableHeader: {
        flexDirection: 'row',
        paddingBottom: spacingY._10,
        borderBottomWidth: 1,
        borderBottomColor: colors.neutral200,
        marginBottom: spacingY._10,
        gap: spacingX._10,
    },
    setsTableRow: {
        flexDirection: 'row',
        paddingVertical: spacingY._10,
        gap: spacingX._10,
    },
    tableHeader: {
        flex: 1,
        fontWeight: '600',
    },
    tableCell: {
        flex: 1,
        textAlign: 'center',
    },
    tableInput: {
        backgroundColor: colors.neutral50,
        borderRadius: radius._6,
        paddingHorizontal: spacingX._10,
        paddingVertical: spacingY._5,
        borderWidth: 1,
        borderColor: colors.neutral200,
        fontSize: 14,
        textAlign: 'center',
    },
})

export default WorkoutForm;
