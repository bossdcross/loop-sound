import React, { useEffect, useRef } from 'react';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, AppState, AppStateStatus } from 'react-native';
import { PostHogProvider } from 'posthog-react-native';
import { initializeAnalytics, getPostHogClient, Analytics } from '../services/analytics';

// PostHog configuration - will be configured via environment variables
const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY || '';
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

// Initialize PostHog
const posthogClient = initializeAnalytics(POSTHOG_API_KEY, POSTHOG_HOST);

function AppContent() {
  const pathname = usePathname();
  const appState = useRef(AppState.currentState);
  
  // Track app lifecycle
  useEffect(() => {
    // Track app opened on mount
    Analytics.appOpened();
    
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        Analytics.appOpened();
      } else if (nextAppState.match(/inactive|background/)) {
        Analytics.appBackgrounded();
      }
      appState.current = nextAppState;
    });
    
    return () => {
      subscription.remove();
    };
  }, []);
  
  // Track screen views
  useEffect(() => {
    if (pathname) {
      Analytics.screenView(pathname);
    }
  }, [pathname]);
  
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0A0A0F' },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  // If PostHog is configured, wrap with provider
  if (posthogClient) {
    return (
      <PostHogProvider client={posthogClient}>
        <AppContent />
      </PostHogProvider>
    );
  }
  
  // Otherwise, render without PostHog
  return <AppContent />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
});
