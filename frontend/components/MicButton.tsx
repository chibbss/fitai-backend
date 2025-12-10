import React, { useState } from 'react';
import { TouchableOpacity, Alert, ActivityIndicator, View, StyleSheet } from 'react-native';
import { Audio } from 'expo-av';
import * as Icons from 'phosphor-react-native';
import LottieView from 'lottie-react-native';
import { colors } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/context/ThemeContext';

type MicButtonProps = {
  onRecordingDone: (uri: string) => void;
  recordingAnimation?: any; // e.g. require('path/to/recording.json')
};

const MicButton = ({ onRecordingDone, recordingAnimation }: MicButtonProps) => {
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
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission required', 'Please allow microphone access');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const newRecording = new Audio.Recording();
      await newRecording.prepareToRecordAsync(recordingOptions);
      await newRecording.startAsync();
      setRecording(newRecording);
      setIsRecording(true);
      console.log('🎙️ Recording started');
    } catch (err) {
      console.error('Error starting recording:', err);
    } finally {
      setLoading(false);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      setLoading(true);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      console.log('✅ Recording stopped. File:', uri);
      setRecording(null);
      setIsRecording(false);
      if (uri) onRecordingDone(uri);
    } catch (err) {
      console.error('Error stopping recording:', err);
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
      style={styles.micButtonContainer}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={themeColors.accentGradient}
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
    width: 32, // ✅ same visual size as icon
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  animation: {
    width: '100%',
    height: '100%',
  },
});
