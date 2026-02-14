import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../context/AuthContext';

export default function AuthCallback() {
  const router = useRouter();
  const { processGoogleCallback } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processCallback = async () => {
      try {
        let sessionId: string | null = null;

        if (Platform.OS === 'web') {
          // Extract session_id from URL hash
          const hash = window.location.hash;
          if (hash.includes('session_id=')) {
            sessionId = hash.split('session_id=')[1]?.split('&')[0] || null;
          }
        }

        if (sessionId) {
          await processGoogleCallback(sessionId);
          // Clear the hash from URL
          if (Platform.OS === 'web') {
            window.history.replaceState(null, '', window.location.pathname);
          }
          router.replace('/(tabs)/home');
        } else {
          // No session_id found, redirect to login
          router.replace('/(auth)/login');
        }
      } catch (error) {
        console.error('Auth callback error:', error);
        router.replace('/(auth)/login');
      }
    };

    processCallback();
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#8B5CF6" />
      <Text style={styles.text}>Signing you in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#9CA3AF',
    fontSize: 16,
    marginTop: 16,
  },
});
