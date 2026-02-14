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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'expo-router';
import WheelPicker from '@quidone/react-native-wheel-picker';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface SelectedSound {
  name: string;
  uri: string;
  base64?: string;
  duration: number;
  soundId?: string; // For library sounds
}

interface LibrarySound {
  sound_id: string;
  name: string;
  duration_seconds: number;
  created_at: string;
}

type TimerMode = 'indefinite' | 'duration' | 'alarm';

export default function HomeScreen() {
  const { user, token, refreshUser } = useAuth();
  const router = useRouter();
  
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
  
  // Modals
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [soundName, setSoundName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // Library sounds
  const [librarySounds, setLibrarySounds] = useState<LibrarySound[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  
  // Refs
  const recordingInterval = useRef<NodeJS.Timeout | null>(null);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);
  const playbackInterval = useRef<NodeJS.Timeout | null>(null);

  // Wheel picker data - hours (0-23) and minutes (0-59)
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

  // Request audio permissions on mount
  useEffect(() => {
    setupAudio();
    return () => {
      cleanup();
    };
  }, []);

  const setupAudio = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      });
    } catch (error) {
      console.error('Error setting up audio:', error);
    }
  };

  const cleanup = async () => {
    if (sound) {
      await sound.unloadAsync();
    }
    if (recording) {
      await recording.stopAndUnloadAsync();
    }
    if (recordingInterval.current) clearInterval(recordingInterval.current);
    if (timerInterval.current) clearInterval(timerInterval.current);
    if (playbackInterval.current) clearInterval(playbackInterval.current);
  };

  // Recording functions
  const startRecording = async () => {
    try {
      // Check if on web - recording has limited support
      if (Platform.OS === 'web') {
        // Try to use browser's MediaRecorder API
        try {
          const permissionResult = await Audio.requestPermissionsAsync();
          if (!permissionResult.granted) {
            Alert.alert(
              'Permission Required',
              'Please allow microphone access to record audio. Check your browser settings.'
            );
            return;
          }
        } catch (permError) {
          Alert.alert(
            'Recording Not Supported',
            'Audio recording may not work in this browser. For best experience, use the Expo Go app on your mobile device or upload an audio file instead.'
          );
          return;
        }
      }

      // Check duration limit
      const maxDuration = user?.is_premium ? 30 * 60 : 5 * 60;
      
      // Request permissions first
      const permissionResponse = await Audio.requestPermissionsAsync();
      if (!permissionResponse.granted) {
        Alert.alert(
          'Permission Denied',
          'Microphone permission is required to record audio. Please enable it in your device settings.'
        );
        return;
      }
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });
      
      // Use a more compatible recording preset
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
      
      // Start duration counter
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
        errorMessage += 'Web browser recording may not be fully supported. Please use the Expo Go app on your mobile device for recording, or upload an audio file instead.';
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
      
      // Get status before stopping to check if recording was successful
      const status = await recording.getStatusAsync();
      console.log('Recording status before stop:', status);
      
      // Stop and unload the recording
      await recording.stopAndUnloadAsync();
      
      // Reset audio mode for playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
      
      const uri = recording.getURI();
      console.log('Recording URI:', uri);
      
      if (uri) {
        // Small delay to ensure file is fully written
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Read file as base64 - this will fail if file doesn't exist
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        
        if (!base64 || base64.length === 0) {
          throw new Error('Recording file is empty');
        }
        
        const duration = recordingDuration > 0 ? recordingDuration : Math.floor((status.durationMillis || 0) / 1000);
        
        setSelectedSound({
          name: `Recording ${new Date().toLocaleTimeString()}`,
          uri,
          base64,
          duration: duration > 0 ? duration : 1,
        });
        
        console.log('Recording saved successfully, duration:', duration);
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

  // File picker
  const pickAudioFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        
        // Read file as base64
        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        
        // Get duration (estimate based on file size for now)
        // In production, you'd use a proper audio duration check
        const fileInfo = await FileSystem.getInfoAsync(asset.uri);
        const estimatedDuration = Math.min(
          (fileInfo as any).size ? Math.floor((fileInfo as any).size / 16000) : 60,
          user?.is_premium ? 30 * 60 : 5 * 60
        );
        
        setSelectedSound({
          name: asset.name || 'Uploaded Sound',
          uri: asset.uri,
          base64,
          duration: estimatedDuration,
        });
      }
    } catch (error) {
      console.error('Error picking file:', error);
      Alert.alert('Error', 'Failed to pick audio file');
    }
  };

  // Playback functions
  const playSound = async () => {
    if (!selectedSound) return;
    
    try {
      // Unload existing sound
      if (sound) {
        await sound.unloadAsync();
      }
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });
      
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: selectedSound.uri },
        { isLooping: true, shouldPlay: true }
      );
      
      setSound(newSound);
      setIsPlaying(true);
      
      // Start timer if not indefinite
      if (timerMode === 'duration') {
        const totalSeconds = durationHours * 3600 + durationMinutes * 60;
        setRemainingTime(totalSeconds);
        startTimer(totalSeconds);
      } else if (timerMode === 'alarm' && alarmTime) {
        const now = new Date();
        const diff = Math.floor((alarmTime.getTime() - now.getTime()) / 1000);
        if (diff > 0) {
          setRemainingTime(diff);
          startTimer(diff);
        }
      }
      
    } catch (error) {
      console.error('Error playing sound:', error);
      Alert.alert('Error', 'Failed to play sound');
    }
  };

  const stopSound = async () => {
    if (sound) {
      await sound.stopAsync();
      await sound.unloadAsync();
      setSound(null);
    }
    setIsPlaying(false);
    setRemainingTime(null);
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
      timerInterval.current = null;
    }
  };

  // Watch for timer reaching zero and stop sound
  useEffect(() => {
    if (remainingTime === 0) {
      stopSound();
    }
  }, [remainingTime]);

  const startTimer = (seconds: number) => {
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
    }
    
    timerInterval.current = setInterval(() => {
      setRemainingTime(prev => {
        if (prev === null || prev <= 0) {
          return 0; // Set to 0 to trigger the useEffect
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Save sound to library
  const saveSound = async () => {
    if (!selectedSound || !soundName.trim() || !token) return;
    
    // Check limits
    const maxSounds = user?.is_premium ? 30 : 5;
    if ((user?.sound_count || 0) >= maxSounds) {
      Alert.alert(
        'Limit Reached',
        user?.is_premium 
          ? 'You have reached the maximum number of sounds.' 
          : 'Upgrade to premium to save more sounds.',
        user?.is_premium ? [{ text: 'OK' }] : [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/(tabs)/profile') },
        ]
      );
      return;
    }
    
    setIsSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/sounds`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: soundName.trim(),
          audio_data: selectedSound.base64,
          duration_seconds: selectedSound.duration,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to save sound');
      }
      
      await refreshUser();
      setShowSaveModal(false);
      setSoundName('');
      Alert.alert('Success', 'Sound saved to your library!');
      
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Format time
  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Set alarm time
  const setAlarmFromPicker = (hours: number, minutes: number) => {
    const now = new Date();
    const alarm = new Date();
    alarm.setHours(hours, minutes, 0, 0);
    
    // If the time is in the past, set it for tomorrow
    if (alarm <= now) {
      alarm.setDate(alarm.getDate() + 1);
    }
    
    setAlarmTime(alarm);
  };

  // Load library sounds
  const loadLibrarySounds = async () => {
    if (!token) return;
    
    setIsLoadingLibrary(true);
    try {
      const response = await fetch(`${API_URL}/api/sounds`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setLibrarySounds(data);
      }
    } catch (error) {
      console.error('Error loading library sounds:', error);
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  // Open library modal
  const openLibraryModal = () => {
    loadLibrarySounds();
    setShowLibraryModal(true);
  };

  // Select sound from library
  const selectLibrarySound = async (librarySound: LibrarySound) => {
    try {
      // Fetch the full sound data including audio
      const response = await fetch(`${API_URL}/api/sounds/${librarySound.sound_id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) throw new Error('Failed to load sound');
      
      const soundData = await response.json();
      
      // Write base64 to temp file
      const fileUri = FileSystem.cacheDirectory + `sound_${librarySound.sound_id}.m4a`;
      await FileSystem.writeAsStringAsync(fileUri, soundData.audio_data, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      setSelectedSound({
        name: librarySound.name,
        uri: fileUri,
        base64: soundData.audio_data,
        duration: librarySound.duration_seconds,
        soundId: librarySound.sound_id,
      });
      
      setShowLibraryModal(false);
    } catch (error) {
      console.error('Error selecting library sound:', error);
      Alert.alert('Error', 'Failed to load sound from library');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Sound Loop</Text>
          <Text style={styles.subtitle}>
            {user?.is_premium ? 'Premium' : `${user?.sound_count || 0}/5 sounds`}
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
                Max: {formatTime(user?.is_premium ? 30 * 60 : 5 * 60)}
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
          >
            <View style={[styles.actionIconContainer, isRecording && styles.recordingIconContainer]}>
              <Ionicons
                name={isRecording ? 'stop' : 'mic'}
                size={24}
                color="#FFFFFF"
              />
            </View>
            <Text style={styles.actionButtonText}>
              {isRecording ? 'Stop' : 'Record'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={pickAudioFile}
          >
            <View style={styles.actionIconContainer}>
              <Ionicons name="cloud-upload" size={24} color="#FFFFFF" />
            </View>
            <Text style={styles.actionButtonText}>Upload</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={openLibraryModal}
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
              Recording works best on mobile. Use Expo Go app or upload a file.
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
        onRequestClose={() => setShowSaveModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Save Sound</Text>
              <TouchableOpacity onPress={() => setShowSaveModal(false)}>
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
            />

            <TouchableOpacity
              style={[styles.modalConfirmButton, isSaving && styles.buttonDisabled]}
              onPress={saveSound}
              disabled={isSaving || !soundName.trim()}
            >
              <Text style={styles.modalConfirmText}>
                {isSaving ? 'Saving...' : 'Save to Library'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
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
                keyExtractor={(item) => item.sound_id}
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
                        {formatTime(item.duration_seconds)}
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
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EF4444',
  },
  recordingText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '600',
  },
  maxDurationText: {
    color: '#9CA3AF',
    fontSize: 12,
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
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
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
    backgroundColor: '#EF4444',
  },
  disabledIconContainer: {
    backgroundColor: '#4B5563',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
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
