import Typo from '@/components/Typo';
import { GradientButton } from '@/components/ui';
import { radius, spacingX, spacingY } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import * as Icons from 'phosphor-react-native';
import { useEffect, useRef, useState } from 'react';
import {
    FlatList,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ── Types ─────────────────────────────────────────────────────────────────────
type WorkoutSet = { id: string; weight: string; reps: string; done: boolean };
type WorkoutExercise = { id: string; name: string; sets: WorkoutSet[]; notes: string; collapsed: boolean };

// ── Constants ─────────────────────────────────────────────────────────────────
const EXERCISES = [
    'Bench Press', 'Deadlift', 'Squat', 'Overhead Press', 'Barbell Row',
    'Pull-ups', 'Dips', 'Incline Press', 'Leg Press', 'Romanian Deadlift',
    'Lateral Raises', 'Bicep Curl', 'Tricep Pushdown', 'Face Pull',
    'Hip Thrust', 'Cable Fly', 'Leg Curl', 'Leg Extension', 'Calf Raise',
    'Seated Row', 'Lat Pulldown', 'Arnold Press', 'Hammer Curl', 'Chest Fly',
];

const MENU_OPTIONS = [
    { id: 'start', label: 'Start Workout', sub: 'Begin a new training session', dot: '#fff', highlight: true },
    { id: 'quick', label: 'Quick Log Workout', sub: 'Log a completed workout', dot: '#6366F1' },
    { id: 'continue', label: 'Continue Active Workout', sub: 'Resume your last session', dot: '#A855F7' },
    { id: 'custom', label: 'Create Custom Workout', sub: 'Build a new workout template', dot: '#F59E0B' },
];

const makeSet = (): WorkoutSet => ({
    id: Date.now().toString() + Math.random(),
    weight: '0', reps: '10', done: false,
});
const makeExercise = (name: string): WorkoutExercise => ({
    id: Date.now().toString() + Math.random(),
    name, sets: [makeSet()], notes: '', collapsed: false,
});

// ── Component ─────────────────────────────────────────────────────────────────
export default function LogTrainingSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();

    const [view, setView] = useState<'menu' | 'workout'>('menu');
    const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (view === 'workout') {
            timerRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [view]);

    const handleClose = () => {
        setView('menu');
        setExercises([]);
        setElapsedSeconds(0);
        setShowSearch(false);
        setSearchQuery('');
        onClose();
    };

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60).toString().padStart(2, '0');
        return `${m}:${(s % 60).toString().padStart(2, '0')}`;
    };

    const doneSets = exercises.flatMap(e => e.sets).filter(s => s.done).length;

    const filteredExercises = EXERCISES.filter(e =>
        e.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const updateSet = (exId: string, setId: string, field: keyof WorkoutSet, value: any) =>
        setExercises(prev => prev.map(ex =>
            ex.id === exId ? { ...ex, sets: ex.sets.map(s => s.id === setId ? { ...s, [field]: value } : s) } : ex
        ));

    const addSet = (exId: string) =>
        setExercises(prev => prev.map(ex => ex.id === exId ? { ...ex, sets: [...ex.sets, makeSet()] } : ex));

    const addExercise = (name: string) => {
        setExercises(prev => [...prev, makeExercise(name)]);
        setShowSearch(false);
        setSearchQuery('');
    };

    const removeExercise = (exId: string) =>
        setExercises(prev => prev.filter(ex => ex.id !== exId));

    const toggleCollapse = (exId: string) =>
        setExercises(prev => prev.map(ex => ex.id === exId ? { ...ex, collapsed: !ex.collapsed } : ex));

    const updateNotes = (exId: string, notes: string) =>
        setExercises(prev => prev.map(ex => ex.id === exId ? { ...ex, notes } : ex));

    // ── Menu ─────────────────────────────────────────────────────────────────────
    if (view === 'menu') {
        return (
            <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
                <Pressable style={styles.backdrop} onPress={handleClose} />
                <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
                    <View style={[styles.handle, { backgroundColor: colors.border }]} />
                    <Typo size={22} fontWeight="800" color={colors.textPrimary} style={{ marginBottom: spacingY._15 }}>
                        Log Training
                    </Typo>
                    {MENU_OPTIONS.map(opt => (
                        <Pressable
                            key={opt.id}
                            onPress={() => opt.id === 'start' ? setView('workout') : null}
                            style={[styles.menuRow, { backgroundColor: opt.highlight ? colors.accent : colors.card }]}
                        >
                            <View style={[styles.menuDot, { backgroundColor: opt.dot }]} />
                            <View style={{ flex: 1 }}>
                                <Typo size={15} fontWeight="700" color={opt.highlight ? colors.textOnAccent : colors.textPrimary}>
                                    {opt.label}
                                </Typo>
                                <Typo size={13} color={opt.highlight ? 'rgba(255,255,255,0.7)' : colors.textMuted}>
                                    {opt.sub}
                                </Typo>
                            </View>
                        </Pressable>
                    ))}
                </View>
            </Modal>
        );
    }

    // ── Workout ───────────────────────────────────────────────────────────────────
    return (
        <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
            <View style={[styles.workoutContainer, { backgroundColor: colors.background, paddingTop: insets.top }]}>

                {/* Header */}
                <View style={[styles.workoutHeader, { borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                        <Icons.X size={20} color={colors.textPrimary} weight="bold" />
                    </TouchableOpacity>
                    <View style={{ flex: 1, marginLeft: spacingX._10 }}>
                        <Typo size={16} fontWeight="700" color={colors.textPrimary}>Morning Workout</Typo>
                        <Typo size={13} color={colors.accent}>{formatTime(elapsedSeconds)}</Typo>
                    </View>
                    <Typo size={13} color={colors.textMuted}>{doneSets} sets</Typo>
                </View>

                {/* Content */}
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.workoutScroll}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {exercises.length === 0 ? (
                        <View style={styles.emptyState}>
                            <View style={[styles.emptyIcon, { backgroundColor: colors.card }]}>
                                <Icons.Barbell size={36} color={colors.textMuted} weight="fill" />
                            </View>
                            <Typo size={17} fontWeight="700" color={colors.textPrimary} style={{ marginTop: spacingY._15 }}>
                                No exercises yet
                            </Typo>
                            <Typo size={14} color={colors.textMuted} style={{ marginTop: 4 }}>
                                Tap "Add Exercise" to get started
                            </Typo>
                        </View>
                    ) : (
                        exercises.map(ex => (
                            <View key={ex.id} style={[styles.exerciseCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                                {/* Exercise header row */}
                                <View style={styles.exerciseHeader}>
                                    <View style={[styles.exIcon, { backgroundColor: colors.cardElevated }]}>
                                        <Icons.Barbell size={16} color={colors.accent} weight="fill" />
                                    </View>
                                    <Typo size={15} fontWeight="700" color={colors.accent} style={{ flex: 1, marginLeft: 8 }}>
                                        {ex.name}
                                    </Typo>
                                    <TouchableOpacity onPress={() => toggleCollapse(ex.id)} style={styles.exAction}>
                                        {ex.collapsed
                                            ? <Icons.CaretDown size={16} color={colors.textMuted} weight="bold" />
                                            : <Icons.CaretUp size={16} color={colors.textMuted} weight="bold" />}
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => removeExercise(ex.id)} style={styles.exAction}>
                                        <Icons.Trash size={16} color={colors.textMuted} />
                                    </TouchableOpacity>
                                </View>

                                {!ex.collapsed && (
                                    <>
                                        {/* Column headers */}
                                        <View style={styles.setHeaders}>
                                            {['Set', 'Weight', 'Reps', 'Done'].map(h => (
                                                <Typo key={h} size={12} color={colors.textMuted} style={styles.setHeaderCell}>{h}</Typo>
                                            ))}
                                        </View>

                                        {/* Sets */}
                                        {ex.sets.map((set, idx) => (
                                            <View key={set.id} style={styles.setRow}>
                                                <Typo size={13} color={colors.textMuted} style={styles.setNumCell}>{idx + 1}</Typo>
                                                <TextInput
                                                    value={set.weight}
                                                    onChangeText={v => updateSet(ex.id, set.id, 'weight', v)}
                                                    keyboardType="numeric"
                                                    style={[styles.setInput, { backgroundColor: colors.cardElevated, color: colors.textPrimary }]}
                                                />
                                                <TextInput
                                                    value={set.reps}
                                                    onChangeText={v => updateSet(ex.id, set.id, 'reps', v)}
                                                    keyboardType="numeric"
                                                    style={[styles.setInput, { backgroundColor: colors.cardElevated, color: colors.textPrimary }]}
                                                />
                                                <TouchableOpacity
                                                    onPress={() => updateSet(ex.id, set.id, 'done', !set.done)}
                                                    style={styles.doneBtn}
                                                >
                                                    <Icons.CheckCircle
                                                        size={24}
                                                        color={set.done ? colors.accent : colors.textMuted}
                                                        weight={set.done ? 'fill' : 'regular'}
                                                    />
                                                </TouchableOpacity>
                                            </View>
                                        ))}

                                        {/* Add Set */}
                                        <TouchableOpacity
                                            onPress={() => addSet(ex.id)}
                                            style={[styles.addSetBtn, { borderColor: colors.border }]}
                                        >
                                            <Typo size={13} color={colors.textMuted}>+ Add Set</Typo>
                                        </TouchableOpacity>

                                        {/* Notes */}
                                        <TextInput
                                            value={ex.notes}
                                            onChangeText={v => updateNotes(ex.id, v)}
                                            placeholder="Notes (optional)"
                                            placeholderTextColor={colors.textMuted}
                                            style={[styles.notesInput, { color: colors.textPrimary, backgroundColor: colors.cardElevated }]}
                                        />
                                    </>
                                )}
                            </View>
                        ))
                    )}

                    {/* Add Exercise */}
                    <TouchableOpacity
                        onPress={() => setShowSearch(true)}
                        style={[styles.addExerciseBtn, { borderColor: colors.border }]}
                    >
                        <Icons.Plus size={16} color={colors.textSecondary} weight="bold" />
                        <Typo size={15} color={colors.textSecondary} style={{ marginLeft: 6 }}>Add Exercise</Typo>
                    </TouchableOpacity>
                </ScrollView>

                {/* Footer */}
                <View style={[styles.workoutFooter, { paddingBottom: insets.bottom + 8 }]}>
                    <GradientButton
                        title={exercises.length === 0 ? 'Cancel Workout' : 'Finish Workout'}
                        onPress={handleClose}
                        style={{ width: '100%' }}
                    />
                </View>
            </View>

            {/* Exercise search sub-sheet */}
            <Modal visible={showSearch} transparent animationType="slide" onRequestClose={() => setShowSearch(false)}>
                <Pressable style={styles.backdrop} onPress={() => setShowSearch(false)} />
                <View style={[styles.searchSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
                    <View style={[styles.handle, { backgroundColor: colors.border }]} />
                    <View style={[styles.searchInputWrap, { backgroundColor: colors.card, borderColor: colors.accent }]}>
                        <Icons.MagnifyingGlass size={18} color={colors.textMuted} />
                        <TextInput
                            placeholder="Search exercises..."
                            placeholderTextColor={colors.textMuted}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            style={[styles.searchInput, { color: colors.textPrimary }]}
                            autoFocus
                        />
                    </View>
                    <FlatList
                        data={filteredExercises}
                        keyExtractor={item => item}
                        showsVerticalScrollIndicator={false}
                        style={{ maxHeight: 360 }}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={[styles.exerciseSearchRow, { borderBottomColor: colors.border }]}
                                onPress={() => addExercise(item)}
                            >
                                <View style={[styles.exIcon, { backgroundColor: colors.card }]}>
                                    <Icons.Barbell size={14} color={colors.accent} weight="fill" />
                                </View>
                                <Typo size={15} fontWeight="600" color={colors.textPrimary} style={{ flex: 1, marginLeft: 10 }}>
                                    {item}
                                </Typo>
                                <Icons.Plus size={18} color={colors.accent} weight="bold" />
                            </TouchableOpacity>
                        )}
                    />
                </View>
            </Modal>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    sheet: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: spacingX._20,
        paddingTop: 12,
        gap: spacingY._10,
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: spacingY._10,
    },
    menuRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacingX._15,
        borderRadius: radius._15,
        gap: spacingX._12,
    },
    menuDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    workoutContainer: {
        flex: 1,
    },
    workoutHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacingX._20,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    closeBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    workoutScroll: {
        padding: spacingX._20,
        paddingBottom: spacingY._30,
        gap: spacingY._15,
    },
    emptyState: {
        alignItems: 'center',
        paddingTop: spacingY._40,
        paddingBottom: spacingY._20,
    },
    emptyIcon: {
        width: 72,
        height: 72,
        borderRadius: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    exerciseCard: {
        borderRadius: radius._20,
        borderWidth: 1,
        padding: spacingX._15,
        gap: spacingY._10,
    },
    exerciseHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    exIcon: {
        width: 28,
        height: 28,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    exAction: {
        padding: 6,
    },
    setHeaders: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    setHeaderCell: {
        flex: 1,
        textAlign: 'center',
    },
    setRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    setNumCell: {
        width: 20,
        textAlign: 'center',
    },
    setInput: {
        flex: 1,
        height: 40,
        borderRadius: radius._10,
        textAlign: 'center',
        fontSize: 15,
        fontWeight: '600',
    },
    doneBtn: {
        flex: 1,
        alignItems: 'center',
    },
    addSetBtn: {
        borderWidth: 1,
        borderStyle: 'dashed',
        borderRadius: radius._10,
        paddingVertical: 10,
        alignItems: 'center',
    },
    notesInput: {
        borderRadius: radius._10,
        paddingHorizontal: spacingX._10,
        paddingVertical: 8,
        fontSize: 13,
        minHeight: 36,
    },
    addExerciseBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderRadius: radius._15,
        paddingVertical: spacingY._15,
    },
    workoutFooter: {
        paddingHorizontal: spacingX._20,
        paddingTop: spacingY._10,
    },
    searchSheet: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: spacingX._20,
        paddingTop: 12,
        maxHeight: '70%',
    },
    searchInputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacingX._10,
        paddingHorizontal: spacingX._15,
        height: 44,
        borderRadius: radius.full,
        borderWidth: 1.5,
        marginBottom: spacingY._10,
    },
    searchInput: {
        flex: 1,
        fontSize: 15,
    },
    exerciseSearchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacingY._12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
});