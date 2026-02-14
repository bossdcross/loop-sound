# Sound Loop App - Product Requirements Document

## Original Problem Statement
Build a mobile app to record or upload sounds and play them back in a loop.

## Core Features

### Player/Home Screen
- [x] Access to library of saved sounds
- [x] Select a sound for looping
- [x] Play/Stop button for audio playback
- [x] Upload audio files from device storage
- [x] Record audio (mobile only)
- [x] Save sounds to library

### Timer Functionality
- [x] Indefinite looping mode
- [x] Duration timer (stop after X hours/minutes) - max 23h 59m
- [x] Alarm timer (stop at specific wall-clock time)
- [x] Roller/wheel picker UI for timer settings
- [x] Background audio playback support (iOS/Android)
- [x] Timestamp-based timer for background resilience

### User Accounts
- [x] Email/password authentication
- [x] Google Sign-In
- [x] Sounds saved to user account
- [ ] Apple Sign-In (Future)

### Library
- [x] List saved sounds
- [x] Edit sound names
- [x] Delete sounds
- [x] KeyboardAvoidingView for edit modal

### Premium Features (Paywall)
- [ ] RevenueCat integration (Future)
- Free tier: 5 sounds max, 5 min duration, 10MB upload
- Premium tier: 30 sounds max, 30 min duration, 50MB upload

### UI/UX
- [x] Modern dark theme
- [x] Infinity icon on login screen
- [x] Clean login/signup flow
- [x] Bottom tab navigation (Player, Library, Profile)

## Technical Architecture

### Frontend
- React Native with Expo (SDK 54)
- Expo Router for navigation
- TypeScript
- expo-av for audio recording/playback
- expo-document-picker for file uploads
- @quidone/react-native-wheel-picker for timer UI

### Backend
- FastAPI (Python)
- MongoDB for data storage
- JWT authentication
- Base64 audio storage

### Key Files
- `/app/frontend/app/(tabs)/home.tsx` - Main player screen
- `/app/frontend/app/(tabs)/library.tsx` - Sound library
- `/app/frontend/app/(auth)/login.tsx` - Login screen
- `/app/backend/server.py` - API server

## API Endpoints
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `GET /api/sounds` - List user's sounds
- `POST /api/sounds` - Save a sound
- `GET /api/sounds/{id}` - Get sound with audio data
- `PUT /api/sounds/{id}/name` - Update sound name
- `DELETE /api/sounds/{id}` - Delete sound

## Database Schema
- **users**: `{user_id, email, name, password, googleId, is_premium, sound_count}`
- **sounds**: `{sound_id, user_id, name, audio_data, duration_seconds, created_at}`

## What's Implemented (Dec 2025)

### Session 1 - Core Features
- Authentication (email/password, Google)
- Audio recording and playback
- Sound library CRUD
- Timer functionality (all 3 modes)
- Background audio configuration
- Login screen UI with infinity icon

### Session 2 - Upload Enhancement
- Enhanced upload with file size limits
- Accurate audio duration detection
- Duration limit validation
- User feedback on successful upload
- Added data-testid attributes for testing

## Pending User Verification
- Background audio playback (cannot test in web environment)

## Future/Backlog Tasks

### P1 - High Priority
- [ ] Verify background audio on real device

### P2 - Medium Priority
- [ ] RevenueCat integration for paywall
- [ ] Profile screen functionality (Logout button)

### P3 - Low Priority
- [ ] Apple Sign-In
- [ ] Configure babel path aliases (@/*)
- [ ] Migrate from expo-av to expo-audio/expo-video (SDK 54 deprecation)

## Test Credentials
- Email: newtest@example.com
- Password: Test123!

## Notes
- expo-av is deprecated in SDK 54, plan migration to expo-audio/expo-video
- Premium subscription is MOCKED for testing
- Recording and background audio only work on mobile (Expo Go app)
