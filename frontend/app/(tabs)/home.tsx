import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  Modal,
  TextInput,
  ScrollView,
  FlatList,
  ActivityIndicator,
  AppState,
  AppStateStatus,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import WheelPicker from '@quidone/react-native-wheel-picker';
import { 
  getSounds, 
  saveSound, 
  getSoundCount, 
  LIMITS,
  LocalSound 
} from '../../services/LocalSoundStorage';
import { Analytics } from '../../services/analytics';

interface SelectedSound {
  name: string;
  uri: string;
  duration: number;
  soundId?: string; // For library sounds
}

type TimerMode = 'indefinite' | 'duration' | 'alarm';

export default function HomeScreen() {
  // Audio state
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedSound, setSelectedSound] = useState<SelectedSound | null>(null);
  
  // Recording state
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  // Timer state
  const [timerMode, setTimerMode] = useState<TimerMode>('indefinite');
  const [durationHours, setDurationHours] = useState(0);
  const [durationMinutes, setDurationMinutes] = useState(5);
  const [alarmTime, setAlarmTime] = useState<Date | null>(null);
  const [remainingTime, setRemainingTime] = useState<number | null>(null);
  const [timerEndTime, setTimerEndTime] = useState<number | null>(null);
  
  // Modals
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [soundName, setSoundName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // Library sounds
  const [librarySounds, setLibrarySounds] = useState<LocalSound[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [soundCount, setSoundCount] = useState(0);
  
  // App state for background handling
  const appState = useRef(AppState.currentState);
  
  // Refs
  const recordingInterval = useRef<NodeJS.Timeout | null>(null);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Wheel picker data
  const hoursData = useMemo(() => 
    Array.from({ length: 24 }, (_, i) => ({
      value: i,
      label: i.toString().padStart(2, '0'),
    })), 
  []);
  
  const minutesData = useMemo(() => 
    Array.from({ length: 60 }, (_, i) => ({
      value: i,
      label: i.toString().padStart(2, '0'),
    })), 
  []);

  useEffect(() => {
    setupAudio();
    loadSoundCount();
    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [timerEndTime, isPlaying]);

  const loadSoundCount = async () => {
    const count = await getSoundCount();
    setSoundCount(count);
  };

  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    if (
      appState.current.match(/inactive|background/) &&
      nextAppState === 'active'
    ) {
      if (timerEndTime && isPlaying) {
        const now = Date.now();
        if (now >= timerEndTime) {
          await stopSound();
        } else {
          const remaining = Math.ceil((timerEndTime - now) / 1000);
          setRemainingTime(remaining);
        }
      }
    }
    appState.current = nextAppState;
  };

  const setupAudio = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: 1,
        shouldDuckAndroid: false,
        interruptionModeAndroid: 1,
        playThroughEarpieceAndroid: false,
      });
    } catch (error) {
      console.error('Error setting up audio:', error);
    }
  };

  const cleanup = async () => {
    if (sound) {
      await sound.unloadAsync();
    }
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
    }
    if (recording) {
      await recording.stopAndUnloadAsync();
    }
    if (recordingInterval.current) clearInterval(recordingInterval.current);
    if (timerInterval.current) clearInterval(timerInterval.current);
  };

  const startRecording = async () => {
    try {
      if (Platform.OS === 'web') {
        try {
          const permissionResult = await Audio.requestPermissionsAsync();
          if (!permissionResult.granted) {
            Alert.alert(
              'Permission Required',
              'Please allow microphone access to record audio.'
            );
            return;
          }
        } catch (permError) {
          Alert.alert(
            'Recording Not Supported',
            'Audio recording may not work in this browser. Use the mobile app or upload a file instead.'
          );
          return;
        }
      }

      const maxDuration = LIMITS.MAX_DURATION_SECONDS;
      
      const permissionResponse = await Audio.requestPermissionsAsync();
      if (!permissionResponse.granted) {
        Alert.alert(
          'Permission Denied',
          'Microphone permission is required to record audio.'
        );
        return;
      }
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });
      
      const recordingOptions = {
        isMeteringEnabled: true,
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,
          numberOfChannels: 2,
          bitRate: 128000,
        },
        ios: {
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.HIGH,
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
      
      const { recording: newRecording } = await Audio.Recording.createAsync(
        recordingOptions
      );
      
      setRecording(newRecording);
      setIsRecording(true);
      setRecordingDuration(0);
      
      recordingInterval.current = setInterval(() => {
        setRecordingDuration(prev => {
          if (prev >= maxDuration - 1) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
      
    } catch (error: any) {
      console.error('Error starting recording:', error);
      
      let errorMessage = 'Failed to start recording. ';
      
      if (Platform.OS === 'web') {
        errorMessage += 'Please use the mobile app for recording, or upload an audio file instead.';
      } else if (error.message?.includes('permission')) {
        errorMessage += 'Please grant microphone permission in your device settings.';
      } else {
        errorMessage += 'Please check your microphone and try again.';
      }
      
      Alert.alert('Recording Error', errorMessage);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    
    try {
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
        recordingInterval.current = null;
      }
      
      setIsRecording(false);
      
      const status = await recording.getStatusAsync();
      await recording.stopAndUnloadAsync();
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
      
      const uri = recording.getURI();
      
      if (uri) {
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const duration = recordingDuration > 0 ? recordingDuration : Math.floor((status.durationMillis || 0) / 1000);
        
        // Track sound recorded
        Analytics.soundRecorded(duration);
        
        setSelectedSound({
          name: `Recording ${new Date().toLocaleTimeString()}`,
          uri,
          duration: duration > 0 ? duration : 1,
        });
      } else {
        throw new Error('No recording URI available');
      }
      
      setRecording(null);
    } catch (error: any) {
      console.error('Error stopping recording:', error);
      setRecording(null);
      setIsRecording(false);
      
      Alert.alert(
        'Recording Error',
        `Failed to save recording: ${error.message || 'Unknown error'}. Please try again.`
      );
    }
  };

  const pickAudioFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        
        // Check file size limit (10MB)
        const maxSizeMB = 10;
        const fileInfo = await FileSystem.getInfoAsync(asset.uri);
        const fileSizeMB = (fileInfo as any).size ? (fileInfo as any).size / (1024 * 1024) : 0;
        
        if (fileSizeMB > maxSizeMB) {
          Alert.alert(
            'File Too Large',
            `Maximum file size is ${maxSizeMB}MB. Please choose a smaller file.`
          );
          return;
        }
        
        // Get actual duration
        let duration = 60;
        try {
          const { sound: tempSound } = await Audio.Sound.createAsync(
            { uri: asset.uri },
            { shouldPlay: false }
          );
          const status = await tempSound.getStatusAsync();
          if (status.isLoaded && status.durationMillis) {
            duration = Math.floor(status.durationMillis / 1000);
          }
          await tempSound.unloadAsync();
        } catch (durationError) {
          console.log('Could not get exact duration, using estimate');
          duration = Math.min(
            fileSizeMB ? Math.floor(fileSizeMB * 60) : 60,
            LIMITS.MAX_DURATION_SECONDS
          );
        }
        
        // Check max duration limit
        if (duration > LIMITS.MAX_DURATION_SECONDS) {
          Alert.alert(
            'Audio Too Long',
            `Maximum duration is ${LIMITS.MAX_DURATION_MINUTES} minutes. Please choose a shorter file.`
          );
          return;
        }
        
        setSelectedSound({
          name: asset.name || 'Uploaded Sound',
          uri: asset.uri,
          duration,
        });
        
        // Track sound uploaded
        Analytics.soundUploaded(asset.name || 'Uploaded Sound', duration, fileSizeMB);
        
        Alert.alert('Success', `Audio file "${asset.name}" loaded successfully!`);
      }
    } catch (error) {
      console.error('Error picking file:', error);
      Alert.alert('Error', 'Failed to pick audio file. Please try a different file format.');
    }
  };

  const playSound = async () => {
    if (!selectedSound) return;
    
    try {
      if (sound) {
        await sound.unloadAsync();
      }
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: 1,
        shouldDuckAndroid: false,
        interruptionModeAndroid: 1,
        playThroughEarpieceAndroid: false,
      });
      
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: selectedSound.uri },
        { 
          isLooping: true, 
          shouldPlay: true,
          volume: 1.0,
        }
      );
      
      setSound(newSound);
      soundRef.current = newSound;
      setIsPlaying(true);
      
      if (timerMode === 'duration') {
        const totalSeconds = durationHours * 3600 + durationMinutes * 60;
        const endTime = Date.now() + (totalSeconds * 1000);
        setTimerEndTime(endTime);
        setRemainingTime(totalSeconds);
        startTimer(endTime);
      } else if (timerMode === 'alarm' && alarmTime) {
        const now = new Date();
        const diff = Math.floor((alarmTime.getTime() - now.getTime()) / 1000);
        if (diff > 0) {
          setTimerEndTime(alarmTime.getTime());
          setRemainingTime(diff);
          startTimer(alarmTime.getTime());
        }
      } else {
        setTimerEndTime(null);
        setRemainingTime(null);
      }
      
    } catch (error) {
      console.error('Error playing sound:', error);
      Alert.alert('Error', 'Failed to play sound');
    }
  };

  const stopSound = async () => {
    if (sound) {
      try {
        await sound.stopAsync();
        await sound.unloadAsync();
      } catch (e) {
        console.log('Error stopping sound from state:', e);
      }
      setSound(null);
    }
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch (e) {
        console.log('Error stopping sound from ref:', e);
      }
      soundRef.current = null;
    }
    setIsPlaying(false);
    setRemainingTime(null);
    setTimerEndTime(null);
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
      timerInterval.current = null;
    }
  };

  useEffect(() => {
    if (remainingTime === 0) {
      stopSound();
    }
  }, [remainingTime]);

  const startTimer = (endTimestamp: number) => {
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
    }
    
    timerInterval.current = setInterval(() => {
      const now = Date.now();
      const remaining = Math.ceil((endTimestamp - now) / 1000);
      
      if (remaining <= 0) {
        setRemainingTime(0);
        if (timerInterval.current) {
          clearInterval(timerInterval.current);
          timerInterval.current = null;
        }
      } else {
        setRemainingTime(remaining);
      }
    }, 1000);
  };

  const handleSaveSound = async () => {
    if (!selectedSound || !soundName.trim()) return;
    
    // Check limits
    if (soundCount >= LIMITS.MAX_SOUNDS) {
      Alert.alert(
        'Limit Reached',
        `Maximum ${LIMITS.MAX_SOUNDS} sounds allowed. Delete a sound from your library to add more.`
      );
      return;
    }
    
    setIsSaving(true);
    try {
      const result = await saveSound(
        soundName.trim(),
        selectedSound.uri,
        selectedSound.duration
      );
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to save sound');
      }
      
      await loadSoundCount();
      setShowSaveModal(false);
      setSoundName('');
      Alert.alert('Success', 'Sound saved to your library!');
      
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const setAlarmFromPicker = (hours: number, minutes: number) => {
    const now = new Date();
    const alarm = new Date();
    alarm.setHours(hours, minutes, 0, 0);
    
    if (alarm <= now) {
      alarm.setDate(alarm.getDate() + 1);
    }
    
    setAlarmTime(alarm);
  };

  const loadLibrarySounds = async () => {
    setIsLoadingLibrary(true);
    try {
      const sounds = await getSounds();
      setLibrarySounds(sounds);
    } catch (error) {
      console.error('Error loading library sounds:', error);
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const openLibraryModal = () => {
    loadLibrarySounds();
    setShowLibraryModal(true);
  };

  const selectLibrarySound = async (librarySound: LocalSound) => {
    setSelectedSound({
      name: librarySound.name,
      uri: librarySound.uri,
      duration: librarySound.duration,
      soundId: librarySound.id,
    });
    
    setShowLibraryModal(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Sound Loop</Text>
          <Text style={styles.subtitle}>
            {soundCount}/{LIMITS.MAX_SOUNDS} sounds
          </Text>
        </View>

        {/* Main Player Area */}
        <View style={styles.playerContainer}>
          {/* Sound Info */}
          <View style={styles.soundInfoContainer}>
            {selectedSound ? (
              <>
                <Ionicons name="musical-note" size={40} color="#8B5CF6" />
                <Text style={styles.soundName} numberOfLines={2}>
                  {selectedSound.name}
                </Text>
                <Text style={styles.soundDuration}>
                  Duration: {formatTime(selectedSound.duration)}
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="musical-notes-outline" size={48} color="#6B7280" />
                <Text style={styles.noSoundText}>No sound selected</Text>
                <Text style={styles.noSoundHint}>Record or upload a sound to get started</Text>
              </>
            )}
          </View>

          {/* Recording Indicator */}
          {isRecording && (
            <View style={styles.recordingIndicator}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>Recording... {formatTime(recordingDuration)}</Text>
              <Text style={styles.maxDurationText}>
                Max: {formatTime(LIMITS.MAX_DURATION_SECONDS)}
              </Text>
            </View>
          )}

          {/* Timer Display */}
          {isPlaying && remainingTime !== null && (
            <View style={styles.timerDisplay}>
              <Ionicons name="time-outline" size={20} color="#8B5CF6" />
              <Text style={styles.timerText}>Stops in: {formatTime(remainingTime)}</Text>
            </View>
          )}

          {/* Play Controls */}
          <View style={styles.playControls}>
            <TouchableOpacity
              style={[styles.playButton, !selectedSound && styles.buttonDisabled]}
              onPress={isPlaying ? stopSound : playSound}
              disabled={!selectedSound}
              testID="play-stop-button"
            >
              <Ionicons
                name={isPlaying ? 'stop' : 'play'}
                size={32}
                color="#FFFFFF"
              />
            </TouchableOpacity>
          </View>

          {/* Timer Mode */}
          <TouchableOpacity
            style={styles.timerButton}
            onPress={() => setShowTimerModal(true)}
            testID="timer-mode-button"
          >
            <Ionicons name="timer-outline" size={20} color="#8B5CF6" />
            <Text style={styles.timerButtonText}>
              {timerMode === 'indefinite' && 'Loop Indefinitely'}
              {timerMode === 'duration' && `Stop after ${durationHours}h ${durationMinutes}m`}
              {timerMode === 'alarm' && alarmTime && `Stop at ${alarmTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, isRecording && styles.recordingButton]}
            onPress={isRecording ? stopRecording : startRecording}
            testID="record-button"
          >
            <View style={[styles.actionIconContainer, isRecording && styles.recordingIconContainer]}>
              <Ionicons
                name={isRecording ? 'stop' : 'mic'}
                size={isRecording ? 28 : 24}
                color="#FFFFFF"
              />
            </View>
            <Text style={[styles.actionButtonText, isRecording && styles.recordingButtonText]}>
              {isRecording ? 'STOP' : 'Record'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={pickAudioFile}
            testID="upload-button"
          >
            <View style={styles.actionIconContainer}>
              <Ionicons name="cloud-upload" size={24} color="#FFFFFF" />
            </View>
            <Text style={styles.actionButtonText}>Upload</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={openLibraryModal}
            testID="library-button"
          >
            <View style={[styles.actionIconContainer, styles.libraryIconContainer]}>
              <Ionicons name="library" size={24} color="#FFFFFF" />
            </View>
            <Text style={styles.actionButtonText}>Library</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, !selectedSound && styles.buttonDisabled]}
            onPress={() => {
              if (selectedSound) {
                setSoundName(selectedSound.name);
                setShowSaveModal(true);
              }
            }}
            disabled={!selectedSound || !!selectedSound.soundId}
            testID="save-button"
          >
            <View style={[styles.actionIconContainer, (!selectedSound || selectedSound.soundId) && styles.disabledIconContainer]}>
              <Ionicons name="save" size={24} color="#FFFFFF" />
            </View>
            <Text style={[styles.actionButtonText, (!selectedSound || selectedSound.soundId) && styles.disabledText]}>
              Save
            </Text>
          </TouchableOpacity>
        </View>

        {/* Web Platform Notice */}
        {Platform.OS === 'web' && (
          <View style={styles.webNotice}>
            <Ionicons name="information-circle-outline" size={16} color="#F59E0B" />
            <Text style={styles.webNoticeText}>
              Recording works best on mobile. Use the app or upload a file.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Timer Modal */}
      <Modal
        visible={showTimerModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTimerModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Timer Settings</Text>
              <TouchableOpacity onPress={() => setShowTimerModal(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Timer Mode Selection */}
            <View style={styles.timerModeOptions}>
              <TouchableOpacity
                style={[
                  styles.timerModeOption,
                  timerMode === 'indefinite' && styles.timerModeActive,
                ]}
                onPress={() => setTimerMode('indefinite')}
              >
                <Ionicons
                  name="infinite"
                  size={24}
                  color={timerMode === 'indefinite' ? '#8B5CF6' : '#6B7280'}
                />
                <Text
                  style={[
                    styles.timerModeText,
                    timerMode === 'indefinite' && styles.timerModeTextActive,
                  ]}
                >
                  Indefinite
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.timerModeOption,
                  timerMode === 'duration' && styles.timerModeActive,
                ]}
                onPress={() => setTimerMode('duration')}
              >
                <Ionicons
                  name="hourglass"
                  size={24}
                  color={timerMode === 'duration' ? '#8B5CF6' : '#6B7280'}
                />
                <Text
                  style={[
                    styles.timerModeText,
                    timerMode === 'duration' && styles.timerModeTextActive,
                  ]}
                >
                  Duration
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.timerModeOption,
                  timerMode === 'alarm' && styles.timerModeActive,
                ]}
                onPress={() => setTimerMode('alarm')}
              >
                <Ionicons
                  name="alarm"
                  size={24}
                  color={timerMode === 'alarm' ? '#8B5CF6' : '#6B7280'}
                />
                <Text
                  style={[
                    styles.timerModeText,
                    timerMode === 'alarm' && styles.timerModeTextActive,
                  ]}
                >
                  Alarm
                </Text>
              </TouchableOpacity>
            </View>

            {/* Duration Picker */}
            {timerMode === 'duration' && (
              <View style={styles.durationPicker}>
                <Text style={styles.pickerLabel}>Stop after:</Text>
                <View style={styles.wheelPickerRow}>
                  <View style={styles.wheelPickerContainer}>
                    <WheelPicker
                      data={hoursData}
                      value={durationHours}
                      onValueChanged={({ item: { value } }) => setDurationHours(value)}
                      itemHeight={50}
                      visibleItemCount={3}
                      itemTextStyle={styles.wheelItemText}
                      selectedIndicatorStyle={styles.wheelSelectedIndicator}
                      width={80}
                    />
                    <Text style={styles.wheelLabel}>hours</Text>
                  </View>
                  <Text style={styles.wheelSeparator}>:</Text>
                  <View style={styles.wheelPickerContainer}>
                    <WheelPicker
                      data={minutesData}
                      value={durationMinutes}
                      onValueChanged={({ item: { value } }) => setDurationMinutes(value)}
                      itemHeight={50}
                      visibleItemCount={3}
                      itemTextStyle={styles.wheelItemText}
                      selectedIndicatorStyle={styles.wheelSelectedIndicator}
                      width={80}
                    />
                    <Text style={styles.wheelLabel}>min</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Alarm Picker */}
            {timerMode === 'alarm' && (
              <View style={styles.alarmPicker}>
                <Text style={styles.pickerLabel}>Stop at:</Text>
                <View style={styles.wheelPickerRow}>
                  <View style={styles.wheelPickerContainer}>
                    <WheelPicker
                      data={hoursData}
                      value={alarmTime?.getHours() || 0}
                      onValueChanged={({ item: { value } }) => {
                        const current = alarmTime || new Date();
                        setAlarmFromPicker(value, current.getMinutes());
                      }}
                      itemHeight={50}
                      visibleItemCount={3}
                      itemTextStyle={styles.wheelItemText}
                      selectedIndicatorStyle={styles.wheelSelectedIndicator}
                      width={80}
                    />
                    <Text style={styles.wheelLabel}>hour</Text>
                  </View>
                  <Text style={styles.wheelSeparator}>:</Text>
                  <View style={styles.wheelPickerContainer}>
                    <WheelPicker
                      data={minutesData}
                      value={alarmTime?.getMinutes() || 0}
                      onValueChanged={({ item: { value } }) => {
                        const current = alarmTime || new Date();
                        setAlarmFromPicker(current.getHours(), value);
                      }}
                      itemHeight={50}
                      visibleItemCount={3}
                      itemTextStyle={styles.wheelItemText}
                      selectedIndicatorStyle={styles.wheelSelectedIndicator}
                      width={80}
                    />
                    <Text style={styles.wheelLabel}>min</Text>
                  </View>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={styles.modalConfirmButton}
              onPress={() => setShowTimerModal(false)}
            >
              <Text style={styles.modalConfirmText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Save Sound Modal */}
      <Modal
        visible={showSaveModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          Keyboard.dismiss();
          setShowSaveModal(false);
        }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Save Sound</Text>
                <TouchableOpacity onPress={() => {
                  Keyboard.dismiss();
                  setShowSaveModal(false);
                }}>
                  <Ionicons name="close" size={24} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.saveInput}
                placeholder="Enter sound name"
                placeholderTextColor="#6B7280"
                value={soundName}
                onChangeText={setSoundName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSaveSound}
              />

              <TouchableOpacity
                style={[styles.modalConfirmButton, (isSaving || !soundName.trim()) && styles.buttonDisabled]}
                onPress={handleSaveSound}
                disabled={isSaving || !soundName.trim()}
              >
                <Text style={styles.modalConfirmText}>
                  {isSaving ? 'Saving...' : 'Save to Library'}
                </Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Library Modal */}
      <Modal
        visible={showLibraryModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLibraryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.libraryModalContent]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select from Library</Text>
              <TouchableOpacity onPress={() => setShowLibraryModal(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {isLoadingLibrary ? (
              <View style={styles.libraryLoading}>
                <ActivityIndicator size="large" color="#8B5CF6" />
                <Text style={styles.libraryLoadingText}>Loading sounds...</Text>
              </View>
            ) : librarySounds.length === 0 ? (
              <View style={styles.libraryEmpty}>
                <Ionicons name="musical-notes-outline" size={48} color="#4B5563" />
                <Text style={styles.libraryEmptyTitle}>No saved sounds</Text>
                <Text style={styles.libraryEmptyText}>
                  Record or upload a sound and save it to your library first
                </Text>
              </View>
            ) : (
              <FlatList
                data={librarySounds}
                keyExtractor={(item) => item.id}
                style={styles.libraryList}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.librarySoundItem}
                    onPress={() => selectLibrarySound(item)}
                  >
                    <View style={styles.librarySoundIcon}>
                      <Ionicons name="musical-note" size={24} color="#8B5CF6" />
                    </View>
                    <View style={styles.librarySoundInfo}>
                      <Text style={styles.librarySoundName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.librarySoundDuration}>
                        {formatTime(item.duration)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#6B7280" />
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 14,
    color: '#8B5CF6',
    fontWeight: '500',
  },
  playerContainer: {
    backgroundColor: '#1F1F2E',
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
  },
  soundInfoContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  soundName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 16,
    textAlign: 'center',
  },
  soundDuration: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
  },
  noSoundText: {
    fontSize: 18,
    color: '#9CA3AF',
    marginTop: 16,
  },
  noSoundHint: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginBottom: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.5)',
  },
  recordingDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FF3B3B',
  },
  recordingText: {
    color: '#FF6B6B',
    fontSize: 16,
    fontWeight: '700',
  },
  maxDurationText: {
    color: '#FF9999',
    fontSize: 13,
  },
  timerDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  timerText: {
    color: '#8B5CF6',
    fontSize: 14,
    fontWeight: '500',
  },
  playControls: {
    alignItems: 'center',
    marginBottom: 20,
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  timerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },
  timerButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    flex: 1,
    textAlign: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 16,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#1F1F2E',
    borderRadius: 16,
    padding: 16,
  },
  recordingButton: {
    backgroundColor: 'rgba(255, 59, 59, 0.25)',
    borderWidth: 2,
    borderColor: '#FF3B3B',
    transform: [{ scale: 1.05 }],
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  recordingIconContainer: {
    backgroundColor: '#FF3B3B',
    width: 56,
    height: 56,
    borderRadius: 28,
    shadowColor: '#FF3B3B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8,
  },
  disabledIconContainer: {
    backgroundColor: '#4B5563',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  recordingButtonText: {
    color: '#FF6B6B',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  disabledText: {
    color: '#6B7280',
  },
  webNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 16,
    gap: 8,
  },
  webNoticeText: {
    color: '#F59E0B',
    fontSize: 12,
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1F1F2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  timerModeOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
  },
  timerModeOption: {
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#2D2D3D',
    minWidth: 90,
  },
  timerModeActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderWidth: 1,
    borderColor: '#8B5CF6',
  },
  timerModeText: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 8,
  },
  timerModeTextActive: {
    color: '#8B5CF6',
  },
  durationPicker: {
    marginBottom: 24,
  },
  alarmPicker: {
    marginBottom: 24,
  },
  pickerLabel: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  wheelPickerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  wheelPickerContainer: {
    alignItems: 'center',
  },
  wheelItemText: {
    fontSize: 28,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  wheelSelectedIndicator: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderRadius: 8,
  },
  wheelLabel: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 8,
  },
  wheelSeparator: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    marginHorizontal: 12,
    marginBottom: 24,
  },
  modalConfirmButton: {
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  saveInput: {
    backgroundColor: '#2D2D3D',
    borderRadius: 12,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 16,
  },
  libraryIconContainer: {
    backgroundColor: '#10B981',
  },
  libraryModalContent: {
    maxHeight: '70%',
  },
  libraryLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  libraryLoadingText: {
    color: '#9CA3AF',
    fontSize: 14,
    marginTop: 16,
  },
  libraryEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  libraryEmptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  libraryEmptyText: {
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'center',
  },
  libraryList: {
    maxHeight: 300,
  },
  librarySoundItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2D2D3D',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  librarySoundIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  librarySoundInfo: {
    flex: 1,
    marginLeft: 12,
  },
  librarySoundName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  librarySoundDuration: {
    color: '#8B5CF6',
    fontSize: 12,
  },
});
