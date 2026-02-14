import React, { useState, useCallback } from 'react';
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
import { Audio } from 'expo-av';
import { useRouter, useFocusEffect } from 'expo-router';
import { 
  getSounds, 
  updateSoundName, 
  deleteSound as deleteSoundFromStorage,
  LIMITS,
  LocalSound 
} from '../../services/LocalSoundStorage';
import { Analytics } from '../../services/analytics';

export default function LibraryScreen() {
  const router = useRouter();
  
  const [sounds, setSounds] = useState<LocalSound[]>([]);
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
      // Track library opened
      Analytics.libraryOpened();
      loadSounds();
      return () => {
        // Cleanup sound when leaving screen
        if (currentSound) {
          currentSound.unloadAsync();
        }
      };
    }, [])
  );

  const loadSounds = async () => {
    try {
      const localSounds = await getSounds();
      setSounds(localSounds);
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
      
      // Find sound
      const soundData = sounds.find(s => s.id === soundId);
      if (!soundData) return;
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
      
      const { sound } = await Audio.Sound.createAsync(
        { uri: soundData.uri },
        { shouldPlay: true, isLooping: true }
      );
      
      setCurrentSound(sound);
      setPlayingId(soundId);
      
    } catch (error) {
      console.error('Error playing sound:', error);
      Alert.alert('Error', 'Failed to play sound');
    }
  };

  const handleDeleteSound = async (soundId: string, soundName: string) => {
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
              const result = await deleteSoundFromStorage(soundId);
              
              if (result.success) {
                // Track sound deleted
                Analytics.soundDeleted(soundName);
                
                setSounds(prev => prev.filter(s => s.id !== soundId));
                
                // Stop if currently playing
                if (playingId === soundId && currentSound) {
                  await currentSound.stopAsync();
                  await currentSound.unloadAsync();
                  setCurrentSound(null);
                  setPlayingId(null);
                }
              } else {
                Alert.alert('Error', result.error || 'Failed to delete sound');
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to delete sound');
            }
          },
        },
      ]
    );
  };

  // Edit sound name
  const openEditModal = (sound: LocalSound) => {
    setEditingSoundId(sound.id);
    setEditingName(sound.name);
    setEditModalVisible(true);
  };

  const closeEditModal = () => {
    setEditModalVisible(false);
    setEditingSoundId(null);
    setEditingName('');
    Keyboard.dismiss();
  };

  const saveEditedName = async () => {
    if (!editingSoundId || !editingName.trim()) return;
    
    setIsSaving(true);
    try {
      const result = await updateSoundName(editingSoundId, editingName.trim());
      
      if (result.success) {
        setSounds(prev => prev.map(s => 
          s.id === editingSoundId 
            ? { ...s, name: editingName.trim() } 
            : s
        ));
        closeEditModal();
      } else {
        Alert.alert('Error', result.error || 'Failed to update sound name');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update sound name');
    } finally {
      setIsSaving(false);
    }
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

  const renderSoundItem = ({ item }: { item: LocalSound }) => (
    <View style={styles.soundItem}>
      <TouchableOpacity
        style={styles.soundPlayButton}
        onPress={() => playSound(item.id)}
        testID={`play-sound-${item.id}`}
      >
        <Ionicons
          name={playingId === item.id ? 'stop' : 'play'}
          size={24}
          color="#FFFFFF"
        />
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.soundInfo}
        onPress={() => openEditModal(item)}
      >
        <Text style={styles.soundName} numberOfLines={1}>{item.name}</Text>
        <View style={styles.soundMeta}>
          <Text style={styles.soundDuration}>{formatDuration(item.duration)}</Text>
          <Text style={styles.soundDate}>{formatDate(item.createdAt)}</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.editButton}
        onPress={() => openEditModal(item)}
        testID={`edit-sound-${item.id}`}
      >
        <Ionicons name="pencil-outline" size={18} color="#8B5CF6" />
      </TouchableOpacity>
      
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDeleteSound(item.id, item.name)}
        testID={`delete-sound-${item.id}`}
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
            {sounds.length}/{LIMITS.MAX_SOUNDS} sounds
          </Text>
        </View>
      </View>

      {/* Limit Warning */}
      {sounds.length >= LIMITS.MAX_SOUNDS - 1 && (
        <View style={styles.limitWarning}>
          <Ionicons name="information-circle-outline" size={20} color="#F59E0B" />
          <Text style={styles.limitWarningText}>
            {sounds.length >= LIMITS.MAX_SOUNDS
              ? 'Limit reached! Delete a sound to add more.'
              : `Only ${LIMITS.MAX_SOUNDS - sounds.length} slot left!`}
          </Text>
        </View>
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
            testID="go-to-player-button"
          >
            <Text style={styles.goToPlayerText}>Go to Player</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={sounds}
          renderItem={renderSoundItem}
          keyExtractor={(item) => item.id}
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

      {/* Edit Name Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeEditModal}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Sound Name</Text>
                <TouchableOpacity onPress={closeEditModal}>
                  <Ionicons name="close" size={24} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.editInput}
                placeholder="Enter sound name"
                placeholderTextColor="#6B7280"
                value={editingName}
                onChangeText={setEditingName}
                autoFocus
                selectTextOnFocus
                returnKeyType="done"
                onSubmitEditing={saveEditedName}
              />

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={closeEditModal}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.saveButton, (isSaving || !editingName.trim()) && styles.buttonDisabled]}
                  onPress={saveEditedName}
                  disabled={isSaving || !editingName.trim()}
                >
                  <Text style={styles.saveButtonText}>
                    {isSaving ? 'Saving...' : 'Save'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>
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
  limitWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    marginHorizontal: 24,
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  limitWarningText: {
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
  editButton: {
    padding: 8,
    marginRight: 4,
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
  editInput: {
    backgroundColor: '#2D2D3D',
    borderRadius: 12,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#2D2D3D',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#9CA3AF',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
