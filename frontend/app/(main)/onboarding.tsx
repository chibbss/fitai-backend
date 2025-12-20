import { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, Platform, KeyboardAvoidingView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import Typo from '@/components/Typo';
import ScreenWrapper from '@/components/ScreenWrapper';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import Button from '@/components/Button';
import Animated, { FadeIn, FadeInDown, FadeInLeft, FadeInUp, SlideInDown, SlideInLeft, SlideInRight, SlideInUp } from 'react-native-reanimated'
import { verticalScale } from '@/utils/styling';
import { supabase } from '@/utils/supabase';
import MultiStepProgressBar from '@/components/MultiStepProgressBar';
import LottieView from 'lottie-react-native';
import successAnimation from '@/assets/images/animations/Success.json';
import botChatAnimation from '@/assets/images/animations/Bot_chat.json';
import { userApi } from '@/utils/api';
import { API_URL, MOCK_MODE } from '@/utils/config';
import { useTheme } from '@/context/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import PulseLogo from '@/components/PulseLogo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { alert } from '@/utils/alert';
import { AuthGuard } from '@/components/AuthGuard';
import * as Icons from 'phosphor-react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { checkOnboardingStatus } from '@/utils/onboarding';

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

const Onboarding = () => {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  //theme hooks
  const { mode, colors: themeColors } = useTheme();
  const isDarkMode = mode === 'dark';

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
  const progress = useMemo(() => {
    return {
      current: currentIndex + 1,
      total: STEP_CONFIG.length,
    };
  }, [currentIndex]);
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

  const renderOptions = () => {
    const { colors: themeColors } = useTheme();

    switch (step.id) {
      case 'intro':
        return (
          <View style={styles.introContent}>
            {/* Hero Icon Section */}
            <Animated.View
              entering={FadeInUp.duration(600).springify().damping(15).stiffness(100)}
              style={styles.heroIconContainer}
            >
              <View style={[styles.heroIconCircle, { backgroundColor: themeColors.cardBackground }]}>
                <Icons.ChatCircleDots size={64} color={themeColors.accentPrimary} weight="fill" />
              </View>
            </Animated.View>

            {/* Gradient Headline */}
            <Animated.View
              entering={FadeInUp.delay(150).duration(600).springify().damping(15).stiffness(100)}
              style={styles.gradientHeadlineContainer}
            >
              <MaskedView
                style={styles.maskedView}
                maskElement={
                  <Typo size={40} fontWeight="800" style={styles.gradientHeadline}>
                    Meet your personal AI fitness coach.
                  </Typo>
                }
              >
                <LinearGradient
                  colors={[themeColors.accentGradient[0], themeColors.accentGradient[1]] as readonly [string, string]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.gradientTextGradient}
                >
                  <Typo
                    size={40}
                    fontWeight="800"
                    style={StyleSheet.flatten([styles.gradientHeadline, { opacity: 0 }])}
                    color={themeColors.background}
                  >
                    Meet your personal AI fitness coach.
                  </Typo>
                </LinearGradient>
              </MaskedView>
            </Animated.View>

            {/* Improved Subtext */}
            <Animated.View
              entering={FadeInUp.delay(250).duration(600).springify().damping(15).stiffness(100)}
            >
              <Typo size={18} color={colors.neutral600} style={styles.introSubtext}>
                Get personalized workouts, real-time coaching, and insights tailored just for you.
              </Typo>
            </Animated.View>

            {/* Feature Highlights */}
            <Animated.View
              entering={FadeInDown.delay(400).duration(600).springify().damping(15).stiffness(100)}
              style={styles.featuresContainer}
            >
              <View style={styles.featureItem}>
                <View style={[styles.featureIconContainer, { backgroundColor: themeColors.cardBackground }]}>
                  <Icons.Barbell size={26} color={themeColors.accentPrimary} weight="fill" />
                </View>
                <Typo size={14} fontWeight="600" color={themeColors.background} style={styles.featureText}>
                  Personalized Plans
                </Typo>
              </View>

              <View style={styles.featureItem}>
                <View style={[styles.featureIconContainer, { backgroundColor: themeColors.cardBackground }]}>
                  <Icons.ChatCircle size={26} color={themeColors.accentPrimary} weight="fill" />
                </View>
                <Typo size={14} fontWeight="600" color={themeColors.background} style={styles.featureText}>
                  24/7 Coaching
                </Typo>
              </View>

              <View style={styles.featureItem}>
                <View style={[styles.featureIconContainer, { backgroundColor: themeColors.cardBackground }]}>
                  <Icons.ChartLineUp size={26} color={themeColors.accentPrimary} weight="fill" />
                </View>
                <Typo size={14} fontWeight="600" color={themeColors.background} style={styles.featureText}>
                  Track Progress
                </Typo>
              </View>
            </Animated.View>
          </View>
        );

      case 'goal':
        return GOAL_OPTIONS.map((option, index) => {
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
              entering={FadeInLeft.delay(index * 200).duration(700).springify().damping(50).stiffness(0)}
            >
              <Button
                key={option.value}
                onPress={() => setGoal(option)}
                style={[
                  styles.optionButton,
                  goal?.value === option.value && {
                    backgroundColor: themeColors.accentPrimary,
                    borderColor: themeColors.accentPrimary,
                  },
                ]}
              >
                <View style={styles.optionContent}>
                  {getIcon()}
                  <Typo
                    size={18}
                    fontWeight={goal?.value === option.value ? '700' : '500'}
                    color={goal?.value === option.value ? themeColors.background : colors.neutral700}
                    style={{ textAlign: 'center', marginLeft: spacingX._7 }}
                  >
                    {option.label}
                  </Typo>
                </View>
              </Button>
            </Animated.View>
          );
        });

      case 'experience':
        return EXPERIENCE_OPTIONS.map((option, index) => (
          <Animated.View
            key={option.value}
            entering={FadeInLeft.delay(index * 200).duration(700).springify().damping(50).stiffness(0)}

          >
            <Button
              key={option.value}
              onPress={() => setExperience(option)}
              style={[
                styles.optionButton,
                experience?.value === option.value && {
                  backgroundColor: themeColors.accentPrimary,
                  borderColor: themeColors.accentPrimary,
                },
              ]}
            >
              <Typo
                size={18}
                fontWeight={experience?.value === option.value ? '700' : '500'}
                color={experience?.value === option.value ? themeColors.background : colors.neutral700}
                style={{ textAlign: 'center' }}
              >
                {option.label}
              </Typo>
            </Button>
          </Animated.View>

        ));

      case 'preference':
        return PREFERENCE_OPTIONS.map((option, index) => {
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
              entering={FadeInLeft.delay(index * 200).duration(700).springify().damping(50).stiffness(0)}
            >
              <Button
                key={option.value}
                onPress={() => setPreference(option)}
                style={[
                  styles.optionButton,
                  preference?.value === option.value && {
                    backgroundColor: themeColors.accentPrimary,
                    borderColor: themeColors.accentPrimary,
                  },
                ]}
              >
                <View style={styles.optionContent}>
                  {getIcon()}
                  <Typo
                    size={18}
                    fontWeight={preference?.value === option.value ? '700' : '500'}
                    color={preference?.value === option.value ? themeColors.background : colors.neutral700}
                    style={{ textAlign: 'center', marginLeft: spacingX._7 }}
                  >
                    {option.label}
                  </Typo>
                </View>
              </Button>
            </Animated.View>
          );
        });

      case 'details':
        return (
          <View style={styles.detailsContainer}>
            <Animated.View
              entering={FadeInLeft.delay(0 * 200).duration(700).springify().damping(50).stiffness(0)}
            >
              <View style={styles.detailsCard}>

                <TextInput
                  placeholder="Shoulder injury, gym 3×/week…"
                  placeholderTextColor={colors.neutral400}
                  multiline
                  value={detailsNote}
                  onChangeText={setDetailsNote}
                  style={styles.detailsInput}
                  textAlignVertical="top"
                  maxLength={280}
                />
              </View>
            </Animated.View>

            <Animated.View
              entering={FadeInLeft.delay(1 * 200).duration(700).springify().damping(50).stiffness(0)}
            >
              <Typo size={14} color={colors.neutral500} style={{ textAlign: 'center' }}>
                Add anything you want me to remember. You can always share more in chat later.
              </Typo>
            </Animated.View>

            <Animated.View
              entering={FadeInLeft.delay(2 * 200).duration(700).springify().damping(50).stiffness(0)}
            >
              <Button
                style={styles.skipButton}
                onPress={() => handleContinue()}
                disabled={continueDisabled}
              >
                <Typo fontWeight="700" color={colors.black}>
                  Skip for now
                </Typo>
              </Button>
            </Animated.View>
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
                // Wait for completion message or navigate after timeout
                if (completionMessage) {
                  // Message is ready, navigate immediately
                  navigateToChat();
                } else if (!isLoadingCompletion) {
                  // Loading finished but no message, navigate anyway
                  navigateToChat();
                } else {
                  // Still loading, wait up to 3 seconds for completion message
                  let attempts = 0;
                  const checkInterval = setInterval(() => {
                    attempts++;
                    if (completionMessage || !isLoadingCompletion || attempts >= 15) {
                      clearInterval(checkInterval);
                      navigateToChat();
                    }
                  }, 200); // Check every 200ms, max 3 seconds (15 * 200ms)
                }
              }}
            />

            <Typo size={30} fontWeight="700" color={themeColors.background} style={{ textAlign: 'center' }}>
              You're all set!
            </Typo>

            <Typo size={16} color={colors.neutral600} style={styles.successSubtext}>
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
  };

  //render response screen
  const renderResponseScreen = () => {
    return (
      <View style={styles.responseContent}>
        <Animated.View
          entering={FadeInDown.duration(500).springify().damping(15).stiffness(80)}
          style={styles.responseContainer}
        >
          <Typo size={24} fontWeight="700" color={colors.black} style={styles.responseMessage}>
            {responseMessage}
          </Typo>
        </Animated.View>
      </View>
    )
  }

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
      }, 1500); // Show for 1.5 seconds

      return () => clearTimeout(timer);
    }
  }, [showResponse, currentIndex, completionMessage]);


  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
    >
      <ScreenWrapper showPattern={false}>
        <Animated.View
          entering={SlideInDown.delay(300).springify()}
          style={styles.container}
        >
          <View style={styles.progressContainer}>
            <MultiStepProgressBar
              steps={STEP_CONFIG.map((cfg) => cfg.title)}
              currentStep={currentIndex}
            />

          </View>

          <View style={styles.contentCard}>
            {showResponse ? (
              <View style={{ flex: 1 }}>
                <View style={[styles.scrollContent, { flex: 1, justifyContent: 'center' }]}>
                  <Typo size={28} fontWeight="700" style={{ marginBottom: spacingY._10 }}>
                    {step.title}
                  </Typo>
                  {renderResponseScreen()}
                </View>
              </View>

            ) : (
              <>

                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={[
                    styles.scrollContent,
                    step.id === 'success' && styles.successScrollContent,
                  ]}
                >

                  <Typo size={28} fontWeight="700" style={{ marginBottom: spacingY._10 }}>
                    {step.title}
                  </Typo>
                  {step.subtitle ? (
                    <Typo size={16} color={colors.neutral600} style={{ marginBottom: spacingY._20 }}>
                      {step.subtitle}
                    </Typo>
                  ) : null}

                  <View style={{ gap: spacingY._15 }}>{renderOptions()}</View>
                </ScrollView>

                {step.id !== 'success' && (
                  <View style={styles.actions}>
                    <Button
                      onPress={handleBack}
                      style={[styles.navButton, styles.backButton]}
                      disabled={isSubmitting}
                    >
                      <Typo fontWeight="500" color={themeColors.background}>
                        {currentIndex === 0 ? 'Back to welcome' : 'Back'}
                      </Typo>
                    </Button>
                    <LinearGradient
                      colors={[themeColors.accentGradient[0], themeColors.accentGradient[1]] as readonly [string, string]}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={styles.buttonGradient}
                    >
                      <Button
                        onPress={handleContinue}
                        loading={isSubmitting}
                        loadingColor={themeColors.textPrimary}
                        style={[styles.navButton, { backgroundColor: 'transparent' }]}
                        disabled={continueDisabled}
                      >
                        <Typo fontWeight="700" color={themeColors.background}>
                          {step.id === 'details' ? "Let's go!" : 'Continue'}
                        </Typo>
                      </Button>
                    </LinearGradient>
                  </View>
                )}
              </>
            )}
          </View>


        </Animated.View>
      </ScreenWrapper>
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
  container: {
    flex: 1,
    //gap: spacingY._30,
    // marginHorizontal: spacingX._20,
    //justifyContent: 'space-between',
    paddingHorizontal: spacingX._20,
    paddingTop: spacingY._20,

  },

  progressContainer: {

    marginBottom: spacingY._20,
    maxWidth: '100%',
  },
  stepIndicator: {
    marginTop: spacingY._10,
  },

  contentCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius._40,
    borderTopRightRadius: radius._40,
    padding: spacingY._20,
    borderCurve: 'continuous',
    elevation: 4,
  },

  optionButton: {
    backgroundColor: '#F4F7FB',
    borderRadius: radius._20,
    paddingVertical: spacingY._12,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  actions: {
    flexDirection: 'row',
    gap: spacingX._12,
    marginTop: spacingY._20,
  },

  navButton: {
    flex: 1,
    paddingVertical: spacingY._12,
  },

  buttonGradient: {
    flex: 1,
    borderRadius: radius.full,
    overflow: 'hidden',
    minHeight: verticalScale(56),
  },

  backButton: {
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.neutral500,
  },
  skipButton: {
    backgroundColor: '#EEF1F6',
  },

  detailsContainer: {
    gap: spacingY._15,
    alignItems: 'stretch',
  },
  detailsCard: {
    backgroundColor: '#F4F7FB',
    borderRadius: radius._20,
    borderWidth: 1,
    borderColor: colors.neutral200,
    padding: spacingY._15,
  },
  detailsInput: {
    minHeight: verticalScale(140),
    color: colors.neutral800,
    fontSize: 16,
    lineHeight: 22,
  },

  scrollContent: {
    paddingBottom: spacingY._10,
  },
  successScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },

  introContent: {
    marginTop: -35,
    gap: spacingY._20,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: spacingX._10,
  },
  heroIconContainer: {
    marginBottom: spacingY._10,
  },
  heroIconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  gradientHeadlineContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacingX._10,
  },
  maskedView: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gradientTextGradient: {
    flex: 1,
  },
  gradientHeadline: {
    textAlign: 'center',
    lineHeight: 48,
  },
  introSubtext: {
    textAlign: 'center',
    lineHeight: 26,
    paddingHorizontal: spacingX._15,
    marginTop: spacingY._5,
  },
  featuresContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacingX._20,
    marginTop: spacingY._10,
    paddingHorizontal: spacingX._10,
    flexWrap: 'wrap',
  },
  featureItem: {
    alignItems: 'center',
    gap: spacingY._7,
    minWidth: 100,
  },
  featureIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  featureText: {
    textAlign: 'center',
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


  header: {
    paddingHorizontal: spacingX._20,
    paddingTop: spacingY._15,
    paddingBottom: spacingY._25,
    flexDirection: 'row',
    alignItems: 'center'
  },

  content: {
    flex: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius._50,
    borderTopRightRadius: radius._50,
    borderCurve: 'continuous',
    paddingHorizontal: spacingX._20,
    paddingTop: spacingY._20
  },

  form: {
    gap: spacingY._15,
    marginTop: spacingY._20
  },

  // Add these styles at the end of the StyleSheet.create
  responseContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacingY._30,
  },
  responseContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  responseMessage: {
    textAlign: 'center',
    paddingHorizontal: spacingX._20,
    lineHeight: 32,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
})