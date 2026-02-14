import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

const SOUNDS_KEY = 'local_sounds';
const MAX_SOUNDS = 5;
const MAX_DURATION_SECONDS = 5 * 60; // 5 minutes

export interface LocalSound {
  id: string;
  name: string;
  uri: string;
  duration: number; // in seconds
  createdAt: string;
}

interface SoundsData {
  sounds: LocalSound[];
}

// Generate unique ID
const generateId = (): string => {
  return 'sound_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
};

// Get all sounds
export const getSounds = async (): Promise<LocalSound[]> => {
  try {
    const data = await AsyncStorage.getItem(SOUNDS_KEY);
    if (data) {
      const parsed: SoundsData = JSON.parse(data);
      return parsed.sounds || [];
    }
    return [];
  } catch (error) {
    console.error('Error getting sounds:', error);
    return [];
  }
};

// Save a new sound
export const saveSound = async (
  name: string,
  sourceUri: string,
  duration: number
): Promise<{ success: boolean; error?: string; sound?: LocalSound }> => {
  try {
    const sounds = await getSounds();
    
    // Check limit
    if (sounds.length >= MAX_SOUNDS) {
      return { 
        success: false, 
        error: `Maximum ${MAX_SOUNDS} sounds allowed. Delete a sound to add more.` 
      };
    }
    
    // Check duration
    if (duration > MAX_DURATION_SECONDS) {
      return { 
        success: false, 
        error: `Maximum duration is ${MAX_DURATION_SECONDS / 60} minutes.` 
      };
    }
    
    // Copy file to permanent location
    const id = generateId();
    const extension = sourceUri.split('.').pop() || 'm4a';
    const permanentUri = FileSystem.documentDirectory + `${id}.${extension}`;
    
    await FileSystem.copyAsync({
      from: sourceUri,
      to: permanentUri,
    });
    
    const newSound: LocalSound = {
      id,
      name,
      uri: permanentUri,
      duration,
      createdAt: new Date().toISOString(),
    };
    
    sounds.push(newSound);
    await AsyncStorage.setItem(SOUNDS_KEY, JSON.stringify({ sounds }));
    
    return { success: true, sound: newSound };
  } catch (error) {
    console.error('Error saving sound:', error);
    return { success: false, error: 'Failed to save sound' };
  }
};

// Update sound name
export const updateSoundName = async (
  id: string,
  newName: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const sounds = await getSounds();
    const index = sounds.findIndex(s => s.id === id);
    
    if (index === -1) {
      return { success: false, error: 'Sound not found' };
    }
    
    sounds[index].name = newName;
    await AsyncStorage.setItem(SOUNDS_KEY, JSON.stringify({ sounds }));
    
    return { success: true };
  } catch (error) {
    console.error('Error updating sound:', error);
    return { success: false, error: 'Failed to update sound' };
  }
};

// Delete a sound
export const deleteSound = async (
  id: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const sounds = await getSounds();
    const sound = sounds.find(s => s.id === id);
    
    if (!sound) {
      return { success: false, error: 'Sound not found' };
    }
    
    // Delete the file
    try {
      await FileSystem.deleteAsync(sound.uri, { idempotent: true });
    } catch (e) {
      console.log('File may already be deleted:', e);
    }
    
    // Remove from list
    const filtered = sounds.filter(s => s.id !== id);
    await AsyncStorage.setItem(SOUNDS_KEY, JSON.stringify({ sounds: filtered }));
    
    return { success: true };
  } catch (error) {
    console.error('Error deleting sound:', error);
    return { success: false, error: 'Failed to delete sound' };
  }
};

// Get a single sound by ID
export const getSound = async (id: string): Promise<LocalSound | null> => {
  try {
    const sounds = await getSounds();
    return sounds.find(s => s.id === id) || null;
  } catch (error) {
    console.error('Error getting sound:', error);
    return null;
  }
};

// Get sound count
export const getSoundCount = async (): Promise<number> => {
  const sounds = await getSounds();
  return sounds.length;
};

// Constants export
export const LIMITS = {
  MAX_SOUNDS,
  MAX_DURATION_SECONDS,
  MAX_DURATION_MINUTES: MAX_DURATION_SECONDS / 60,
};
