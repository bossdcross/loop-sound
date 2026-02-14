import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getSoundCount, LIMITS } from '../../services/LocalSoundStorage';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Analytics } from '../../services/analytics';

export default function ProfileScreen() {
  const [soundCount, setSoundCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      // Track settings viewed
      Analytics.settingsViewed();
      loadSoundCount();
    }, [])
  );

  const loadSoundCount = async () => {
    const count = await getSoundCount();
    setSoundCount(count);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    return `${mins} minutes`;
  };

  const handleRateApp = () => {
    Alert.alert(
      'Rate App',
      'Thank you for using Sound Loop! App store rating will be available once the app is published. In the meantime, we\'d love your feedback via email!',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Send Feedback', 
          onPress: () => handleFeedback() 
        }
      ]
    );
  };

  const handleFeedback = async () => {
    const email = 'app.soundloop@gmail.com';
    const subject = encodeURIComponent('Sound Loop App Feedback');
    const body = encodeURIComponent(
      'Hi Sound Loop team,\n\n' +
      'I wanted to share some feedback about the app:\n\n' +
      '[Your feedback here]\n\n' +
      '---\n' +
      'App Version: 1.0.0\n' +
      'Platform: ' + (Platform.OS === 'web' ? 'Web' : Platform.OS)
    );
    
    const mailtoUrl = `mailto:${email}?subject=${subject}&body=${body}`;
    
    try {
      const canOpen = await Linking.canOpenURL(mailtoUrl);
      if (canOpen) {
        await Linking.openURL(mailtoUrl);
      } else {
        // Fallback: show email address to copy
        Alert.alert(
          'Send Feedback',
          `Please email us at:\n\n${email}\n\nWe'd love to hear your thoughts!`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      Alert.alert(
        'Send Feedback',
        `Please email us at:\n\n${email}\n\nWe'd love to hear your thoughts!`,
        [{ text: 'OK' }]
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
        </View>

        {/* Storage Usage */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Storage</Text>
          
          <View style={styles.storageCard}>
            <View style={styles.storageHeader}>
              <View style={styles.planBadge}>
                <Ionicons name="folder-open" size={20} color="#8B5CF6" />
                <Text style={styles.planName}>Local Storage</Text>
              </View>
            </View>

            <View style={styles.storageProgress}>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${(soundCount / LIMITS.MAX_SOUNDS) * 100}%` }
                  ]} 
                />
              </View>
              <Text style={styles.progressText}>
                {soundCount} of {LIMITS.MAX_SOUNDS} sounds used
              </Text>
            </View>

            <View style={styles.storageFeatures}>
              <View style={styles.featureItem}>
                <Ionicons name="musical-notes" size={18} color="#6B7280" />
                <Text style={styles.featureText}>
                  Max {LIMITS.MAX_SOUNDS} sounds
                </Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="time" size={18} color="#6B7280" />
                <Text style={styles.featureText}>
                  Max duration: {formatDuration(LIMITS.MAX_DURATION_SECONDS)}
                </Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="phone-portrait" size={18} color="#6B7280" />
                <Text style={styles.featureText}>
                  Saved locally on device
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Coming Soon - Premium */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Coming Soon</Text>
          
          <View style={styles.comingSoonCard}>
            <View style={styles.comingSoonHeader}>
              <Ionicons name="star" size={32} color="#F59E0B" />
              <Text style={styles.comingSoonTitle}>Premium Features</Text>
            </View>
            
            <View style={styles.comingSoonFeatures}>
              <View style={styles.comingSoonItem}>
                <Ionicons name="cloud-upload" size={20} color="#8B5CF6" />
                <Text style={styles.comingSoonText}>Cloud backup & sync</Text>
              </View>
              <View style={styles.comingSoonItem}>
                <Ionicons name="infinite" size={20} color="#8B5CF6" />
                <Text style={styles.comingSoonText}>Unlimited sounds</Text>
              </View>
              <View style={styles.comingSoonItem}>
                <Ionicons name="time" size={20} color="#8B5CF6" />
                <Text style={styles.comingSoonText}>Longer recordings (30 min)</Text>
              </View>
            </View>

            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonBadgeText}>Coming in Future Update</Text>
            </View>
          </View>
        </View>

        {/* App Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App</Text>
          
          <TouchableOpacity
            style={styles.menuItem}
            onPress={handleRateApp}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
              <Ionicons name="star-outline" size={20} color="#F59E0B" />
            </View>
            <Text style={styles.menuText}>Rate App</Text>
            <Ionicons name="chevron-forward" size={20} color="#4B5563" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, { marginTop: 8 }]}
            onPress={handleFeedback}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(139, 92, 246, 0.1)' }]}>
              <Ionicons name="chatbubble-outline" size={20} color="#8B5CF6" />
            </View>
            <Text style={styles.menuText}>Send Feedback</Text>
            <Ionicons name="chevron-forward" size={20} color="#4B5563" />
          </TouchableOpacity>
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appName}>Sound Loop</Text>
          <Text style={styles.appVersion}>Version 1.0.0 (Free Launch)</Text>
          <Text style={styles.appTagline}>Loop your sounds, find your calm</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  storageCard: {
    backgroundColor: '#1F1F2E',
    borderRadius: 16,
    padding: 16,
  },
  storageHeader: {
    marginBottom: 16,
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#8B5CF6',
  },
  storageProgress: {
    marginBottom: 16,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#2D2D3D',
    borderRadius: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#8B5CF6',
    borderRadius: 4,
  },
  progressText: {
    color: '#9CA3AF',
    fontSize: 12,
    textAlign: 'right',
  },
  storageFeatures: {
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  comingSoonCard: {
    backgroundColor: '#1F1F2E',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  comingSoonHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  comingSoonTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 8,
  },
  comingSoonFeatures: {
    gap: 12,
    marginBottom: 20,
  },
  comingSoonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  comingSoonText: {
    color: '#9CA3AF',
    fontSize: 15,
  },
  comingSoonBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  comingSoonBadgeText: {
    color: '#F59E0B',
    fontSize: 14,
    fontWeight: '500',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F1F2E',
    borderRadius: 12,
    padding: 16,
  },
  menuIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  appInfo: {
    alignItems: 'center',
    marginTop: 20,
  },
  appName: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '500',
  },
  appVersion: {
    color: '#4B5563',
    fontSize: 12,
    marginTop: 4,
  },
  appTagline: {
    color: '#4B5563',
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
});
