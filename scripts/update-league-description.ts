import { prisma } from "../lib/prisma";

async function updateLeagueDescription() {
  console.log("=== Updating League Description ===");

  const leagueId = "7207d95d-ec40-4ac1-80a8-7cf0d2125e09";

  const existingLeague = await prisma.leagues.findUnique({
    where: { id: leagueId },
  });

  if (!existingLeague) {
    throw new Error(`League ${leagueId} not found.`);
  }

  console.log(`[BEFORE] League Name: "${existingLeague.name}"`);
  console.log(`[BEFORE] Current Description: "${existingLeague.description}"`);

  const updatedLeague = await prisma.leagues.update({
    where: { id: leagueId },
    data: {
      description: "Official tournament registration for the 2026 Mahatao Volleyball League.",
      updated_at: new Date(),
    },
  });

  console.log(`\n[AFTER] League Name: "${updatedLeague.name}"`);
  console.log(`[AFTER] Updated Description: "${updatedLeague.description}"`);
  console.log("\n=== League description updated successfully! ===");
}

updateLeagueDescription()
  .catch((err) => {
    console.error("Failed to update league description:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
