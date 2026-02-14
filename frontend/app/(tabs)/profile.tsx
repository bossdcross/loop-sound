import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useRouter } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function ProfileScreen() {
  const { user, token, logout, refreshUser, upgradeToMockPremium } = useAuth();
  const router = useRouter();
  
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<any>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isUpgrading, setIsUpgrading] = useState(false);

  useEffect(() => {
    loadSubscriptionStatus();
  }, [token]);

  const loadSubscriptionStatus = async () => {
    if (!token) return;
    
    try {
      const response = await fetch(`${API_URL}/api/subscription/status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setSubscriptionStatus(data);
      }
    } catch (error) {
      console.error('Error loading subscription status:', error);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            setIsLoggingOut(true);
            try {
              await logout();
              router.replace('/(auth)/login');
            } catch (error) {
              Alert.alert('Error', 'Failed to logout');
            } finally {
              setIsLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  const handleMockUpgrade = async () => {
    setIsUpgrading(true);
    try {
      await upgradeToMockPremium();
      await loadSubscriptionStatus();
      Alert.alert('Success', 'You are now a premium user! (MOCKED for testing)');
    } catch (error) {
      Alert.alert('Error', 'Failed to upgrade');
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleMockDowngrade = async () => {
    try {
      const response = await fetch(`${API_URL}/api/subscription/mock-downgrade`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        await refreshUser();
        await loadSubscriptionStatus();
        Alert.alert('Downgraded', 'You are now on the free plan');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to downgrade');
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    return `${mins} minutes`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
        </View>

        {/* User Info */}
        <View style={styles.userCard}>
          {user?.picture ? (
            <Image source={{ uri: user.picture }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>
          )}
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.name}</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
          </View>
          {user?.is_premium && (
            <View style={styles.premiumBadge}>
              <Ionicons name="star" size={14} color="#F59E0B" />
              <Text style={styles.premiumText}>Premium</Text>
            </View>
          )}
        </View>

        {/* Subscription Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription</Text>
          
          {isLoadingStatus ? (
            <ActivityIndicator color="#8B5CF6" style={{ marginVertical: 20 }} />
          ) : (
            <View style={styles.subscriptionCard}>
              <View style={styles.subscriptionHeader}>
                <View style={styles.planBadge}>
                  <Ionicons
                    name={user?.is_premium ? 'diamond' : 'leaf'}
                    size={20}
                    color={user?.is_premium ? '#8B5CF6' : '#10B981'}
                  />
                  <Text
                    style={[
                      styles.planName,
                      { color: user?.is_premium ? '#8B5CF6' : '#10B981' },
                    ]}
                  >
                    {user?.is_premium ? 'Premium Plan' : 'Free Plan'}
                  </Text>
                </View>
              </View>

              <View style={styles.subscriptionFeatures}>
                <View style={styles.featureItem}>
                  <Ionicons name="musical-notes" size={18} color="#6B7280" />
                  <Text style={styles.featureText}>
                    {subscriptionStatus?.sound_count || 0}/{subscriptionStatus?.max_sounds || 5} sounds used
                  </Text>
                </View>
                <View style={styles.featureItem}>
                  <Ionicons name="time" size={18} color="#6B7280" />
                  <Text style={styles.featureText}>
                    Max duration: {formatDuration(subscriptionStatus?.max_duration_seconds || 300)}
                  </Text>
                </View>
                <View style={styles.featureItem}>
                  <Ionicons name="infinite" size={18} color="#6B7280" />
                  <Text style={styles.featureText}>
                    {subscriptionStatus?.sounds_remaining || 0} slots remaining
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Premium Upgrade/Downgrade */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upgrade</Text>
          
          {!user?.is_premium ? (
            <View style={styles.upgradeCard}>
              <View style={styles.upgradeHeader}>
                <Ionicons name="star" size={32} color="#F59E0B" />
                <Text style={styles.upgradeTitle}>Go Premium</Text>
              </View>
              
              <View style={styles.upgradeFeatures}>
                <View style={styles.upgradeFeatureItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                  <Text style={styles.upgradeFeatureText}>30 saved sounds (vs 5)</Text>
                </View>
                <View style={styles.upgradeFeatureItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                  <Text style={styles.upgradeFeatureText}>30 min recordings (vs 5 min)</Text>
                </View>
                <View style={styles.upgradeFeatureItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                  <Text style={styles.upgradeFeatureText}>Priority support</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.upgradeButton, isUpgrading && styles.buttonDisabled]}
                onPress={handleMockUpgrade}
                disabled={isUpgrading}
              >
                {isUpgrading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.upgradeButtonText}>Upgrade Now</Text>
                    <Text style={styles.upgradePrice}>(MOCKED for testing)</Text>
                  </>
                )}
              </TouchableOpacity>

              <Text style={styles.revenueNotice}>
                In production, this will use RevenueCat for real in-app purchases
              </Text>
            </View>
          ) : (
            <View style={styles.managePlanCard}>
              <Text style={styles.managePlanText}>You're enjoying premium features!</Text>
              <TouchableOpacity
                style={styles.downgradeButton}
                onPress={handleMockDowngrade}
              >
                <Text style={styles.downgradeButtonText}>Downgrade to Free (Test)</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Account Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          
          <TouchableOpacity
            style={styles.menuItem}
            onPress={handleLogout}
            disabled={isLoggingOut}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
              <Ionicons name="log-out-outline" size={20} color="#EF4444" />
            </View>
            <Text style={[styles.menuText, { color: '#EF4444' }]}>Logout</Text>
            {isLoggingOut ? (
              <ActivityIndicator color="#EF4444" size="small" />
            ) : (
              <Ionicons name="chevron-forward" size={20} color="#4B5563" />
            )}
          </TouchableOpacity>
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appName}>Sound Loop</Text>
          <Text style={styles.appVersion}>Version 1.0.0 (MVP)</Text>
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
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F1F2E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  userInfo: {
    flex: 1,
    marginLeft: 16,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  premiumText: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '600',
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
  subscriptionCard: {
    backgroundColor: '#1F1F2E',
    borderRadius: 16,
    padding: 16,
  },
  subscriptionHeader: {
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
  },
  subscriptionFeatures: {
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
  upgradeCard: {
    backgroundColor: '#1F1F2E',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  upgradeHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  upgradeTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 8,
  },
  upgradeFeatures: {
    gap: 12,
    marginBottom: 20,
  },
  upgradeFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  upgradeFeatureText: {
    color: '#FFFFFF',
    fontSize: 15,
  },
  upgradeButton: {
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  upgradePrice: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    marginTop: 4,
  },
  revenueNotice: {
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'center',
  },
  managePlanCard: {
    backgroundColor: '#1F1F2E',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  managePlanText: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 16,
  },
  downgradeButton: {
    backgroundColor: 'rgba(107, 114, 128, 0.2)',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  downgradeButtonText: {
    color: '#9CA3AF',
    fontSize: 14,
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
});
