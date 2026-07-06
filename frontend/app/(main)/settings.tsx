import { AuthGuard } from '@/components/AuthGuard';
import Typo from '@/components/Typo';
import { radius, spacingX, spacingY } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useRouter } from 'expo-router';
import * as Icons from 'phosphor-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ── Reusable row sub-components ───────────────────────────────────────────────

const SectionLabel = ({ label, colors }: { label: string; colors: any }) => (
    <Typo size={12} fontWeight="700" color={colors.textMuted} style={styles.sectionLabel}>
        {label}
    </Typo>
);

const rowEdge = (isFirst?: boolean, isLast?: boolean, border?: string) => ({
    ...(isFirst && { borderTopLeftRadius: radius._15, borderTopRightRadius: radius._15 }),
    ...(isLast && { borderBottomLeftRadius: radius._15, borderBottomRightRadius: radius._15 }),
    ...(!isFirst && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: border }),
});

const NavRow = ({
    icon, iconBg, label, sub, isFirst, isLast, colors, onPress,
}: {
    icon: React.ReactNode; iconBg: string; label: string; sub?: string;
    isFirst?: boolean; isLast?: boolean; colors: any; onPress?: () => void;
}) => (
    <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        style={[styles.row, rowEdge(isFirst, isLast, colors.border)]}
    >
        <View style={[styles.iconBadge, { backgroundColor: iconBg }]}>{icon}</View>
        <View style={{ flex: 1 }}>
            <Typo size={15} fontWeight="600" color={colors.textPrimary}>{label}</Typo>
            {sub && <Typo size={12} color={colors.textMuted} style={{ marginTop: 1 }}>{sub}</Typo>}
        </View>
        <Icons.CaretRight size={16} color={colors.textMuted} weight="bold" />
    </TouchableOpacity>
);

const ToggleRow = ({
    icon, iconBg, label, sub, value, onChange, isFirst, isLast, colors, accent,
}: {
    icon: React.ReactNode; iconBg: string; label: string; sub?: string;
    value: boolean; onChange: (v: boolean) => void;
    isFirst?: boolean; isLast?: boolean; colors: any; accent: string;
}) => (
    <View style={[styles.row, rowEdge(isFirst, isLast, colors.border)]}>
        <View style={[styles.iconBadge, { backgroundColor: iconBg }]}>{icon}</View>
        <View style={{ flex: 1 }}>
            <Typo size={15} fontWeight="600" color={colors.textPrimary}>{label}</Typo>
            {sub && <Typo size={12} color={colors.textMuted} style={{ marginTop: 1 }}>{sub}</Typo>}
        </View>
        <Switch
            value={value}
            onValueChange={onChange}
            trackColor={{ false: colors.cardElevated, true: accent }}
            thumbColor="#fff"
        />
    </View>
);

const SegmentRow = ({
    icon, iconBg, label, options, value, onChange, isFirst, isLast, colors, accent,
}: {
    icon: React.ReactNode; iconBg: string; label: string;
    options: string[]; value: string; onChange: (v: string) => void;
    isFirst?: boolean; isLast?: boolean; colors: any; accent: string;
}) => (
    <View style={[styles.row, { alignItems: 'flex-start' }, rowEdge(isFirst, isLast, colors.border)]}>
        <View style={[styles.iconBadge, { backgroundColor: iconBg, marginTop: 2 }]}>{icon}</View>
        <View style={{ flex: 1 }}>
            <Typo size={15} fontWeight="600" color={colors.textPrimary}>{label}</Typo>
            <View style={[styles.segmentTrack, { backgroundColor: colors.cardElevated }]}>
                {options.map(opt => (
                    <TouchableOpacity
                        key={opt}
                        onPress={() => onChange(opt)}
                        activeOpacity={0.7}
                        style={[styles.segmentBtn, { backgroundColor: value === opt ? accent : 'transparent' }]}
                    >
                        <Typo size={13} fontWeight="600" color={value === opt ? '#fff' : colors.textMuted}>{opt}</Typo>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    </View>
);

// ── Main screen ───────────────────────────────────────────────────────────────

function SettingsScreen() {
    const { colors } = useTheme();
    const router = useRouter();

    const [weightUnit, setWeightUnit] = useState('lbs');
    const [distanceUnit, setDistanceUnit] = useState('miles');
    const [weekStart, setWeekStart] = useState('Mon');
    const [workoutReminders, setWorkoutReminders] = useState(true);
    const [recoveryReminders, setRecoveryReminders] = useState(true);
    const [goalReminders, setGoalReminders] = useState(false);
    const [prNotifications, setPrNotifications] = useState(true);

    const { signOut } = useAuth();

    const handleLogout = () => {
        router.push('/welcome' as any);
        signOut();
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={() => router.back()}
                        style={[styles.backBtn, { backgroundColor: colors.card }]}
                        activeOpacity={0.7}
                    >
                        <Icons.CaretLeft size={18} color={colors.textPrimary} weight="bold" />
                    </TouchableOpacity>
                    <Typo size={26} fontWeight="800" color={colors.textPrimary}>Settings</Typo>
                    <View style={{ width: 36 }} />
                </View>

                {/* ACCOUNT */}
                <SectionLabel label="ACCOUNT" colors={colors} />
                <View style={[styles.group, { backgroundColor: colors.card }]}>
                    <NavRow icon={<Icons.Envelope size={16} color="#fff" weight="fill" />} iconBg="#6366F1"
                        label="Email" sub="alex@example.com" isFirst colors={colors} />
                    <NavRow icon={<Icons.Lock size={16} color="#fff" weight="fill" />} iconBg="#14B8A6"
                        label="Password" sub="Change password" colors={colors} />
                    <NavRow icon={<Icons.LinkSimple size={16} color="#fff" weight="bold" />} iconBg="#F97316"
                        label="Connected Accounts" sub="Apple Health, Strava" isLast colors={colors} />
                </View>

                {/* WORKOUT PREFERENCES */}
                <SectionLabel label="WORKOUT PREFERENCES" colors={colors} />
                <View style={[styles.group, { backgroundColor: colors.card }]}>
                    <SegmentRow icon={<Icons.Barbell size={16} color="#fff" weight="fill" />} iconBg="#14B8A6"
                        label="Weight Units" options={['kg', 'lbs']} value={weightUnit} onChange={setWeightUnit}
                        isFirst colors={colors} accent={colors.accent} />
                    <SegmentRow icon={<Icons.Ruler size={16} color="#fff" weight="fill" />} iconBg="#14B8A6"
                        label="Distance Units" options={['km', 'miles']} value={distanceUnit} onChange={setDistanceUnit}
                        colors={colors} accent={colors.accent} />
                    <SegmentRow icon={<Icons.CalendarBlank size={16} color="#fff" weight="fill" />} iconBg="#F97316"
                        label="Week Starts" options={['Mon', 'Sun', 'Sat']} value={weekStart} onChange={setWeekStart}
                        isLast colors={colors} accent={colors.accent} />
                </View>

                {/* AI COACH */}
                <SectionLabel label="AI COACH" colors={colors} />
                <View style={[styles.group, { backgroundColor: colors.card }]}>
                    <NavRow icon={<Icons.Robot size={16} color="#fff" weight="fill" />} iconBg="#A855F7"
                        label="Coach Personality" sub="Motivating & Direct" isFirst colors={colors} />
                    <NavRow icon={<Icons.AlignLeft size={16} color="#fff" weight="bold" />} iconBg="#14B8A6"
                        label="Response Length" sub="Concise" colors={colors} />
                    <NavRow icon={<Icons.ArrowsClockwise size={16} color="#fff" weight="bold" />} iconBg="#14B8A6"
                        label="Coaching Style" sub="Progressive Overload" isLast colors={colors} />
                </View>

                {/* NOTIFICATIONS */}
                <SectionLabel label="NOTIFICATIONS" colors={colors} />
                <View style={[styles.group, { backgroundColor: colors.card }]}>
                    <ToggleRow icon={<Icons.Bell size={16} color="#fff" weight="fill" />} iconBg="#F59E0B"
                        label="Workout Reminders" sub="Daily at 7:00 AM"
                        value={workoutReminders} onChange={setWorkoutReminders} isFirst colors={colors} accent={colors.accent} />
                    <ToggleRow icon={<Icons.Bell size={16} color="#fff" weight="fill" />} iconBg="#14B8A6"
                        label="Recovery Reminders" sub="Rest day suggestions"
                        value={recoveryReminders} onChange={setRecoveryReminders} colors={colors} accent={colors.accent} />
                    <ToggleRow icon={<Icons.Bell size={16} color="#fff" weight="fill" />} iconBg="#14B8A6"
                        label="Goal Reminders" sub="Weekly goal check-ins"
                        value={goalReminders} onChange={setGoalReminders} colors={colors} accent={colors.accent} />
                    <ToggleRow icon={<Icons.Bell size={16} color="#fff" weight="fill" />} iconBg="#A855F7"
                        label="PR Notifications" sub="Celebrate new records"
                        value={prNotifications} onChange={setPrNotifications} isLast colors={colors} accent={colors.accent} />
                </View>

                {/* PRIVACY & DATA */}
                <SectionLabel label="PRIVACY & DATA" colors={colors} />
                <View style={[styles.group, { backgroundColor: colors.card }]}>
                    <NavRow icon={<Icons.DownloadSimple size={16} color="#fff" weight="bold" />} iconBg="#14B8A6"
                        label="Export Workout Data" sub="Download as CSV" isFirst colors={colors} />
                    <NavRow icon={<Icons.FileText size={16} color="#fff" weight="fill" />} iconBg="#6366F1"
                        label="Download Progress History" sub="PDF report" colors={colors} />
                    <NavRow icon={<Icons.ShieldCheck size={16} color="#fff" weight="fill" />} iconBg="#4B5563"
                        label="Privacy Policy" isLast colors={colors} />
                </View>

                {/* SUPPORT */}
                <SectionLabel label="SUPPORT" colors={colors} />
                <View style={[styles.group, { backgroundColor: colors.card }]}>
                    <NavRow icon={<Icons.BugBeetle size={16} color="#fff" weight="fill" />} iconBg="#EF4444"
                        label="Report a Bug" isFirst colors={colors} />
                    <NavRow icon={<Icons.Lightbulb size={16} color="#fff" weight="fill" />} iconBg="#F59E0B"
                        label="Feature Request" colors={colors} />
                    <NavRow icon={<Icons.ChatCircle size={16} color="#fff" weight="fill" />} iconBg="#14B8A6"
                        label="Contact Support" colors={colors} />
                    <NavRow icon={<Icons.Question size={16} color="#fff" weight="bold" />} iconBg="#4B5563"
                        label="Help Center" isLast colors={colors} />
                </View>

                {/* Log Out */}
                <TouchableOpacity
                    style={[styles.group, styles.row, { backgroundColor: colors.card, marginTop: spacingY._20 }]}
                    activeOpacity={0.7}
                    onPress={handleLogout}
                >
                    <View style={[styles.iconBadge, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
                        <Icons.SignOut size={16} color="#EF4444" weight="bold" />
                    </View>
                    <Typo size={15} fontWeight="600" color="#EF4444">Log Out</Typo>
                </TouchableOpacity>

                <Typo size={13} color={colors.textMuted} style={styles.footer}>FitAI v1.0.0</Typo>

            </ScrollView>
        </SafeAreaView>
    );
}

export default function ProtectedSettings() {
    return (
        <AuthGuard>
            <SettingsScreen />
        </AuthGuard>
    );
}

const styles = StyleSheet.create({
    scroll: { paddingHorizontal: spacingX._20, paddingBottom: spacingY._40 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacingY._20, marginBottom: spacingY._25 },
    backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    sectionLabel: { letterSpacing: 0.8, marginBottom: 8, marginTop: spacingY._20, marginLeft: 4 },
    group: { borderRadius: radius._15, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacingX._15, paddingVertical: 14 },
    iconBadge: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    segmentTrack: { flexDirection: 'row', borderRadius: 8, padding: 3, marginTop: 8 },
    segmentBtn: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 6 },
    footer: { textAlign: 'center', marginTop: spacingY._30 },
});