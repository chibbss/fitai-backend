import React, { useState } from 'react';
import {
    View,
    Modal,
    StyleSheet,
    TouchableOpacity,
    TouchableWithoutFeedback,
    ScrollView,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    StatusBar,
} from 'react-native';
import { radius, spacingX, spacingY, colors } from '@/constants/theme';
import Typo from '@/components/Typo';
import Button from '@/components/Button';
import * as Icons from 'phosphor-react-native';
import { verticalScale } from '@/utils/styling';
import { useTheme } from '@/context/ThemeContext';
import { bugApi } from '@/utils/api';
import { useAlert } from '@/context/AlertContext';

interface BugReportModalProps {
    visible: boolean;
    onClose: () => void;
}

const BugReportModal: React.FC<BugReportModalProps> = ({ visible, onClose }) => {
    const { colors: themeColors } = useTheme();
    const { showAlert } = useAlert();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [severity, setSeverity] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Get severity color based on level
    const getSeverityColor = (level: string) => {
        switch (level) {
            case 'low':
                return colors.green; // #16a34a
            case 'medium':
                return colors.sunriseCoral; // #f97316
            case 'high':
                return colors.rose; // #ef4444
            default:
                return themeColors.accentPrimary;
        }
    };

    const handleSubmit = async () => {
        if (!description.trim()) {
            showAlert({
                title: 'Description Required',
                message: 'Please provide a description of the bug.',
                type: 'warning',
            });
            return;
        }

        if (description.length > 4000) {
            showAlert({
                title: 'Description Too Long',
                message: 'Description must be 4000 characters or less.',
                type: 'warning',
            });
            return;
        }

        setIsSubmitting(true);
        try {
            await bugApi.reportBug({
                description: description.trim(),
                title: title.trim() || undefined,
                severity: severity || undefined,
                metadata: {
                    submitted_from: 'mobile_app',
                    platform: Platform.OS,
                },
            });

            showAlert({
                title: 'Bug Reported',
                message: 'Thank you for reporting this bug! We\'ll look into it.',
                type: 'success',
            });

            // Reset form
            setTitle('');
            setDescription('');
            setSeverity('');
            onClose();
        } catch (error: any) {
            showAlert({
                title: 'Error',
                message: error.message || 'Failed to submit bug report. Please try again.',
                type: 'error',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        if (!isSubmitting) {
            setTitle('');
            setDescription('');
            setSeverity('');
            onClose();
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={handleClose}
            statusBarTranslucent={true}
        >
            <StatusBar barStyle="light-content" backgroundColor="rgba(0, 0, 0, 0.5)" translucent />
            <TouchableWithoutFeedback onPress={handleClose}>
                <View style={styles.overlay}>
                    <TouchableWithoutFeedback>
                        <KeyboardAvoidingView
                            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                            style={styles.container}
                        >
                            <View style={[styles.modal, { backgroundColor: themeColors.panel }]}>
                                {/* Header */}
                                <View style={styles.header}>
                                    <Typo size={20} color={themeColors.textPrimary} fontWeight="600">
                                        Report a Bug
                                    </Typo>
                                    <TouchableOpacity
                                        onPress={handleClose}
                                        disabled={isSubmitting}
                                        style={styles.closeButton}
                                    >
                                        <Icons.X size={24} color={themeColors.textPrimary} weight="regular" />
                                    </TouchableOpacity>
                                </View>

                                <ScrollView
                                    style={styles.content}
                                    contentContainerStyle={styles.contentContainer}
                                    showsVerticalScrollIndicator={false}
                                    keyboardShouldPersistTaps="handled"
                                >
                                    {/* Title Input */}
                                    <View style={styles.inputGroup}>
                                        <Typo size={14} color={themeColors.textSecondary} style={styles.label}>
                                            Title (Optional)
                                        </Typo>
                                        <TextInput
                                            style={[styles.textInput, { color: themeColors.textPrimary, borderColor: colors.neutral200, backgroundColor: themeColors.panel }]}
                                            placeholder="Brief summary of the bug"
                                            placeholderTextColor={colors.neutral400}
                                            value={title}
                                            onChangeText={setTitle}
                                            maxLength={200}
                                            editable={!isSubmitting}
                                        />
                                    </View>

                                    {/* Severity Selector */}
                                    <View style={styles.inputGroup}>
                                        <Typo size={14} color={themeColors.textSecondary} style={styles.label}>
                                            Severity (Optional)
                                        </Typo>
                                        <View style={styles.severityContainer}>
                                            {['low', 'medium', 'high'].map((level) => {
                                                const isSelected = severity === level;
                                                const severityColor = getSeverityColor(level);
                                                return (
                                                    <TouchableOpacity
                                                        key={level}
                                                        style={[
                                                            styles.severityButton,
                                                            isSelected && {
                                                                backgroundColor: severityColor,
                                                                borderColor: severityColor,
                                                            },
                                                            !isSelected && { borderColor: colors.neutral200 }
                                                        ]}
                                                        onPress={() => setSeverity(severity === level ? '' : level)}
                                                        disabled={isSubmitting}
                                                    >
                                                        <Typo
                                                            size={13}
                                                            color={isSelected ? colors.white : themeColors.textSecondary}
                                                            fontWeight="500"
                                                            style={{ textTransform: 'capitalize' }}
                                                        >
                                                            {level}
                                                        </Typo>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </View>

                                    {/* Description Input */}
                                    <View style={styles.inputGroup}>
                                        <Typo size={14} color={themeColors.textSecondary} style={styles.label}>
                                            Description *
                                        </Typo>
                                        <TextInput
                                            style={[
                                                styles.textArea,
                                                { color: themeColors.textPrimary, borderColor: colors.neutral200, backgroundColor: themeColors.panel }
                                            ]}
                                            placeholder="Describe the bug in detail..."
                                            placeholderTextColor={colors.neutral400}
                                            value={description}
                                            onChangeText={setDescription}
                                            multiline
                                            numberOfLines={6}
                                            maxLength={4000}
                                            textAlignVertical="top"
                                            editable={!isSubmitting}
                                        />
                                        <Typo size={12} color={colors.neutral400} style={styles.charCount}>
                                            {description.length}/4000
                                        </Typo>
                                    </View>
                                </ScrollView>

                                {/* Footer */}
                                <View style={styles.footer}>
                                    <Button
                                        onPress={handleSubmit}
                                        loading={isSubmitting}
                                        loadingColor={themeColors.textPrimary}
                                        style={styles.submitButton}
                                    >
                                        <Typo size={16} color={colors.black} fontWeight="600">
                                            Submit Report
                                        </Typo>
                                    </Button>
                                </View>
                            </View>
                        </KeyboardAvoidingView>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
};

export default BugReportModal;

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: Platform.OS === 'android' ? -StatusBar.currentHeight || 0 : 0,
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0,
    },
    container: {
        width: '100%',
        maxWidth: 500,
        maxHeight: '95%',
        alignSelf: 'center',
        padding: spacingX._20,
    },
    modal: {
        borderRadius: radius._20,
        padding: spacingX._20,
        maxHeight: '95%',
        minHeight: 500,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacingY._20,
    },
    closeButton: {
        padding: spacingX._5,
    },
    content: {
        maxHeight: 400,
    },
    contentContainer: {
        paddingBottom: spacingY._10,
    },
    inputGroup: {
        marginBottom: spacingY._20,
    },
    label: {
        marginBottom: spacingY._10,
    },
    textInput: {
        height: verticalScale(48),
        borderWidth: 1,
        borderRadius: radius._10,
        paddingHorizontal: spacingX._15,
        fontSize: verticalScale(14),
    },
    textArea: {
        minHeight: verticalScale(150),
        borderWidth: 1,
        borderRadius: radius._10,
        paddingHorizontal: spacingX._15,
        paddingTop: spacingY._12,
        fontSize: verticalScale(14),
    },
    charCount: {
        marginTop: spacingY._5,
        textAlign: 'right',
    },
    severityContainer: {
        flexDirection: 'row',
        gap: spacingX._10,
    },
    severityButton: {
        flex: 1,
        height: verticalScale(40),
        borderWidth: 1,
        borderRadius: radius._10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    footer: {
        marginTop: spacingY._20,
    },
    submitButton: {
        width: '100%',
    },
});