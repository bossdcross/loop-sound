# Sound Loop App - Product Requirements Document

## Original Problem Statement
Build a mobile app to record or upload sounds and play them back in a loop.

## Current Version: Free Launch (v1.0.0)

### Key Changes from Previous Version
- **No login required** - App opens directly to Player
- **Local storage only** - Sounds saved on device using AsyncStorage
- **No premium tier** - Single free tier with limits
- **Simplified Profile** - Now shows Settings with storage info and coming soon features

### Launch Limits
- Max 5 sounds
- Max 5 minutes per sound
- Max 10MB file upload
- All data stored locally on device

## Core Features

### Player/Home Screen
- [x] Record audio (mobile only)
- [x] Upload audio files from device storage
- [x] Play sounds in loop
- [x] Select sounds from library via modal
- [x] Save sounds to local storage
- [x] File size limit validation (10MB)
- [x] Duration limit validation (5 min)

### Timer Functionality
- [x] Indefinite looping mode
- [x] Duration timer (stop after X hours/minutes)
- [x] Alarm timer (stop at specific wall-clock time)
- [x] Roller/wheel picker UI for timer settings
- [x] Background audio playback support (iOS/Android)
- [x] Timestamp-based timer for background resilience

### Library
- [x] List saved sounds (local storage)
- [x] Edit sound names
- [x] Delete sounds
- [x] Show storage usage (X/5 sounds)
- [x] KeyboardAvoidingView for edit modal

### Settings (Profile Tab)
- [x] Storage usage display with progress bar
- [x] Feature limits info
- [x] Coming Soon section (Premium teaser)
- [x] Rate App button
- [x] Send Feedback button
- [x] App version info

### UI/UX
- [x] Modern dark theme
- [x] No login screen (direct to player)
- [x] Bottom tab navigation (Player, Library, Profile)
- [x] Responsive web preview

## Technical Architecture

### Frontend
- React Native with Expo (SDK 54)
- Expo Router for navigation
- TypeScript
- expo-av for audio recording/playback
- expo-document-picker for file uploads
- @quidone/react-native-wheel-picker for timer UI
- AsyncStorage for local sound storage
- expo-file-system for file management

### Backend (Minimal - for future use)
- FastAPI (Python) - Auth endpoints still exist but unused
- MongoDB - Still configured but not used in free version

### Key Files
- `/app/frontend/app/index.tsx` - Redirects to home (no auth)
- `/app/frontend/app/_layout.tsx` - Simple layout (no AuthProvider)
- `/app/frontend/app/(tabs)/home.tsx` - Main player screen with local storage
- `/app/frontend/app/(tabs)/library.tsx` - Sound library with local storage
- `/app/frontend/app/(tabs)/profile.tsx` - Settings screen
- `/app/frontend/services/LocalSoundStorage.ts` - Local storage service

### Local Storage Schema
```typescript
interface LocalSound {
  id: string;        // Generated unique ID
  name: string;      // Sound name
  uri: string;       // Local file URI
  duration: number;  // Duration in seconds
  createdAt: string; // ISO timestamp
}
```

## What's Implemented (Dec 2025)

### Free Launch Version
- Removed authentication requirement
- Implemented LocalSoundStorage service
- Updated all screens to use local storage
- Simplified Profile to Settings
- Added "Coming Soon" premium teaser
- Direct redirect to Player on app launch

## Pending Verification
- Background audio playback (needs real device testing)

## Deployment Status (Dec 2025)
- ✅ Health check passed
- ✅ All environment variables configured
- ✅ UI fixes verified by user (keyboard input visibility, stop button emphasis)
- ✅ App returning HTTP 200
- ✅ PostHog analytics integrated
- ✅ Production-ready app.json configured
- ✅ EAS build configuration (eas.json) created
- ✅ Custom app icons generated (infinity loop + sound wave design)
- ✅ Splash screen created
- ✅ Favicon for web created
- ✅ Deployment guide created (DEPLOYMENT.md)
- **Ready for EAS builds and app store submission**

### Production Assets Created
| Asset | Path | Dimensions |
|-------|------|------------|
| App Icon | `assets/images/icon.png` | 1024x1024 |
| Adaptive Icon (Android) | `assets/images/adaptive-icon.png` | 1024x1024 |
| Splash Screen | `assets/images/splash-icon.png` | 1024x1536 |
| Favicon (Web) | `assets/images/favicon.png` | 196x196 |

## Analytics Integration (PostHog)
PostHog analytics has been integrated to track user behavior. Events tracked:
- `app_opened` / `app_backgrounded` - App lifecycle
- `sound_recorded` - When user records audio
- `sound_uploaded` - When user uploads audio file  
- `sound_played` / `sound_stopped` - Playback events
- `sound_saved` / `sound_deleted` - Library management
- `timer_set` - Timer configuration
- `library_opened` - Library screen views
- `settings_viewed` - Settings screen views
- Screen view tracking for all navigation

### PostHog Setup Required
PostHog is now configured with:
- API Key: `phc_Bs4AYMi0XJre5j0vujzrvRzy1fsfRpuO1TIadNQ6n2A`
- Host: `https://us.i.posthog.com`

### Profile/Settings Page Features
- **Rate App**: Shows message explaining app store rating coming soon, with option to send feedback instead
- **Send Feedback**: Opens email client to `app.soundloop@gmail.com` with pre-filled subject and body template

## Future/Backlog Tasks

### P1 - High Priority (For Premium Version)
- [ ] User authentication (email/Google)
- [ ] Cloud storage for sounds
- [ ] RevenueCat integration for paywall
- [ ] Sync sounds across devices

### P2 - Medium Priority
- [ ] Apple Sign-In
- [ ] Export/share sounds
- [ ] Sound categories/folders

### P3 - Low Priority
- [ ] Migrate from expo-av to expo-audio/expo-video
- [ ] Configure babel path aliases (@/*)
- [ ] Audio visualization during playback

## Notes
- expo-av is deprecated in SDK 54, plan migration to expo-audio/expo-video
- Recording only works on mobile devices (not web preview)
- Background audio requires real device testing
- All sounds are stored locally - no cloud sync in this version
