import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // v2 seed does NOT create demo users by default.
  // The first user to sign up at /signup becomes the admin.
  // You can optionally create a default location here if you want.
  const locationCount = await prisma.location.count();
  if (locationCount === 0) {
    await prisma.location.create({
      data: { name: "Main Location", timezone: "America/New_York" },
    });
    console.log("Created default 'Main Location'. Edit it in Settings → Locations.");
  }
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
