import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding ClipForge AI...");

  const email = "demo@clipforge.ai";
  const passwordHash = await bcrypt.hash("Demo1234!", 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Demo Creator",
      password: passwordHash,
      profile: {
        create: {
          niche: "gaming",
          language: "en",
          timezone: "America/New_York",
          bio: "Demo account for ClipForge AI V1",
        },
      },
      nicheSettings: {
        create: {
          niche: "gaming",
          targetDuration: 30,
          captionStyle: "bold",
          captionEnabled: true,
          language: "en",
        },
      },
      integrations: {
        create: [
          { provider: "YOUTUBE", status: "DISCONNECTED" },
          { provider: "INSTAGRAM", status: "DISCONNECTED" },
        ],
      },
    },
  });

  console.log(`✅ Seeded user: ${user.email} (${user.id})`);
  console.log("   Password: Demo1234!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
