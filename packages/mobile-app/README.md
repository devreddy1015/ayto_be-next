# Ayto Mobile App (Team D)

React Native + Expo (SDK 54, expo-router) app for on-device sports analytics. The same code renders on the web via react-native-web.

## Quick Start

```bash
cd packages/mobile-app
npm install
npx expo start
```

## Structure

| Path | What |
|------|------|
| `app/(auth)/` | Splash, onboarding (with sport picker), login |
| `app/(tabs)/` | Home, Sports gallery, History, Compare, Profile |
| `app/sport/[id].tsx` | One sport's own section |
| `app/record/` | Camera + processing |
| `app/session/[id].tsx` | Session report |
| `app/drills/` | Drill book (per sport) |
| `src/sports.ts` | Sport registry: names, riso inks, strokes, metrics, honest analysis status |
| `src/components/riso/` | Design system: `SweepHeading`, `RisoSurface`, `Plate` |
| `src/data/` | Sample session data (live sports only) and the drill book |
| `public/dashboard.html` | Standalone web dashboard in the same Riso Sweep style |

## Design: "Riso Sweep"

Black stock with cream paper ink; every sport prints in its own three riso inks. Display type is Fraunces, numerals are JetBrains Mono. Headings reveal with a horizontal ink sweep on a hard offset plate (UI-thread Reanimated, skipped when reduce-motion is on). Texture comes from three tiny tiled PNGs in `assets/riso/`; nothing is drawn per frame.

## Design Constraints

- Must work on ₹8,000 Android phones (2GB RAM)
- Must work on 4G connections
- Max app size: 80MB (including models)
- Session recording: max 10 minutes
