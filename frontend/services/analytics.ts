import PostHog from 'posthog-react-native';

// PostHog client singleton
let posthogClient: PostHog | null = null;

// Event types for type safety
export type AnalyticsEvent = 
  | 'app_opened'
  | 'app_backgrounded'
  | 'sound_recorded'
  | 'sound_uploaded'
  | 'sound_played'
  | 'sound_stopped'
  | 'sound_saved'
  | 'sound_deleted'
  | 'timer_set'
  | 'library_opened'
  | 'settings_viewed';

interface EventProperties {
  // Sound events
  sound_name?: string;
  sound_duration?: number;
  loop_count?: number;
  file_size_mb?: number;
  
  // Timer events
  timer_mode?: 'indefinite' | 'duration' | 'alarm';
  timer_duration_seconds?: number;
  
  // Recording events
  recording_duration?: number;
  
  // General
  timestamp?: string;
  error?: string;
}

/**
 * Initialize PostHog analytics
 * Call this once at app startup
 */
export const initializeAnalytics = (apiKey: string, host: string): PostHog | null => {
  if (!apiKey || !host) {
    console.log('[Analytics] PostHog API key or host not configured - analytics disabled');
    return null;
  }
  
  try {
    posthogClient = new PostHog(apiKey, {
      host,
      flushInterval: 30000, // Flush every 30 seconds
      maxQueueSize: 100,    // Max 100 events in queue
      defaultOptIn: true,   // Opt-in by default
      disabled: false,
    });
    
    console.log('[Analytics] PostHog initialized successfully');
    return posthogClient;
  } catch (error) {
    console.error('[Analytics] Failed to initialize PostHog:', error);
    return null;
  }
};

/**
 * Get the PostHog client instance
 */
export const getPostHogClient = (): PostHog | null => {
  return posthogClient;
};

/**
 * Track an analytics event
 */
export const trackEvent = (
  event: AnalyticsEvent,
  properties?: EventProperties
): void => {
  if (!posthogClient) {
    return;
  }
  
  try {
    posthogClient.capture(event, {
      ...properties,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Analytics] Failed to track event:', event, error);
  }
};

/**
 * Track screen views
 */
export const trackScreen = (screenName: string): void => {
  if (!posthogClient) {
    return;
  }
  
  try {
    posthogClient.screen(screenName, {
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Analytics] Failed to track screen:', screenName, error);
  }
};

// Convenience functions for specific events
export const Analytics = {
  // App lifecycle
  appOpened: () => trackEvent('app_opened'),
  appBackgrounded: () => trackEvent('app_backgrounded'),
  
  // Sound events
  soundRecorded: (duration: number) => 
    trackEvent('sound_recorded', { recording_duration: duration }),
  
  soundUploaded: (name: string, duration: number, sizeMB?: number) => 
    trackEvent('sound_uploaded', { 
      sound_name: name, 
      sound_duration: duration,
      file_size_mb: sizeMB,
    }),
  
  soundPlayed: (name: string, duration: number, timerMode: 'indefinite' | 'duration' | 'alarm') => 
    trackEvent('sound_played', { 
      sound_name: name, 
      sound_duration: duration,
      timer_mode: timerMode,
    }),
  
  soundStopped: (name: string, loopCount?: number) => 
    trackEvent('sound_stopped', { 
      sound_name: name, 
      loop_count: loopCount,
    }),
  
  soundSaved: (name: string, duration: number) => 
    trackEvent('sound_saved', { 
      sound_name: name, 
      sound_duration: duration,
    }),
  
  soundDeleted: (name: string) => 
    trackEvent('sound_deleted', { sound_name: name }),
  
  // Timer events
  timerSet: (mode: 'indefinite' | 'duration' | 'alarm', durationSeconds?: number) => 
    trackEvent('timer_set', { 
      timer_mode: mode, 
      timer_duration_seconds: durationSeconds,
    }),
  
  // Navigation
  libraryOpened: () => trackEvent('library_opened'),
  settingsViewed: () => trackEvent('settings_viewed'),
  
  // Screen tracking
  screenView: (screenName: string) => trackScreen(screenName),
};

export default Analytics;
