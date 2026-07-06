import Typo from '@/components/Typo';
import { radius, spacingX, spacingY } from '@/constants/theme';
import { useAlert } from '@/context/AlertContext';
import { useTheme } from '@/context/ThemeContext';
import { bugApi } from '@/utils/api';
import * as Icons from 'phosphor-react-native';
import { useState } from 'react';
import {
    KeyboardAvoidingView, Modal, Platform, Pressable,
    ScrollView, StyleSheet, TextInput, TouchableOpacity, View,
} from 'react-native';

type TabType = 'bug' | 'feature' | 'general';

const ISSUE_TYPES = [
    'UI/Visual Issue', 'Workout Logging Bug', 'Data Sync Problem',
    'Performance Issue', 'AI Coach Issue', 'Other',
];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const PRIORITY_COLORS: Record<string, string> = {
    Low: '#22C55E', Medium: '#14B8A6', High: '#F97316', Critical: '#EF4444',
};

interface BugReportModalProps {
    visible: boolean;
    onClose: () => void;
}

export default function BugReportModal({ visible, onClose }: BugReportModalProps) {
    const { colors } = useTheme();
    const { showAlert } = useAlert();

    const [activeTab, setActiveTab] = useState<TabType>('bug');
    const [issueType, setIssueType] = useState('UI/Visual Issue');
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [priority, setPriority] = useState('Medium');
    const [bugDesc, setBugDesc] = useState('');
    const [featureDesc, setFeatureDesc] = useState('');
    const [generalDesc, setGeneralDesc] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleClose = () => {
        if (submitting) return;
        setActiveTab('bug'); setIssueType('UI/Visual Issue');
        setDropdownOpen(false); setPriority('Medium');
        setBugDesc(''); setFeatureDesc(''); setGeneralDesc('');
        onClose();
    };

    const handleSubmit = async () => {
        const desc = activeTab === 'bug' ? bugDesc : activeTab === 'feature' ? featureDesc : generalDesc;
        if (!desc.trim()) {
            showAlert({ title: 'Required', message: 'Please fill in the description.', type: 'warning' });
            return;
        }
        setSubmitting(true);
        try {
            if (activeTab === 'bug') {
                await bugApi.reportBug({
                    description: bugDesc.trim(),
                    title: issueType,
                    severity: priority.toLowerCase(),
                    metadata: { submitted_from: 'mobile_app', platform: Platform.OS },
                });
            }
            showAlert({ title: 'Submitted!', message: 'Thanks for your feedback.', type: 'success' });
            handleClose();
        } catch (e: any) {
            showAlert({ title: 'Error', message: e.message || 'Failed to submit.', type: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
            <View style={styles.overlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
                    <View style={[styles.sheet, { backgroundColor: colors.card }]}>

                        {/* Handle */}
                        <View style={[styles.handle, { backgroundColor: colors.border }]} />

                        {/* Header */}
                        <View style={styles.header}>
                            <Typo size={20} fontWeight="700" color={colors.textPrimary}>Send Feedback</Typo>
                            <TouchableOpacity
                                onPress={handleClose}
                                activeOpacity={0.7}
                                style={[styles.closeBtn, { backgroundColor: colors.cardElevated }]}
                            >
                                <Icons.X size={16} color={colors.textMuted} weight="bold" />
                            </TouchableOpacity>
                        </View>

                        {/* Tabs */}
                        <View style={[styles.tabRow, { backgroundColor: colors.cardElevated }]}>
                            {(['bug', 'feature', 'general'] as TabType[]).map(tab => (
                                <TouchableOpacity
                                    key={tab}
                                    onPress={() => { setActiveTab(tab); setDropdownOpen(false); }}
                                    activeOpacity={0.7}
                                    style={[styles.tabBtn, { backgroundColor: activeTab === tab ? colors.card : 'transparent' }]}
                                >
                                    {tab === 'bug' && <Icons.BugBeetle size={20} color={activeTab === tab ? '#EF4444' : colors.textMuted} weight={activeTab === tab ? 'fill' : 'regular'} />}
                                    {tab === 'feature' && <Icons.Lightbulb size={20} color={activeTab === tab ? '#F59E0B' : colors.textMuted} weight={activeTab === tab ? 'fill' : 'regular'} />}
                                    {tab === 'general' && <Icons.ChatCircle size={20} color={activeTab === tab ? colors.accent : colors.textMuted} weight={activeTab === tab ? 'fill' : 'regular'} />}
                                </TouchableOpacity>
                            ))}
                        </View>

                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={styles.scrollContent}
                            keyboardShouldPersistTaps="handled"
                        >
                            {/* ── BUG TAB ── */}
                            {activeTab === 'bug' && (
                                <>
                                    <Typo size={13} fontWeight="600" color={colors.textMuted} style={styles.label}>Issue Type</Typo>
                                    <TouchableOpacity
                                        onPress={() => setDropdownOpen(!dropdownOpen)}
                                        activeOpacity={0.7}
                                        style={[styles.dropdown, { backgroundColor: colors.cardElevated, borderColor: dropdownOpen ? colors.accent : colors.border }]}
                                    >
                                        <Typo size={15} fontWeight="600" color={colors.accent}>{issueType}</Typo>
                                        <Icons.CaretDown size={16} color={colors.textMuted} weight="bold" />
                                    </TouchableOpacity>
                                    {dropdownOpen && (
                                        <View style={[styles.dropdownList, { backgroundColor: colors.cardElevated, borderColor: colors.border }]}>
                                            {ISSUE_TYPES.map(type => (
                                                <TouchableOpacity
                                                    key={type}
                                                    onPress={() => { setIssueType(type); setDropdownOpen(false); }}
                                                    activeOpacity={0.7}
                                                    style={styles.dropdownItem}
                                                >
                                                    <Typo size={14} fontWeight={type === issueType ? '600' : '400'} color={type === issueType ? colors.accent : colors.textSecondary}>
                                                        {type}
                                                    </Typo>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    )}

                                    <Typo size={13} fontWeight="600" color={colors.textMuted} style={StyleSheet.flatten([styles.label, { marginTop: spacingY._15 }])}>Priority</Typo>
                                    <View style={styles.priorityRow}>
                                        {PRIORITIES.map(p => (
                                            <TouchableOpacity
                                                key={p}
                                                onPress={() => setPriority(p)}
                                                activeOpacity={0.7}
                                                style={[styles.priorityChip, { backgroundColor: priority === p ? PRIORITY_COLORS[p] : colors.cardElevated }]}
                                            >
                                                <Typo size={13} fontWeight="600" color={priority === p ? '#fff' : colors.textMuted}>{p}</Typo>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    <Typo size={13} fontWeight="600" color={colors.textMuted} style={StyleSheet.flatten([styles.label, { marginTop: spacingY._15 }])}>Describe the issue</Typo>
                                    <TextInput
                                        style={[styles.textArea, { backgroundColor: colors.cardElevated, color: colors.textPrimary, borderColor: colors.border }]}
                                        placeholder="What happened? What did you expect to happen?"
                                        placeholderTextColor={colors.textMuted}
                                        value={bugDesc} onChangeText={setBugDesc}
                                        multiline textAlignVertical="top" editable={!submitting}
                                    />
                                    <TouchableOpacity style={[styles.screenshotBtn, { borderColor: colors.border }]} activeOpacity={0.7}>
                                        <Icons.Plus size={15} color={colors.textMuted} weight="bold" />
                                        <Typo size={13} color={colors.textMuted}>Attach Screenshot (optional)</Typo>
                                    </TouchableOpacity>
                                </>
                            )}

                            {/* ── FEATURE TAB ── */}
                            {activeTab === 'feature' && (
                                <>
                                    <Typo size={14} color={colors.textSecondary} style={{ marginBottom: spacingY._15, lineHeight: 20 }}>
                                        Describe a feature you'd love to see in FitAI. We read every request!
                                    </Typo>
                                    <Typo size={13} fontWeight="600" color={colors.textMuted} style={styles.label}>Describe the feature</Typo>
                                    <TextInput
                                        style={[styles.textArea, { backgroundColor: colors.cardElevated, color: colors.textPrimary, borderColor: colors.border }]}
                                        placeholder="What problem would this solve? How would it work?"
                                        placeholderTextColor={colors.textMuted}
                                        value={featureDesc} onChangeText={setFeatureDesc}
                                        multiline textAlignVertical="top" editable={!submitting}
                                    />
                                </>
                            )}

                            {/* ── GENERAL TAB ── */}
                            {activeTab === 'general' && (
                                <>
                                    <Typo size={14} color={colors.textSecondary} style={{ marginBottom: spacingY._15, lineHeight: 20 }}>
                                        Share your experience, thoughts, or suggestions. We're always listening.
                                    </Typo>
                                    <Typo size={13} fontWeight="600" color={colors.textMuted} style={styles.label}>Your feedback</Typo>
                                    <TextInput
                                        style={[styles.textArea, { backgroundColor: colors.cardElevated, color: colors.textPrimary, borderColor: colors.border }]}
                                        placeholder="Tell us what you think..."
                                        placeholderTextColor={colors.textMuted}
                                        value={generalDesc} onChangeText={setGeneralDesc}
                                        multiline textAlignVertical="top" editable={!submitting}
                                    />
                                </>
                            )}
                        </ScrollView>

                        {/* Submit */}
                        <TouchableOpacity
                            onPress={handleSubmit}
                            activeOpacity={0.85}
                            disabled={submitting}
                            style={[styles.submitBtn, { backgroundColor: colors.accent }]}
                        >
                            <Typo size={16} fontWeight="700" color={colors.textOnAccent}>
                                {submitting ? 'Submitting...' : 'Submit'}
                            </Typo>
                        </TouchableOpacity>

                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    sheet: { borderTopLeftRadius: radius._20, borderTopRightRadius: radius._20, paddingHorizontal: spacingX._20, paddingTop: 12, paddingBottom: 34 },
    handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: spacingY._15 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacingY._15 },
    closeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    tabRow: { flexDirection: 'row', borderRadius: radius._10, padding: 4, marginBottom: spacingY._20 },
    tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8 },
    scrollContent: { paddingBottom: spacingY._10 },
    label: { marginBottom: 8, letterSpacing: 0.3 },
    dropdown: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: radius._10, paddingHorizontal: spacingX._15, paddingVertical: 12 },
    dropdownList: { borderWidth: 1, borderRadius: radius._10, marginTop: 4, overflow: 'hidden' },
    dropdownItem: { paddingHorizontal: spacingX._15, paddingVertical: 12 },
    priorityRow: { flexDirection: 'row', gap: 8 },
    priorityChip: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 20 },
    textArea: { borderWidth: 1, borderRadius: radius._10, padding: spacingX._15, minHeight: 100, fontSize: 14 },
    screenshotBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: radius._10, paddingVertical: 12, marginTop: spacingY._12 },
    submitBtn: { borderRadius: radius._15, paddingVertical: 16, alignItems: 'center', marginTop: spacingY._15 },
});