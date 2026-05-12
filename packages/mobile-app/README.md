# Ayto Mobile App (Team D)

React Native + Expo app for on-device sports analytics.

## Quick Start

```bash
cd packages/mobile-app
npm install
npx expo start
```

## Screen Flow

```
Auth → Home → Camera → Results → Dashboard
                 ↑                    │
                 └────────────────────┘
```

## Screens

| Screen | File | Status |
|--------|------|--------|
| Auth | `src/screens/AuthScreen.tsx` | Supabase OTP sign-in |
| Home | `src/screens/HomeScreen.tsx` | Record button + menu |
| Camera | `src/screens/CameraScreen.tsx` | Back camera, record 720p video |
| Results | `src/screens/ResultsScreen.tsx` | Video player + speed overlay |
| Dashboard | `src/screens/DashboardScreen.tsx` | Session summary card |

## Integration Plan

- **Week 1-4:** Camera recording + dummy overlays (current)
- **Week 5:** TFLite model integration — real shuttle speed + stroke labels
- **Week 6:** Supabase upload + real session metrics

## Design Constraints

- Must work on ₹8,000 Android phones (2GB RAM)
- Must work on 4G connections
- Max app size: 80MB (including models)
- Session recording: max 10 minutes
