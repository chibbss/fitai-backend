import Typo from '@/components/Typo';
import { radius, spacingX, spacingY } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import * as Icons from 'phosphor-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

// ── Mock Data ─────────────────────────────────────────────────────────────────
const VOLUME_DATA = [
    { label: 'Jan', value: 62000 }, { label: 'Feb', value: 72000 },
    { label: 'Mar', value: 77000 }, { label: 'Apr', value: 73000 },
    { label: 'May', value: 79000 }, { label: 'Jun', value: 84000 },
];
const STRENGTH_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const STRENGTH_LINES = [
    { label: 'Bench', color: '#14B8A6', data: [190, 195, 200, 205, 210, 215] },
    { label: 'Squat', color: '#6366F1', data: [230, 238, 244, 250, 255, 260] },
    { label: 'Deadlift', color: '#F59E0B', data: [270, 280, 290, 300, 310, 320] },
];
const CONSISTENCY_DATA = [
    { label: 'W1', value: 3 }, { label: 'W2', value: 4 },
    { label: 'W3', value: 3 }, { label: 'W4', value: 5 },
    { label: 'W5', value: 4 }, { label: 'W6', value: 3 },
    { label: 'W7', value: 4 }, { label: 'W8', value: 5 },
];
const WORKOUT_DAYS_JUNE = new Set([1, 3, 5, 8, 10, 12, 15, 17, 19]);
const TODAY_DAY = 22;
const CAL_DAYS_HEADER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const THIS_WEEK = [
    { day: 'Mon', initial: 'M', exercises: 8, active: true },
    { day: 'Tue', initial: 'T', exercises: 0, active: false },
    { day: 'Wed', initial: 'W', exercises: 6, active: true },
    { day: 'Thu', initial: 'T', exercises: 0, active: false },
    { day: 'Fri', initial: 'F', exercises: 10, active: true },
    { day: 'Sat', initial: 'S', exercises: 0, active: false },
    { day: 'Sun', initial: 'S', exercises: 0, active: false },
];

// ── SVG Charts ────────────────────────────────────────────────────────────────
const BarChart = ({
    data, width, height = 140, barColor, maxOverride,
}: {
    data: { label: string; value: number }[];
    width: number; height?: number; barColor: string; maxOverride?: number;
}) => {
    const L = 36, B = 20, T = 8;
    const pw = width - L, ph = height - B - T;
    const maxVal = maxOverride ?? Math.max(...data.map(d => d.value));
    const bw = (pw / data.length) * 0.55;
    const gap = pw / data.length;
    const fmt = (v: number) => maxVal >= 10000 ? `${Math.round(v / 1000)}k` : `${v}`;

    return (
        <Svg width={width} height={height}>
            {Array.from({ length: 5 }, (_, i) => {
                const val = (maxVal / 4) * i;
                const y = T + ph - (val / maxVal) * ph;
                return [
                    <Line key={`gl${i}`} x1={L} y1={y} x2={width} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />,
                    <SvgText key={`yl${i}`} x={L - 4} y={y + 4} fontSize={10} fill="rgba(255,255,255,0.3)" textAnchor="end">{fmt(val)}</SvgText>,
                ];
            }).flat()}
            {data.map((d, i) => {
                const bh = Math.max((d.value / maxVal) * ph, 2);
                const x = L + i * gap + (gap - bw) / 2;
                const y = T + ph - bh;
                return [
                    <Rect key={`b${i}`} x={x} y={y} width={bw} height={bh} rx={4} fill={barColor} />,
                    <SvgText key={`xl${i}`} x={x + bw / 2} y={height - 4} fontSize={10} fill="rgba(255,255,255,0.35)" textAnchor="middle">{d.label}</SvgText>,
                ];
            }).flat()}
        </Svg>
    );
};

const LineChart = ({
    lines, xLabels, width, height = 140,
}: {
    lines: { label: string; color: string; data: number[] }[];
    xLabels: string[]; width: number; height?: number;
}) => {
    const L = 40, B = 20, T = 8;
    const pw = width - L, ph = height - B - T;
    const allVals = lines.flatMap(l => l.data);
    const minVal = Math.min(...allVals), maxVal = Math.max(...allVals);
    const range = maxVal - minVal || 1;
    const xStep = pw / (xLabels.length - 1);
    const gx = (i: number) => L + i * xStep;
    const gy = (v: number) => T + ph - ((v - minVal) / range) * ph;

    return (
        <Svg width={width} height={height}>
            {Array.from({ length: 5 }, (_, i) => {
                const val = minVal + (range / 4) * i;
                const y = gy(val);
                return [
                    <Line key={`gl${i}`} x1={L} y1={y} x2={width} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />,
                    <SvgText key={`yl${i}`} x={L - 4} y={y + 4} fontSize={10} fill="rgba(255,255,255,0.3)" textAnchor="end">{Math.round(val)}</SvgText>,
                ];
            }).flat()}
            {lines.map(line => (
                <Path
                    key={line.label}
                    d={line.data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${gx(i)} ${gy(v)}`).join(' ')}
                    stroke={line.color} strokeWidth={2} fill="none"
                    strokeLinecap="round" strokeLinejoin="round"
                />
            ))}
            {xLabels.map((label, i) => (
                <SvgText key={label} x={gx(i)} y={height - 4} fontSize={10} fill="rgba(255,255,255,0.35)" textAnchor="middle">{label}</SvgText>
            ))}
        </Svg>
    );
};

const RadarChart = ({ size, accentColor }: { size: number; accentColor: string }) => {
    const C = size / 2, R = size * 0.3, N = 5;
    const LABELS = ['Chest', 'Back', 'Legs', 'Arms', 'Core'];
    const DATA = [0.7, 0.8, 0.6, 0.5, 0.4];
    const pt = (axis: number, r: number) => {
        const a = (axis * 2 * Math.PI / N) - Math.PI / 2;
        return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
    };
    const polyPath = (r: number) => {
        const pts = Array.from({ length: N }, (_, i) => pt(i, r));
        return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
    };
    const dataPoints = DATA.map((v, i) => pt(i, v * R));
    const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

    return (
        <Svg width={size} height={size}>
            {[0.25, 0.5, 0.75, 1].map((r, i) => (
                <Path key={i} d={polyPath(r * R)} stroke="rgba(255,255,255,0.08)" strokeWidth={1} fill="none" />
            ))}
            {Array.from({ length: N }, (_, i) => {
                const o = pt(i, R);
                return <Line key={i} x1={C} y1={C} x2={o.x} y2={o.y} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />;
            })}
            <Path d={dataPath} fill={`${accentColor}33`} stroke={accentColor} strokeWidth={2} />
            {dataPoints.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={3} fill={accentColor} />)}
            {LABELS.map((label, i) => {
                const pos = pt(i, R + 18);
                return <SvgText key={label} x={pos.x} y={pos.y + 4} fontSize={10} fill="rgba(255,255,255,0.5)" textAnchor="middle">{label}</SvgText>;
            })}
        </Svg>
    );
};

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function StatsScreen() {
    const { colors } = useTheme();
    const { width: screenWidth } = useWindowDimensions();
    const [volumePeriod, setVolumePeriod] = useState<'Weekly' | 'Monthly' | 'All'>('Monthly');
    const chartWidth = screenWidth - 40 - 30;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

                {/* Header */}
                <View style={styles.pageHeader}>
                    <View style={{ flex: 1 }}>
                        <Typo size={32} fontWeight="800" color={colors.textPrimary}>Stats</Typo>
                        <Typo size={15} color={colors.accent} style={{ marginTop: 2 }}>Your progress at a glance</Typo>
                    </View>
                    <TouchableOpacity style={[styles.alertBtn, { backgroundColor: colors.card }]} activeOpacity={0.7}>
                        <Icons.BugBeetleIcon size={18} color={colors.textMuted} weight="regular" />
                    </TouchableOpacity>
                </View>

                {/* Top stat cards */}
                <View style={styles.statRow}>
                    {[
                        { icon: <Icons.Fire size={14} color="#F59E0B" weight="fill" />, label: 'Streak', value: '12', sub: 'days' },
                        { icon: <Icons.Trophy size={14} color="#F59E0B" weight="fill" />, label: 'PRs', value: '8', sub: 'this month' },
                        { icon: <Icons.ChartLineUp size={14} color={colors.accent} weight="bold" />, label: 'Volume', value: '84k', sub: 'lbs total' },
                    ].map(s => (
                        <View key={s.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                                {s.icon}
                                <Typo size={12} color={colors.textMuted}>{s.label}</Typo>
                            </View>
                            <Typo size={26} fontWeight="800" color={colors.textPrimary}>{s.value}</Typo>
                            <Typo size={12} color={colors.textMuted}>{s.sub}</Typo>
                        </View>
                    ))}
                </View>

                {/* Calendar */}
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.calHeader}>
                        <Typo size={18} fontWeight="700" color={colors.textPrimary}>June 2026</Typo>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity style={[styles.calNavBtn, { backgroundColor: colors.cardElevated }]}>
                                <Icons.CaretLeft size={14} color={colors.textMuted} weight="bold" />
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.calNavBtn, { backgroundColor: colors.cardElevated }]}>
                                <Icons.CaretRight size={14} color={colors.textMuted} weight="bold" />
                            </TouchableOpacity>
                        </View>
                    </View>
                    <View style={styles.calRow}>
                        {CAL_DAYS_HEADER.map(d => (
                            <Typo key={d} size={11} color={colors.textMuted} style={styles.calCell}>{d}</Typo>
                        ))}
                    </View>
                    {Array.from({ length: 5 }, (_, weekIdx) => (
                        <View key={weekIdx} style={styles.calRow}>
                            {Array.from({ length: 7 }, (_, dayIdx) => {
                                const day = weekIdx * 7 + dayIdx + 1;
                                if (day > 30) return <View key={dayIdx} style={styles.calCell} />;
                                const isToday = day === TODAY_DAY;
                                const hasWorkout = WORKOUT_DAYS_JUNE.has(day);
                                return (
                                    <View key={dayIdx} style={[styles.calCell, { alignItems: 'center' }]}>
                                        <View style={[styles.calDayWrap, isToday && { borderColor: colors.accent, borderWidth: 1.5 }]}>
                                            <Typo size={13} color={isToday ? colors.accent : colors.textSecondary} fontWeight={isToday ? '700' : '400'}>
                                                {day}
                                            </Typo>
                                        </View>
                                        {hasWorkout && <View style={[styles.calDot, { backgroundColor: colors.accent }]} />}
                                    </View>
                                );
                            })}
                        </View>
                    ))}
                </View>

                {/* Training Distribution */}
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Typo size={18} fontWeight="700" color={colors.textPrimary}>Training Distribution</Typo>
                    <Typo size={13} color={colors.textMuted} style={{ marginTop: 2 }}>Muscle group focus this month</Typo>
                    <View style={{ alignItems: 'center', marginTop: spacingY._10 }}>
                        <RadarChart size={200} accentColor={colors.accent} />
                    </View>
                </View>

                {/* Volume Trend */}
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View>
                            <Typo size={18} fontWeight="700" color={colors.textPrimary}>Volume Trend</Typo>
                            <Typo size={13} color={colors.accent} style={{ marginTop: 2 }}>Total training volume</Typo>
                        </View>
                        <View style={styles.toggleRow}>
                            {(['Weekly', 'Monthly', 'All'] as const).map(p => (
                                <TouchableOpacity
                                    key={p}
                                    onPress={() => setVolumePeriod(p)}
                                    style={[styles.toggleBtn, { backgroundColor: volumePeriod === p ? colors.accent : colors.cardElevated }]}
                                >
                                    <Typo size={12} fontWeight="600" color={volumePeriod === p ? colors.textOnAccent : colors.textMuted}>{p}</Typo>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                    <View style={{ marginTop: spacingY._15 }}>
                        <BarChart data={VOLUME_DATA} width={chartWidth} maxOverride={100000} barColor={colors.accent} />
                    </View>
                </View>

                {/* Strength Progression */}
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Typo size={18} fontWeight="700" color={colors.textPrimary}>Strength Progression</Typo>
                    <Typo size={13} color={colors.accent} style={{ marginTop: 2 }}>1RM estimates in lbs</Typo>
                    <View style={{ marginTop: spacingY._15 }}>
                        <LineChart lines={STRENGTH_LINES} xLabels={STRENGTH_MONTHS} width={chartWidth} />
                    </View>
                    <View style={styles.legend}>
                        {STRENGTH_LINES.map(l => (
                            <View key={l.label} style={styles.legendItem}>
                                <View style={[styles.legendDot, { backgroundColor: l.color }]} />
                                <Typo size={12} color={colors.textMuted}>{l.label}</Typo>
                            </View>
                        ))}
                    </View>
                </View>

                {/* Workout Consistency */}
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Typo size={18} fontWeight="700" color={colors.textPrimary}>Workout Consistency</Typo>
                    <Typo size={13} color={colors.textMuted} style={{ marginTop: 2 }}>Sessions per week over 8 weeks</Typo>
                    <View style={{ marginTop: spacingY._15 }}>
                        <BarChart data={CONSISTENCY_DATA} width={chartWidth} maxOverride={5} barColor={colors.accent} />
                    </View>
                    <View style={[styles.streakRow, { backgroundColor: colors.cardElevated }]}>
                        <View>
                            <Typo size={14} fontWeight="700" color={colors.textPrimary}>Current Streak</Typo>
                            <Typo size={12} color={colors.textMuted}>Personal best: 21 days</Typo>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Icons.Fire size={18} color="#F59E0B" weight="fill" />
                            <Typo size={22} fontWeight="800" color={colors.textPrimary}>12</Typo>
                            <Typo size={13} color={colors.textMuted}> days</Typo>
                        </View>
                    </View>
                </View>

                {/* This Week */}
                <View style={{ marginBottom: spacingY._20 }}>
                    <Typo size={22} fontWeight="800" color={colors.textPrimary} style={{ marginBottom: spacingY._15 }}>This Week</Typo>
                    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 0, paddingHorizontal: 0, paddingVertical: 0, overflow: 'hidden' }]}>
                        {THIS_WEEK.map((item, idx) => (
                            <View
                                key={item.day}
                                style={[
                                    styles.weekRow,
                                    { borderBottomColor: colors.border },
                                    idx === THIS_WEEK.length - 1 && { borderBottomWidth: 0 },
                                ]}
                            >
                                <View style={[styles.weekInitial, { backgroundColor: item.active ? colors.accentDim : colors.cardElevated }]}>
                                    <Typo size={13} fontWeight="700" color={item.active ? colors.accent : colors.textMuted}>{item.initial}</Typo>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Typo size={14} fontWeight="700" color={colors.textPrimary}>{item.day}</Typo>
                                    <Typo size={12} color={colors.textMuted}>{item.active ? `${item.exercises} exercises` : 'Rest day'}</Typo>
                                </View>
                                {item.active && <Icons.CheckCircle size={22} color={colors.accent} weight="fill" />}
                            </View>
                        ))}
                    </View>
                </View>

            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    scroll: {
        paddingHorizontal: spacingX._20,
        paddingBottom: spacingY._30,
    },
    pageHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingTop: spacingY._20,
        marginBottom: spacingY._20,
    },
    alertBtn: {
        width: 36, height: 36, borderRadius: 18,
        alignItems: 'center', justifyContent: 'center', marginTop: 4,
    },
    statRow: { flexDirection: 'row', gap: spacingX._10, marginBottom: spacingY._15 },
    statCard: { flex: 1, borderRadius: radius._15, borderWidth: 1, padding: 12 },
    card: { borderRadius: radius._20, borderWidth: 1, padding: spacingX._15, marginBottom: spacingY._15 },
    calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    calNavBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    calRow: { flexDirection: 'row', justifyContent: 'space-between' },
    calCell: { flex: 1, alignItems: 'center', paddingVertical: 4 },
    calDayWrap: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    calDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
    toggleRow: { flexDirection: 'row', gap: 4 },
    toggleBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
    legend: { flexDirection: 'row', gap: spacingX._15, marginTop: spacingY._10 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    streakRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        borderRadius: 12, padding: spacingX._15, marginTop: spacingY._15,
    },
    weekRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: spacingX._15, paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    weekInitial: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});