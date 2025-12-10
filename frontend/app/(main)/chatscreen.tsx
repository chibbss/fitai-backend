import React, { useRef, useState, useEffect, use } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
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
import { chatApi } from '@/utils/api';
import { userApi } from '@/utils/api';
import { useLocalSearchParams } from 'expo-router';
import { discoverFromChat } from '@/utils/chatDiscovery';
import Constants from 'expo-constants';
import { API_URL, MOCK_MODE } from '@/utils/config';
import { getAccentColor, getGradientColors } from '@/utils/settings';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '@/context/ThemeContext';
import TypingIndicator from '@/components/TypingIndicator';
import { generatePersonalizedGreeting, GreetingData } from '@/utils/greetingUtils';

interface Message {
    id: string;
    type: 'text' | 'voice';
    content: string; // text or URI
    sender: 'user' | 'bot';
}

const AnimatedDots = () => {
    const dot1 = useRef(new Animated.Value(0)).current;
    const dot2 = useRef(new Animated.Value(0)).current;
    const dot3 = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const animate = (dot: Animated.Value, delay: number) => {
            return Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(dot, {
                        toValue: 1,
                        duration: 400,
                        useNativeDriver: true,
                    }),
                    Animated.timing(dot, {
                        toValue: 0,
                        duration: 400,
                        useNativeDriver: true,
                    }),
                ])
            );
        };

        const anim1 = animate(dot1, 0);
        const anim2 = animate(dot2, 200);
        const anim3 = animate(dot3, 400);

        anim1.start();
        anim2.start();
        anim3.start();

        return () => {
            anim1.stop();
            anim2.stop();
            anim3.stop();
        };
    }, []);

    const opacity1 = dot1.interpolate({
        inputRange: [0, 1],
        outputRange: [0.3, 1],
    });
    const opacity2 = dot2.interpolate({
        inputRange: [0, 1],
        outputRange: [0.3, 1],
    });
    const opacity3 = dot3.interpolate({
        inputRange: [0, 1],
        outputRange: [0.3, 1],
    });

    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 4 }}>
            <Animated.Text style={{ opacity: opacity1, fontSize: 16, color: colors.black }}>.</Animated.Text>
            <Animated.Text style={{ opacity: opacity2, fontSize: 16, color: colors.black }}>.</Animated.Text>
            <Animated.Text style={{ opacity: opacity3, fontSize: 16, color: colors.black }}>.</Animated.Text>
        </View>
    )
}

// Blinking cursor component for typewriter effect
const BlinkingCursor = () => {
    const opacity = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        const blink = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, {
                    toValue: 0,
                    duration: 500,
                    useNativeDriver: true,
                }),
                Animated.timing(opacity, {
                    toValue: 1,
                    duration: 500,
                    useNativeDriver: true,
                }),
            ])
        );
        blink.start();
        return () => blink.stop();
    }, []);

    return (
        <Animated.Text style={{ opacity, fontSize: 16, color: colors.black }}>▊</Animated.Text>
    );
};

const ChatScreen = () => {
    const router = useRouter();
    const params = useLocalSearchParams();
    const { colors: themeColors, isDarkMode } = useTheme();
    const [messages, setMessages] = useState<Message[]>([]);
    const [userBubbleColor, setUserBubbleColor] = useState<string>(colors.primary);
    const [gradientColors, setGradientColors] = useState<[string, string]>(() => {
        // Initialize with primary color gradient (matching login/signup button)
        return getGradientColors(colors.primary);
    });

    // State for input height management
    const [inputHeight, setInputHeight] = useState(56);

    // Animation for send button fade-in
    const sendButtonOpacity = useRef(new Animated.Value(0)).current;

    // Load accent color when screen comes into focus
    useFocusEffect(
        React.useCallback(() => {
            const loadAccentColor = async () => {
                const accentColor = await getAccentColor();
                setUserBubbleColor(accentColor);
                setGradientColors(getGradientColors(accentColor));
            };
            loadAccentColor();
        }, [])
    );

    // State for personalized greeting
    const [personalizedGreeting, setPersonalizedGreeting] = useState<GreetingData | null>(null);
    const [isLoadingGreeting, setIsLoadingGreeting] = useState(true);

    // Add effect to show completion message on mount if provided
    useEffect(() => {
        const initialMessage = params.initialMessage as string | undefined;
        const prefillQuery = params.prefillQuery as string | undefined;
        
        if (initialMessage && messages.length === 0) {
            // Add bot message with completion message
            const botMsgId = Date.now().toString();
            const botMsg: Message = {
                id: botMsgId,
                type: 'text',
                content: initialMessage,
                sender: 'bot',
            };
            setMessages([botMsg]);
            // Initialize displayed text as empty so typewriter effect works
            setDisplayedTexts({ [botMsgId]: '' });
        }
        
        // Handle pre-filled query from insights screen
        if (prefillQuery && input === '') {
            setInput(prefillQuery);
        }
    }, [params.initialMessage, params.prefillQuery]);

    // Load personalized greeting on mount (only if chat is empty)
    useEffect(() => {
        const loadGreeting = async () => {
            // Only show personalized greeting if chat is empty
            if (messages.length === 0 && !params.initialMessage && !params.prefillQuery) {
                setIsLoadingGreeting(true);
                try {
                    const greeting = await generatePersonalizedGreeting();
                    setPersonalizedGreeting(greeting);
                } catch (error) {
                    console.error('Failed to load greeting:', error);
                } finally {
                    setIsLoadingGreeting(false);
                }
            } else {
                setIsLoadingGreeting(false);
            }
        };
        
        loadGreeting();
    }, []); // Only run once on mount

    const [input, setInput] = useState('');
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);

    const fadeAnim = useRef(new Animated.Value(0)).current; // 0 = mic visible, 1 = send visible
    const scrollViewRef = useRef<ScrollView | null>(null);

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

    // Typewriter effect for bot messages
    useEffect(() => {
        const botMessages = messages.filter((msg) => msg.sender === 'bot' && msg.type === 'text');

        botMessages.forEach((msg) => {
            const messageId = msg.id;
            const targetText = msg.content;
            const currentDisplayed = displayedTexts[messageId] || '';

            // If target text is longer than displayed, type out the new characters
            if (targetText.length > currentDisplayed.length) {
                // Clear any existing timer for this message
                if (typewriterTimersRef.current[messageId]) {
                    clearInterval(typewriterTimersRef.current[messageId]);
                }

                let charIndex = currentDisplayed.length;
                const typeInterval = setInterval(() => {
                    // Get current target text (in case it changed while typing)
                    const currentMsg = messages.find((m) => m.id === messageId);
                    const latestTargetText = currentMsg?.content || targetText;

                    if (charIndex < latestTargetText.length) {
                        // Calculate how many characters behind we are
                        const backlog = latestTargetText.length - charIndex;

                        // Type 1-3 characters at a time depending on backlog to catch up faster
                        const charsToType = backlog > 10 ? 3 : backlog > 5 ? 2 : 1;
                        const newCharIndex = Math.min(charIndex + charsToType, latestTargetText.length);
                        const newText = latestTargetText.substring(0, newCharIndex);

                        setDisplayedTexts((prev) => ({
                            ...prev,
                            [messageId]: newText,
                        }));
                        charIndex = newCharIndex;

                        // Auto scroll as text types
                        if (scrollViewRef.current) {
                            scrollViewRef.current.scrollToEnd({ animated: true });
                        }
                    } else {
                        clearInterval(typeInterval);
                        delete typewriterTimersRef.current[messageId];
                    }
                }, 10); // Type every 10ms for smooth but fast effect

                typewriterTimersRef.current[messageId] = typeInterval;
            } else if (targetText.length < currentDisplayed.length || (targetText !== currentDisplayed && targetText.length === currentDisplayed.length)) {
                // If content was reset or changed completely (e.g., error message), update immediately
                setDisplayedTexts((prev) => ({
                    ...prev,
                    [messageId]: targetText,
                }));
                // Clear any timer for this message
                if (typewriterTimersRef.current[messageId]) {
                    clearInterval(typewriterTimersRef.current[messageId]);
                    delete typewriterTimersRef.current[messageId];
                }
            }
        });

        // Clean up timers for messages that no longer exist
        Object.keys(typewriterTimersRef.current).forEach((messageId) => {
            if (!messages.find((msg) => msg.id === messageId)) {
                clearInterval(typewriterTimersRef.current[messageId]);
                delete typewriterTimersRef.current[messageId];
            }
        });

        // Cleanup function
        return () => {
            Object.values(typewriterTimersRef.current).forEach((timer) => {
                clearInterval(timer);
            });
        };
    }, [messages]);

    // Initialize session ID on mount
    useEffect(() => {
        if (!sessionId) {
            setSessionId(generateSessionId());
        }
    }, []);

    // Add these imports at the top if not already present


    // Inside the ChatScreen component, add a ref to accumulate tokens:
    const tokenBufferRef = useRef<string>('');
    const tokenUpdateTimerRef = useRef<number | null>(null);

    // Typewriter effect state for each message
    const [displayedTexts, setDisplayedTexts] = useState<Record<string, string>>({});
    const typewriterTimersRef = useRef<Record<string, number>>({});

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
        if (!text || isLoading || isTranscribing) return; // Also check isTranscribing

        // Clear token buffer
        tokenBufferRef.current = '';

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

        // Create bot message placeholder for streaming
        const botMessageId = (Date.now() + 1).toString();
        const botMsg: Message = {
            id: botMessageId,
            type: 'text',
            content: '',
            sender: 'bot',
        };
        setMessages((prev) => [...prev, botMsg]);
        // Initialize displayed text for typewriter effect
        setDisplayedTexts((prev) => ({ ...prev, [botMessageId]: '' }));

        try {
            await chatApi.chatStream(
                text,
                sessionId,
                // onToken: called for each token as it arrives
                (token: string) => {
                    // Accumulate tokens in a ref
                    tokenBufferRef.current += token;

                    // Clear existing timer
                    if (tokenUpdateTimerRef.current) {
                        clearTimeout(tokenUpdateTimerRef.current);
                    }

                    // Batch updates - update every 50ms instead of every token
                    tokenUpdateTimerRef.current = setTimeout(() => {
                        const tokensToAdd = tokenBufferRef.current;
                        if (tokensToAdd) {
                            setMessages((prev) =>
                                prev.map((msg) =>
                                    msg.id === botMessageId
                                        ? { ...msg, content: msg.content + tokensToAdd }
                                        : msg
                                )
                            );
                            tokenBufferRef.current = ''; // Clear buffer
                        }
                    }, 30); // Update every 30ms for smoother streaming
                },

                //onDone: called when all tokens are received
                (answer: string) => {
                    // Clear any pending token updates
                    if (tokenUpdateTimerRef.current) {
                        clearTimeout(tokenUpdateTimerRef.current);
                        tokenUpdateTimerRef.current = null;
                    }

                    // Flush any remaining tokens in buffer
                    if (tokenBufferRef.current) {
                        setMessages((prev) =>
                            prev.map((msg) =>
                                msg.id === botMessageId
                                    ? { ...msg, content: msg.content + tokenBufferRef.current }
                                    : msg
                            )
                        );
                        tokenBufferRef.current = '';
                    }

                    setIsLoading(false);
                    // Final answer is already in the message from tokens
                    console.log('Chat completed, total length:', answer.length);

                    // Discover user data from conversation (non-blocking) - skip in mock mode
                    if (!MOCK_MODE) {
                        discoverFromChat(text, answer).catch(err => {
                            console.warn('Failed to discover data from chat:', err);
                        });
                    }
                },
                //onerror: called if there's an error
                (error: Error) => {
                    // Clear token buffer on error
                    if (tokenUpdateTimerRef.current) {
                        clearTimeout(tokenUpdateTimerRef.current);
                        tokenUpdateTimerRef.current = null;
                    }
                    tokenBufferRef.current = '';

                    setIsLoading(false);
                    //update UI with error message
                    const errorContent = error.message || 'Sorry, an error occurred. Please try again.';
                    setMessages((prev) =>
                        prev.map((msg) =>
                            msg.id === botMessageId
                                ? { ...msg, content: errorContent }
                                : msg
                        )
                    );
                    // Reset displayed text for error message to trigger typewriter effect
                    setDisplayedTexts((prev) => ({ ...prev, [botMessageId]: '' }));
                    Alert.alert(
                        'Error',
                        error.message || 'Failed to send message. Please check your connection.',
                        [{ text: 'OK' }]
                    );
                }
            );
        } catch (error: any) {
            console.error('Chat error:', error);

            // Clear token buffer on error
            if (tokenUpdateTimerRef.current) {
                clearTimeout(tokenUpdateTimerRef.current);
                tokenUpdateTimerRef.current = null;
            }
            tokenBufferRef.current = '';

            setIsLoading(false);

            //Show error to user
            const errorContent = error.message || 'Sorry, an error occurred. Please try again.';
            setMessages((prev) =>
                prev.map((msg) =>
                    msg.id === botMessageId
                        ? { ...msg, content: errorContent }
                        : msg
                )
            );
            // Reset displayed text for error message to trigger typewriter effect
            setDisplayedTexts((prev) => ({ ...prev, [botMessageId]: '' }));
            Alert.alert(
                'Error',
                error.message || 'Failed to send message. Please check your connection.',
                [{ text: 'OK' }]
            );
        }

        /*try {
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
        }*/
    };

    // Send voice message - transcribe then chat with streaming
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
            let transcribedText: string;

            // 🚨 MOCK MODE: Use mock transcription
            if (MOCK_MODE) {
                console.log('🤖 MOCK MODE: Using mock transcription');
                // Simulate transcription delay (1.5 seconds)
                await new Promise(resolve => setTimeout(resolve, 1500));
                transcribedText = "This is a mock transcription of your voice message. The backend is currently down, so this is simulated text.";
                setIsTranscribing(false);
            } else {
                // Original transcription code
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
                transcribedText = transcribeData.transcribed_text;

                if (!transcribedText || !transcribedText.trim()) {
                    throw new Error('No text was transcribed from the audio');
                }

                setIsTranscribing(false);
            }

            setIsLoading(true);

            // Step 2: Use streaming chat for transcribed text
            const botMessageId = (Date.now() + 1).toString();
            const botMsg: Message = {
                id: botMessageId,
                type: 'text',
                content: '',
                sender: 'bot',
            };
            setMessages((prev) => [...prev, botMsg]);
            // Initialize displayed text for typewriter effect
            setDisplayedTexts((prev) => ({ ...prev, [botMessageId]: '' }));

            await chatApi.chatStream(
                transcribedText,
                sessionId,
                // onToken: called for each token as it arrives
                (token: string) => {
                    setMessages((prev) =>
                        prev.map((msg) =>
                            msg.id === botMessageId
                                ? { ...msg, content: msg.content + token }
                                : msg
                        )
                    );
                },
                // onDone: called when streaming completes
                (answer: string) => {
                    setIsLoading(false);
                    console.log('Voice chat completed, total length:', answer.length);
                },
                // onError: called if there's an error
                (error: Error) => {
                    setIsLoading(false);
                    const errorContent = error.message || 'Sorry, an error occurred. Please try again.';
                    setMessages((prev) =>
                        prev.map((msg) =>
                            msg.id === botMessageId
                                ? { ...msg, content: errorContent }
                                : msg
                        )
                    );
                    // Reset displayed text for error message to trigger typewriter effect
                    setDisplayedTexts((prev) => ({ ...prev, [botMessageId]: '' }));
                    Alert.alert(
                        'Error',
                        error.message || 'Failed to process voice message.',
                        [{ text: 'OK' }]
                    );
                }
            );

        } catch (error: any) {
            console.error('Voice chat error:', error);
            setIsTranscribing(false);
            setIsLoading(false);

            // Show error message to user
            const errorMsgId = (Date.now() + 1).toString();
            const errorMsg: Message = {
                id: errorMsgId,
                type: 'text',
                content: error.message || 'Sorry, I couldn\'t process your voice message. Please try again.',
                sender: 'bot',
            };
            setMessages((prev) => [...prev, errorMsg]);
            // Initialize displayed text for typewriter effect
            setDisplayedTexts((prev) => ({ ...prev, [errorMsgId]: '' }));

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

    // Add cleanup effect
    useEffect(() => {
        return () => {
            // Cleanup token update timer on unmount
            if (tokenUpdateTimerRef.current) {
                clearTimeout(tokenUpdateTimerRef.current);
            }
        };
    }, []);

    // Add this component for bot message interaction icons
    const BotMessageActions = ({ messageId }: { messageId: string }) => {
        return (
            <View style={styles.botMessageActions}>
                <TouchableOpacity style={styles.actionButton} activeOpacity={0.7}>
                    <Icons.Copy size={18} color={colors.neutral400} weight="regular" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton} activeOpacity={0.7}>
                    <Icons.ThumbsUp size={18} color={colors.neutral400} weight="regular" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton} activeOpacity={0.7}>
                    <Icons.ThumbsDown size={18} color={colors.neutral400} weight="regular" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton} activeOpacity={0.7}>
                    <Icons.SpeakerHigh size={18} color={colors.neutral400} weight="regular" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton} activeOpacity={0.7}>
                    <Icons.ArrowClockwise size={18} color={colors.neutral400} weight="regular" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton} activeOpacity={0.7}>
                    <Icons.ShareNetwork size={18} color={colors.neutral400} weight="regular" />
                </TouchableOpacity>
            </View>
        );
    };


    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: themeColors.background }}
            edges={[]}>
                
            <View style={styles.container}>
                {/* SlidingPanel outside KeyboardAvoidingView - won't affect ChatScreen keyboard behavior */}
                <SlidingPanel />

                {/* Greeting - positioned absolutely outside KeyboardAvoidingView to prevent keyboard movement */}
                {messages.length === 0 && (
                    <Animated.View
                        style={[
                            styles.greetingWrapper,
                            { opacity: fadeAnim }
                        ]}
                        pointerEvents="auto"
                    >
                        {isLoadingGreeting ? (
                            <View style={styles.loadingGreeting}>
                                <ActivityIndicator size="small" color={colors.primary} />
                            </View>
                        ) : personalizedGreeting ? (
                            <View style={styles.personalizedGreetingContainer}>
                                <View style={styles.greetingMessage}>
                                    <Typo size={18} fontWeight="600" color={themeColors.textPrimary}>
                                        {personalizedGreeting.message}
                                    </Typo>
                                </View>
                                {personalizedGreeting.prompts && personalizedGreeting.prompts.length > 0 && (
                                    <View style={styles.promptButtons}>
                                        {personalizedGreeting.prompts.map((prompt, index) => (
                                            <TouchableOpacity
                                                key={index}
                                                style={styles.promptButton}
                                                onPress={() => {
                                                    setInput(prompt);
                                                }}
                                            >
                                                <Typo size={14} color={colors.primary} fontWeight="500">
                                                    {prompt}
                                                </Typo>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}
                            </View>
                        ) : (
                            <Greeting
                                gradientColors={gradientColors}
                                onPromptPress={(prompt) => {
                                    setInput(prompt)
                                    // Optionally auto-send: sendText()
                                }}
                            />
                        )}
                    </Animated.View>
                )}

                {/* KeyboardAvoidingView only wraps ChatScreen content */}
                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={0}
                >
                    <ScreenWrapperChat showPattern={false} style={{ paddingTop: 40, paddingBottom: 0 }}>
                        <View style={styles.content}>
                            <ScrollView
                                ref={scrollViewRef}
                                showsVerticalScrollIndicator={false}
                                style={{ backgroundColor: 'transparent', zIndex: 1 }}
                                contentContainerStyle={{ paddingTop: messages.length === 0 ? 0 : spacingY._50 }}
                            >
                                {messages.map((msg) => (
                                    <View key={msg.id}>
                                        {msg.sender === 'bot' ? (
                                            // Bot message: no bubble, white text on black background
                                            <View style={styles.botMessageContainer}>
                                                
                                                {msg.type === 'text' ? (
                                                    msg.content == '' && (isLoading || isTranscribing) ? (
                                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                            {/*<Text
                                                                style={[styles.botMessageText, { color: themeColors.textPrimary }]}
                                                            >
                                                                {isTranscribing ? 'Transcribing' : 'Thinking'}
                                                            </Text>*/}
                                                            <TypingIndicator
                                                                showWordmark={false}
                                                                caption="Thinking"
                                                            />
                                                        </View>
                                                    ) : (
                                                        <>
                                                            <Text style={[styles.botMessageText, { color: themeColors.textPrimary }]}>
                                                                {displayedTexts[msg.id] !== undefined ? displayedTexts[msg.id] : (msg.content || '')}
                                                                {msg.content && displayedTexts[msg.id] !== undefined && displayedTexts[msg.id].length < msg.content.length && (
                                                                    <BlinkingCursor />
                                                                )}
                                                            </Text>
                                                            {msg.content && !isLoading && !isTranscribing && displayedTexts[msg.id] === msg.content && (
                                                                <BotMessageActions messageId={msg.id} />
                                                            )}
                                                        </>
                                                    )
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
                                        ) : (
                                            // User message: with accent gradient
                                            <View style={styles.userBubbleContainer}>
                                                <LinearGradient
                                                    colors={themeColors.accentGradient}
                                                    start={{ x: 0, y: 0 }}
                                                    end={{ x: 1, y: 1 }}
                                                    style={[styles.bubble, styles.userBubble]}
                                                >
                                                    {msg.type === 'text' ? (
                                                        <Text
                                                            style={[
                                                                styles.bubbleText,
                                                                { color: colors.white },
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
                                                                color={colors.white}
                                                                weight="bold"
                                                            />
                                                            <Text
                                                                style={[
                                                                    styles.bubbleText,
                                                                    { marginLeft: 6, color: colors.white },
                                                                ]}
                                                            >
                                                                Voice message
                                                            </Text>
                                                        </TouchableOpacity>
                                                    )}
                                                </LinearGradient>
                                            </View>
                                        )}
                                    </View>
                                ))}

                                {/* Loading indicator for bot response 
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
                                )}*/}
                            </ScrollView>
                        </View>

                        <View style={styles.inputSectionWrapper}>
                            <View style={[
                                styles.inputContainer,
                                {
                                    backgroundColor: themeColors.background,
                                    borderTopColor: themeColors.textPrimary
                                }
                            ]}>

                                {/*<TouchableOpacity 
                                style={styles.plusButton} 
                                activeOpacity={0.8}
                            >
                                <Icons.PlusCircleIcon
                                    size={32}
                                    color={themeColors.textPrimary}
                                    weight="regular"
                                />
                            </TouchableOpacity>*/}
                                <TouchableOpacity
                                    style={styles.iconButton}
                                    activeOpacity={0.7}
                                >
                                    <Icons.PaperclipHorizontalIcon
                                        size={32}
                                        color={themeColors.textPrimary}
                                        weight="regular"
                                    />
                                </TouchableOpacity>

                                <View style={styles.inputWrapper}>


                                    <TextInput
                                        placeholder="Ask anything..."
                                        placeholderTextColor={colors.neutral400}
                                        value={input}
                                        onChangeText={setInput}
                                        multiline
                                        textAlignVertical={inputHeight > 56 ? 'top' : 'center'}
                                        style={[
                                            styles.textInput,
                                            {
                                                height: inputHeight > 56 ? undefined : 56,
                                                maxHeight: 120,
                                            }
                                        ]}
                                        onContentSizeChange={(e) => {
                                            const contentHeight = e.nativeEvent.contentSize.height;
                                            const calculatedHeight = contentHeight < 56 ? 56 : Math.min(contentHeight, 120);
                                            setInputHeight(calculatedHeight);
                                        }}
                                    />
                                    {/* Send button with gradient */}
                                    {input.trim() ? (
                                        <View style={styles.sendButtonContainer}>
                                            <TouchableOpacity
                                                onPress={sendText}
                                                activeOpacity={0.7}
                                                style={styles.sendButtonTouchable}
                                            >
                                                <LinearGradient
                                                    colors={themeColors.accentGradient}
                                                    start={{ x: 0, y: 0 }}
                                                    end={{ x: 1, y: 1 }}
                                                    style={styles.sendButtonGradient}
                                                >
                                                    <Icons.PaperPlaneRightIcon
                                                        size={22}
                                                        color={colors.white}
                                                        weight="fill"
                                                    />
                                                </LinearGradient>
                                            </TouchableOpacity>
                                        </View>
                                    ) : (
                                        <View style={styles.micButtonWrapper}>
                                            <MicButton onRecordingDone={sendVoice} recordingAnimation={recordingAnimation} />
                                        </View>
                                    )}
                                </View>


                            </View>

                            <View
                                style={[
                                    styles.doubleCheckContainer,
                                    {
                                        backgroundColor: themeColors.background,
                                    }
                                ]}
                            >
                                <Typo
                                    color={themeColors.textPrimary}
                                    size={13}
                                    style={{ textAlign: 'center', flexWrap: 'wrap' }}
                                >
                                    Please double check responses
                                </Typo>
                            </View>
                        </View>
                    </ScreenWrapperChat>
                </KeyboardAvoidingView>
            </View>
        </SafeAreaView>
    );
};

export default ChatScreen;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        position: 'relative',
    },
    content: {
        flex: 1,
        backgroundColor: 'transparent',
        //borderTopLeftRadius: radius._50,
        //borderTopRightRadius: radius._50,
        //borderCurve: 'continuous',
        paddingHorizontal: spacingX._30,
        paddingTop: spacingY._10,
    },
    inputSectionWrapper: {
        zIndex: 20, // Ensure input section stays above messages
        backgroundColor: 'transparent',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingTop: verticalScale(8),
        paddingBottom: 0,
        paddingHorizontal: spacingX._15,
        borderTopWidth: 1,
        zIndex: 20, // Ensure input is above greeting when both are visible
        minHeight: 76, // Minimum height to accommodate buttons
    },
    doubleCheckContainer: {
        paddingBottom: spacingY._25,
        paddingTop: spacingY._5,
        zIndex: 21, // Above input container
    },
    inputWrapper: {
        flex: 1,
        backgroundColor: colors.neutral50,
        borderRadius: radius.full,
        paddingLeft: spacingX._10,
        paddingRight: spacingX._10,
        paddingVertical: 0,
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 56,
        maxHeight: 144, // Max height for multiline (120px content + 24px padding)
    },
    textInput: {
        flex: 1,
        fontSize: 16,
        color: colors.black,
        textAlign: 'left',
        paddingVertical: 0,
        paddingHorizontal: 0,
        margin: 0,
        paddingRight: spacingX._10,
        includeFontPadding: false,
        textAlignVertical: 'center',
    },
    sendButtonWrapper: {
        marginLeft: spacingX._5,
        alignSelf: 'center',
        zIndex: 10,
    },
    sendButtonContainer: {
        width: 50,
        height: 50,
        borderRadius: 28,
        overflow: 'hidden',
        position: 'relative', // Add this
    },
    buttonOverlay: { // Add this new style
        position: 'absolute',
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendButtonTouchable: {
        width: '100%',
        height: '100%',
    },
    sendButtonGradient: {
        width: '100%',
        height: '100%',
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    micGlowWrapper: {
        alignSelf: 'center',
        marginLeft: spacingX._10,
    },
    micButtonWrapper: {
        width: 50,
        height: 50,
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconButton: {
        padding: 8,
        justifyContent: 'center',
        alignItems: 'center',

    },
    bubble: {
        padding: 10,
        borderRadius: 15,
    },
    userBubble: {
        borderBottomRightRadius: 0,
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
        bottom: 120, // Leave space for input area at bottom to prevent overlap
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
        zIndex: 5, // Lower than input container zIndex: 20
        paddingHorizontal: spacingX._20,
        paddingTop: 40, // Match ScreenWrapperChat paddingTop
    },
    botMessageContainer: {
        alignSelf: 'flex-start',
        marginVertical: 8,
        maxWidth: '85%',
    },
    botMessageText: {
        fontSize: 16,
        color: colors.black,
        lineHeight: 24,
    },
    botMessageActions: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
        gap: 12,
    },
    actionButton: {
        padding: 4,
    },
    userBubbleContainer: {
        alignSelf: 'flex-end',
        borderRadius: 15,
        borderBottomRightRadius: 0,
        overflow: 'hidden',
        maxWidth: '80%',
        marginVertical: 4,
        elevation: 3,
    },
    loadingGreeting: {
        padding: spacingY._20,
        alignItems: 'center',
    },
    personalizedGreetingContainer: {
        padding: spacingX._20,
        backgroundColor: colors.neutral50,
        borderRadius: radius._15,
        margin: spacingX._20,
    },
    greetingMessage: {
        marginBottom: spacingY._15,
    },
    promptButtons: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacingX._10,
    },
    promptButton: {
        paddingHorizontal: spacingX._15,
        paddingVertical: spacingY._10,
        backgroundColor: colors.white,
        borderRadius: radius._10,
        borderWidth: 1,
        borderColor: colors.primary,
    },
});
