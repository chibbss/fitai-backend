import Typo from '@/components/Typo';
import { radius, spacingX, spacingY } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import * as Icons from 'phosphor-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Exercise = { name: string; sets: number; reps: string; weight: string };
type Session = {
    id: string; name: string; date: string;
    duration: string; calories: number; totalWeight: string;
    prs: number; exercises: Exercise[];
};


const MOCK_SESSIONS: Session[] = [
    {
        id: '1',
        name: 'Upper Body Power',
        date: 'Today, 9:30 AM',
        duration: '52 min',
        calories: 420,
        totalWeight: '8,240 lbs',
        prs: 2,
        exercises: [
            { name: 'Bench Press', sets: 4, reps: '8', weight: '185 lbs' },
            { name: 'Overhead Press', sets: 4, reps: '6', weight: '115 lbs' },
            { name: 'Barbell Row', sets: 4, reps: '8', weight: '155 lbs' },
            { name: 'Pull-ups', sets: 3, reps: '10', weight: 'BW' },
        ],
    },
    {
        id: '2',
        name: 'Lower Body Strength',
        date: 'Yesterday, 6:00 PM',
        duration: '48 min',
        calories: 480,
        totalWeight: '12,180 lbs',
        prs: 1,
        exercises: [
            { name: 'Squat', sets: 5, reps: '5', weight: '225 lbs' },
            { name: 'Romanian Deadlift', sets: 4, reps: '8', weight: '185 lbs' },
            { name: 'Leg Press', sets: 3, reps: '12', weight: '360 lbs' },
            { name: 'Leg Curl', sets: 3, reps: '12-15', weight: '90 lbs' },
        ],
    },
];


export default function LogScreen() {
    const { colors } = useTheme();
    const [expandedId, setExpandedId] = useState<string | null>('2');


    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
                {/*Header*/}
                <View style={styles.header}>
                    <View style={{ flex: 1 }}>
                        <Typo size={32} fontWeight="800" color={colors.textPrimary}>Workout Log</Typo>
                        <Typo size={15} color={colors.accent} style={{ marginTop: 2 }}>Your training history</Typo>
                    </View>

                    <TouchableOpacity style={[styles.alertBtn, { backgroundColor: colors.card }]} activeOpacity={0.7}>
                        <Icons.BugBeetleIcon size={18} color={colors.textMuted} weight="regular" />
                    </TouchableOpacity>
                </View>

                {/* Session cards */}
                {MOCK_SESSIONS.map(session => {
                    const isExpanded = expandedId === session.id;
                    return (
                        <View key={session.id} style={[styles.sessionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                            {/* Top row */}
                            <TouchableOpacity
                                onPress={() => setExpandedId(isExpanded ? null : session.id)}
                                activeOpacity={0.8}
                                style={styles.cardHeader}
                            >
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <Typo size={16} fontWeight="700" color={colors.textPrimary}>{session.name}</Typo>

                                        {session.prs > 0 && (
                                            <View style={[styles.prBadge, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
                                                <Icons.Trophy size={12} color="#F59E0B" weight="fill" />
                                                <Typo size={12} fontWeight="700" color="#F59E0B"> {session.prs} PR</Typo>
                                            </View>
                                        )}

                                    </View>
                                    <Typo size={13} color={colors.textMuted} style={{ marginTop: 2 }}>{session.date}</Typo>
                                </View>

                                {isExpanded
                                    ? <Icons.CaretUp size={16} color={colors.textMuted} weight="bold" />
                                    : <Icons.CaretDown size={16} color={colors.textMuted} weight="bold" />}
                            </TouchableOpacity>

                            {/*Stats Row*/}
                            <View style={styles.statsRow}>
                                <View style={styles.statItem}>
                                    <Icons.Clock size={14} color={colors.textMuted} />
                                    <Typo size={13} color={colors.textSecondary}> {session.duration}</Typo>
                                </View>

                                <View style={styles.statItem}>
                                    <Icons.Lightning size={14} color={colors.textMuted} weight="fill" />
                                    <Typo size={13} color={colors.textSecondary}> {session.calories} cal</Typo>
                                </View>
                                <Typo size={13} fontWeight="700" color={colors.accent}>{session.totalWeight}</Typo>
                            </View>

                            {/* Expanded exercises */}
                            {isExpanded && (
                                <View style={styles.exercisesSection}>
                                    <Typo size={11} fontWeight="600" color={colors.textMuted} style={styles.exercisesLabel}>
                                        EXERCISES ({session.exercises.length})
                                    </Typo>

                                    {session.exercises.map((ex, idx) => (
                                        <View key={idx} style={[styles.exerciseRow, { backgroundColor: colors.cardElevated }]}>
                                            <Typo size={14} fontWeight="700" color={colors.textPrimary}>{ex.name}</Typo>

                                            <View style={styles.exStats}>
                                                <Typo size={13} fontWeight="600" color="#A855F7">{ex.sets} sets</Typo>
                                                <Typo size={13} color={colors.textMuted}> • </Typo>
                                                <Typo size={13} fontWeight="600" color="#6366F1">{ex.reps} reps</Typo>
                                                <Typo size={13} color={colors.textMuted}> • </Typo>
                                                <Typo size={13} fontWeight="600" color={colors.accent}>{ex.weight}</Typo>
                                            </View>
                                        </View>

                                    ))}
                                </View>
                            )}

                        </View>
                    );
                })}
            </ScrollView>
        </SafeAreaView >
    );
}

const styles = StyleSheet.create({
    scroll: {
        paddingHorizontal: spacingX._20,
        paddingBottom: spacingY._30,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingTop: spacingY._20,
        marginBottom: spacingY._20,
    },
    alertBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 4,
    },
    sessionCard: {
        borderRadius: radius._20,
        borderWidth: 1,
        padding: spacingX._15,
        marginBottom: spacingY._15,
        gap: spacingY._10,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    prBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 20,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacingX._15,
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    exercisesSection: {
        gap: spacingY._5,
        marginTop: spacingY._5,
    },
    exercisesLabel: {
        letterSpacing: 0.8,
        marginBottom: spacingY._5,
    },
    exerciseRow: {
        borderRadius: radius._10,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    exStats: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 3,
        flexWrap: 'wrap',
    },
})