import { prisma } from "../lib/prisma";

async function run() {
  console.log("=== PHASE 04: LEAGUE CATEGORIES DATA UPDATE ===");

  const leagueId = "7207d95d-ec40-4ac1-80a8-7cf0d2125e09";
  const openCatId = "dfa975ab-4fc4-477a-af57-fb5488e819d8";
  const mahataoCatId = "3fce76bf-c4aa-44ff-b321-948f97de3c73";

  // 1. Confirm and report existing records before execution
  const existingOpenCat = await prisma.league_categories.findUnique({
    where: { id: openCatId },
    include: {
      registrations_registrations_league_category_idToleague_categories: {
        include: { teams: true },
      },
    },
  });

  if (!existingOpenCat) {
    throw new Error(`Expected category "Open" (${openCatId}) not found!`);
  }

  console.log("\n[CONFIRMATION] Reporting affected category and registrations before update:");
  console.log(`- Category ID: ${existingOpenCat.id}`);
  console.log(`- Current Name: "${existingOpenCat.name}"`);
  console.log(`- Target New Name: "Open Conference — Men's Division"`);
  console.log(`- Registrations currently referencing this category (${existingOpenCat.registrations_registrations_league_category_idToleague_categories.length}):`);
  
  for (const reg of existingOpenCat.registrations_registrations_league_category_idToleague_categories) {
    console.log(`  * Registration ID: ${reg.id}`);
    console.log(`    Code: ${reg.registration_code}`);
    console.log(`    Team: "${reg.teams.team_name}"`);
    console.log(`    Status: ${reg.status}`);
    console.log(`    Note: This registration will now be associated with "Open Conference — Men's Division" because the category UUID remains unchanged.`);
  }

  // 2. Perform category rename on existing Open category
  console.log("\n[EXECUTION] Renaming existing Open category to 'Open Conference — Men\'s Division'...");
  await prisma.league_categories.update({
    where: { id: openCatId },
    data: {
      name: "Open Conference — Men's Division",
      description: "Open conference tournament category for men's volleyball teams.",
      updated_at: new Date(),
    },
  });
  console.log("[PASS] Category renamed successfully.");

  // 3. Check if Women's Division already exists to avoid duplicate on re-run
  const existingWomens = await prisma.league_categories.findFirst({
    where: {
      league_id: leagueId,
      name: "Open Conference — Women's Division",
    },
  });

  if (!existingWomens) {
    console.log("[EXECUTION] Inserting new category: 'Open Conference — Women\'s Division'...");
    const createdWomens = await prisma.league_categories.create({
      data: {
        league_id: leagueId,
        name: "Open Conference — Women's Division",
        description: "Open conference tournament category for women's volleyball teams.",
        registration_fee: 300.0,
        min_players: 6,
        max_players: 12,
      },
    });
    console.log(`[PASS] Created Women's Division category with ID: ${createdWomens.id}`);
  } else {
    console.log(`[NOTE] Women's Division category already exists with ID: ${existingWomens.id}`);
  }

  // 4. Verify all 3 categories
  console.log("\n=== POST-UPDATE VERIFICATION ===");
  const allCategories = await prisma.league_categories.findMany({
    where: { league_id: leagueId },
    orderBy: { name: "asc" },
    include: {
      registrations_registrations_league_category_idToleague_categories: {
        include: { teams: true },
      },
    },
  });

  console.log(`Total categories in league: ${allCategories.length}`);
  if (allCategories.length !== 3) {
    throw new Error(`Expected exactly 3 categories, found ${allCategories.length}`);
  }

  for (const cat of allCategories) {
    console.log(`- "${cat.name}" (ID: ${cat.id})`);
    console.log(`  Fee: ₱${cat.registration_fee}, Min: ${cat.min_players}, Max: ${cat.max_players}`);
    console.log(`  Linked registrations: ${cat.registrations_registrations_league_category_idToleague_categories.length}`);
    for (const r of cat.registrations_registrations_league_category_idToleague_categories) {
      console.log(`    * [${r.registration_code}] ${r.teams.team_name} (Status: ${r.status})`);
    }

    if (Number(cat.registration_fee) !== 300) {
      throw new Error(`Category ${cat.name} fee is not 300!`);
    }
    if (cat.min_players !== 6 || cat.max_players !== 12) {
      throw new Error(`Category ${cat.name} min/max is not 6/12!`);
    }
  }

  // 5. Verify registrations specific checks
  const reg1 = await prisma.registrations.findFirst({
    where: { registration_code: "MVA-2026-0001" },
    include: {
      league_categories_registrations_league_category_idToleague_categories: true,
      teams: true,
    },
  });
  if (!reg1 || reg1.league_category_id !== mahataoCatId || reg1.league_categories_registrations_league_category_idToleague_categories.name !== "Mahatao Only") {
    throw new Error(`Registration MVA-2026-0001 does not point to Mahatao Only!`);
  }
  console.log(`[PASS] MVA-2026-0001 verified -> points to "Mahatao Only" (${reg1.teams.team_name})`);

  const reg2 = await prisma.registrations.findFirst({
    where: { registration_code: "MVA-2026-0002" },
    include: {
      league_categories_registrations_league_category_idToleague_categories: true,
      teams: true,
    },
  });
  if (!reg2 || reg2.league_category_id !== openCatId || reg2.league_categories_registrations_league_category_idToleague_categories.name !== "Open Conference — Men's Division") {
    throw new Error(`Registration MVA-2026-0002 does not point to Open Conference — Men's Division!`);
  }
  console.log(`[PASS] MVA-2026-0002 verified -> points to "Open Conference — Men's Division" (${reg2.teams.team_name}) with same UUID (${openCatId})`);

  console.log("\n=== ALL DATA CHECKS PASSED ===");
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
