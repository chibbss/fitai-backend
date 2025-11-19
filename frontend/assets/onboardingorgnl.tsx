import { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, Platform, KeyboardAvoidingView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import Typo from '@/components/Typo';
import ScreenWrapper from '@/components/ScreenWrapper';
import { colors, radius, spacingX, spacingY } from '@/constants/theme';
import Button from '@/components/Button';
import Animated, { FadeIn, FadeInDown, FadeInLeft, FadeInUp, SlideInLeft, SlideInRight } from 'react-native-reanimated'
import { verticalScale } from '@/utils/styling';
import { supabase } from '@/utils/supabase';
import MultiStepProgressBar from '@/components/MultiStepProgressBar';
import LottieView from 'lottie-react-native';
import successAnimation from '@/assets/images/animations/Success.json';
import botChatAnimation from '@/assets/images/animations/Bot_chat.json';
import { userApi } from '@/utils/api';

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
    title: 'All set! 🎉',
    subtitle: '',
  },
];

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

const GOAL_OPTIONS: GoalOption[] = [
  { label: 'Build muscle 💪', value: 'build muscle' },
  { label: 'Lose fat 🔥', value: 'lose fat' },
  { label: 'Get consistent 🧘', value: 'get consistent' },
  { label: 'Feel healthier ❤️', value: 'feel healthier' },
  { label: 'Train for performance ⚡', value: 'train for performance' },
  { label: 'Just exploring 👀', value: 'just exploring' },
];

const EXPERIENCE_OPTIONS: ExperienceOption[] = [
  { label: 'Beginner', value: 'beginner' },
  { label: 'Intermediate', value: 'intermediate' },
  { label: 'Advanced', value: 'advanced' },
];

const PREFERENCE_OPTIONS: PreferenceOption[] = [
  { label: 'Strength training 🏋️', value: 'strength training' },
  { label: 'Cardio 🏃‍♂️', value: 'cardio' },
  { label: 'Home workouts 🏠', value: 'home workouts' },
  { label: 'Sports & performance ⚽', value: 'sports & performance' },
  { label: 'Mix of everything 🔁', value: 'mix of everything' },
];

const Onboarssding = () => {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [goal, setGoal] = useState<GoalOption | null>(null);
  const [experience, setExperience] = useState<ExperienceOption | null>(null);
  const [preference, setPreference] = useState<PreferenceOption | null>(null);
  const [detailsNote, setDetailsNote] = useState('');
  const [showResponse, setShowResponse] = useState(false);
  const [responseMessage, setResponseMessage] = useState<string>('');

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
          Alert.alert('Session Error', 'Please sign in again to continue onboarding.', [
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
      Alert.alert('Session Expired', 'Please log back in to continue onboarding.', [
        { text: 'OK', onPress: () => router.replace('/login') },
      ]);
      return false;
    }

    let data: Record<string, any> = {};
    let apiStep = 'profile';

    switch (stepId) {
      case 'goal':
        if (!goal) {
          Alert.alert('Select a goal', "Please choose the primary reason you’re here.");
          return false;
        }
        data = { primary_goal: goal.value };
        apiStep = 'goals';
        break;

      case 'experience':
        if (!experience) {
          Alert.alert('Select experience', 'Let us know where you’re at so we can tailor everything.');
          return false;
        }
        data = { experience_level: experience.value };
        apiStep = 'profile';
        break;

      case 'preference':
        if (!preference) {
          Alert.alert('Select preference', 'Pick whichever feels closest — you can always change later.');
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

    try {
      //3rd place to comment out for testing
      setIsSubmitting(true);
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

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || 'Failed to save onboarding step');
      }

      return true;
    } catch (error: any) {
      console.error('Onboarding step error:', error);
      Alert.alert('Save Failed', error?.message || 'Please try again.');
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
            const completionData = await userApi.getCompletionMessage(userId);
            if (completionData?.message) {
              // Store completion message to show in chat screen
              // You can pass it via navigation params or store in AsyncStorage
              router.replace({
                pathname: '/chatscreen',
                params: { initialMessage: completionData.message }
              } as any)
            } else {
              router.replace('/chatscreen');
            }
          } catch (error) {
            console.warn('Failed to get completion message:', error);
            // Continue to chat screen anyway
            router.replace('/chatscreen');
          }
        } else {
          router.replace('/chatscreen');
        }
        return;
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

  const renderOptions = () => {
    switch (step.id) {
      case 'intro':
        return (
          <View style={styles.introContent}>

            <Animated.Text
              entering={FadeInUp.duration(700).springify().damping(20).stiffness(80)}
            >
              <Typo size={32} fontWeight="800" color={colors.black} style={styles.introHeadline}>
                Meet your personal AI fitness coach.
              </Typo>
            </Animated.Text>

            <Animated.Text
              entering={FadeInDown.duration(700).springify().damping(20).stiffness(80)}

            >
              <Typo size={18} color={colors.neutral500} style={styles.introSubtext}>
                Let’s personalize your fitness journey together—it only takes a minute!
              </Typo>
            </Animated.Text>

            {/* Bot Chat Animation */}
            <View style={styles.animationContainer}>
              <LottieView
                source={botChatAnimation}
                autoPlay
                loop
                style={styles.animation}

              />
            </View>
          </View>
        );

      case 'goal':
        return GOAL_OPTIONS.map((option, index) => (

          <Animated.View
            key={option.value}
            entering={FadeInLeft.delay(index * 200).duration(700).springify().damping(50).stiffness(0)}

          >
            <Button
              key={option.value}
              onPress={() => setGoal(option)}
              style={[
                styles.optionButton,
                goal?.value === option.value && styles.optionButtonActive,
              ]}
            >
              <Typo
                size={18}
                fontWeight={goal?.value === option.value ? '700' : '500'}
                color={goal?.value === option.value ? colors.black : colors.neutral700}
                style={{ textAlign: 'center' }}
              >
                {option.label}
              </Typo>
            </Button>
          </Animated.View>
        ));

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
                experience?.value === option.value && styles.optionButtonActive,
              ]}
            >
              <Typo
                size={18}
                fontWeight={experience?.value === option.value ? '700' : '500'}
                color={experience?.value === option.value ? colors.black : colors.neutral700}
                style={{ textAlign: 'center' }}
              >
                {option.label}
              </Typo>
            </Button>
          </Animated.View>

        ));

      case 'preference':
        return PREFERENCE_OPTIONS.map((option, index) => (
          <Animated.View
            key={option.value}
            entering={FadeInLeft.delay(index * 200).duration(700).springify().damping(50).stiffness(0)}

          >
            <Button
              key={option.value}
              onPress={() => setPreference(option)}
              style={[
                styles.optionButton,
                preference?.value === option.value && styles.optionButtonActive,
              ]}
            >
              <Typo
                size={18}
                fontWeight={preference?.value === option.value ? '700' : '500'}
                color={preference?.value === option.value ? colors.black : colors.neutral700}
                style={{ textAlign: 'center' }}
              >
                {option.label}
              </Typo>
            </Button>
          </Animated.View>

        ));

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
                if (!hasNavigatedToChat.current) {
                  hasNavigatedToChat.current = true;
                  router.replace('/chatscreen');
                }
              }}
            />

            <Typo size={30} fontWeight="700" color={colors.primaryDark} style={{ textAlign: 'center' }}>
              You’re all set!
            </Typo>

            <Typo size={16} color={colors.neutral600} style={styles.successSubtext}>
              We’ve stitched together your personalized fitness journey. Jumping into chat…
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

  useEffect(() => {
    if (step.id !== 'success') {
      hasNavigatedToChat.current = false;
    }
  }, [step.id]);

  // response timer
  useEffect(() => {
    if (showResponse) {
      const timer = setTimeout(() => {
        setShowResponse(false);
        if (currentIndex === STEP_CONFIG.length - 1) {
          router.replace('/chatscreen');
        } else {
          setCurrentIndex((prev) => Math.min(prev + 1, STEP_CONFIG.length - 1));
        }
      }, 1500); // Show for 1.5 seconds

      return () => clearTimeout(timer);
    }
  }, [showResponse, currentIndex, router]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
    >
      <ScreenWrapper showPattern={false}>
        <View style={styles.container}>
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
                      <Typo fontWeight="700" color={colors.black}>
                        {currentIndex === 0 ? 'Back to welcome' : 'Back'}
                      </Typo>
                    </Button>

                    <Button
                      onPress={handleContinue}
                      loading={isSubmitting}
                      style={styles.navButton}
                      disabled={continueDisabled}
                    >
                      <Typo fontWeight="700" color={colors.black}>
                        {step.id === 'details' ? "Let's go!" : 'Continue'}
                      </Typo>
                    </Button>
                  </View>
                )}
              </>
            )}
          </View>


        </View>
      </ScreenWrapper>
    </KeyboardAvoidingView>
  )
}

export default Onboarding;



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
  optionButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark,
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
  backButton: {
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.neutral300,
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
    marginTop: spacingY._20,
    gap: spacingY._20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  introHeadline: {
    textAlign: 'center',
    marginBottom: spacingY._10
  },
  introSubtext: {
    textAlign: 'center',
    lineHeight: 24,
  },

  animationContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -spacingY._40,

  },
  animation: {
    width: verticalScale(350),
    height: verticalScale(350),
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
})