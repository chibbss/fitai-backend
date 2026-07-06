import React, { useState } from 'react';
import { TouchableOpacity, Alert, ActivityIndicator, View, StyleSheet } from 'react-native';
import { Audio } from 'expo-av';
import * as Icons from 'phosphor-react-native';
import LottieView from 'lottie-react-native';
import { colors } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/context/ThemeContext';
import { alert } from '@/utils/alert';

type MicButtonProps = {
  onRecordingDone: (uri: string) => void;
  recordingAnimation?: any; // e.g. require('path/to/recording.json')
  onPressIn?: () => void;
};

const MicButton = ({ onRecordingDone, recordingAnimation, onPressIn }: MicButtonProps) => {
  const { colors: themeColors } = useTheme();
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [loading, setLoading] = useState(false);

  const recordingOptions: Audio.RecordingOptions = {
    android: {
      extension: '.m4a',
      outputFormat: 2, // MPEG_4
      audioEncoder: 3, // AAC
      sampleRate: 44100,
      numberOfChannels: 2,
      bitRate: 128000,
    },
    ios: {
      extension: '.caf',
      audioQuality: 0,
      sampleRate: 44100,
      numberOfChannels: 2,
      bitRate: 128000,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    },
    web: {
      mimeType: 'audio/webm',
      bitsPerSecond: 128000,
    },
  };

  const startRecording = async () => {
    try {
      setLoading(true);

      // Clean up any existing recording first
      if (recording) {
        try {
          const status = await recording.getStatusAsync();
          if (status.isRecording) {
            await recording.stopAndUnloadAsync();
          }
        } catch (cleanupError) {
          console.warn('Error cleaning up existing recording:', cleanupError);
        }
        setRecording(null);
        setIsRecording(false);
      }

      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        alert.warning('Please allow microphone access', 'Permission required');
        setLoading(false);
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const newRecording = new Audio.Recording();

      // Prepare recording with error handling
      try {
        await newRecording.prepareToRecordAsync(recordingOptions);
      } catch (prepareError) {
        console.error('Error preparing recording:', prepareError);
        // Recording preparation failed, just throw the error
        // The recording object will be garbage collected
        throw prepareError;
      }

      await newRecording.startAsync();
      setRecording(newRecording);
      setIsRecording(true);
      console.log('✅ Recording started');
    } catch (err: any) {
      console.error('Error starting recording:', err);
      alert.error(
        err.message || 'Failed to start recording. Please try again.',
        'Recording Error'
      );
      // Reset state on error
      setRecording(null);
      setIsRecording(false);
    } finally {
      setLoading(false);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      setLoading(true);

      // Get URI before stopping
      const uri = recording.getURI();

      // Stop and unload recording
      await recording.stopAndUnloadAsync();

      console.log('✅ Recording stopped. File:', uri);
      setRecording(null);
      setIsRecording(false);

      if (uri) {
        onRecordingDone(uri);
      } else {
        throw new Error('Recording URI is null');
      }
    } catch (err: any) {
      console.error('Error stopping recording:', err);
      alert.error(
        err.message || 'Failed to stop recording. Please try again.',
        'Recording Error'
      );
      // Reset state on error
      setRecording(null);
      setIsRecording(false);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async () => {
    if (loading) return;
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  return (
    <TouchableOpacity
      onPress={handleToggle}
      onPressIn={onPressIn}
      style={styles.micButtonContainer}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={themeColors.accentGradient as unknown as readonly [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.micButton}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : isRecording && recordingAnimation ? (
          <View style={styles.animationWrapper}>
            <LottieView
              source={recordingAnimation}
              autoPlay
              loop
              style={styles.animation}
              colorFilters={[
                { keypath: '*', color: '#FFFFFF' },
              ]}
            />
          </View>
        ) : (
          <Icons.Microphone size={22} color={colors.white} weight="fill" />
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
};

export default MicButton;

const styles = StyleSheet.create({
  micButtonContainer: {
    borderRadius: 28,
    overflow: 'hidden',
  },
  micButton: {
    width: 50,
    height: 50,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  animationWrapper: {
    width: 32, // G�� same visual size as icon
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  animation: {
    width: '100%',
    height: '100%',
  },
});
