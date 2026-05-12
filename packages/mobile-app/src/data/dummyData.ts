export const DUMMY_SESSION = {
  playerName: "Rahul Dev",
  sport: "Badminton",
  maxSpeed: 287,
  avgSpeed: 198,
  duration: 28,
  formScore: 82,
  strokes: [
    { type: "smash", speed: 287, time: 2.3 },
    { type: "drop", speed: 98, time: 5.1 },
    { type: "smash", speed: 264, time: 8.7 },
    { type: "clear", speed: 156, time: 12.2 },
    { type: "net", speed: 76, time: 15.8 },
    { type: "serve", speed: 112, time: 18.3 },
    { type: "smash", speed: 271, time: 22.1 },
    { type: "defensive", speed: 134, time: 25.6 },
  ],
  vsProComparison: {
    proName: "Viktor Axelsen",
    smashPower: 78,
    wristSnap: 65,
    footwork: 71,
    serveAccuracy: 55,
  },
}

export const RECENT_SESSIONS = [
  { id: "1", date: "Today", maxSpeed: 287, strokes: 8, duration: "28 min" },
  { id: "2", date: "Yesterday", maxSpeed: 264, strokes: 12, duration: "35 min" },
  { id: "3", date: "2 days ago", maxSpeed: 251, strokes: 6, duration: "18 min" },
]

export const WEEKLY_SPEEDS = [
  { day: "Mon", speed: 245 },
  { day: "Tue", speed: 251 },
  { day: "Wed", speed: 264 },
  { day: "Thu", speed: 238 },
  { day: "Fri", speed: 287 },
  { day: "Sat", speed: 271 },
  { day: "Sun", speed: 256 },
]
