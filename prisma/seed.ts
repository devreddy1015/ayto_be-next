import { PrismaClient } from "../generated/prisma-client"

const prisma = new PrismaClient()

async function main() {
  console.log("Seeding pro_benchmarks...")

  const benchmarks = [
    {
      player_name: "Viktor Axelsen",
      sport: "badminton",
      smash_speed_kmh: 419,
      avg_elbow_angle: 165,
      avg_wrist_velocity: 12.4,
      footwork_score: 92,
      serve_speed_kmh: 198,
      drop_accuracy: 88,
      consistency_score: 94,
      country: "Denmark",
    },
    {
      player_name: "Srikanth Kidambi",
      sport: "badminton",
      smash_speed_kmh: 372,
      avg_elbow_angle: 158,
      avg_wrist_velocity: 10.8,
      footwork_score: 85,
      serve_speed_kmh: 182,
      drop_accuracy: 82,
      consistency_score: 87,
      country: "India",
    },
    {
      player_name: "Pusarla V. Sindhu",
      sport: "badminton",
      smash_speed_kmh: 356,
      avg_elbow_angle: 160,
      avg_wrist_velocity: 11.2,
      footwork_score: 88,
      serve_speed_kmh: 175,
      drop_accuracy: 86,
      consistency_score: 90,
      country: "India",
    },
    {
      player_name: "Kento Momota",
      sport: "badminton",
      smash_speed_kmh: 343,
      avg_elbow_angle: 155,
      avg_wrist_velocity: 10.5,
      footwork_score: 90,
      serve_speed_kmh: 170,
      drop_accuracy: 92,
      consistency_score: 91,
      country: "Japan",
    },
    {
      player_name: "Carolina Marin",
      sport: "badminton",
      smash_speed_kmh: 348,
      avg_elbow_angle: 157,
      avg_wrist_velocity: 10.9,
      footwork_score: 86,
      serve_speed_kmh: 168,
      drop_accuracy: 84,
      consistency_score: 89,
      country: "Spain",
    },
  ]

  for (const b of benchmarks) {
    await prisma.proBenchmark.upsert({
      where: {
        id: "00000000-0000-0000-0000-000000000000",
      },
      update: {},
      create: b,
    }).catch(() => {
      // If upsert by non-existent id fails, insert directly
      return prisma.proBenchmark.create({ data: b })
    })
  }

  console.log(`Seeded ${benchmarks.length} pro benchmarks`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
