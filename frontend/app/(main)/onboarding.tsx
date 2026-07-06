import successAnimation from '@/assets/images/animations/Success.json';
import { AuthGuard } from '@/components/AuthGuard';
import MultiStepProgressBar from '@/components/MultiStepProgressBar';
import OptionCard from '@/components/OptionCard';
import Typo from '@/components/Typo';
import { radius, spacingX, spacingY } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { alert } from '@/utils/alert';
import { userApi } from '@/utils/api';
import { API_URL, MOCK_MODE } from '@/utils/config';
import { checkOnboardingStatus } from '@/utils/onboarding';
import { verticalScale } from '@/utils/styling';
import { supabase } from '@/utils/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import LottieView from 'lottie-react-native';
import * as Icons from 'phosphor-react-native';
import { useEffect, useRef, useState } from 'react';
import Animated, { FadeInDown, FadeInLeft, FadeInRight, FadeOutLeft } from 'react-native-reanimated';

import { GradientButton } from '@/components/ui';
import {
  CalendarBlank,
  ChartLineUp,
  ChatCircleDots,
  NotePencil,
  Target
} from 'phosphor-react-native';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type OnboardingStep = 'intro' | 'goal' | 'experience' | 'preference' | 'details' | 'success';

type GoalOption = {
  label: string;
  value: string;
};

type ExperienceOption = {
  label: string;
  value: string;
};

type PreferenceOption = {
  label: string;
  value: string;
};

type StepConfig = {
  id: OnboardingStep;
  title: string;
  subtitle: string;
  optional?: boolean;
};

const STEP_CONFIG: StepConfig[] = [
  {
    id: 'intro',
    title: '',
    subtitle: '',
  },
  {
    id: 'goal',
    title: 'Your Why',
    subtitle: 'What brings you to FitAI today?',
  },

  {
    id: 'experience',
    title: 'Your Experience',
    subtitle: 'How would you describe your training right now?',
  },

  {
    id: 'preference',
    title: 'How You Train',
    subtitle: 'What kind of training feels most like you?',
  },
  {
    id: 'details',
    title: 'Anything I should know?',
    subtitle: 'Share injuries, schedule, or any context you want me to remember.',
    optional: true,
  },
  {
    id: 'success',
    title: 'All set!',
    subtitle: '',
  },
];


const GOAL_OPTIONS: GoalOption[] = [
  { label: 'Build muscle', value: 'build muscle' },
  { label: 'Lose fat', value: 'lose fat' },
  { label: 'Get consistent', value: 'get consistent' },
  { label: 'Feel healthier', value: 'feel healthier' },
  { label: 'Train for performance', value: 'train for performance' },
  { label: 'Just exploring', value: 'just exploring' },
];

const EXPERIENCE_OPTIONS: ExperienceOption[] = [
  { label: 'Beginner', value: 'beginner' },
  { label: 'Intermediate', value: 'intermediate' },
  { label: 'Advanced', value: 'advanced' },
];

const PREFERENCE_OPTIONS: PreferenceOption[] = [
  { label: 'Strength training', value: 'strength training' },
  { label: 'Cardio', value: 'cardio' },
  { label: 'Home workouts', value: 'home workouts' },
  { label: 'Sports & performance', value: 'sports & performance' },
  { label: 'Mix of everything', value: 'mix of everything' },
];

const DETAIL_CHIPS = [
  'Previous Injury', 'Busy Schedule', 'Home Workouts',
  'Nutrition Goals', 'Recovery Issues', 'Sports Training',
];

const Onboarding = () => {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  console.log('[Onboarding] Rendering - MOCK_MODE:', MOCK_MODE);

  const { colors: themeColors } = useTheme();

  const [goal, setGoal] = useState<GoalOption | null>(null);
  const [experience, setExperience] = useState<ExperienceOption | null>(null);
  const [preference, setPreference] = useState<PreferenceOption | null>(null);
  const [detailsNote, setDetailsNote] = useState('');
  const [showResponse, setShowResponse] = useState(false);
  const [responseMessage, setResponseMessage] = useState<string>('');

  // Add state for completion message
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);
  const [isLoadingCompletion, setIsLoadingCompletion] = useState(false);

  const successAnimationRef = useRef<LottieView>(null);
  const hasNavigatedToChat = useRef(false);

  const stripEmojis = (text: string): string => {
    return text.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim();
  };

  useEffect(() => {//first place to comment out for testing
    let isMounted = true;

    const loadSession = async () => {
      // 🚨 MOCK MODE: Set dummy session
      if (MOCK_MODE) {
        console.log('🤖 MOCK MODE: Using dummy session for onboarding (loadSession)');
        setUserId('mock-user-id');
        setAuthToken('mock-auth-token');
        return;
      }

      try {
        const { data } = await supabase.auth.getSession();
        if (!isMounted) return;

        const session = data.session;

        if (!session?.user || !session.access_token) {
          router.replace('/login');
          return;
        }

        setUserId(session.user.id);
        setAuthToken(session.access_token);
      } catch (error) {
        console.warn('[onboarding] Failed to load auth session', error);
        if (isMounted) {
          alert.alert('Session Error', 'Please sign in again to continue onboarding.', [
            { text: 'OK', onPress: () => router.replace('/login') },
          ]);
        }
      }
    };

    loadSession();

    return () => {
      isMounted = false;
    };
  }, [router]);

  /*useEffect(() => {//uncomment for testing
    setUserId('preview');
    setAuthToken('preview');
  }, []);*/

  // Load existing user data to resume onboarding if partially completed
  useEffect(() => {
    const loadExistingData = async () => {
      // 🚨 MOCK MODE: Skip status check
      if (MOCK_MODE) {
        console.log('🤖 MOCK MODE: Skipping onboarding status check');
        return;
      }

      if (!userId || !authToken) return;

      try {
        const { userData } = await checkOnboardingStatus(userId);

        if (!userData) return;

        // Pre-fill goal if exists
        if (userData.goals?.primary_goal) {
          const goalValue = userData.goals.primary_goal;
          const existingGoal = GOAL_OPTIONS.find(opt => opt.value === goalValue);
          if (existingGoal) {
            setGoal(existingGoal);
          }
        }

        // Pre-fill experience if exists
        if (userData.profile?.experience_level) {
          const expValue = userData.profile.experience_level;
          const existingExp = EXPERIENCE_OPTIONS.find(opt => opt.value === expValue);
          if (existingExp) {
            setExperience(existingExp);
          }
        }

        // Pre-fill preference if exists
        if (userData.profile?.workout_preference) {
          const prefValue = userData.profile.workout_preference;
          const existingPref = PREFERENCE_OPTIONS.find(opt => opt.value === prefValue);
          if (existingPref) {
            setPreference(existingPref);
          }
        }

        // Pre-fill details if exists
        if (userData.profile?.constraints) {
          setDetailsNote(userData.profile.constraints);
        }

        // Determine which step to start from based on missing data
        const hasGoal = !!userData.goals?.primary_goal;
        const hasExperience = !!userData.profile?.experience_level;
        const hasPreference = !!userData.profile?.workout_preference;

        // If user has completed some steps, start from the first incomplete step
        // Otherwise, start from the beginning (intro step)
        if (hasGoal && hasExperience && hasPreference) {
          // All required steps completed, stay at current step (or go to details if they haven't)
          // This handles the case where user completed required steps but not optional details
          if (currentIndex === 0) {
            // If still at intro and they have all required data, move to details step
            setCurrentIndex(STEP_CONFIG.findIndex(s => s.id === 'details'));
          }
        } else if (hasGoal && hasExperience) {
          // Missing preference, start at preference step
          setCurrentIndex(STEP_CONFIG.findIndex(s => s.id === 'preference'));
        } else if (hasGoal) {
          // Missing experience, start at experience step
          setCurrentIndex(STEP_CONFIG.findIndex(s => s.id === 'experience'));
        }
        // If no goal, start from goal step (or intro if they want to read it again)

      } catch (error) {
        console.warn('[Onboarding] Error loading existing data:', error);
        // Non-critical - continue with fresh onboarding
      }
    };

    loadExistingData();
  }, [userId, authToken]);

  const step = STEP_CONFIG[currentIndex];
  const requiresSession = step.id !== 'intro' && step.id !== 'success';
  const continueDisabled = isSubmitting || (requiresSession && (!authToken || !userId));

  const submitStep = async (stepId: OnboardingStep) => {
    if (stepId === 'intro' || stepId === 'success') {
      return true;
    }

    if (!authToken || !userId) {//2nd place to comment out for testing
      alert.alert('Session Expired', 'Please log back in to continue onboarding.', [
        { text: 'OK', onPress: () => router.replace('/login') },
      ]);
      return false;
    }



    let data: Record<string, any> = {};
    let apiStep = 'profile';

    switch (stepId) {
      case 'goal':
        if (!goal) {
          alert.warning("Please choose the primary reason you're here.", 'Select a goal');
          return false;
        }
        data = { primary_goal: goal.value };
        apiStep = 'goals';
        break;

      case 'experience':
        if (!experience) {
          alert.warning("Let us know where you're at so we can tailor everything.", 'Select experience');
          return false;
        }
        data = { experience_level: experience.value };
        apiStep = 'profile';
        break;

      case 'preference':
        if (!preference) {
          alert.warning('Pick whichever feels closest — you can always change later.', 'Select preference');
          return false;
        }
        data = { workout_preference: preference.value };
        apiStep = 'profile';
        break;

      case 'details':
        if (!detailsNote.trim()) {
          return true;
        }
        data = { constraints: detailsNote.trim() };
        apiStep = 'profile';
        break;

      default:
        return true;
    }

    // 🚨 MOCK MODE: Skip backend submission
    if (MOCK_MODE) {
      console.log('🤖 MOCK MODE: Skipping onboarding step submission');
      return true;
    }

    try {
      //3rd place to comment out for testing
      setIsSubmitting(true);

      // Log the request details for debugging
      console.log('[Onboarding] Submitting step:', {
        apiUrl: API_URL,
        endpoint: `${API_URL}/onboarding_step`,
        userId,
        step: apiStep,
        data,
        hasAuthToken: !!authToken,
      });

      const response = await fetch(`${API_URL}/onboarding_step`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          step: apiStep,
          data,
        }),
      });

      console.log('[Onboarding] Response status:', response.status, response.statusText);


      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Failed to save onboarding step';

        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.detail || errorMessage;
        } catch {
          // If not JSON, use the text directly
          errorMessage = errorText || errorMessage;
        }

        // Log the full error for debugging
        console.error('[Onboarding] API Error:', {
          status: response.status,
          statusText: response.statusText,
          url: `${API_URL}/onboarding_step`,
          error: errorText,
          requestBody: { user_id: userId, step: apiStep, data }
        });

        throw new Error(errorMessage);
      }

      return true;
    } catch (error: any) {
      // console.error('Onboarding step error:', error);
      alert.error(error?.message || 'Please try again.', 'Save Failed');
      return false;
    } finally {
      setIsSubmitting(false);
    }

    //return true;//for testing
  };

  const handleContinue = async () => {
    if (continueDisabled) {
      return;
    }
    const stepId = step.id;
    const success = await submitStep(stepId);
    if (!success) return;

    // Show response screen for goal, experience, preference, or details (if text entered)
    if (stepId === 'goal' && goal) {
      setResponseMessage(`So you want to ${stripEmojis(goal.label)}? Alright!`);
      setShowResponse(true);
    }
    else if (stepId === 'experience' && experience) {
      setResponseMessage(`Perfect! We'll tailor everything to ${experience.label} level.`);
      setShowResponse(true);
    }
    else if (stepId === 'preference' && preference) {
      setResponseMessage(`Awesome! ${preference.label} sounds great.`);
      setShowResponse(true);
    }
    else if (stepId === 'details' && detailsNote.trim()) {
      setResponseMessage(`Got it! Thanks for sharing.`);
      setShowResponse(true);
    }
    else {
      // For intro or details (skipped), navigate directly
      if (currentIndex === STEP_CONFIG.length - 1) {
        // Mark onboarding as completed via discover endpoint
        if (userId && authToken) {
          try {
            await userApi.discoverData(
              'onboarding_completed',
              true,
              'User completed onboarding'
            );
          } catch (error) {
            console.warn('Failed to mark onboarding as completed:', error);
            // Non-critical, continue anyway
          }

          //fetch completion message before navigating
          try {
            console.log('[Onboarding] Fetching completion message for user:', userId);
            const completionData = await userApi.getCompletionMessage(userId);
            console.log('[Onboarding] Completion data received:', completionData);

            if (completionData?.message) {
              console.log('[Onboarding] Navigating with completion message:', completionData.message);
              console.log('[Onboarding] Message length:', completionData.message.length);

              // Store in AsyncStorage as backup (in case params don't work)
              try {
                await AsyncStorage.setItem('onboarding_completion_message', completionData.message);
                console.log('[Onboarding] Stored completion message in AsyncStorage as backup');
              } catch (storageError) {
                console.warn('[Onboarding] Failed to store message in AsyncStorage:', storageError);
              }

              // Navigate with completion message
              router.replace({
                pathname: '/chatscreen',
                params: { initialMessage: completionData.message }
              } as any);

              // Add a small delay to ensure navigation completes
              await new Promise(resolve => setTimeout(resolve, 100));
              return;
            } else {
              console.log('[Onboarding] No completion message in response');
              router.replace('/chatscreen');
              return;
            }
          } catch (error) {
            console.error('[Onboarding] Error fetching completion message:', error);
            // Continue to chat screen anyway
            router.replace('/chatscreen');
            return;
          }
        } else {
          console.log('[Onboarding] No userId or authToken, navigating without completion message');
          router.replace('/chatscreen');
          return;
        }

      }
      setCurrentIndex((prev) => Math.min(prev + 1, STEP_CONFIG.length - 1));
    }


  };

  const handleBack = () => {
    if (currentIndex === 0) {
      router.replace('/welcome');
      return;
    }
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleResponseContinue = () => {
    setShowResponse(false);
    setCurrentIndex(prev => Math.min(prev + 1, STEP_CONFIG.length - 1));
  };

  // NEW: Navigate to chat screen with completion message
  const navigateToChat = () => {
    if (hasNavigatedToChat.current) {
      return; // Prevent double navigation
    }
    hasNavigatedToChat.current = true;

    if (completionMessage) {
      // Navigate with completion message
      router.replace({
        pathname: '/chatscreen',
        params: { initialMessage: completionMessage }
      } as any);
    } else {
      // Navigate without completion message if not available
      router.replace('/chatscreen');
    }
  };

  const getStepIcon = () => {
    const map: Record<string, React.ReactNode> = {
      intro: <ChatCircleDots size={28} color={themeColors.accent} weight="fill" />,
      goal: <Target size={28} color={themeColors.accent} weight="fill" />,
      experience: <ChartLineUp size={28} color={themeColors.accent} weight="fill" />,
      preference: <CalendarBlank size={28} color={themeColors.accent} weight="fill" />,
      details: <NotePencil size={28} color={themeColors.accent} weight="fill" />,
    };
    const icon = map[step.id];
    if (!icon) return null;
    return (
      <View style={[styles.stepIconBox, {
        backgroundColor: themeColors.card,
        borderColor: themeColors.border,
      }]}>
        {icon}
      </View>
    );
  };

  const renderOptions = () => {
    const content = (() => {
      switch (step.id) {
        case 'intro':
          return (
            <Animated.View entering={FadeInDown.delay(100).springify()} style={{ alignItems: 'center', gap: spacingY._20, paddingTop: spacingY._20 }}>
              <Typo size={32} fontWeight="800" color={themeColors.textPrimary} style={{ textAlign: 'center' }}>
                Meet your personal AI fitness coach.
              </Typo>
              <Typo size={16} color={themeColors.textSecondary} style={{ textAlign: 'center', lineHeight: 24 }}>
                Get personalized workouts, real-time coaching, and insights tailored just for you.
              </Typo>
            </Animated.View>
          );

        case 'goal':
          return (
            <View style={{ gap: spacingY._15 }}>
              {GOAL_OPTIONS.map((option, index) => {
                const getIcon = () => {
                  switch (option.value) {
                    case 'build muscle':
                      return <Icons.Barbell size={20} color={goal?.value === option.value ? themeColors.background : themeColors.accentPrimary} weight="fill" />;
                    case 'lose fat':
                      return <Icons.Flame size={20} color={goal?.value === option.value ? themeColors.background : themeColors.accentWarm} weight="fill" />;
                    case 'get consistent':
                      return <Icons.Heart size={20} color={goal?.value === option.value ? themeColors.background : themeColors.accentPrimary} weight="fill" />;
                    case 'feel healthier':
                      return <Icons.Heart size={20} color={goal?.value === option.value ? themeColors.background : themeColors.accentPrimary} weight="fill" />;
                    case 'train for performance':
                      return <Icons.Lightning size={20} color={goal?.value === option.value ? themeColors.background : themeColors.accentPrimary} weight="fill" />;
                    case 'just exploring':
                      return <Icons.Eye size={20} color={goal?.value === option.value ? themeColors.background : themeColors.textSecondary} weight="fill" />;
                    default:
                      return null;
                  }
                };

                return (
                  <Animated.View
                    key={option.value}
                    entering={FadeInLeft.delay(index * 150).duration(500).springify().damping(20)}
                  >
                    <OptionCard
                      label={option.label}
                      icon={getIcon()}
                      isSelected={goal?.value === option.value}
                      onPress={() => setGoal(option)}
                    />
                  </Animated.View>
                );
              })}
            </View>
          );

        case 'experience':
          return (
            <View style={{ gap: spacingY._15 }}>
              {EXPERIENCE_OPTIONS.map((option, index) => {
                const getIcon = () => {
                  switch (option.value) {
                    case 'beginner':
                      return <Icons.Leaf size={20} color={experience?.value === option.value ? themeColors.background : themeColors.accentPrimary} weight="fill" />;
                    case 'intermediate':
                      return <Icons.ChartLineUp size={20} color={experience?.value === option.value ? themeColors.background : themeColors.accentPrimary} weight="fill" />;
                    case 'advanced':
                      return <Icons.Lightning size={20} color={experience?.value === option.value ? themeColors.background : themeColors.accentPrimary} weight="fill" />;
                    default:
                      return null;
                  }
                };

                return (
                  <Animated.View
                    key={option.value}
                    entering={FadeInLeft.delay(index * 150).duration(500).springify().damping(20)}
                  >
                    <OptionCard
                      label={option.label}
                      icon={getIcon()}
                      isSelected={experience?.value === option.value}
                      onPress={() => setExperience(option)}
                    />
                  </Animated.View>
                );
              })}
            </View>
          );

        case 'preference':
          return (
            <View style={{ gap: spacingY._15 }}>
              {PREFERENCE_OPTIONS.map((option, index) => {
                const getIcon = () => {
                  switch (option.value) {
                    case 'strength training':
                      return <Icons.Barbell size={20} color={preference?.value === option.value ? themeColors.background : themeColors.accentPrimary} weight="fill" />;
                    case 'cardio':
                      return <Icons.Heartbeat size={20} color={preference?.value === option.value ? themeColors.background : themeColors.accentPrimary} weight="fill" />;
                    case 'home workouts':
                      return <Icons.House size={20} color={preference?.value === option.value ? themeColors.background : themeColors.accentPrimary} weight="fill" />;
                    case 'sports & performance':
                      return <Icons.Trophy size={20} color={preference?.value === option.value ? themeColors.background : themeColors.accentPrimary} weight="fill" />;
                    case 'mix of everything':
                      return <Icons.ArrowsClockwise size={20} color={preference?.value === option.value ? themeColors.background : themeColors.accentPrimary} weight="fill" />;
                    default:
                      return null;
                  }
                };

                return (
                  <Animated.View
                    key={option.value}
                    entering={FadeInLeft.delay(index * 150).duration(500).springify().damping(20)}
                  >
                    <OptionCard
                      label={option.label}
                      icon={getIcon()}
                      isSelected={preference?.value === option.value}
                      onPress={() => setPreference(option)}
                    />
                  </Animated.View>
                );
              })}
            </View>
          );

        case 'details':
          return (
            <View style={styles.detailsContainer}>

              {/* Suggestion chips */}
              <Typo size={12} fontWeight="600" color={themeColors.textMuted} style={{ letterSpacing: 0.5 }}>
                Common things to share
              </Typo>
              <View style={styles.chipsRow}>
                {DETAIL_CHIPS.map((chip) => (
                  <Pressable
                    key={chip}
                    onPress={() => setDetailsNote(prev => prev ? `${prev}, ${chip.toLowerCase()}` : chip.toLowerCase())}
                    style={[styles.chip, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
                  >
                    <Typo size={13} color={themeColors.textPrimary}>{chip}</Typo>
                  </Pressable>
                ))}
              </View>

              {/* Input */}
              <View style={[styles.detailsCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
                <TextInput
                  placeholder="Shoulder injury, gym 3×/week…"
                  style={[styles.detailsInput, { color: themeColors.textPrimary }]}
                  placeholderTextColor={themeColors.textMuted}
                  multiline
                  value={detailsNote}
                  onChangeText={setDetailsNote}
                  textAlignVertical="top"
                  maxLength={280}
                />
              </View>

              <Typo size={13} color={themeColors.textMuted}>
                Add anything you want me to remember. You can always share more in chat later.
              </Typo>

              {/* What I'll Remember summary */}
              <View style={[styles.rememberCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
                <View style={styles.rememberTitle}>
                  <Icons.BookBookmark size={16} color={themeColors.accent} weight="fill" />
                  <Typo size={13} fontWeight="700" color={themeColors.textPrimary}>What I'll Remember</Typo>
                </View>
                {goal && (
                  <View style={styles.learnedRow}>
                    <Typo size={13} color={themeColors.textSecondary}>Goal</Typo>
                    <View style={styles.learnedValue}>
                      <Icons.Check size={13} color={themeColors.accent} weight="bold" />
                      <Typo size={13} fontWeight="700" color={themeColors.textPrimary}>{goal.label}</Typo>
                    </View>
                  </View>
                )}
                {experience && (
                  <View style={styles.learnedRow}>
                    <Typo size={13} color={themeColors.textSecondary}>Level</Typo>
                    <View style={styles.learnedValue}>
                      <Icons.Check size={13} color={themeColors.accent} weight="bold" />
                      <Typo size={13} fontWeight="700" color={themeColors.textPrimary}>{experience.label}</Typo>
                    </View>
                  </View>
                )}
                {preference && (
                  <View style={styles.learnedRow}>
                    <Typo size={13} color={themeColors.textSecondary}>Preference</Typo>
                    <View style={styles.learnedValue}>
                      <Icons.Check size={13} color={themeColors.accent} weight="bold" />
                      <Typo size={13} fontWeight="700" color={themeColors.textPrimary}>{preference.label}</Typo>
                    </View>
                  </View>
                )}
              </View>
            </View>
          );

        case 'success':
          return (
            <View style={styles.successContent}>
              <LottieView
                ref={successAnimationRef}
                source={successAnimation}
                autoPlay
                loop={false}
                style={styles.successAnimation}
                onAnimationFinish={() => {
                  if (completionMessage) {
                    navigateToChat();
                  } else if (!isLoadingCompletion) {
                    navigateToChat();
                  } else {
                    let attempts = 0;
                    const checkInterval = setInterval(() => {
                      attempts++;
                      if (completionMessage || !isLoadingCompletion || attempts >= 15) {
                        clearInterval(checkInterval);
                        navigateToChat();
                      }
                    }, 200);
                  }
                }}
              />

              <Typo size={30} fontWeight="700" color={themeColors.textPrimary} style={{ textAlign: 'center' }}>
                You're all set!
              </Typo>

              <Typo size={16} color={themeColors.textSecondary} style={styles.successSubtext}>
                {isLoadingCompletion
                  ? 'Preparing your personalized welcome...'
                  : completionMessage
                    ? 'Ready to chat!'
                    : 'Stitched together your personalized fitness journey. Jumping into chat…'
                }
              </Typo>
            </View>
          );

        default:
          return null;
      }
    })();

    return (
      <Animated.View
        key={step.id}
        entering={FadeInRight.springify().damping(18)}
        exiting={FadeOutLeft.duration(300)}
        style={{ flex: 1 }}
      >
        {content}
      </Animated.View>
    );
  };

  // Fetch completion message when success step is reached
  useEffect(() => {
    const step = STEP_CONFIG[currentIndex];

    // Only fetch when we reach the success step
    if (step.id === 'success' && userId && authToken && !completionMessage && !isLoadingCompletion) {
      console.log('[Onboarding] Fetching completion message...');
      setIsLoadingCompletion(true);

      // 🚨 MOCK MODE: Use mock completion message
      if (MOCK_MODE) {
        console.log('🤖 MOCK MODE: Using mock completion message');
        // Set a mock completion message after a short delay to simulate API call
        setTimeout(() => {
          setCompletionMessage("Hey! 👋 Welcome to FitAI! I'm excited to help you on your fitness journey. Based on what you shared during onboarding, I've got a personalized plan ready for you. What would you like to start with today?");
          setIsLoadingCompletion(false);
        }, 500); // Small delay to simulate loading
        return;
      }

      // Mark onboarding as completed (non-blocking)
      userApi.discoverData(
        'onboarding_completed',
        true,
        'User completed onboarding'
      ).catch(error => {
        console.warn('[Onboarding] Failed to mark onboarding as completed:', error);
        // Non-critical, continue anyway
      });

      // Fetch completion message
      userApi.getCompletionMessage(userId)
        .then(data => {
          if (data?.message) {
            console.log('[Onboarding] Completion message received:', data.message);
            setCompletionMessage(data.message);
          } else {
            console.log('[Onboarding] No completion message returned');
          }
        })
        .catch(error => {
          console.warn('[Onboarding] Failed to get completion message:', error);
          // Non-critical - continue without completion message
        })
        .finally(() => {
          setIsLoadingCompletion(false);
          console.log('[Onboarding] Completion message fetch finished');
        });
    }
  }, [currentIndex, userId, authToken, completionMessage, isLoadingCompletion]);

  // Reset navigation flag when leaving success step
  useEffect(() => {
    if (step.id !== 'success') {
      hasNavigatedToChat.current = false;
    }
  }, [step.id]);

  // Update response timer to properly handle navigation to success step
  useEffect(() => {
    if (showResponse) {
      const timer = setTimeout(() => {
        setShowResponse(false);

        // Check if we're on the last step before success (details step)
        if (currentIndex === STEP_CONFIG.length - 2) {
          // Move to success step (last step)
          setCurrentIndex((prev) => Math.min(prev + 1, STEP_CONFIG.length - 1));
        } else if (currentIndex === STEP_CONFIG.length - 1) {
          // Already on success step, this shouldn't happen but handle it
          navigateToChat();
        } else {
          // Move to next step
          setCurrentIndex((prev) => Math.min(prev + 1, STEP_CONFIG.length - 1));
        }
      }, 60000); // Show for 1.5 seconds

      return () => clearTimeout(timer);
    }
  }, [showResponse, currentIndex, completionMessage]);


  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
    >
      <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.background }]}>
        <StatusBar barStyle="light-content" backgroundColor={themeColors.background} />

        <MultiStepProgressBar
          steps={STEP_CONFIG.map((cfg) =>
            cfg.title)}
          currentStep={currentIndex}
        />

        {showResponse ? (
          <View style={{ flex: 1, paddingHorizontal: spacingX._20 }}>

            {/* Header row */}
            <View style={styles.responseHeader}>
              <View style={[styles.profileBadge, { backgroundColor: themeColors.accentDim, borderColor: themeColors.accent }]}>
                <Icons.Info size={14} color={themeColors.accent} weight="fill" />
                <Typo size={13} fontWeight="600" color={themeColors.accent}>Building Your Profile</Typo>
              </View>
              <Typo size={13} color={themeColors.textMuted}>
                {[goal, experience, preference].filter(Boolean).length}/3 answered
              </Typo>
            </View>

            {/* Learned So Far card */}
            <View style={[styles.learnedCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
              <Typo size={11} fontWeight="700" color={themeColors.textMuted} style={{ letterSpacing: 1, marginBottom: 4 }}>
                LEARNED SO FAR
              </Typo>
              {goal && (
                <View style={styles.learnedRow}>
                  <Typo size={14} color={themeColors.textSecondary}>Your Goal</Typo>
                  <View style={styles.learnedValue}>
                    {step.id === 'goal'
                      ? <View style={[styles.checkCircle, { backgroundColor: themeColors.accent }]}><Icons.Check size={10} color="#fff" weight="bold" /></View>
                      : <Icons.Check size={14} color={themeColors.accent} weight="bold" />}
                    <Typo size={14} fontWeight="700" color={step.id === 'goal' ? themeColors.accent : themeColors.textPrimary}>{goal.label}</Typo>
                  </View>
                </View>
              )}
              {experience && (
                <View style={styles.learnedRow}>
                  <Typo size={14} color={themeColors.textSecondary}>Experience</Typo>
                  <View style={styles.learnedValue}>
                    {step.id === 'experience'
                      ? <View style={[styles.checkCircle, { backgroundColor: themeColors.accent }]}><Icons.Check size={10} color="#fff" weight="bold" /></View>
                      : <Icons.Check size={14} color={themeColors.accent} weight="bold" />}
                    <Typo size={14} fontWeight="700" color={step.id === 'experience' ? themeColors.accent : themeColors.textPrimary}>{experience.label}</Typo>
                  </View>
                </View>
              )}
              {preference && (
                <View style={styles.learnedRow}>
                  <Typo size={14} color={themeColors.textSecondary}>Preference</Typo>
                  <View style={styles.learnedValue}>
                    {step.id === 'preference'
                      ? <View style={[styles.checkCircle, { backgroundColor: themeColors.accent }]}><Icons.Check size={10} color="#fff" weight="bold" /></View>
                      : <Icons.Check size={14} color={themeColors.accent} weight="bold" />}
                    <Typo size={14} fontWeight="700" color={step.id === 'preference' ? themeColors.accent : themeColors.textPrimary}>{preference.label}</Typo>
                  </View>
                </View>
              )}
            </View>

            {/* Coach bubble */}
            <View style={styles.coachRow}>
              <View style={[styles.coachAvatar, { backgroundColor: themeColors.accent }]}>
                <Icons.Sparkle size={18} color="#fff" weight="fill" />
              </View>
              <View style={[styles.coachBubble, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
                <Typo size={17} fontWeight="700" color={themeColors.textPrimary} style={{ lineHeight: 25 }}>
                  {responseMessage}
                </Typo>
                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: themeColors.border }} />
                <Typo size={13} color={themeColors.accent}>• FitAI will remember this</Typo>
              </View>
            </View>

            <View style={{ flex: 1 }} />

            {/* CTA */}
            <View style={styles.actions}>
              <GradientButton
                title={[goal, experience, preference].filter(Boolean).length >= 3 ? 'Almost Done' : 'Next Question'}
                onPress={handleResponseContinue}
                style={{ width: '100%' }}
              />
            </View>
          </View>
        ) : (
          <>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scroll}
            >
              {getStepIcon()}
              <Typo size={28} fontWeight="800" color={themeColors.textPrimary}>
                {step.title}
              </Typo>

              {step.subtitle ? (
                <Typo size={15} color={themeColors.textSecondary} style={styles.subtitle}>
                  {step.subtitle}
                </Typo>
              ) : null}

              <View style={styles.options}>
                {renderOptions()}
              </View>
            </ScrollView>

            {step.id !== 'success' && (
              <View style={styles.actions}>
                <GradientButton
                  title={step.id === 'details' ? 'Get Started' : 'Continue'}
                  onPress={handleContinue}
                  loading={isSubmitting}
                  disabled={continueDisabled}
                  style={{ width: '100%' }}
                />
                {step.id === 'details' ? (
                  <GradientButton
                    title="Skip for now"
                    variant="outline"
                    onPress={handleContinue}
                    style={{ width: '100%' }}
                  />
                ) : (
                  <Pressable onPress={handleBack} style={styles.backLink}>
                    <Typo size={15} color={themeColors.textSecondary}>
                      {currentIndex === 0 ? 'Back to welcome' : 'Back'}
                    </Typo>
                  </Pressable>
                )}
              </View>
            )}
          </>
        )}
      </SafeAreaView>

    </KeyboardAvoidingView>
  )
}

const OnboardingComponent = Onboarding;

export default function ProtectedOnboarding() {
  return (
    <AuthGuard>
      <OnboardingComponent />
    </AuthGuard>
  );
}



const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    paddingHorizontal: spacingX._20,
    paddingBottom: spacingY._20,
  },
  stepIconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacingY._15,
    marginTop: spacingY._10,
  },
  subtitle: {
    marginTop: 8,
    marginBottom: spacingY._20,
  },
  options: {
    gap: spacingY._10,
  },
  actions: {
    paddingHorizontal: spacingX._20,
    paddingBottom: spacingY._25,
    paddingTop: spacingY._10,
    gap: spacingY._10,
    alignItems: 'center',
  },
  backLink: {
    paddingVertical: 6,
  },
  responseWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacingX._20,
  },
  // Keep for details/success steps
  detailsContainer: {
    gap: spacingY._15,
  },
  detailsCard: {
    borderRadius: radius._20,
    borderWidth: 1,
    padding: spacingY._15,
  },
  detailsInput: {
    minHeight: verticalScale(140),
    fontSize: 16,
    lineHeight: 22,
  },
  successContent: {
    alignItems: 'center',
    gap: spacingY._15,
    paddingTop: spacingY._10,
  },
  successAnimation: {
    width: verticalScale(220),
    height: verticalScale(220),
  },
  successSubtext: {
    textAlign: 'center',
    paddingHorizontal: spacingX._10,
    lineHeight: 22,
  },

  responseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacingY._10,
    marginBottom: spacingY._15,
  },
  profileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  learnedCard: {
    borderRadius: radius._20,
    borderWidth: 1,
    padding: spacingX._15,
    marginBottom: spacingY._15,
    gap: spacingY._10,
  },
  learnedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  learnedValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  checkCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachRow: {
    flexDirection: 'row',
    gap: spacingX._12,
    alignItems: 'flex-start',
  },
  coachAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  coachBubble: {
    flex: 1,
    borderRadius: radius._20,
    borderWidth: 1,
    padding: spacingX._15,
    gap: spacingY._10,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  rememberCard: {
    borderRadius: radius._20,
    borderWidth: 1,
    padding: spacingX._15,
    gap: spacingY._10,
  },
  rememberTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
})