import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter, useFocusEffect } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface Sound {
  sound_id: string;
  name: string;
  duration_seconds: number;
  created_at: string;
}

export default function LibraryScreen() {
  const { user, token, refreshUser } = useAuth();
  const router = useRouter();
  
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [currentSound, setCurrentSound] = useState<Audio.Sound | null>(null);
  
  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingSoundId, setEditingSoundId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Load sounds when screen focuses
  useFocusEffect(
    useCallback(() => {
      loadSounds();
      return () => {
        // Cleanup sound when leaving screen
        if (currentSound) {
          currentSound.unloadAsync();
        }
      };
    }, [token])
  );

  const loadSounds = async () => {
    if (!token) return;
    
    try {
      const response = await fetch(`${API_URL}/api/sounds`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setSounds(data);
      }
    } catch (error) {
      console.error('Error loading sounds:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadSounds();
    refreshUser();
  };

  const playSound = async (soundId: string) => {
    try {
      // Stop current sound if playing
      if (currentSound) {
        await currentSound.stopAsync();
        await currentSound.unloadAsync();
        setCurrentSound(null);
      }
      
      if (playingId === soundId) {
        setPlayingId(null);
        return;
      }
      
      // Fetch sound data
      const response = await fetch(`${API_URL}/api/sounds/${soundId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) throw new Error('Failed to load sound');
      
      const soundData = await response.json();
      
      // Write base64 to temp file
      const fileUri = FileSystem.cacheDirectory + `sound_${soundId}.m4a`;
      await FileSystem.writeAsStringAsync(fileUri, soundData.audio_data, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
      
      const { sound } = await Audio.Sound.createAsync(
        { uri: fileUri },
        { shouldPlay: true, isLooping: true }
      );
      
      setCurrentSound(sound);
      setPlayingId(soundId);
      
      // Handle playback status
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && !status.isPlaying && !status.isBuffering) {
          // Playback stopped
        }
      });
      
    } catch (error) {
      console.error('Error playing sound:', error);
      Alert.alert('Error', 'Failed to play sound');
    }
  };

  const deleteSound = async (soundId: string) => {
    Alert.alert(
      'Delete Sound',
      'Are you sure you want to delete this sound?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_URL}/api/sounds/${soundId}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${token}`,
                },
              });
              
              if (response.ok) {
                setSounds(prev => prev.filter(s => s.sound_id !== soundId));
                refreshUser();
                
                // Stop if currently playing
                if (playingId === soundId && currentSound) {
                  await currentSound.stopAsync();
                  await currentSound.unloadAsync();
                  setCurrentSound(null);
                  setPlayingId(null);
                }
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to delete sound');
            }
          },
        },
      ]
    );
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const maxSounds = user?.is_premium ? 30 : 5;
  const soundsRemaining = maxSounds - (user?.sound_count || 0);

  const renderSoundItem = ({ item }: { item: Sound }) => (
    <View style={styles.soundItem}>
      <TouchableOpacity
        style={styles.soundPlayButton}
        onPress={() => playSound(item.sound_id)}
      >
        <Ionicons
          name={playingId === item.sound_id ? 'stop' : 'play'}
          size={24}
          color="#FFFFFF"
        />
      </TouchableOpacity>
      
      <View style={styles.soundInfo}>
        <Text style={styles.soundName} numberOfLines={1}>{item.name}</Text>
        <View style={styles.soundMeta}>
          <Text style={styles.soundDuration}>{formatDuration(item.duration_seconds)}</Text>
          <Text style={styles.soundDate}>{formatDate(item.created_at)}</Text>
        </View>
      </View>
      
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => deleteSound(item.sound_id)}
      >
        <Ionicons name="trash-outline" size={20} color="#EF4444" />
      </TouchableOpacity>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B5CF6" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Library</Text>
        <View style={styles.limitBadge}>
          <Text style={styles.limitText}>
            {user?.sound_count || 0}/{maxSounds} sounds
          </Text>
        </View>
      </View>

      {/* Limit Warning */}
      {!user?.is_premium && soundsRemaining <= 2 && (
        <TouchableOpacity
          style={styles.upgradePrompt}
          onPress={() => router.push('/(tabs)/profile')}
        >
          <Ionicons name="star" size={20} color="#F59E0B" />
          <Text style={styles.upgradeText}>
            {soundsRemaining === 0
              ? 'Limit reached! Upgrade for 30 sounds'
              : `Only ${soundsRemaining} slots left. Upgrade for more!`}
          </Text>
          <Ionicons name="chevron-forward" size={20} color="#F59E0B" />
        </TouchableOpacity>
      )}

      {/* Sound List */}
      {sounds.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="musical-notes-outline" size={64} color="#4B5563" />
          <Text style={styles.emptyTitle}>No sounds yet</Text>
          <Text style={styles.emptyText}>Record or upload sounds from the Player tab</Text>
          <TouchableOpacity
            style={styles.goToPlayerButton}
            onPress={() => router.push('/(tabs)/home')}
          >
            <Text style={styles.goToPlayerText}>Go to Player</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={sounds}
          renderItem={renderSoundItem}
          keyExtractor={(item) => item.sound_id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor="#8B5CF6"
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  limitBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  limitText: {
    color: '#8B5CF6',
    fontSize: 12,
    fontWeight: '600',
  },
  upgradePrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    marginHorizontal: 24,
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  upgradeText: {
    flex: 1,
    color: '#F59E0B',
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  soundItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F1F2E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  soundPlayButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soundInfo: {
    flex: 1,
    marginLeft: 16,
  },
  soundName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  soundMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  soundDuration: {
    fontSize: 12,
    color: '#8B5CF6',
  },
  soundDate: {
    fontSize: 12,
    color: '#6B7280',
  },
  deleteButton: {
    padding: 8,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 48,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  goToPlayerButton: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  goToPlayerText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
