# SoundLoop Deployment Guide

## Prerequisites

Before deploying, you'll need:

1. **Expo Account**: Create at [expo.dev](https://expo.dev)
2. **EAS CLI**: `npm install -g eas-cli`
3. **Apple Developer Account**: $99/year at [developer.apple.com](https://developer.apple.com) (for iOS)
4. **Google Play Console Account**: $25 one-time at [play.google.com/console](https://play.google.com/console) (for Android)

## Configuration Checklist

### 1. Replace placeholders in `app.json`

This repo still has placeholders for EAS IDs. You must replace these before building.

```json
{
  "expo": {
    "owner": "YOUR_EXPO_USERNAME",
    "extra": {
      "eas": {
        "projectId": "YOUR_EAS_PROJECT_ID"
      }
    },
    "updates": {
      "url": "https://u.expo.dev/YOUR_EAS_PROJECT_ID"
    }
  }
}
```

Run these commands from `frontend/`:

```bash
cd /workspace/loop-sound/frontend
eas login
eas project:init --force
eas project:info
```

Copy the `ID` shown by `eas project:info` and replace both occurrences in `app.json`:

- `expo.extra.eas.projectId`
- `expo.updates.url` (the final segment after `https://u.expo.dev/`)

Also set `expo.owner` to your real Expo username (from `eas whoami`).

### 2. Replace placeholders in `eas.json`

For iOS submission, fill all three values:
```json
{
  "submit": {
    "production": {
      "ios": {
        "appleId": "YOUR_APPLE_ID_EMAIL",
        "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID",
        "appleTeamId": "YOUR_APPLE_TEAM_ID"
      }
    }
  }
}
```

How to get each value:

- `appleId`: the Apple ID email you use for App Store Connect.
- `ascAppId`: in App Store Connect → **My Apps** → your app → **App Information**; this is the numeric Apple ID (example: `1234567890`).
  - For a brand new app, first create the app record in App Store Connect using your iOS bundle identifier (`com.soundloop.app`). The Apple ID appears only after the app record exists.
  - If the app is brand new and you do not have this yet, keep the placeholder (or temporarily remove `ascAppId`) and run `eas submit --platform ios --profile production`; once the app exists, add the numeric Apple ID back to `eas.json`.
- `appleTeamId`: run `eas credentials --platform ios` and copy the Team ID shown (10 uppercase letters).

For Android submission:
- Create a service account in Google Play Console
- Download the JSON key file
- Save as `google-services.json` in `/workspace/loop-sound/frontend/`

### 3. Validate config before build

Run:

```bash
cd /workspace/loop-sound/frontend
eas config --platform ios
eas config --platform android
```

If placeholders are still present, these commands will show them and you should fix `app.json`/`eas.json` before continuing.

### 4. First submission flow (exact order)

```bash
cd /workspace/loop-sound/frontend

# 1) Build production binaries
eas build --profile production --platform ios
eas build --profile production --platform android

# 2) Submit the completed builds
eas submit --platform ios --profile production
eas submit --platform android --profile production
```

## Build Commands

### Development Build (Testing)
```bash
# iOS Simulator
eas build --profile development --platform ios

# Android Emulator
eas build --profile development --platform android

# Both platforms
eas build --profile development --platform all
```

### Preview Build (Internal Testing)
```bash
# Share with testers via link
eas build --profile preview --platform all
```

### Production Build
```bash
# iOS App Store
eas build --profile production --platform ios

# Google Play Store
eas build --profile production --platform android

# Both platforms
eas build --profile production --platform all
```

## App Store Submission

### iOS (App Store)
```bash
eas submit --platform ios
```

You'll need:
- Apple Developer Program membership
- App Store Connect app created
- App screenshots (6.7", 6.5", 5.5" iPhones + iPads if supporting tablets)
- App icon (already configured)
- Privacy policy URL
- App description

### Android (Google Play)
```bash
eas submit --platform android
```

You'll need:
- Google Play Console account
- Service account JSON key
- Feature graphic (1024x500)
- Screenshots (phone + tablet)
- Privacy policy URL
- App description

## App Store Assets Needed

### Screenshots Required

**iOS:**
- 6.7" iPhone (1290 x 2796 px) - iPhone 14 Pro Max
- 6.5" iPhone (1284 x 2778 px) - iPhone 11 Pro Max
- 5.5" iPhone (1242 x 2208 px) - iPhone 8 Plus
- 12.9" iPad Pro (2048 x 2732 px) - if supporting tablets

**Android:**
- Phone (1080 x 1920 px minimum)
- 7" Tablet (if supporting)
- 10" Tablet (if supporting)

### Store Listing Content

**App Name:** SoundLoop

**Short Description (80 chars):**
Loop your sounds. Record or upload audio and play it on repeat.

**Full Description:**
SoundLoop is a simple, elegant app for playing sounds on repeat.

Features:
• Record audio directly in the app
• Upload sounds from your device
• Play any sound in a continuous loop
• Set timers to auto-stop playback
• Save up to 5 sounds locally
• Dark mode interface

Perfect for:
- Sleep sounds and white noise
- Meditation and relaxation
- Music practice and study
- ASMR and ambient audio

No account required. All sounds stay on your device.

**Category:** Music / Utilities

**Keywords (iOS):** loop, sound, audio, repeat, sleep, white noise, meditation, relax

## Post-Deployment

### Over-the-Air Updates
Once published, you can push JS updates without new app store submissions:
```bash
eas update --branch production
```

### Monitoring
- Check PostHog dashboard for analytics
- Monitor crash reports in Expo dashboard
- Review app store reviews

## Troubleshooting

### Build Fails
```bash
# Clear cache and rebuild
eas build --clear-cache --platform [ios|android]
```

### Credentials Issues
```bash
# Reconfigure iOS credentials
eas credentials --platform ios

# Reconfigure Android credentials
eas credentials --platform android
```

## App Assets Summary

| Asset | Path | Dimensions |
|-------|------|------------|
| App Icon | `assets/images/icon.png` | 1024x1024 |
| Adaptive Icon (Android) | `assets/images/adaptive-icon.png` | 1024x1024 |
| Splash Screen | `assets/images/splash-icon.png` | 1024x1536 |
| Favicon (Web) | `assets/images/favicon.png` | 196x196 |

All icons feature the infinity loop + sound wave design with the app's dark theme (#0A0A0F).
