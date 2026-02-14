import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface SelectedSound {
  name: string;
  uri: string;
  base64?: string;
  duration: number;
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
  const [soundName, setSoundName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // Refs
  const recordingInterval = useRef<NodeJS.Timeout | null>(null);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);
  const playbackInterval = useRef<NodeJS.Timeout | null>(null);

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
      // Check duration limit
      const maxDuration = user?.is_premium ? 30 * 60 : 5 * 60;
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
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
      
    } catch (error) {
      console.error('Error starting recording:', error);
      Alert.alert('Error', 'Failed to start recording');
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
      await recording.stopAndUnloadAsync();
      
      const uri = recording.getURI();
      if (uri) {
        // Read file as base64
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        
        setSelectedSound({
          name: `Recording ${new Date().toLocaleTimeString()}`,
          uri,
          base64,
          duration: recordingDuration,
        });
      }
      
      setRecording(null);
    } catch (error) {
      console.error('Error stopping recording:', error);
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

  const startTimer = (seconds: number) => {
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
    }
    
    timerInterval.current = setInterval(() => {
      setRemainingTime(prev => {
        if (prev === null || prev <= 1) {
          stopSound();
          return null;
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
              {isRecording ? 'Stop Recording' : 'Record'}
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
            style={[styles.actionButton, !selectedSound && styles.buttonDisabled]}
            onPress={() => {
              if (selectedSound) {
                setSoundName(selectedSound.name);
                setShowSaveModal(true);
              }
            }}
            disabled={!selectedSound}
          >
            <View style={[styles.actionIconContainer, !selectedSound && styles.disabledIconContainer]}>
              <Ionicons name="save" size={24} color="#FFFFFF" />
            </View>
            <Text style={[styles.actionButtonText, !selectedSound && styles.disabledText]}>
              Save
            </Text>
          </TouchableOpacity>
        </View>
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
                <View style={styles.pickerRow}>
                  <View style={styles.pickerItem}>
                    <TouchableOpacity
                      style={styles.pickerButton}
                      onPress={() => setDurationHours(Math.min(23, durationHours + 1))}
                    >
                      <Ionicons name="chevron-up" size={24} color="#8B5CF6" />
                    </TouchableOpacity>
                    <Text style={styles.pickerValue}>{durationHours}</Text>
                    <TouchableOpacity
                      style={styles.pickerButton}
                      onPress={() => setDurationHours(Math.max(0, durationHours - 1))}
                    >
                      <Ionicons name="chevron-down" size={24} color="#8B5CF6" />
                    </TouchableOpacity>
                    <Text style={styles.pickerUnit}>hours</Text>
                  </View>
                  <Text style={styles.pickerSeparator}>:</Text>
                  <View style={styles.pickerItem}>
                    <TouchableOpacity
                      style={styles.pickerButton}
                      onPress={() => setDurationMinutes(Math.min(59, durationMinutes + 5))}
                    >
                      <Ionicons name="chevron-up" size={24} color="#8B5CF6" />
                    </TouchableOpacity>
                    <Text style={styles.pickerValue}>{durationMinutes.toString().padStart(2, '0')}</Text>
                    <TouchableOpacity
                      style={styles.pickerButton}
                      onPress={() => setDurationMinutes(Math.max(0, durationMinutes - 5))}
                    >
                      <Ionicons name="chevron-down" size={24} color="#8B5CF6" />
                    </TouchableOpacity>
                    <Text style={styles.pickerUnit}>minutes</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Alarm Picker */}
            {timerMode === 'alarm' && (
              <View style={styles.alarmPicker}>
                <Text style={styles.pickerLabel}>Stop at:</Text>
                <View style={styles.pickerRow}>
                  <View style={styles.pickerItem}>
                    <TouchableOpacity
                      style={styles.pickerButton}
                      onPress={() => {
                        const current = alarmTime || new Date();
                        const newHour = (current.getHours() + 1) % 24;
                        setAlarmFromPicker(newHour, current.getMinutes());
                      }}
                    >
                      <Ionicons name="chevron-up" size={24} color="#8B5CF6" />
                    </TouchableOpacity>
                    <Text style={styles.pickerValue}>
                      {(alarmTime?.getHours() || 0).toString().padStart(2, '0')}
                    </Text>
                    <TouchableOpacity
                      style={styles.pickerButton}
                      onPress={() => {
                        const current = alarmTime || new Date();
                        const newHour = (current.getHours() - 1 + 24) % 24;
                        setAlarmFromPicker(newHour, current.getMinutes());
                      }}
                    >
                      <Ionicons name="chevron-down" size={24} color="#8B5CF6" />
                    </TouchableOpacity>
                    <Text style={styles.pickerUnit}>hour</Text>
                  </View>
                  <Text style={styles.pickerSeparator}>:</Text>
                  <View style={styles.pickerItem}>
                    <TouchableOpacity
                      style={styles.pickerButton}
                      onPress={() => {
                        const current = alarmTime || new Date();
                        const newMin = (current.getMinutes() + 5) % 60;
                        setAlarmFromPicker(current.getHours(), newMin);
                      }}
                    >
                      <Ionicons name="chevron-up" size={24} color="#8B5CF6" />
                    </TouchableOpacity>
                    <Text style={styles.pickerValue}>
                      {(alarmTime?.getMinutes() || 0).toString().padStart(2, '0')}
                    </Text>
                    <TouchableOpacity
                      style={styles.pickerButton}
                      onPress={() => {
                        const current = alarmTime || new Date();
                        const newMin = (current.getMinutes() - 5 + 60) % 60;
                        setAlarmFromPicker(current.getHours(), newMin);
                      }}
                    >
                      <Ionicons name="chevron-down" size={24} color="#8B5CF6" />
                    </TouchableOpacity>
                    <Text style={styles.pickerUnit}>minute</Text>
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
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerItem: {
    alignItems: 'center',
  },
  pickerButton: {
    padding: 8,
  },
  pickerValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    width: 60,
    textAlign: 'center',
  },
  pickerUnit: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 4,
  },
  pickerSeparator: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    marginHorizontal: 8,
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
});
