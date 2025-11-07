import React, { useRef, useState, useEffect } from 'react';
import {
    ActivityIndicator,
    Alert,
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
import { supabase } from '@/utils/supabase';
import { useRouter } from 'expo-router';
import ScreenWrapperChat from '@/components/ScreenWrapperChat';

interface Message {
    id: string;
    type: 'text' | 'voice';
    content: string; // text or URI
    sender: 'user' | 'bot';
}

const ChatScreen = () => {
    const router = useRouter();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);

    const fadeAnim = useRef(new Animated.Value(1)).current;
    const scrollViewRef = useRef<ScrollView | null>(null);

    const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
    //generate a unique sessionID for this conversation
    const generateSessionId = () => {
        return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    // ✅ Scroll to bottom when new messages are added
    useEffect(() => {
        if (scrollViewRef.current) {
            scrollViewRef.current.scrollToEnd({ animated: true });
        }
    }, [messages]);

    // Initialize session ID on mount
    useEffect(() => {
        if (!sessionId) {
            setSessionId(generateSessionId());
        }
    }, []);

    // Helper function to get auth token
    const getAuthToken = async (): Promise<string | null> => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                Alert.alert(
                    'Authentication Required',
                    'Please log in to continue.',
                    [{ text: 'OK', onPress: () => router.replace('/login') }]
                );
                return null;
            }
            return session.access_token;
        } catch (error) {
            console.error('Error getting auth token:', error);
            Alert.alert('Error', 'Failed to authenticate. Please try again.');
            return null;
        }
    };

    // Send text message to backend
    const sendText = async () => {
        const text = input.trim();
        if (!text || isLoading) return;

        // Add user message to UI immediately
        const userMsg: Message = {
            id: Date.now().toString(),
            type: 'text',
            content: text,
            sender: 'user',
        };

        setMessages((prev) => [...prev, userMsg]);
        setInput(''); // safe to clear input

        // Hide greeting on first message
        if (messages.length === 0) {
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 500,
                useNativeDriver: true,
            }).start();
        }

        setIsLoading(true);

        try {
            const token = await getAuthToken();
            if (!token) {
                setIsLoading(false);
                return;
            }

            //Call /chat endpoint
            const response = await fetch(`${API_URL}/chat`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: text,
                    session_id: sessionId,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));

                if (response.status === 401) {
                    Alert.alert(
                        'Session Expired',
                        'Please log in again to continue.',
                        [{ text: 'OK', onPress: () => router.replace('/login') }]
                    );
                    return;
                }
                throw new Error(errorData.detail || `HTTP ${response.status}`);
            }

            const data = await response.json();

            // Add bot response to UI
            const botMsg: Message = {
                id: (Date.now() + 1).toString(),
                type: 'text',
                content: data.answer || 'Sorry, I couldn\'t generate a response.',
                sender: 'bot',
            };
            setMessages((prev) => [...prev, botMsg]);

        } catch (error: any) {
            console.error('Chat error:', error);

            //Show error to user
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                type: 'text',
                content: error.message || 'Sorry an error occurred. Please try again.',
                sender: 'bot',
            }

            Alert.alert(
                'Error',
                error.message || 'Failed to send message. Please check your connection.',
                [{ text: 'OK' }]
            );
        } finally {
            setIsLoading(false);
        }
    };

    // Send voice message - transcribe then chat
    const sendVoice = async (uri: string) => {
        if (isLoading || isTranscribing) return;

        // Add voice message to UI immediately
        const voiceMsg: Message = {
            id: Date.now().toString(),
            type: 'voice',
            content: uri,
            sender: 'user',
        };
        setMessages((prev) => [...prev, voiceMsg]);

        // Hide greeting on first message
        if (messages.length === 0) {
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 500,
                useNativeDriver: true,
            }).start();
        }

        setIsTranscribing(true);

        try {
            const token = await getAuthToken();
            if (!token) {
                setIsTranscribing(false);
                return;
            }

            // Step 1: Transcribe audio using /transcribe_chat endpoint
            const formData = new FormData();

            // Determine file extension and MIME type based on platform
            const fileExtension = Platform.OS === 'ios' ? '.caf' : '.m4a';
            const mimeType = Platform.OS === 'ios'
                ? 'audio/x-caf'
                : 'audio/mp4';

            formData.append('file', {
                uri,
                type: mimeType,
                name: `voice${fileExtension}`,
            } as any);

            if (sessionId) {
                formData.append('session_id', sessionId);
            }

            const transcribeResponse = await fetch(`${API_URL}/transcribe_chat`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    // Don't set Content-Type - let FormData set it with boundary
                },
                body: formData,
            });

            if (!transcribeResponse.ok) {
                const errorData = await transcribeResponse.json().catch(() => ({ detail: 'Transcription failed' }));

                if (transcribeResponse.status === 401) {
                    Alert.alert(
                        'Session Expired',
                        'Please log in again to continue.',
                        [{ text: 'OK', onPress: () => router.replace('/login') }]
                    );
                    return;
                }

                throw new Error(errorData.detail || 'Audio transcription failed');
            }

            const transcribeData = await transcribeResponse.json();
            const transcribedText = transcribeData.transcribed_text;

            if (!transcribedText || !transcribedText.trim()) {
                throw new Error('No text was transcribed from the audio');
            }

            setIsTranscribing(false);
            setIsLoading(true);

            // Step 2: Send transcribed text to chat endpoint
            const chatResponse = await fetch(`${API_URL}/chat`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: transcribedText,
                    session_id: sessionId,
                }),
            });

            if (!chatResponse.ok) {
                const errorData = await chatResponse.json().catch(() => ({ detail: 'Chat failed' }));
                throw new Error(errorData.detail || 'Failed to get response');
            }

            const chatData = await chatResponse.json();

            // Add bot response to UI
            const botMsg: Message = {
                id: (Date.now() + 1).toString(),
                type: 'text',
                content: chatData.answer || 'Sorry, I couldn\'t generate a response.',
                sender: 'bot',
            };
            setMessages((prev) => [...prev, botMsg]);


        } catch (error: any) {
            console.error('Voice chat error:', error);
            setIsTranscribing(false);
            setIsLoading(false);

            // Show error message to user
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                type: 'text',
                content: error.message || 'Sorry, I couldn\'t process your voice message. Please try again.',
                sender: 'bot',
            };
            setMessages((prev) => [...prev, errorMsg]);

            Alert.alert(
                'Error',
                error.message || 'Failed to process voice message.',
                [{ text: 'OK' }]
            );
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
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}
            edges={[]}>
            <View style={styles.container}>
                {/* SlidingPanel outside KeyboardAvoidingView - won't affect ChatScreen keyboard behavior */}
                <SlidingPanel />
                
                {/* KeyboardAvoidingView only wraps ChatScreen content */}
                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <ScreenWrapperChat showPattern={false} style={{ paddingTop: 40, paddingBottom: 0 }}>
                        <View style={styles.content}>
                            <Animated.View
                                style={[styles.greetingWrapper, { opacity: fadeAnim }]}
                            >
                                <Greeting />
                            </Animated.View>

                            <ScrollView
                                ref={scrollViewRef}
                                showsVerticalScrollIndicator={false}

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

                                {/* Loading indicator for bot response */}
                                {(isLoading || isTranscribing) && (
                                    <View style={[styles.bubble, styles.botBubble]}>
                                        <ActivityIndicator
                                            size="small"
                                            color={colors.white}
                                            style={{ marginRight: 8 }}
                                        />
                                        <Text style={[styles.bubbleText, { color: colors.white }]}>
                                            {isTranscribing ? 'Transcribing...' : 'Thinking...'}
                                        </Text>
                                    </View>
                                )}
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
                                    <MicButton onRecordingDone={sendVoice}  recordingAnimation={recordingAnimation} />
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
                    </ScreenWrapperChat>
                </KeyboardAvoidingView>
            </View>
        </SafeAreaView>
    );
};

export default ChatScreen;

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: {
        flex: 1,
        backgroundColor: colors.white,
        //borderTopLeftRadius: radius._50,
        //borderTopRightRadius: radius._50,
        //borderCurve: 'continuous',
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
        top: '5%',
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
