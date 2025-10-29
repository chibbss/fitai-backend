import React, { useRef, useState, useEffect } from 'react';
import {
    Animated,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import ScreenWrapper from '@/components/ScreenWrapper';
import SlidingPanel from '@/components/SlidingPanel';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import { verticalScale } from '@/utils/styling';
import Input from '@/components/Input';
import * as Icons from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MicButton from '@/components/MicButton';
import { Audio } from 'expo-av';
import Greeting from '@/components/Greeting';
import Typo from '@/components/Typo';
import { SafeAreaView } from 'react-native-safe-area-context';
import recordingAnimation from "@/assets/images/animations/Recording.json"

interface Message {
    id: string;
    type: 'text' | 'voice';
    content: string; // text or URI
    sender: 'user' | 'bot';
}

const ChatScreen = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const fadeAnim = useRef(new Animated.Value(1)).current;
    const scrollViewRef = useRef<ScrollView | null>(null);

    // ✅ Scroll to bottom when new messages are added
    useEffect(() => {
        if (scrollViewRef.current) {
            scrollViewRef.current.scrollToEnd({ animated: true });
        }
    }, [messages]);

    const sendText = () => {
        const text = input.trim();
        if (!text) return;

        const newMsg: Message = {
            id: Date.now().toString(),
            type: 'text',
            content: text,
            sender: 'user',
        };

        setMessages((prev) => [...prev, newMsg]);
        setInput(''); // safe to clear now

        if (messages.length === 0) {
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 500,
                useNativeDriver: true,
            }).start();
        }
    };

    const sendVoice = (uri: string) => {
        const voiceMsg: Message = {
            id: Date.now().toString(),
            type: 'voice',
            content: uri,
            sender: 'user',
        };
        setMessages((prev) => [...prev, voiceMsg]);

        if (messages.length === 0) {
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 500,
                useNativeDriver: true,
            }).start();
        }
    };

    const playVoice = async (uri: string) => {
        try {
            if (sound) {
                await sound.stopAsync();
                await sound.unloadAsync();
                setSound(null);
            }

            const { sound: newSound } = await Audio.Sound.createAsync(
                { uri },
                { shouldPlay: true }
            );
            setSound(newSound);

            newSound.setOnPlaybackStatusUpdate((status) => {
                if (status.isLoaded && status.didJustFinish) {
                    newSound.unloadAsync();
                    setSound(null);
                }
            });
        } catch (err) {
            console.error('Error playing voice message:', err);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.black }}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <View style={styles.container}>
                    <SlidingPanel />
                    <ScreenWrapper showPattern={false}>
                        <View style={styles.content}>
                            <Animated.View
                                style={[styles.greetingWrapper, { opacity: fadeAnim }]}
                            >
                                <Greeting />
                            </Animated.View>

                            <ScrollView
                                ref={scrollViewRef}
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={{ paddingVertical: spacingY._20 }}
                            >
                                {messages.map((msg) => (
                                    <View
                                        key={msg.id}
                                        style={[
                                            styles.bubble,
                                            msg.sender === 'user'
                                                ? styles.userBubble
                                                : styles.botBubble,
                                        ]}
                                    >
                                        {msg.type === 'text' ? (
                                            <Text
                                                style={[
                                                    styles.bubbleText,
                                                    msg.sender === 'user'
                                                        ? { color: colors.black }
                                                        : { color: colors.white },
                                                ]}
                                            >
                                                {msg.content}
                                            </Text>
                                        ) : (
                                            <TouchableOpacity
                                                style={styles.voiceBubble}
                                                onPress={() => playVoice(msg.content)}
                                            >
                                                <Icons.Play
                                                    size={22}
                                                    color={colors.primary}
                                                    weight="bold"
                                                />
                                                <Text
                                                    style={[
                                                        styles.bubbleText,
                                                        { marginLeft: 6, color: colors.primary },
                                                    ]}
                                                >
                                                    Voice message
                                                </Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                ))}
                            </ScrollView>
                        </View>

                        <View style={styles.inputContainer}>
                            <TouchableOpacity style={styles.plusButton} activeOpacity={0.8}>
                                <Icons.PlusCircleIcon
                                    size={32}
                                    color={colors.black}
                                    weight="regular"
                                />
                            </TouchableOpacity>

                            <View style={styles.inputWrapper}>
                                <Input
                                    placeholder="Ask anything..."
                                    value={input}
                                    onChangeText={setInput}
                                    style={[styles.input, { textAlign: 'left', paddingLeft: 0 }]}
                                    containerStyle={{
                                        borderWidth: 0,
                                        backgroundColor: 'transparent',
                                        elevation: 0,
                                        shadowOpacity: 0,
                                    }}
                                />
                                <TouchableOpacity
                                    style={styles.iconWrapper}
                                    onPress={sendText}
                                >
                                    <Icons.PaperPlaneRightIcon
                                        size={30}
                                        color={colors.primary}
                                        weight="fill"
                                    />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.micGlowWrapper}>
                                <LinearGradient
                                    colors={['#ffb347', '#ffcc33']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.micGradient}
                                >
                                    <MicButton onRecordingDone={sendVoice} recordingAnimation={recordingAnimation} />
                                </LinearGradient>
                                <View style={styles.micGlow} />
                            </View>
                        </View>

                        <View
                            style={{
                                backgroundColor: 'white',
                                paddingBottom: spacingY._10,
                            }}
                        >
                            <Typo
                                color={colors.neutral400}
                                size={13}
                                style={{ textAlign: 'center', flexWrap: 'wrap' }}
                            >
                                Please double check responses
                            </Typo>
                        </View>
                    </ScreenWrapper>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default ChatScreen;

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: {
        flex: 1,
        backgroundColor: colors.white,
        borderTopLeftRadius: radius._50,
        borderTopRightRadius: radius._50,
        borderCurve: 'continuous',
        paddingHorizontal: spacingX._20,
        paddingTop: spacingY._20,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.white,
        paddingVertical: verticalScale(10),
        paddingHorizontal: spacingX._15,
        borderTopWidth: 1,
        borderTopColor: colors.neutral100,
    },
    inputWrapper: {
        flex: 1,
        backgroundColor: colors.neutral50,
        borderRadius: radius.full,
        paddingHorizontal: spacingX._10,
        justifyContent: 'center',
        shadowColor: '#ffb347',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    input: { fontSize: 16, color: colors.black, textAlign: 'left' },
    iconWrapper: {
        position: 'absolute',
        right: 13,
        top: '50%',
        transform: [{ translateY: -27 }],
        backgroundColor: colors.white,
        borderRadius: radius.full,
        padding: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    micGlowWrapper: { position: 'relative', marginLeft: spacingX._10 },
    micGradient: {
        borderRadius: radius.full,
        padding: verticalScale(3),
        elevation: 8,
        zIndex: 2,
    },
    micGlow: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: radius.full,
        backgroundColor: '#ffcc33',
        opacity: 0.4,
        shadowColor: '#ffb347',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 18,
        zIndex: 1,
    },
    plusButton: {
        position: 'absolute',
        left: spacingX._25,
        zIndex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
        padding: verticalScale(13),
    },
    bubble: {
        padding: 10,
        borderRadius: 15,
        marginVertical: 4,
        maxWidth: '80%',
    },
    userBubble: {
        alignSelf: 'flex-end',
        backgroundColor: colors.neutral50,
        borderBottomRightRadius: 0,
        elevation: 3,
    },
    botBubble: {
        alignSelf: 'flex-start',
        backgroundColor: colors.primary,
        borderBottomLeftRadius: 0,
    },
    bubbleText: { fontSize: 16 },
    voiceBubble: { flexDirection: 'row', alignItems: 'center' },
    greetingWrapper: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: colors.white,
        zIndex: 0,
        paddingHorizontal: spacingX._20,
        borderTopLeftRadius: radius._50,
        borderTopRightRadius: radius._50,
        borderCurve: 'continuous',
    },
});
