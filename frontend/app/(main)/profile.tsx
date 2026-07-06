import Typo from '@/components/Typo';
import { radius, spacingX, spacingY } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Icons from 'phosphor-react-native';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ── Mock Data ─────────────────────────────────────────────────────────────────
const SNAPSHOT_STATS = [
    { label: 'Current Streak', value: '12', sub: 'days', icon: 'Fire', iconColor: '#F97316' },
    { label: 'Workouts Logged', value: '104', sub: 'total', icon: 'Barbell', iconColor: '#6366F1' },
    { label: 'Personal Records', value: '23', sub: 'achieved', icon: 'Trophy', iconColor: '#F59E0B' },
    { label: 'Monthly Volume', value: '84k', sub: 'lbs this month', icon: 'ChartLineUp', iconColor: '#14B8A6' },
];

const ACTIVE_GOALS = [
    { id: '1', label: 'Build Muscle Mass', progress: 0.68, color: '#14B8A6' },
    { id: '2', label: 'Increase Bench Press to 225 lbs', progress: 0.82, color: '#14B8A6' },
    { id: '3', label: 'Run 5K in under 25 min', progress: 0.45, color: '#A855F7' },
];

const ACHIEVEMENTS = [
    { id: '1', label: 'First PR', icon: 'Trophy', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', unlocked: true },
    { id: '2', label: '7-Day\nStreak', icon: 'Fire', color: '#F97316', bg: 'rgba(249,115,22,0.15)', unlocked: true },
    { id: '3', label: '100\nWorkouts', icon: 'Barbell', color: '#14B8A6', bg: 'rgba(20,184,166,0.15)', unlocked: true },
    { id: '4', label: '30-Day\nStreak', icon: 'Star', color: '#6B7280', bg: 'rgba(107,114,128,0.08)', unlocked: false },
    { id: '5', label: 'Elite\nLifter', icon: 'Medal', color: '#6B7280', bg: 'rgba(107,114,128,0.08)', unlocked: false },
    { id: '6', label: 'Power\nWeek', icon: 'Lightning', color: '#A855F7', bg: 'rgba(168,85,247,0.15)', unlocked: true },
];

const RECENT_ACTIVITY = [
    { id: '1', icon: 'Barbell', iconColor: '#6366F1', iconBg: 'rgba(99,102,241,0.15)', title: 'Upper Body Power', sub: '8,240 lbs · 52 min', date: 'Today' },
    { id: '2', icon: 'Trophy', iconColor: '#F59E0B', iconBg: 'rgba(245,158,11,0.15)', title: 'Bench Press PR', sub: '185 lbs — new record!', date: 'Today' },
    { id: '3', icon: 'Barbell', iconColor: '#6366F1', iconBg: 'rgba(99,102,241,0.15)', title: 'Lower Body Strength', sub: '12,180 lbs · 48 min', date: 'Yesterday' },
    { id: '4', icon: 'Star', iconColor: '#14B8A6', iconBg: 'rgba(20,184,166,0.15)', title: '100 Workouts!', sub: 'Achievement unlocked', date: 'Mar 20' },
];

// ── Screen ────────────────────────────────────────────────────────────────────
export default function ProfileScreen() {
    const { colors } = useTheme();

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

                {/* Header */}
                <View style={styles.pageHeader}>
                    <Typo size={32} fontWeight="800" color={colors.textPrimary}>Profile</Typo>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity
                            style={[styles.iconBtn, { backgroundColor: colors.card }]}
                            activeOpacity={0.7}
                            onPress={() => router.push('/settings' as any)}
                        >
                            <Icons.Gear size={18} color={colors.textMuted} weight="regular" />
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.card }]} activeOpacity={0.7}>
                            <Icons.Warning size={18} color={colors.textMuted} weight="regular" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* User card */}
                <View style={[styles.userCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <LinearGradient
                        colors={['#14B8A6', '#6366F1']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={styles.avatar}
                    >
                        <Typo size={24} fontWeight="800" color="#fff">AJ</Typo>
                    </LinearGradient>
                    <View style={{ flex: 1 }}>
                        <Typo size={20} fontWeight="800" color={colors.textPrimary}>Alex Johnson</Typo>
                        <View style={[styles.levelBadge, { backgroundColor: colors.accentDim }]}>
                            <Typo size={12} fontWeight="600" color={colors.accent}>Intermediate</Typo>
                        </View>
                        <Typo size={13} color={colors.textMuted} style={{ marginTop: 5 }}>Member since January 2024</Typo>
                    </View>
                </View>

                {/* Fitness Snapshot */}
                <Typo size={22} fontWeight="800" color={colors.textPrimary} style={styles.sectionTitle}>
                    Fitness Snapshot
                </Typo>
                <View style={styles.snapshotGrid}>
                    {SNAPSHOT_STATS.map(stat => {
                        const IconComp = Icons[stat.icon as keyof typeof Icons] as any;
                        return (
                            <View key={stat.label} style={[styles.snapshotCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                                    <IconComp size={13} color={stat.iconColor} weight="fill" />
                                    <Typo size={11} color={colors.textMuted}>{stat.label}</Typo>
                                </View>
                                <Typo size={28} fontWeight="800" color={colors.textPrimary}>{stat.value}</Typo>
                                <Typo size={12} color={colors.textMuted}>{stat.sub}</Typo>
                            </View>
                        );
                    })}
                </View>

                {/* Body Weight */}
                <View style={[styles.bodyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={[styles.bodyIconWrap, { backgroundColor: colors.accentDim }]}>
                        <Icons.Scales size={20} color={colors.accent} weight="regular" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Typo size={15} fontWeight="700" color={colors.textPrimary}>Body Weight</Typo>
                        <Typo size={12} color={colors.textMuted}>Last updated today</Typo>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Typo size={26} fontWeight="800" color={colors.textPrimary}>182</Typo>
                        <Typo size={12} color={colors.textMuted}>lbs</Typo>
                    </View>
                </View>

                {/* Active Goals */}
                <View style={styles.sectionHeader}>
                    <Typo size={22} fontWeight="800" color={colors.textPrimary}>Active Goals</Typo>
                    <TouchableOpacity activeOpacity={0.7}>
                        <Typo size={14} fontWeight="600" color={colors.accent}>Manage</Typo>
                    </TouchableOpacity>
                </View>
                {ACTIVE_GOALS.map(goal => (
                    <View key={goal.id} style={[styles.goalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <View style={styles.goalTop}>
                            <View style={[styles.goalDot, { backgroundColor: goal.color }]} />
                            <Typo size={14} fontWeight="600" color={colors.textPrimary} style={{ flex: 1 }}>{goal.label}</Typo>
                            <Typo size={14} fontWeight="700" color={goal.color}>{Math.round(goal.progress * 100)}%</Typo>
                        </View>
                        <View style={[styles.progressTrack, { backgroundColor: colors.cardElevated }]}>
                            <View style={[styles.progressFill, { width: `${goal.progress * 100}%` as any, backgroundColor: goal.color }]} />
                        </View>
                    </View>
                ))}

                {/* Achievements */}
                <View style={[styles.sectionHeader, { marginTop: spacingY._10 }]}>
                    <Typo size={22} fontWeight="800" color={colors.textPrimary}>Achievements</Typo>
                    <TouchableOpacity activeOpacity={0.7}>
                        <Typo size={14} fontWeight="600" color={colors.accent}>View All</Typo>
                    </TouchableOpacity>
                </View>
                <View style={[styles.achievementsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {[0, 1].map(row => (
                        <View key={row} style={[styles.badgeRow, row === 0 && { marginBottom: 8 }]}>
                            {ACHIEVEMENTS.slice(row * 3, row * 3 + 3).map(badge => {
                                const IconComp = Icons[badge.icon as keyof typeof Icons] as any;
                                return (
                                    <View key={badge.id} style={[styles.badgeItem, { backgroundColor: colors.cardElevated }]}>
                                        <View style={[styles.badgeIconWrap, { backgroundColor: badge.bg }]}>
                                            <IconComp size={26} color={badge.color} weight={badge.unlocked ? 'fill' : 'regular'} />
                                        </View>
                                        <Typo size={11} color={badge.unlocked ? colors.textSecondary : colors.textMuted} style={styles.badgeLabel}>
                                            {badge.label}
                                        </Typo>
                                    </View>
                                );
                            })}
                        </View>
                    ))}
                </View>

                {/* Recent Activity */}
                <Typo size={22} fontWeight="800" color={colors.textPrimary} style={styles.sectionTitle}>
                    Recent Activity
                </Typo>
                <View style={[styles.activityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {RECENT_ACTIVITY.map((item, idx) => {
                        const IconComp = Icons[item.icon as keyof typeof Icons] as any;
                        return (
                            <TouchableOpacity
                                key={item.id}
                                activeOpacity={0.7}
                                style={[
                                    styles.activityRow,
                                    { borderBottomColor: colors.border },
                                    idx === RECENT_ACTIVITY.length - 1 && { borderBottomWidth: 0 },
                                ]}
                            >
                                <View style={[styles.activityIcon, { backgroundColor: item.iconBg }]}>
                                    <IconComp size={18} color={item.iconColor} weight="fill" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <Typo size={14} fontWeight="700" color={colors.textPrimary}>{item.title}</Typo>
                                        <Typo size={12} color={colors.textMuted}>{item.date}</Typo>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                                        <Typo size={12} color={colors.textMuted}>{item.sub}</Typo>
                                        <Icons.CaretRight size={12} color={colors.textMuted} weight="bold" />
                                    </View>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>

            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    scroll: { paddingHorizontal: spacingX._20, paddingBottom: spacingY._30 },
    pageHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: spacingY._20, marginBottom: spacingY._20,
    },
    iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    userCard: {
        flexDirection: 'row', alignItems: 'center', gap: 15,
        borderRadius: radius._20, borderWidth: 1, padding: spacingX._15, marginBottom: spacingY._20,
    },
    avatar: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center' },
    levelBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, marginTop: 5 },
    sectionTitle: { marginBottom: spacingY._12 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacingY._12 },
    snapshotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: spacingY._10 },
    snapshotCard: { width: '48%', borderRadius: radius._15, borderWidth: 1, padding: 15 },
    bodyCard: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        borderRadius: radius._15, borderWidth: 1, padding: spacingX._15, marginBottom: spacingY._20,
    },
    bodyIconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
    goalCard: { borderRadius: radius._15, borderWidth: 1, padding: spacingX._15, marginBottom: spacingY._10 },
    goalTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    goalDot: { width: 8, height: 8, borderRadius: 4 },
    progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: 6, borderRadius: 3 },
    achievementsCard: { borderRadius: radius._20, borderWidth: 1, padding: spacingX._15, marginBottom: spacingY._20 },
    badgeRow: { flexDirection: 'row', gap: 8 },
    badgeItem: { flex: 1, alignItems: 'center', borderRadius: radius._15, padding: 12 },
    badgeIconWrap: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    badgeLabel: { textAlign: 'center', marginTop: 6 },
    activityCard: { borderRadius: radius._20, borderWidth: 1, overflow: 'hidden', marginBottom: spacingY._20 },
    activityRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: spacingX._15, paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    activityIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});