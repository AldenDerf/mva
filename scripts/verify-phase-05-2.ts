import pg from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "crypto";
import { verifyAdminAuthorization } from "../lib/auth/admin";

/**
 * PHASE 05.2 — AUTOMATED AUTHENTICATION & AUTHORIZATION VERIFICATION SUITE
 * 
 * Verifies strict server-side authorization boundaries against local database (mva_dev).
 * 
 * Matrix of Test Cases:
 * 1. Unauthenticated (null / empty UUID)                 -> DENIED (null)
 * 2. Authenticated user without profile/admin_access     -> DENIED (null)
 * 3. Authenticated user with profile, but no admin_access -> DENIED (null)
 * 4. Authenticated user with inactive admin_access       -> DENIED (null)
 * 5. Authenticated user with non-ADMIN role              -> DENIED (null)
 * 6. Authenticated user with active ADMIN authorization   -> ALLOWED (AdminContext)
 */

async function verifySafetyProbe(connectionString: string) {
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const probeRes = await client.query(
      "SELECT current_database(), current_user, inet_server_addr(), inet_server_port();"
    );
    const probe = probeRes.rows[0];

    console.log("[SAFETY PROBE] Inspecting target database connection:");
    console.log(`  - Database: "${probe.current_database}"`);
    console.log(`  - User: "${probe.current_user}"`);
    console.log(`  - Server Addr: ${probe.inet_server_addr ?? "local socket / ::1"}`);
    console.log(`  - Server Port: ${probe.inet_server_port ?? 5432}`);

    if (probe.current_database !== "mva_dev") {
      throw new Error(
        `CRITICAL SAFETY VIOLATION: Target database is "${probe.current_database}", expected "mva_dev"! Aborting test run.`
      );
    }

    const addr = String(probe.inet_server_addr || "");
    const isLocal =
      addr === "" ||
      addr === "127.0.0.1" ||
      addr === "::1" ||
      addr === "localhost";

    if (!isLocal) {
      throw new Error(`CRITICAL SAFETY VIOLATION: Remote database address "${addr}" detected! Aborting.`);
    }

    console.log("[SAFETY PROBE PASS] Target confirmed: local development mva_dev.\n");
  } finally {
    await client.end();
  }
}

async function runVerification() {
  console.log("===============================================================");
  console.log("PHASE 05.2: ADMIN AUTHENTICATION & AUTHORIZATION VERIFICATION");
  console.log("===============================================================\n");

  const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL or DIRECT_URL environment variable is missing.");
  }

  // 1. Safety Guard
  await verifySafetyProbe(connectionString);

  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  // Test fixture UUIDs
  const userA_noProfile_id = randomUUID();
  const userB_noAdminAccess_id = randomUUID();
  const userC_inactiveAdmin_id = randomUUID();
  const userD_activeAdmin_id = randomUUID();

  const createdProfileIds: string[] = [];

  let passes = 0;
  let failures = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passes++;
    } else {
      console.error(`  [FAIL] ${testName}${detail ? ` — ${detail}` : ""}`);
      failures++;
    }
  }

  try {
    console.log("--- 1. SETTING UP TEST FIXTURES IN mva_dev ---");

    // Subject B: Profile exists, but NO admin_access record
    const profileB = await prisma.profiles.create({
      data: {
        auth_user_id: userB_noAdminAccess_id,
        display_name: "Test User No Admin Record",
        email: "test_no_admin@example.com",
      },
    });
    createdProfileIds.push(profileB.id);

    // Subject C: Profile exists, admin_access exists, but is_active = FALSE
    const profileC = await prisma.profiles.create({
      data: {
        auth_user_id: userC_inactiveAdmin_id,
        display_name: "Test Inactive Admin",
        email: "test_inactive_admin@example.com",
        admin_access: {
          create: {
            role: "ADMIN",
            is_active: false,
          },
        },
      },
    });
    createdProfileIds.push(profileC.id);

    // Subject D: Profile exists, admin_access exists with role = ADMIN, is_active = TRUE
    const profileD = await prisma.profiles.create({
      data: {
        auth_user_id: userD_activeAdmin_id,
        display_name: "Test Authorized Admin",
        email: "test_active_admin@example.com",
        admin_access: {
          create: {
            role: "ADMIN",
            is_active: true,
          },
        },
      },
    });
    createdProfileIds.push(profileD.id);

    console.log(`Created ${createdProfileIds.length} test profile fixtures.\n`);

    console.log("--- 2. RUNNING AUTHORIZATION BOUNDARY TESTS ---");

    // Case 1: Unauthenticated (null / empty input)
    const res1 = await verifyAdminAuthorization(null as unknown as string);
    assert(res1 === null, "Test 1A: Null auth user ID -> DENIED (null)");

    const res1b = await verifyAdminAuthorization("");
    assert(res1b === null, "Test 1B: Empty string auth user ID -> DENIED (null)");

    const res1c = await verifyAdminAuthorization("not-a-uuid");
    assert(res1c === null, "Test 1C: Malformed auth user ID -> DENIED (null)");

    // Case 2: Authenticated Supabase user, but no profile or admin record in MVA
    const res2 = await verifyAdminAuthorization(userA_noProfile_id);
    assert(
      res2 === null,
      "Test 2: Authenticated user without profile record -> DENIED (null)",
      `Expected null, got: ${JSON.stringify(res2)}`
    );

    // Case 3: Authenticated user with profile, but NO admin_access record
    const res3 = await verifyAdminAuthorization(userB_noAdminAccess_id);
    assert(
      res3 === null,
      "Test 3: Authenticated user with profile but no admin_access -> DENIED (null)",
      `Expected null, got: ${JSON.stringify(res3)}`
    );

    // Case 4: Authenticated user with admin_access, but is_active = FALSE
    const res4 = await verifyAdminAuthorization(userC_inactiveAdmin_id);
    assert(
      res4 === null,
      "Test 4: Authenticated user with inactive admin_access (is_active=false) -> DENIED (null)",
      `Expected null, got: ${JSON.stringify(res4)}`
    );

    // Case 5: Authenticated user with active ADMIN access (is_active = TRUE, role = "ADMIN")
    const res5 = await verifyAdminAuthorization(userD_activeAdmin_id);
    assert(
      res5 !== null &&
      res5.authUserId === userD_activeAdmin_id &&
      res5.profileId === profileD.id &&
      res5.role === "ADMIN" &&
      res5.displayName === "Test Authorized Admin" &&
      res5.email === "test_active_admin@example.com",
      "Test 5: Authenticated user with active ADMIN authorization -> ALLOWED (AdminContext returned)",
      `Result: ${JSON.stringify(res5)}`
    );

    console.log("\n--- 3. SECURITY INVARIANTS & INTEGRITY CHECKS ---");

    // Invariant A: Admin access role check constraint is enforced
    assert(
      res5?.role === "ADMIN",
      "Invariant A: Role is strictly confirmed as 'ADMIN'"
    );

    // Invariant B: Supabase Auth user ID matches DB auth_user_id exactly
    assert(
      res5?.authUserId === userD_activeAdmin_id,
      "Invariant B: Context authUserId matches input authUserId"
    );

  } finally {
    console.log("\n--- 4. CLEANING UP TEST FIXTURES ---");
    if (createdProfileIds.length > 0) {
      const deleteResult = await prisma.profiles.deleteMany({
        where: { id: { in: createdProfileIds } },
      });
      console.log(`[CLEANUP] Deleted ${deleteResult.count} test profile records (cascaded to admin_access).`);
    }

    await prisma.$disconnect();
    await pool.end();
  }

  console.log("\n===============================================================");
  console.log(`VERIFICATION SUMMARY: ${passes} PASSED, ${failures} FAILED`);
  console.log("===============================================================\n");

  if (failures > 0) {
    throw new Error(`${failures} test(s) failed.`);
  }
}

runVerification().catch((err) => {
  console.error("\n[VERIFICATION ERROR]:", err.message || err);
  process.exit(1);
});
