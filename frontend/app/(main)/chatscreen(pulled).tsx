import React, { useRef, useState, useEffect, use, useMemo, useCallback } from 'react';
import {
    ActivityIndicator,
    Animated,
    KeyboardAvoidingView,
    Platform,
    FlatList,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { alert } from '@/utils/alert';
import { logger } from '@/utils/logger';
import { AuthGuard } from '@/components/AuthGuard';
import { useAuth } from '@/context/AuthContext';
import { cacheUserData, getCachedUserData } from '@/utils/dataCache';

interface Message {
    id: string;
    type: 'text' | 'voice';
    content: string; // text or URI
    sender: 'user' | 'bot';
    timestamp?: number; // Optional timestamp in milliseconds
}

type ChatListItem =
    | { type: 'message'; message: Message; index: number }
    | { type: 'dateSeparator'; date: string; timestamp: number };

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

// Helper function to format date for chat separators (WhatsApp style)
const formatChatDate = (timestamp: number): string => {
    const messageDate = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Reset time to midnight for date comparison
    const messageDateOnly = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());

    // Check if same day as today
    if (messageDateOnly.getTime() === todayOnly.getTime()) {
        return 'Today';
    }

    // Check if same day as yesterday
    if (messageDateOnly.getTime() === yesterdayOnly.getTime()) {
        return 'Yesterday';
    }

    // Check if within last 7 days - show day name
    const daysDiff = Math.floor((todayOnly.getTime() - messageDateOnly.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff < 7) {
        return messageDate.toLocaleDateString('en-US', { weekday: 'long' }); // Monday, Tuesday, etc.
    }

    // Older than 7 days - show full date
    return messageDate.toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    }); // 24 November 2025
};

// Helper function to get date string for comparison (YYYY-MM-DD)
const getDateKey = (timestamp: number): string => {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// Helper function to extract timestamp from message ID or use message timestamp
const getMessageTimestamp = (msg: Message): number => {
    if (msg.timestamp) {
        return msg.timestamp;
    }
    // Try to parse ID as timestamp (since IDs are Date.now().toString())
    const parsed = parseInt(msg.id, 10);
    if (!isNaN(parsed) && parsed > 0) {
        return parsed;
    }
    // Fallback to current time if ID can't be parsed
    return Date.now();
};

const ChatScreen = () => {
    const router = useRouter();
    const params = useLocalSearchParams();
    const { colors: themeColors, isDarkMode } = useTheme();
    const { user } = useAuth();
    const insets = useSafeAreaInsets();
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

    // ✅ Session check - redirect to login if no valid session
    useEffect(() => {
        const checkSession = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();

                if (error || !session?.user || !session?.access_token) {
                    logger.log('No valid session in chatscreen, redirecting to login');
                    router.replace('/login');
                }
            } catch (error) {
                logger.error('Session check error in chatscreen:', error);
                router.replace('/login');
            }
        };

        checkSession();
    }, [router]);

    // State for personalized greeting
    const [personalizedGreeting, setPersonalizedGreeting] = useState<GreetingData | null>(null);
    const [isLoadingGreeting, setIsLoadingGreeting] = useState(true);

    // Input state - declared early because it's used in useEffect dependency array
    const [input, setInput] = useState('');

    // Add effect to show completion message on mount if provided (only if no cached history)
    useEffect(() => {
        const loadCompletionMessage = async () => {
            if (__DEV__) {
                logger.log('[ChatScreen] Params received:', params);
                logger.log('[ChatScreen] initialMessage:', params.initialMessage);
                logger.log('[ChatScreen] Current messages length:', messages.length);
            }

            // Don't load completion message if we already have cached chat history
            if (messages.length > 0) {
                if (__DEV__) {
                    logger.log('[ChatScreen] Skipping completion message - chat history already loaded');
                }
                return;
            }

            // First check params
            const initialMessage = params.initialMessage as string | undefined;
            const prefillQuery = params.prefillQuery as string | undefined;

            if (initialMessage && messages.length === 0) {
                console.log('[ChatScreen] Setting completion message from params:', initialMessage);
                // Add bot message with completion message
                const botMsgTimestamp = Date.now();
                const botMsgId = botMsgTimestamp.toString();
                const botMsg: Message = {
                    id: botMsgId,
                    type: 'text',
                    content: initialMessage,
                    sender: 'bot',
                    timestamp: botMsgTimestamp,
                };
                setMessages([botMsg]);
                // Initialize displayed text as empty so typewriter effect works
                setDisplayedTexts({ [botMsgId]: '' });
                console.log('[ChatScreen] Completion message added to messages');
                // Clear from AsyncStorage after using (if it was stored there)
                await AsyncStorage.removeItem('onboarding_completion_message');
                return;
            }

            // Fallback: Check AsyncStorage if params didn't work
            if (messages.length === 0 && !initialMessage) {
                try {
                    const storedMessage = await AsyncStorage.getItem('onboarding_completion_message');
                    if (storedMessage) {
                        console.log('[ChatScreen] Found completion message in AsyncStorage');
                        const botMsgTimestamp = Date.now();
                        const botMsgId = botMsgTimestamp.toString();
                        const botMsg: Message = {
                            id: botMsgId,
                            type: 'text',
                            content: storedMessage,
                            sender: 'bot',
                            timestamp: botMsgTimestamp,
                        };
                        setMessages([botMsg]);
                        setDisplayedTexts({ [botMsgId]: '' });
                        await AsyncStorage.removeItem('onboarding_completion_message');
                        return;
                    }
                } catch (error) {
                    console.warn('[ChatScreen] Error reading AsyncStorage:', error);
                }
            }

            // Handle pre-filled query from insights screen
            if (prefillQuery && input === '') {
                setInput(prefillQuery);
            }
        };

        loadCompletionMessage();
    }, [params.initialMessage, params.prefillQuery, messages.length, input]);

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

    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);

    const fadeAnim = useRef(new Animated.Value(0)).current; // 0 = mic visible, 1 = send visible
    const flatListRef = useRef<FlatList<ChatListItem>>(null);
    const isUserScrolling = useRef(false);
    const scrollTimeoutRef = useRef<number | null>(null);
    const previousMessagesLengthRef = useRef<number>(0);

    //generate a unique sessionID for this conversation
    const generateSessionId = () => {
        return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    // Load chat messages from cache on mount
    useEffect(() => {
        const loadChatHistory = async () => {
            if (!user?.id) {
                setIsLoadingChatHistory(false);
                return;
            }

            setIsLoadingChatHistory(true);
            try {
                // Step 1: Load from cache first (fast UX)
                const cachedMessages = await getCachedUserData<Message[]>(user.id, 'chatMessages');
                logger.log('[ChatScreen] Cache check - user.id:', user.id);
                logger.log('[ChatScreen] Cached messages found:', cachedMessages ? cachedMessages.length : 0);

                if (cachedMessages && Array.isArray(cachedMessages) && cachedMessages.length > 0) {
                    logger.log('[ChatScreen] Loaded chat history from cache:', cachedMessages.length, 'messages');

                    // Mark all cached messages as restored
                    const restoredIds = new Set<string>(cachedMessages.map(msg => msg.id));
                    setRestoredMessageIds(restoredIds);

                    // Initialize opacity animations for fade-in
                    cachedMessages.forEach(msg => {
                        if (!messageOpacityRefs.current[msg.id]) {
                            messageOpacityRefs.current[msg.id] = new Animated.Value(0);
                        }
                    });

                    // Set messages - they will fade in
                    setMessages(cachedMessages);

                    // Initialize previousMessagesLengthRef to prevent auto-scroll on initial load
                    previousMessagesLengthRef.current = cachedMessages.length;

                    // Initialize displayed texts - for restored messages, show full content immediately (no typewriter)
                    const texts: Record<string, string> = {};
                    cachedMessages.forEach(msg => {
                        // For restored messages, show full content immediately (will fade in)
                        texts[msg.id] = msg.content || '';
                    });
                    setDisplayedTexts(texts);

                    // Animate fade-in for all restored messages
                    cachedMessages.forEach((msg, index) => {
                        const opacityRef = messageOpacityRefs.current[msg.id];
                        if (opacityRef) {
                            Animated.timing(opacityRef, {
                                toValue: 1,
                                duration: 300,
                                delay: index * 50, // Stagger the animations
                                useNativeDriver: true,
                            }).start();
                        }
                    });
                }

                // Step 2: ALWAYS fetch from backend (ensures completeness)
                try {
                    logger.log('[ChatScreen] Fetching chat history from backend...');
                    const backendMessages = await chatApi.getChatHistory(500); // Get all messages
                    logger.log('[ChatScreen] Backend returned:', backendMessages.length, 'messages');

                    // Step 3: Merge (backend is source of truth)
                    // Deduplicate by message ID, prefer backend messages
                    const messageMap = new Map<string, Message>();
                    cachedMessages?.forEach(msg => messageMap.set(msg.id, msg));
                    backendMessages.forEach(msg => messageMap.set(msg.id, msg)); // Backend overwrites cache

                    const mergedMessages = Array.from(messageMap.values())
                        .sort((a, b) => {
                            const aTime = (a as any).timestamp || 0;
                            const bTime = (b as any).timestamp || 0;
                            return aTime - bTime;
                        });

                    // Step 4: Cache merged data (permanent)
                    await cacheUserData(user.id, 'chatMessages', mergedMessages, Number.MAX_SAFE_INTEGER);
                    logger.log('[ChatScreen] Cached', mergedMessages.length, 'messages');

                    // Step 5: Update UI if we got new messages
                    if (mergedMessages.length !== cachedMessages?.length ||
                        !cachedMessages ||
                        mergedMessages.length > 0) {
                        setMessages(mergedMessages);

                        // Re-initialize animations for new messages
                        mergedMessages.forEach(msg => {
                            if (!messageOpacityRefs.current[msg.id]) {
                                messageOpacityRefs.current[msg.id] = new Animated.Value(1); // Already visible
                            }
                        });

                        // Update displayed texts
                        const texts: Record<string, string> = {};
                        mergedMessages.forEach(msg => {
                            texts[msg.id] = msg.content || '';
                        });
                        setDisplayedTexts(texts);
                    }
                } catch (backendError) {
                    // If backend fails, keep using cache (offline support)
                    logger.warn('[ChatScreen] Failed to fetch chat history from backend:', backendError);
                    if (!cachedMessages || cachedMessages.length === 0) {
                        // No cache and backend failed - show empty state
                        logger.log('[ChatScreen] No cache and backend failed - showing empty state');
                    }
                }
            } catch (error) {
                logger.error('[ChatScreen] Error loading chat history:', error);
            } finally {
                setIsLoadingChatHistory(false);
            }
        };

        loadChatHistory();
    }, [user?.id]);

    // Save chat messages to cache whenever they change
    useEffect(() => {
        const saveChatHistory = async () => {
            if (!user?.id || messages.length === 0) return;

            try {
                // Only save if we have at least one user message (to avoid saving just greeting/completion messages)
                const hasUserMessage = messages.some(msg => msg.sender === 'user');
                if (hasUserMessage) {
                    await cacheUserData(user.id, 'chatMessages', messages, Number.MAX_SAFE_INTEGER); // Permanent cache
                }
            } catch (error) {
                console.error('[ChatScreen] Error saving chat history to cache:', error);
            }
        };

        // Debounce saves to avoid too frequent writes
        const timeoutId = setTimeout(saveChatHistory, 1000);
        return () => clearTimeout(timeoutId);
    }, [messages, user?.id]);

    // ✅ Scroll to bottom only when a NEW message is added (not during typewriter effect)
    useEffect(() => {
        const currentLength = messages.length;
        const previousLength = previousMessagesLengthRef.current;

        // Only auto-scroll if a new message was added (length increased)
        if (currentLength > previousLength && flatListRef.current && !isUserScrolling.current) {
            // Reset user scrolling flag when new message arrives (user likely wants to see it)
            isUserScrolling.current = false;

            // Small delay to ensure FlatList has rendered the new item
            const scrollTimeout = setTimeout(() => {
                try {
                    // flatListData is derived from messages, so we can check messages.length instead
                    if (flatListRef.current && messages.length > 0) {
                        flatListRef.current.scrollToEnd({ animated: true });
                    }
                } catch (error) {
                    // Silently handle scroll errors (component might be unmounting)
                    logger.warn('[ChatScreen] Error scrolling to end:', error);
                }
            }, 100); // Increased delay for Android

            return () => clearTimeout(scrollTimeout);
        }

        // Update previous length
        previousMessagesLengthRef.current = currentLength;
    }, [messages.length]); // Removed flatListData.length since it's derived from messages

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
                scrollTimeoutRef.current = null;
            }
        };
    }, []);

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
                // Throttle typewriter updates on iOS for better performance
                const updateInterval = Platform.OS === 'ios' ? 20 : 10;
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

                        // Don't auto-scroll during typewriter effect - only on new messages
                    } else {
                        clearInterval(typeInterval);
                        delete typewriterTimersRef.current[messageId];
                    }
                }, updateInterval); // Throttled on iOS for better performance

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

    // Track restored messages (from cache) vs new messages
    const [restoredMessageIds, setRestoredMessageIds] = useState<Set<string>>(new Set());
    const [isLoadingChatHistory, setIsLoadingChatHistory] = useState(false);
    const messageOpacityRefs = useRef<Record<string, Animated.Value>>({});

    // Memoize displayedTexts to prevent unnecessary re-renders
    const memoizedDisplayedTexts = useMemo(() => displayedTexts, [displayedTexts]);

    // Memoize messages combined with displayed text for typewriter effect
    const memoizedMessages = useMemo(() => {
        return messages.map((msg) => {
            if (msg.sender === 'bot' && msg.type === 'text') {
                const displayedText = memoizedDisplayedTexts[msg.id] || '';
                return {
                    ...msg,
                    displayedContent: displayedText || msg.content,
                };
            }
            return msg;
        });
    }, [messages, memoizedDisplayedTexts]);

    // Create FlatList data structure with messages and date separators
    const flatListData = useMemo(() => {
        const items: ChatListItem[] = [];

        // Safety check: ensure memoizedMessages is defined
        if (!memoizedMessages || !Array.isArray(memoizedMessages)) {
            return items;
        }

        memoizedMessages.forEach((msg, index) => {
            const currentTimestamp = getMessageTimestamp(msg);
            const currentDateKey = getDateKey(currentTimestamp);

            // Get previous message date
            const previousTimestamp = index > 0 ? getMessageTimestamp(memoizedMessages[index - 1]) : null;
            const previousDateKey = previousTimestamp ? getDateKey(previousTimestamp) : null;

            // Add date separator if date changed
            if (index === 0 || currentDateKey !== previousDateKey) {
                items.push({
                    type: 'dateSeparator',
                    date: formatChatDate(currentTimestamp),
                    timestamp: currentTimestamp,
                });
            }

            // Add message
            items.push({
                type: 'message',
                message: msg,
                index,
            });
        });

        return items;
    }, [memoizedMessages]);

    // Render function for FlatList items
    const renderItem = useCallback(({ item }: { item: ChatListItem }) => {
        if (item.type === 'dateSeparator') {
            return (
                <View style={styles.dateSeparator}>
                    <View style={[styles.dateSeparatorLine, { backgroundColor: themeColors.border || colors.neutral200 }]} />
                    <Typo
                        size={12}
                        color={themeColors.textSecondary}
                        style={styles.dateSeparatorText}
                    >
                        {item.date}
                    </Typo>
                    <View style={[styles.dateSeparatorLine, { backgroundColor: themeColors.border || colors.neutral200 }]} />
                </View>
            );
        }

        // Render message
        const msg = item.message;
        const isRestored = restoredMessageIds.has(msg.id);
        const opacityRef = messageOpacityRefs.current[msg.id] || new Animated.Value(isRestored ? 0 : 1);
        if (!messageOpacityRefs.current[msg.id] && !isRestored) {
            messageOpacityRefs.current[msg.id] = new Animated.Value(1);
        }

        return (
            <Animated.View
                style={{ opacity: isRestored ? opacityRef : 1 }}
            >
                {msg.sender === 'bot' ? (
                    // Bot message: no bubble, white text on black background
                    <View style={styles.botMessageContainer}>
                        {msg.type === 'text' ? (
                            msg.content == '' && (isLoading || isTranscribing) ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <TypingIndicator
                                        showWordmark={false}
                                        caption="Thinking"
                                    />
                                </View>
                            ) : (
                                <>
                                    <Text style={[styles.botMessageText, { color: themeColors.textPrimary }]}>
                                        {isRestored
                                            ? (msg.content || '')
                                            : (displayedTexts[msg.id] !== undefined ? displayedTexts[msg.id] : (msg.content || ''))
                                        }
                                        {!isRestored && msg.content && displayedTexts[msg.id] !== undefined && displayedTexts[msg.id].length < msg.content.length && (
                                            <BlinkingCursor />
                                        )}
                                    </Text>
                                    {msg.content && !isLoading && !isTranscribing && (
                                        isRestored ? (
                                            <BotMessageActions messageId={msg.id} />
                                        ) : (
                                            displayedTexts[msg.id] === msg.content && (
                                                <BotMessageActions messageId={msg.id} />
                                            )
                                        )
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
            </Animated.View>
        );
    }, [memoizedMessages, displayedTexts, isLoading, isTranscribing, themeColors, restoredMessageIds]);

    // Key extractor for FlatList
    const keyExtractor = useCallback((item: ChatListItem, index: number) => {
        if (item.type === 'dateSeparator') {
            return `date-${item.timestamp}`;
        }
        return item.message.id;
    }, []);

    // Helper function to get auth token (memoized with useCallback)
    const getAuthToken = useCallback(async (): Promise<string | null> => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                alert.alert(
                    'Authentication Required',
                    'Please log in to continue.',
                    [{ text: 'OK', onPress: () => router.replace('/login') }]
                );
                return null;
            }
            return session.access_token;
        } catch (error) {
            logger.error('Error getting auth token:', error);
            alert.error('Failed to authenticate. Please try again.', 'Error');
            return null;
        }
    }, [router]);

    // Send text message to backend
    const sendText = async () => {
        const text = input.trim();
        if (!text || isLoading || isTranscribing) return; // Also check isTranscribing

        // Clear token buffer
        tokenBufferRef.current = '';

        // Add user message to UI immediately
        const now = Date.now();
        const userMsg: Message = {
            id: now.toString(),
            type: 'text',
            content: text,
            sender: 'user',
            timestamp: now,
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
        const botTimestamp = Date.now() + 1;
        const botMessageId = botTimestamp.toString();
        const botMsg: Message = {
            id: botMessageId,
            type: 'text',
            content: '',
            sender: 'bot',
            timestamp: botTimestamp,
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
                    alert.error(
                        error.message || 'Failed to send message. Please check your connection.',
                        'Error'
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
            alert.error(
                error.message || 'Failed to send message. Please check your connection.',
                'Error'
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
                    alert.alert(
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
            const botMsgTimestamp = Date.now() + 1;
            const botMsg: Message = {
                id: botMsgTimestamp.toString(),
                type: 'text',
                content: data.answer || 'Sorry, I couldn\'t generate a response.',
                sender: 'bot',
                timestamp: botMsgTimestamp,
            };
            setMessages((prev) => [...prev, botMsg]);

        } catch (error: any) {
            console.error('Chat error:', error);

            //Show error to user
            const errorMsgTimestamp = Date.now() + 1;
            const errorMsg: Message = {
                id: errorMsgTimestamp.toString(),
                type: 'text',
                content: error.message || 'Sorry an error occurred. Please try again.',
                sender: 'bot',
                timestamp: errorMsgTimestamp,
            }

            alert.error(
                error.message || 'Failed to send message. Please check your connection.',
                'Error'
            );
        } finally {
            setIsLoading(false);
        }*/
    };

    // Send voice message - transcribe then chat with streaming
    const sendVoice = async (uri: string) => {
        if (isLoading || isTranscribing) return;

        // Don't add voice message to chat - just show transcription popup
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
                        alert.alert(
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

            // Set the transcribed text in the input field
            setInput(transcribedText);

        } catch (error: any) {
            console.error('Voice chat error:', error);
            setIsTranscribing(false);
            setIsLoading(false);

            // Show error to user
            alert.error(
                error.message || 'Failed to process voice message. Please try again.',
                'Transcription Error'
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
                    keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
                >
                    <ScreenWrapperChat showPattern={false} style={{ paddingTop: 40, paddingBottom: 0 }}>
                        <View style={styles.content}>
                            {/* Loading indicator for chat history */}
                            {isLoadingChatHistory && messages.length === 0 && (
                                <View style={{ paddingVertical: spacingY._40, alignItems: 'center' }}>
                                    <ActivityIndicator size="large" color={colors.primary} />
                                </View>
                            )}

                            <FlatList
                                ref={flatListRef}
                                data={flatListData}
                                renderItem={renderItem}
                                keyExtractor={keyExtractor}
                                showsVerticalScrollIndicator={false}
                                style={{ backgroundColor: 'transparent', zIndex: 1 }}
                                contentContainerStyle={{
                                    paddingTop: messages.length === 0 ? 0 : spacingY._50,
                                    paddingBottom: spacingY._20,
                                }}
                                // iOS performance optimizations
                                removeClippedSubviews={true}
                                maxToRenderPerBatch={10}
                                initialNumToRender={15}
                                windowSize={10}
                                updateCellsBatchingPeriod={50}
                                onScrollBeginDrag={() => {
                                    // User started scrolling manually
                                    isUserScrolling.current = true;
                                    if (scrollTimeoutRef.current) {
                                        clearTimeout(scrollTimeoutRef.current);
                                        scrollTimeoutRef.current = null;
                                    }
                                }}
                                onScrollEndDrag={() => {
                                    // Reset scrolling flag after a delay (iOS can trigger scroll events after drag ends)
                                    if (scrollTimeoutRef.current) {
                                        clearTimeout(scrollTimeoutRef.current);
                                    }
                                    scrollTimeoutRef.current = setTimeout(() => {
                                        isUserScrolling.current = false;
                                        scrollTimeoutRef.current = null;
                                    }, 1000);
                                }}
                                onMomentumScrollEnd={() => {
                                    // iOS momentum scrolling ended
                                    if (scrollTimeoutRef.current) {
                                        clearTimeout(scrollTimeoutRef.current);
                                    }
                                    scrollTimeoutRef.current = setTimeout(() => {
                                        isUserScrolling.current = false;
                                        scrollTimeoutRef.current = null;
                                    }, 1000);
                                }}
                                maintainVisibleContentPosition={{
                                    minIndexForVisible: 0,
                                }}
                                ListEmptyComponent={
                                    isLoadingChatHistory ? (
                                        <View style={{ paddingVertical: spacingY._40, alignItems: 'center' }}>
                                            <ActivityIndicator size="large" color={colors.primary} />
                                        </View>
                                    ) : null
                                }
                            />
                        </View>

                        <View style={styles.inputSectionWrapper}>
                            <View style={[
                                styles.inputContainer,
                                {
                                    backgroundColor: themeColors.background,
                                    borderTopColor: themeColors.textPrimary
                                }
                            ]}>


                                {/* Paperclip hidden - not visible */}
                                {/* <TouchableOpacity
                                    style={styles.iconButton}
                                    activeOpacity={0.7}
                                >
                                    <Icons.PaperclipHorizontalIcon
                                        size={32}
                                        color={themeColors.textPrimary}
                                        weight="regular"
                                    />
                                </TouchableOpacity> */}

                                <View style={styles.inputWrapper}>
                                    {/* Transcription popup overlay */}
                                    {isTranscribing ? (
                                        <View style={[styles.transcriptionPopup, { backgroundColor: themeColors.cardBackground || colors.white }]}>
                                            <ActivityIndicator
                                                size="small"
                                                color={themeColors.accentPrimary || colors.primary}
                                                style={{ marginRight: spacingX._10 }}
                                            />
                                            <Typo size={16} color={themeColors.textPrimary} fontWeight="500">
                                                Transcribing...
                                            </Typo>
                                        </View>
                                    ) : (
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
                                                    ...(Platform.OS === 'ios' && inputHeight <= 56 && {
                                                        paddingTop: 18,
                                                        paddingBottom: 18,
                                                    }),
                                                }
                                            ]}
                                            onContentSizeChange={(e) => {
                                                const contentHeight = e.nativeEvent.contentSize.height;
                                                const calculatedHeight = contentHeight < 56 ? 56 : Math.min(contentHeight, 120);
                                                setInputHeight(calculatedHeight);
                                            }}
                                        />
                                    )}
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

const ChatScreenComponent = ChatScreen;

export default function ProtectedChatScreen() {
    return (
        <AuthGuard>
            <ChatScreenComponent />
        </AuthGuard>
    );
}

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
        justifyContent: 'flex-start',
        minHeight: 56,
        maxHeight: 144, // Max height for multiline (120px content + 24px padding)
    },
    transcriptionPopup: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        width: '100%',
        borderRadius: radius.full,
        paddingHorizontal: spacingX._20,
        minHeight: 56,
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
        ...(Platform.OS === 'ios' && {
            lineHeight: 20,
        }),
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
    dateSeparator: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: spacingY._15,
        paddingHorizontal: spacingX._20,
    },
    dateSeparatorLine: {
        flex: 1,
        height: 1,
    },
    dateSeparatorText: {
        paddingHorizontal: spacingX._12,
        opacity: 0.7,
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
