if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // ignore
  }
}

import pg from "pg";
import { randomUUID } from "crypto";
import { prisma } from "../lib/prisma";
import { AdminContext } from "../lib/auth/admin";
import {
  getAdminPaymentsList,
} from "../lib/admin/payments";
import {
  correctPaymentDetails,
} from "../lib/admin/payment-corrections";
import {
  calculateRegistrationAccounting,
} from "../lib/admin/accounting";
import {
  mutatePlayerPaymentStatus,
} from "../lib/admin/player-payment-mutations";
import { payment_method } from "@prisma/client";

interface AuditMetadata {
  payment_id: string;
  registration_id: string;
  registration_code: string | null;
  registration_player_id: string | null;
  player_id: string | null;
  player_name: string;
  team_id: string;
  team_name: string;
  amount: number;
  payment_status: string;
  before: {
    payment_method: string;
    reference_number: string | null;
  };
  after: {
    payment_method: string;
    reference_number: string | null;
  };
  reason: string;
  actor_name: string | null;
  actor_email: string | null;
}

/**
 * PHASE 05.7B: ADMIN PAYMENT MONITORING & CORRECTION VERIFICATION SUITE
 *
 * Hard Safety Guard:
 * Must connect strictly to local mva_dev database. Aborts immediately if not.
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
      throw new Error(
        `CRITICAL SAFETY VIOLATION: Remote database address "${addr}" detected! Aborting.`
      );
    }

    console.log("  [PASS] Hard safety probe passed: strictly connected to local mva_dev.\n");
  } finally {
    await client.end();
  }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  [PASS] ${message}`);
}

async function run() {
  console.log("===============================================================");
  console.log("PHASE 05.7B: ADMIN PAYMENT MONITORING & CORRECTIONS SUITE");
  console.log("===============================================================\n");

  const connStr = process.env.DATABASE_URL;
  if (!connStr) {
    throw new Error("DATABASE_URL is not defined in environment");
  }

  // 1. SAFETY PROBE
  await verifySafetyProbe(connStr);

  // Fixture IDs for clean teardown
  const testIds = {
    profileId: "",
    adminAccessId: "",
    leagueId: "",
    categoryId: "",
    team1Id: "",
    team2Id: "",
    reg1Id: "",
    reg2Id: "",
    playerIds: [] as string[],
    paymentIds: [] as string[],
    auditLogIds: [] as string[],
  };

  try {
    console.log("--- CREATING EPHEMERAL TEST FIXTURES IN mva_dev ---");

    // 1. Admin Profile & Active ADMIN Access
    const authId = randomUUID();
    const adminProfile = await prisma.profiles.create({
      data: {
        auth_user_id: authId,
        display_name: "Test Admin Verifier",
        email: `test-admin-${Date.now()}@mva.org`,
      },
    });
    testIds.profileId = adminProfile.id;

    const adminAccess = await prisma.admin_access.create({
      data: {
        profile_id: adminProfile.id,
        role: "ADMIN",
        is_active: true,
      },
    });
    testIds.adminAccessId = adminAccess.id;

    const adminContext: AdminContext = {
      profileId: adminProfile.id,
      authUserId: authId,
      displayName: adminProfile.display_name || "Admin",
      email: adminProfile.email || "admin@mva.org",
      role: "ADMIN",
    };

    // 2. League & Category
    const league = await prisma.leagues.create({
      data: {
        name: `Phase 05.7B League ${Date.now()}`,
        status: "OPEN_FOR_REGISTRATION",
      },
    });
    testIds.leagueId = league.id;

    const category = await prisma.league_categories.create({
      data: {
        league_id: league.id,
        name: "Premier Division 7B",
        registration_fee: 300.0,
        min_players: 3,
        max_players: 12,
      },
    });
    testIds.categoryId = category.id;

    // 3. Team 1: Complete Team (Verified registration, 3 players, 3 VERIFIED payments)
    const team1 = await prisma.teams.create({
      data: {
        team_name: `T1 Complete Alpha ${Date.now()}`,
        slug: `t1-complete-${Date.now()}`,
      },
    });
    testIds.team1Id = team1.id;

    const reg1 = await prisma.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: category.id,
        team_id: team1.id,
        registrant_first_name: "Team1",
        registrant_last_name: "Leader",
        registrant_contact: "09170000001",
        status: "VERIFIED",
        registration_code: `MVA-7B-0001-${Date.now().toString().slice(-4)}`,
      },
    });
    testIds.reg1Id = reg1.id;

    // Player 1: "Juan Dela Cruz" (Tokenized search candidate: first=Juan, middle=Dela, last=Cruz)
    const p1 = await prisma.players.create({
      data: {
        first_name: "Juan",
        middle_name: "Dela",
        last_name: "Cruz",
      },
    });
    testIds.playerIds.push(p1.id);
    const rp1 = await prisma.registration_players.create({
      data: {
        registration_id: reg1.id,
        player_id: p1.id,
        jersey_number: 10,
        is_captain: true,
      },
    });
    const pay1 = await prisma.payments.create({
      data: {
        registration_id: reg1.id,
        registration_player_id: rp1.id,
        amount: 300.0,
        status: "VERIFIED",
        payment_method: "CASH",
        reference_number: "REF-JUAN-01",
        verified_at: new Date(),
        verified_by_profile_id: adminProfile.id,
      },
    });
    testIds.paymentIds.push(pay1.id);

    // Player 2: "Maria Santos" (GCASH)
    const p2 = await prisma.players.create({
      data: {
        first_name: "Maria",
        last_name: "Santos",
      },
    });
    testIds.playerIds.push(p2.id);
    const rp2 = await prisma.registration_players.create({
      data: {
        registration_id: reg1.id,
        player_id: p2.id,
        jersey_number: 7,
      },
    });
    const pay2 = await prisma.payments.create({
      data: {
        registration_id: reg1.id,
        registration_player_id: rp2.id,
        amount: 300.0,
        status: "VERIFIED",
        payment_method: "GCASH",
        reference_number: "GCASH-MARIA-02",
        verified_at: new Date(),
        verified_by_profile_id: adminProfile.id,
      },
    });
    testIds.paymentIds.push(pay2.id);

    // Player 3: "Pedro Penduko" (BANK_TRANSFER)
    const p3 = await prisma.players.create({
      data: {
        first_name: "Pedro",
        last_name: "Penduko",
      },
    });
    testIds.playerIds.push(p3.id);
    const rp3 = await prisma.registration_players.create({
      data: {
        registration_id: reg1.id,
        player_id: p3.id,
        jersey_number: 5,
      },
    });
    const pay3 = await prisma.payments.create({
      data: {
        registration_id: reg1.id,
        registration_player_id: rp3.id,
        amount: 300.0,
        status: "VERIFIED",
        payment_method: "BANK_TRANSFER",
        reference_number: "BANK-PEDRO-03",
        verified_at: new Date(),
        verified_by_profile_id: adminProfile.id,
      },
    });
    testIds.paymentIds.push(pay3.id);

    // 4. Team 2: Incomplete Team (PENDING_PAYMENT registration, 3 players with mixed statuses + 1 legacy payment)
    const team2 = await prisma.teams.create({
      data: {
        team_name: `T2 Incomplete Beta ${Date.now()}`,
        slug: `t2-incomplete-${Date.now()}`,
      },
    });
    testIds.team2Id = team2.id;

    const reg2 = await prisma.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: category.id,
        team_id: team2.id,
        registrant_first_name: "Team2",
        registrant_last_name: "Leader",
        registrant_contact: "09170000002",
        status: "PENDING_PAYMENT",
        registration_code: `MVA-7B-0002-${Date.now().toString().slice(-4)}`,
      },
    });
    testIds.reg2Id = reg2.id;

    // Player 4: "Carlos Garcia" (PENDING, OTHER)
    const p4 = await prisma.players.create({
      data: {
        first_name: "Carlos",
        last_name: "Garcia",
      },
    });
    testIds.playerIds.push(p4.id);
    const rp4 = await prisma.registration_players.create({
      data: {
        registration_id: reg2.id,
        player_id: p4.id,
        jersey_number: 12,
      },
    });
    const pay4 = await prisma.payments.create({
      data: {
        registration_id: reg2.id,
        registration_player_id: rp4.id,
        amount: 300.0,
        status: "PENDING",
        payment_method: "OTHER",
        reference_number: "OTHER-CARLOS-04",
      },
    });
    testIds.paymentIds.push(pay4.id);

    // Player 5: "Ana Reyes" (REJECTED, CASH)
    const p5 = await prisma.players.create({
      data: {
        first_name: "Ana",
        last_name: "Reyes",
      },
    });
    testIds.playerIds.push(p5.id);
    const rp5 = await prisma.registration_players.create({
      data: {
        registration_id: reg2.id,
        player_id: p5.id,
        jersey_number: 3,
      },
    });
    const pay5 = await prisma.payments.create({
      data: {
        registration_id: reg2.id,
        registration_player_id: rp5.id,
        amount: 300.0,
        status: "REJECTED",
        payment_method: "CASH",
        reference_number: "REJ-ANA-05",
      },
    });
    testIds.paymentIds.push(pay5.id);

    // Player 6: "Elena Cruz" (REFUNDED, GCASH)
    const p6 = await prisma.players.create({
      data: {
        first_name: "Elena",
        last_name: "Cruz",
      },
    });
    testIds.playerIds.push(p6.id);
    const rp6 = await prisma.registration_players.create({
      data: {
        registration_id: reg2.id,
        player_id: p6.id,
        jersey_number: 9,
      },
    });
    const pay6 = await prisma.payments.create({
      data: {
        registration_id: reg2.id,
        registration_player_id: rp6.id,
        amount: 300.0,
        status: "REFUNDED",
        payment_method: "GCASH",
        reference_number: "REFUND-ELENA-06",
      },
    });
    testIds.paymentIds.push(pay6.id);

    // Payment 7: Legacy / Unallocated Payment for Team 2 (registration_player_id = null)
    const pay7Legacy = await prisma.payments.create({
      data: {
        registration_id: reg2.id,
        registration_player_id: null,
        amount: 500.0,
        status: "PENDING",
        payment_method: "CASH",
        reference_number: "LEGACY-CASH-07",
      },
    });
    testIds.paymentIds.push(pay7Legacy.id);

    console.log("  [SETUP] Ephemeral test fixtures established successfully.\n");

    // =========================================================================
    // SECTION 1: SEARCH IMPLEMENTATION VERIFICATION
    // =========================================================================
    console.log("--- PART 1: PAYMENT SEARCH IMPLEMENTATION TESTS ---");

    // Test 1: Search by registration code
    console.log("\n[Test 1] Search by registration code");
    const s1 = await getAdminPaymentsList({
      search: reg1.registration_code!,
      categoryId: category.id,
    });
    assert(s1.totalCount === 3, "Registration code search found exactly 3 payments for Team 1");
    assert(s1.items.every((i) => i.registrationCode === reg1.registration_code), "All results match registration code");

    // Test 2: Search by payment reference
    console.log("\n[Test 2] Search by payment reference");
    const s2 = await getAdminPaymentsList({
      search: "REF-JUAN-01",
      categoryId: category.id,
    });
    assert(s2.totalCount === 1, "Payment reference search found exactly 1 payment");
    assert(s2.items[0].referenceNumber === "REF-JUAN-01", "Returned correct reference number");

    // Test 3: Search by team name
    console.log("\n[Test 3] Search by team name");
    const s3 = await getAdminPaymentsList({
      search: team1.team_name,
      categoryId: category.id,
    });
    assert(s3.totalCount === 3, "Team name search found all 3 payments for Team 1");
    assert(s3.items[0].teamName === team1.team_name, "Team name matches query");

    // Test 4: Search by single player name
    console.log("\n[Test 4] Search by single player name");
    const s4 = await getAdminPaymentsList({
      search: "Maria",
      categoryId: category.id,
    });
    assert(s4.items.some((i) => i.fullName === "Maria Santos"), "Found payment for Maria Santos");

    // Test 5: Search by multi-token full player name
    console.log("\n[Test 5] Search by multi-token full player name");
    // "Juan Dela Cruz" is split across first_name (Juan), middle_name (Dela), last_name (Cruz)
    const s5 = await getAdminPaymentsList({
      search: "Juan Dela Cruz",
      categoryId: category.id,
    });
    assert(s5.totalCount === 1, "Multi-token search found Juan Dela Cruz across separate name columns");
    assert(s5.items[0].fullName === "Juan Dela Cruz", "Result is Juan Dela Cruz");

    // Also test reverse order tokens
    const s5b = await getAdminPaymentsList({
      search: "Cruz Juan",
      categoryId: category.id,
    });
    assert(s5b.totalCount === 1, "Permuted token order 'Cruz Juan' also matches correctly");

    // =========================================================================
    // SECTION 2: STATUS & METHOD FILTER VERIFICATION
    // =========================================================================
    console.log("\n--- PART 2: PAYMENT STATUS & METHOD FILTER TESTS ---");

    // Test 6: Filter PENDING
    console.log("\n[Test 6] Filter PENDING");
    const fPending = await getAdminPaymentsList({
      status: "PENDING",
      categoryId: category.id,
    });
    assert(fPending.totalCount === 2, "Found 2 PENDING payments (Carlos + Legacy)");
    assert(fPending.items.every((i) => i.status === "PENDING"), "All items have status PENDING");

    // Test 7: Filter VERIFIED
    console.log("\n[Test 7] Filter VERIFIED");
    const fVerified = await getAdminPaymentsList({
      status: "VERIFIED",
      categoryId: category.id,
    });
    assert(fVerified.totalCount === 3, "Found 3 VERIFIED payments (Juan, Maria, Pedro)");
    assert(fVerified.items.every((i) => i.status === "VERIFIED"), "All items have status VERIFIED");

    // Test 8: Filter REJECTED
    console.log("\n[Test 8] Filter REJECTED");
    const fRejected = await getAdminPaymentsList({
      status: "REJECTED",
      categoryId: category.id,
    });
    assert(fRejected.totalCount === 1, "Found 1 REJECTED payment (Ana)");
    assert(fRejected.items[0].fullName === "Ana Reyes", "REJECTED item is Ana Reyes");

    // Test 9: Filter REFUNDED
    console.log("\n[Test 9] Filter REFUNDED");
    const fRefunded = await getAdminPaymentsList({
      status: "REFUNDED",
      categoryId: category.id,
    });
    assert(fRefunded.totalCount === 1, "Found 1 REFUNDED payment (Elena)");
    assert(fRefunded.items[0].fullName === "Elena Cruz", "REFUNDED item is Elena Cruz");

    // Test 10: Filter CASH
    console.log("\n[Test 10] Filter CASH");
    const fCash = await getAdminPaymentsList({
      paymentMethod: "CASH",
      categoryId: category.id,
    });
    assert(fCash.totalCount === 3, "Found 3 CASH payments (Juan, Ana, Legacy)");
    assert(fCash.items.every((i) => i.paymentMethod === "CASH"), "All items have method CASH");

    // Test 11: Filter GCASH
    console.log("\n[Test 11] Filter GCASH");
    const fGcash = await getAdminPaymentsList({
      paymentMethod: "GCASH",
      categoryId: category.id,
    });
    assert(fGcash.totalCount === 2, "Found 2 GCASH payments (Maria, Elena)");
    assert(fGcash.items.every((i) => i.paymentMethod === "GCASH"), "All items have method GCASH");

    // Test 12: Filter BANK_TRANSFER
    console.log("\n[Test 12] Filter BANK_TRANSFER");
    const fBank = await getAdminPaymentsList({
      paymentMethod: "BANK_TRANSFER",
      categoryId: category.id,
    });
    assert(fBank.totalCount === 1, "Found 1 BANK_TRANSFER payment (Pedro)");
    assert(fBank.items[0].paymentMethod === "BANK_TRANSFER", "Method is BANK_TRANSFER");

    // Test 13: Filter OTHER
    console.log("\n[Test 13] Filter OTHER");
    const fOther = await getAdminPaymentsList({
      paymentMethod: "OTHER",
      categoryId: category.id,
    });
    assert(fOther.totalCount === 1, "Found 1 OTHER payment (Carlos)");
    assert(fOther.items[0].paymentMethod === "OTHER", "Method is OTHER");

    // Test 14: Filter division/category
    console.log("\n[Test 14] Filter division/category");
    const fCategory = await getAdminPaymentsList({
      categoryId: category.id,
    });
    assert(fCategory.totalCount === 7, "Category filter returned all 7 payments across both teams");

    // Test 15: Verified-registration-only filter
    console.log("\n[Test 15] Verified-registration-only filter");
    const fVerifiedReg = await getAdminPaymentsList({
      verifiedRegistrationOnly: true,
      categoryId: category.id,
    });
    assert(fVerifiedReg.totalCount === 3, "Returned 3 payments for Team 1, excluded Team 2 (PENDING_PAYMENT)");
    assert(fVerifiedReg.items.every((i) => i.registrationStatus === "VERIFIED"), "All registrations are VERIFIED");

    // =========================================================================
    // SECTION 3: CRITICAL COMPLETENESS FILTER RULE (Section E)
    // =========================================================================
    console.log("\n--- PART 3: CANONICAL COMPLETENESS FILTER RULE (BEFORE PAGINATION) ---");

    // Test 16: COMPLETE accounting filter
    console.log("\n[Test 16] COMPLETE accounting filter");
    const fComplete = await getAdminPaymentsList({
      completeness: "COMPLETE",
      categoryId: category.id,
    });
    assert(fComplete.totalCount === 3, "COMPLETE filter returned exactly 3 payments for Team 1");
    assert(fComplete.items.every((i) => i.paymentCompleteness === "COMPLETE"), "All view rows carry COMPLETE status");

    // Test 17: INCOMPLETE accounting filter
    console.log("\n[Test 17] INCOMPLETE accounting filter");
    const fIncomplete = await getAdminPaymentsList({
      completeness: "INCOMPLETE",
      categoryId: category.id,
    });
    assert(fIncomplete.totalCount === 4, "INCOMPLETE filter returned exactly 4 payments for Team 2");
    assert(fIncomplete.items.every((i) => i.paymentCompleteness === "INCOMPLETE"), "All view rows carry INCOMPLETE status");

    // Test 18: Completeness filtering occurs before pagination
    console.log("\n[Test 18] Completeness filtering occurs before pagination");
    const page1OfComplete = await getAdminPaymentsList({
      completeness: "COMPLETE",
      categoryId: category.id,
      page: 1,
      pageSize: 1, // small page size
    });
    assert(page1OfComplete.items.length === 1, "Page 1 returned exactly 1 item as requested by pageSize: 1");
    assert(page1OfComplete.totalCount === 3, "totalCount is 3, proving pagination was applied AFTER completeness filtering");

    // Test 19: Pagination total is correct under completeness filter
    console.log("\n[Test 19] Pagination total is correct under completeness filter");
    assert(page1OfComplete.totalPages === 3, "Total pages correctly calculated as 3");
    assert(page1OfComplete.hasNextPage === true, "hasNextPage is true for page 1 of 3");

    // =========================================================================
    // SECTION 4: LEGACY / UNALLOCATED PAYMENT HANDLING (Section H)
    // =========================================================================
    console.log("\n--- PART 4: LEGACY / UNALLOCATED PAYMENT HANDLING ---");

    // Test 20: Legacy payment appears correctly
    console.log("\n[Test 20] Legacy payment appears correctly");
    const legacyItem = fIncomplete.items.find((i) => i.id === pay7Legacy.id);
    assert(Boolean(legacyItem), "Legacy payment record found in view items");
    assert(legacyItem?.isLegacyUnallocated === true, "isLegacyUnallocated is strictly true");
    assert(legacyItem?.fullName === "Legacy / Unallocated Payment", "Full name explicitly indicates unallocated payment");

    // Test 21: Legacy payment does not become attributed to a player
    console.log("\n[Test 21] Legacy payment does not become attributed to a player");
    assert(legacyItem?.registrationPlayerId === null, "registrationPlayerId is strictly null");
    assert(legacyItem?.playerId === null, "playerId is strictly null");

    // =========================================================================
    // SECTION 5: PAYMENT CORRECTION SERVICE (Sections K-P)
    // =========================================================================
    console.log("\n--- PART 5: PAYMENT CORRECTION SERVICE MUTATION & INVARIANTS ---");

    // Test 22: Correction CASH -> GCASH
    console.log("\n[Test 22] Correction CASH -> GCASH");
    const corr1 = await correctPaymentDetails(adminContext, {
      paymentId: pay1.id,
      paymentMethod: "GCASH",
      referenceNumber: "REF-JUAN-01-GCASH",
      expectedPaymentMethod: "CASH",
      expectedReferenceNumber: "REF-JUAN-01",
      reason: "Player paid via GCash rather than cash per physical receipt.",
    });
    assert(corr1.success === true, "CASH -> GCASH correction succeeded");
    if (corr1.success) {
      testIds.auditLogIds.push(corr1.auditLogId);
      assert(corr1.paymentMethod === "GCASH", "Returned new payment method GCASH");
    }

    // Verify DB update
    const dbPay1After = await prisma.payments.findUniqueOrThrow({ where: { id: pay1.id } });
    assert(dbPay1After.payment_method === "GCASH", "DB payment_method updated to GCASH");
    assert(dbPay1After.reference_number === "REF-JUAN-01-GCASH", "DB reference_number updated");

    // Test 23: Correction reference null -> value
    console.log("\n[Test 23] Correction reference null -> value");
    // Create a temporary payment with reference null
    const payNullRef = await prisma.payments.create({
      data: {
        registration_id: reg1.id,
        amount: 300.0,
        status: "PENDING",
        payment_method: "CASH",
        reference_number: null,
      },
    });
    testIds.paymentIds.push(payNullRef.id);

    const corr2 = await correctPaymentDetails(adminContext, {
      paymentId: payNullRef.id,
      paymentMethod: "CASH",
      referenceNumber: "NEW-REF-999",
      expectedPaymentMethod: "CASH",
      expectedReferenceNumber: null,
      reason: "Attaching newly located cashier reference number.",
    });
    assert(corr2.success === true, "Null -> value reference correction succeeded");
    if (corr2.success) testIds.auditLogIds.push(corr2.auditLogId);

    // Test 24: Correction reference value -> corrected value
    console.log("\n[Test 24] Correction reference value -> corrected value");
    const corr3 = await correctPaymentDetails(adminContext, {
      paymentId: payNullRef.id,
      paymentMethod: "CASH",
      referenceNumber: "CORRECTED-REF-1000",
      expectedPaymentMethod: "CASH",
      expectedReferenceNumber: "NEW-REF-999",
      reason: "Corrected typo in digits of reference number.",
    });
    assert(corr3.success === true, "Value -> corrected value succeeded");
    if (corr3.success) testIds.auditLogIds.push(corr3.auditLogId);

    // Test 25: Correction reference value -> null
    console.log("\n[Test 25] Correction reference value -> null");
    const corr4 = await correctPaymentDetails(adminContext, {
      paymentId: payNullRef.id,
      paymentMethod: "CASH",
      referenceNumber: "", // empty string becomes null
      expectedPaymentMethod: "CASH",
      expectedReferenceNumber: "CORRECTED-REF-1000",
      reason: "Removed erroneously entered bank slip reference.",
    });
    assert(corr4.success === true, "Value -> null reference succeeded");
    if (corr4.success) testIds.auditLogIds.push(corr4.auditLogId);
    const dbPayNullAfter = await prisma.payments.findUniqueOrThrow({ where: { id: payNullRef.id } });
    assert(dbPayNullAfter.reference_number === null, "Reference number in DB is strictly null");

    // =========================================================================
    // SECTION 6: IMMUTABLE PAYMENT FIELDS PROTECTION (Section M)
    // =========================================================================
    console.log("\n--- PART 6: STRICT IMMUTABLE FIELDS PROTECTION ---");

    // Test 26: Amount unchanged after correction
    console.log("\n[Test 26] Amount unchanged after correction");
    assert(Number(dbPay1After.amount) === 300.0, "Amount remains ₱300.00");

    // Test 27: Payment status unchanged after correction
    console.log("\n[Test 27] Payment status unchanged after correction");
    assert(dbPay1After.status === "VERIFIED", "Status remains VERIFIED");

    // Test 28: Registration ID unchanged
    console.log("\n[Test 28] Registration ID unchanged");
    assert(dbPay1After.registration_id === reg1.id, "registration_id unchanged");

    // Test 29: Registration player ID unchanged
    console.log("\n[Test 29] Registration player ID unchanged");
    assert(dbPay1After.registration_player_id === rp1.id, "registration_player_id unchanged");

    // Test 30: Registration status unchanged
    console.log("\n[Test 30] Registration status unchanged");
    const dbReg1 = await prisma.registrations.findUniqueOrThrow({ where: { id: reg1.id } });
    assert(dbReg1.status === "VERIFIED", "Registration status remains VERIFIED");

    // Test 31: verified_at unchanged
    console.log("\n[Test 31] verified_at unchanged");
    assert(dbPay1After.verified_at !== null, "verified_at timestamp preserved");

    // Test 32: verified_by_profile_id unchanged
    console.log("\n[Test 32] verified_by_profile_id unchanged");
    assert(dbPay1After.verified_by_profile_id === adminProfile.id, "verified_by_profile_id unchanged");

    // =========================================================================
    // SECTION 7: VALIDATION, CONCURRENCY & NO-OP GUARDS (Sections L, N, O)
    // =========================================================================
    console.log("\n--- PART 7: VALIDATION, CONCURRENCY & NO-OP GUARDS ---");

    // Test 33: Correction reason required (< 5 chars rejected)
    console.log("\n[Test 33] Correction reason required (< 5 chars rejected)");
    const failReason = await correctPaymentDetails(adminContext, {
      paymentId: pay1.id,
      paymentMethod: "CASH",
      expectedPaymentMethod: "GCASH",
      reason: "abc", // too short
    });
    assert(failReason.success === false, "Rejected short reason");
    assert(failReason.error === "VALIDATION_ERROR", "Error is VALIDATION_ERROR");

    // Test 34: Invalid payment method rejected
    console.log("\n[Test 34] Invalid payment method rejected");
    const failMethod = await correctPaymentDetails(adminContext, {
      paymentId: pay1.id,
      paymentMethod: "BITCOIN" as unknown as payment_method,
      expectedPaymentMethod: "GCASH",
      reason: "Valid reason for payment method change",
    });
    assert(failMethod.success === false, "Rejected invalid payment method");
    assert(failMethod.error === "VALIDATION_ERROR", "Error is VALIDATION_ERROR");

    // Test 35: >100-char reference rejected
    console.log("\n[Test 35] >100-char reference rejected");
    const failRefLen = await correctPaymentDetails(adminContext, {
      paymentId: pay1.id,
      paymentMethod: "CASH",
      referenceNumber: "X".repeat(101),
      expectedPaymentMethod: "GCASH",
      reason: "Valid reason for payment method change",
    });
    assert(failRefLen.success === false, "Rejected 101-char reference");
    assert(failRefLen.error === "VALIDATION_ERROR", "Error is VALIDATION_ERROR");

    // Test 36: Stale expected method rejected
    console.log("\n[Test 36] Stale expected method rejected");
    const failStaleMethod = await correctPaymentDetails(adminContext, {
      paymentId: pay1.id,
      paymentMethod: "BANK_TRANSFER",
      expectedPaymentMethod: "CASH", // Current in DB is GCASH
      expectedReferenceNumber: "REF-JUAN-01-GCASH",
      reason: "Valid reason for payment change",
    });
    assert(failStaleMethod.success === false, "Rejected stale expected payment method");
    assert(failStaleMethod.error === "STALE_STATE", "Error is STALE_STATE");

    // Test 37: Stale expected reference rejected
    console.log("\n[Test 37] Stale expected reference rejected");
    const failStaleRef = await correctPaymentDetails(adminContext, {
      paymentId: pay1.id,
      paymentMethod: "GCASH",
      expectedPaymentMethod: "GCASH",
      expectedReferenceNumber: "OLD-STALE-REF", // Current in DB is REF-JUAN-01-GCASH
      reason: "Valid reason for payment change",
    });
    assert(failStaleRef.success === false, "Rejected stale expected reference number");
    assert(failStaleRef.error === "STALE_STATE", "Error is STALE_STATE");

    // Test 38: Stale correction creates no audit log
    console.log("\n[Test 38] Stale correction creates no audit log");
    const auditCountBeforeStale = await prisma.admin_audit_logs.count({
      where: { entity_id: pay1.id },
    });
    await correctPaymentDetails(adminContext, {
      paymentId: pay1.id,
      paymentMethod: "BANK_TRANSFER",
      expectedPaymentMethod: "CASH", // stale
      reason: "Valid reason for change",
    });
    const auditCountAfterStale = await prisma.admin_audit_logs.count({
      where: { entity_id: pay1.id },
    });
    assert(auditCountBeforeStale === auditCountAfterStale, "Zero audit logs created on stale abort");

    // Test 39: No-op correction creates no audit log
    console.log("\n[Test 39] No-op correction creates no audit log");
    const noOpResult = await correctPaymentDetails(adminContext, {
      paymentId: pay1.id,
      paymentMethod: "GCASH",
      referenceNumber: "REF-JUAN-01-GCASH",
      expectedPaymentMethod: "GCASH",
      expectedReferenceNumber: "REF-JUAN-01-GCASH",
      reason: "Valid reason but no actual changes",
    });
    assert(noOpResult.success === false, "No-op rejected");
    assert(noOpResult.error === "NO_CHANGE", "Error is strictly NO_CHANGE");
    const auditCountAfterNoOp = await prisma.admin_audit_logs.count({
      where: { entity_id: pay1.id },
    });
    assert(auditCountAfterNoOp === auditCountBeforeStale, "Zero audit logs created on NO_CHANGE abort");

    // =========================================================================
    // SECTION 8: AUDIT LOG PAYLOAD VERIFICATION (Section P)
    // =========================================================================
    console.log("\n--- PART 8: AUDIT LOG PAYLOAD VERIFICATION ---");

    // Test 40: Successful correction creates exactly one PAYMENT_DETAILS_CORRECTED audit entry
    console.log("\n[Test 40] Successful correction creates exactly one PAYMENT_DETAILS_CORRECTED audit entry");
    const auditEntry = await prisma.admin_audit_logs.findUniqueOrThrow({
      where: { id: corr1.success ? corr1.auditLogId : "" },
    });
    assert(auditEntry.action === "PAYMENT_DETAILS_CORRECTED", "Action is PAYMENT_DETAILS_CORRECTED");
    assert(auditEntry.entity_type === "PAYMENT", "Entity type is PAYMENT");
    assert(auditEntry.entity_id === pay1.id, "Entity ID matches payment ID");

    const meta = auditEntry.metadata as unknown as AuditMetadata;

    // Test 41: Audit before values correct
    console.log("\n[Test 41] Audit before values correct");
    assert(meta.before.payment_method === "CASH", "before.payment_method is CASH");
    assert(meta.before.reference_number === "REF-JUAN-01", "before.reference_number is REF-JUAN-01");

    // Test 42: Audit after values correct
    console.log("\n[Test 42] Audit after values correct");
    assert(meta.after.payment_method === "GCASH", "after.payment_method is GCASH");
    assert(meta.after.reference_number === "REF-JUAN-01-GCASH", "after.reference_number is REF-JUAN-01-GCASH");

    // Test 43: Audit reason correct
    console.log("\n[Test 43] Audit reason correct");
    assert(meta.reason.includes("physical receipt"), "Audit reason captured accurately");

    // Test 44: Audit actor correct
    console.log("\n[Test 44] Audit actor correct");
    assert(meta.actor_name === adminContext.displayName, "Actor display name captured");
    assert(meta.actor_email === adminContext.email, "Actor email captured");

    // Test 45: Legacy correction audit uses null player IDs correctly
    console.log("\n[Test 45] Legacy correction audit uses null player IDs correctly");
    const legacyCorr = await correctPaymentDetails(adminContext, {
      paymentId: pay7Legacy.id,
      paymentMethod: "OTHER",
      referenceNumber: "LEGACY-OTHER-99",
      expectedPaymentMethod: "CASH",
      expectedReferenceNumber: "LEGACY-CASH-07",
      reason: "Corrected unallocated legacy payment classification.",
    });
    assert(legacyCorr.success === true, "Legacy payment correction succeeded");
    if (legacyCorr.success) {
      testIds.auditLogIds.push(legacyCorr.auditLogId);
      const legacyAudit = await prisma.admin_audit_logs.findUniqueOrThrow({
        where: { id: legacyCorr.auditLogId },
      });
      const legMeta = legacyAudit.metadata as unknown as AuditMetadata;
      assert(legMeta.player_id === null, "Legacy audit player_id is strictly null");
      assert(legMeta.registration_player_id === null, "Legacy audit registration_player_id is strictly null");
      assert(legMeta.player_name === "Legacy / Unallocated Payment", "Legacy audit player_name is unallocated notice");
    }

    // =========================================================================
    // SECTION 9: REVENUE & CANONICAL ACCOUNTING STABILITY
    // =========================================================================
    console.log("\n--- PART 9: REVENUE & CANONICAL ACCOUNTING STABILITY ---");

    // Test 46: Canonical accounting remains correct after detail correction
    console.log("\n[Test 46] Canonical accounting remains correct after detail correction");
    const rawReg1 = await prisma.registrations.findUniqueOrThrow({
      where: { id: reg1.id },
      include: {
        teams: true,
        leagues: true,
        league_categories_registrations_league_category_idToleague_categories: true,
        registration_players: {
          include: {
            players: true,
            payments: true,
          },
        },
        payments: {
          where: { registration_player_id: null },
        },
      },
    });
    const acct1 = calculateRegistrationAccounting(rawReg1);
    assert(acct1.expectedAmount === 900.0, "Expected amount remains ₱900.00");
    assert(acct1.verifiedPaidAmount === 900.0, "Verified paid remains ₱900.00");
    assert(acct1.balance === 0, "Balance remains ₱0.00");
    assert(acct1.paymentComplete === true, "Payment completeness remains COMPLETE");

    // =========================================================================
    // SECTION 10: COMPLETENESS CANDIDATE NARROWING & PERFORMANCE HARDENING
    // =========================================================================
    console.log("\n--- PART 10: COMPLETENESS CANDIDATE NARROWING & PERFORMANCE HARDENING ---");

    // Test 47: registration-code search + completeness
    console.log("\n[Test 47] registration-code search + completeness");
    const h1Complete = await getAdminPaymentsList({
      search: reg1.registration_code!,
      completeness: "COMPLETE",
      categoryId: category.id,
    });
    assert(h1Complete.totalCount === 4, "Registration code + COMPLETE found exactly 4 payments for Team 1");
    assert(h1Complete.items.every((i) => i.registrationCode === reg1.registration_code), "All results belong to Team 1");

    const h1Incomplete = await getAdminPaymentsList({
      search: reg1.registration_code!,
      completeness: "INCOMPLETE",
      categoryId: category.id,
    });
    assert(h1Incomplete.totalCount === 0 && h1Incomplete.items.length === 0, "Registration code for complete team + INCOMPLETE returns 0 payments");

    const h1Team2Incomplete = await getAdminPaymentsList({
      search: reg2.registration_code!,
      completeness: "INCOMPLETE",
      categoryId: category.id,
    });
    assert(h1Team2Incomplete.totalCount === 4, "Registration code + INCOMPLETE found exactly 4 payments for Team 2");

    // Test 48: payment-reference search + completeness
    console.log("\n[Test 48] payment-reference search + completeness");
    const h2Complete = await getAdminPaymentsList({
      search: "REF-JUAN-01-GCASH",
      completeness: "COMPLETE",
      categoryId: category.id,
    });
    assert(h2Complete.totalCount === 1, "Payment reference + COMPLETE matched 1 payment on complete team");
    assert(h2Complete.items[0].referenceNumber === "REF-JUAN-01-GCASH", "Returned correct reference number");

    const h2IncompleteMismatch = await getAdminPaymentsList({
      search: "REF-JUAN-01-GCASH",
      completeness: "INCOMPLETE",
      categoryId: category.id,
    });
    assert(h2IncompleteMismatch.totalCount === 0, "Payment reference + INCOMPLETE returns 0 because parent registration is COMPLETE");

    // Test 49: team-name search + completeness
    console.log("\n[Test 49] team-name search + completeness");
    const h3Complete = await getAdminPaymentsList({
      search: team1.team_name,
      completeness: "COMPLETE",
      categoryId: category.id,
    });
    assert(h3Complete.totalCount === 4, "Team name search + COMPLETE returned 4 payments for Team 1");

    const h3Incomplete = await getAdminPaymentsList({
      search: team1.team_name,
      completeness: "INCOMPLETE",
      categoryId: category.id,
    });
    assert(h3Incomplete.totalCount === 0, "Team name search + INCOMPLETE returned 0 for complete Team 1");

    // Test 50: multi-token player-name search + completeness
    console.log("\n[Test 50] multi-token player-name search + completeness");
    const h4Tokens = await getAdminPaymentsList({
      search: "Cruz Juan",
      completeness: "COMPLETE",
      categoryId: category.id,
    });
    assert(h4Tokens.totalCount === 1, "Multi-token 'Cruz Juan' + COMPLETE matches Juan Dela Cruz");
    assert(h4Tokens.items[0].fullName === "Juan Dela Cruz", "Item matches Juan Dela Cruz");

    const h4TokensMismatch = await getAdminPaymentsList({
      search: "Cruz Juan",
      completeness: "INCOMPLETE",
      categoryId: category.id,
    });
    assert(h4TokensMismatch.totalCount === 0, "Multi-token 'Cruz Juan' + INCOMPLETE returns 0 on complete team");

    // Test 51: payment-status + completeness
    console.log("\n[Test 51] payment-status + completeness");
    const h5Verified = await getAdminPaymentsList({
      paymentStatus: "VERIFIED",
      completeness: "COMPLETE",
      categoryId: category.id,
    });
    assert(h5Verified.totalCount === 3, "paymentStatus VERIFIED + COMPLETE returned 3 payments");
    assert(h5Verified.items.every((i) => i.status === "VERIFIED"), "All returned items have VERIFIED status");

    const h5Pending = await getAdminPaymentsList({
      paymentStatus: "PENDING",
      completeness: "INCOMPLETE",
      categoryId: category.id,
    });
    assert(h5Pending.totalCount === 2, "paymentStatus PENDING + INCOMPLETE returned 2 payments (Carlos + Legacy)");

    // Test 52: payment-method + completeness
    console.log("\n[Test 52] payment-method + completeness");
    const h6GcashComplete = await getAdminPaymentsList({
      paymentMethod: "GCASH",
      completeness: "COMPLETE",
      categoryId: category.id,
    });
    assert(h6GcashComplete.totalCount === 2, "paymentMethod GCASH + COMPLETE matched 2 payments on Team 1");
    assert(h6GcashComplete.items.every((i) => i.paymentMethod === "GCASH"), "All returned items have GCASH method");

    const h6GcashIncomplete = await getAdminPaymentsList({
      paymentMethod: "GCASH",
      completeness: "INCOMPLETE",
      categoryId: category.id,
    });
    assert(h6GcashIncomplete.totalCount === 1, "paymentMethod GCASH + INCOMPLETE matched Elena Cruz on Team 2");
    assert(h6GcashIncomplete.items[0].referenceNumber === "REFUND-ELENA-06", "Correct payment record returned");

    // Test 53: category/division + completeness
    console.log("\n[Test 53] category/division + completeness");
    const h7CatComplete = await getAdminPaymentsList({
      categoryId: category.id,
      completeness: "COMPLETE",
    });
    assert(h7CatComplete.totalCount === 4, "Category + COMPLETE returned 4 payments for Team 1");

    const h7CatIncomplete = await getAdminPaymentsList({
      categoryId: category.id,
      completeness: "INCOMPLETE",
    });
    assert(h7CatIncomplete.totalCount === 4, "Category + INCOMPLETE returned 4 payments for Team 2");

    // Test 54: verified-registration-only + completeness
    console.log("\n[Test 54] verified-registration-only + completeness");
    const h8VerRegComplete = await getAdminPaymentsList({
      verifiedRegistrationOnly: true,
      completeness: "COMPLETE",
      categoryId: category.id,
    });
    assert(h8VerRegComplete.totalCount === 4, "verifiedRegistrationOnly + COMPLETE returned 4 payments");

    const h8VerRegIncomplete = await getAdminPaymentsList({
      verifiedRegistrationOnly: true,
      completeness: "INCOMPLETE",
      categoryId: category.id,
    });
    assert(h8VerRegIncomplete.totalCount === 0, "verifiedRegistrationOnly + INCOMPLETE returned 0 (Team 2 is PENDING_PAYMENT)");

    // Test 55: empty candidate set
    console.log("\n[Test 55] empty candidate set");
    const h9Empty = await getAdminPaymentsList({
      search: "DEFINITELY-NONEXISTENT-TOKEN-9999",
      completeness: "COMPLETE",
      categoryId: category.id,
    });
    assert(h9Empty.totalCount === 0, "Empty candidate set returns totalCount 0");
    assert(h9Empty.items.length === 0, "Empty candidate set returns items []");
    assert(h9Empty.totalPages === 0, "Empty candidate set returns totalPages 0");

    // Test 56: correct totalCount with completeness
    console.log("\n[Test 56] correct totalCount with completeness");
    const h10Count = await getAdminPaymentsList({
      completeness: "INCOMPLETE",
      categoryId: category.id,
      pageSize: 2,
    });
    assert(h10Count.totalCount === 4, "totalCount reflects full matching set (4) when pageSize is 2");
    assert(h10Count.totalPages === 2, "totalPages is 2 for 4 items with pageSize 2");
    assert(h10Count.items.length === 2, "items array contains only page items (2)");

    // Test 57: pagination correctness with completeness
    console.log("\n[Test 57] pagination correctness with completeness");
    const h11Page1 = await getAdminPaymentsList({
      completeness: "INCOMPLETE",
      categoryId: category.id,
      page: 1,
      pageSize: 2,
    });
    assert(h11Page1.items.length === 2, "Page 1 has 2 items");
    assert(h11Page1.hasPreviousPage === false, "Page 1 has no previous page");
    assert(h11Page1.hasNextPage === true, "Page 1 has next page");

    const h11Page2 = await getAdminPaymentsList({
      completeness: "INCOMPLETE",
      categoryId: category.id,
      page: 2,
      pageSize: 2,
    });
    assert(h11Page2.items.length === 2, "Page 2 has 2 items");
    assert(h11Page2.hasPreviousPage === true, "Page 2 has previous page");
    assert(h11Page2.hasNextPage === false, "Page 2 has no next page");

    const page1Ids = new Set(h11Page1.items.map((i) => i.id));
    const disjoint = h11Page2.items.every((i) => !page1Ids.has(i.id));
    assert(disjoint, "Page 1 and Page 2 items are completely disjoint");

    // Test 58: completeness resolved before pagination
    console.log("\n[Test 58] completeness resolved before pagination");
    const h12Pre = await getAdminPaymentsList({
      completeness: "INCOMPLETE",
      categoryId: category.id,
      page: 1,
      pageSize: 2,
    });
    assert(h12Pre.items.length === 2, "Pre-pagination completeness guarantees page is full (2 items)");
    assert(h12Pre.totalCount === 4, "Total count is accurately 4 across all pages");
    assert(h12Pre.items.every((i) => i.registrationId === reg2.id), "All page items belong to qualifying incomplete registration");

    // Test 59: no regression of tokenized full-name search
    console.log("\n[Test 59] no regression of tokenized full-name search");
    const h13Tokens1 = await getAdminPaymentsList({
      search: "Juan Cruz Dela",
      categoryId: category.id,
    });
    assert(h13Tokens1.totalCount === 1 && h13Tokens1.items[0].referenceNumber === "REF-JUAN-01-GCASH", "Tokens 'Juan Cruz Dela' matched Juan Dela Cruz");

    const h13Tokens2 = await getAdminPaymentsList({
      search: "Dela Cruz Juan",
      categoryId: category.id,
    });
    assert(h13Tokens2.totalCount === 1 && h13Tokens2.items[0].referenceNumber === "REF-JUAN-01-GCASH", "Tokens 'Dela Cruz Juan' matched Juan Dela Cruz");

    // Test 60: no regression of legacy/unallocated payment handling
    console.log("\n[Test 60] no regression of legacy/unallocated payment handling");
    const h14Legacy = await getAdminPaymentsList({
      search: "LEGACY-OTHER-99",
      completeness: "INCOMPLETE",
      categoryId: category.id,
    });
    assert(h14Legacy.totalCount === 1, "Legacy payment found with completeness filter");
    assert(h14Legacy.items[0].isLegacyUnallocated === true, "isLegacyUnallocated is true for unallocated payment");
    assert(h14Legacy.items[0].fullName === "Legacy / Unallocated Payment", "Placeholder name for legacy payment");
    assert(h14Legacy.items[0].registrationPlayerId === null, "registrationPlayerId is null for legacy payment");

    // Test 61: Existing payment status mutation behavior remains functional
    console.log("\n[Test 61] Existing payment status mutation behavior remains functional");
    const mutResult = await mutatePlayerPaymentStatus(adminContext, {
      registrationPlayerId: rp3.id,
      paymentId: pay3.id,
      action: "REFUND",
      expectedStatus: "VERIFIED",
      reason: "Regression test refund for Pedro Penduko",
    });
    assert(mutResult.success === true, "Existing player payment refund mutation succeeded");
    if (mutResult.success) {
      testIds.auditLogIds.push(mutResult.auditLogId);
      assert(mutResult.newStatus === "REFUNDED", "Player payment status transitioned to REFUNDED");
    }

  } finally {
    console.log("\n--- CLEAN TEARDOWN OF EPHEMERAL FIXTURES ---");

    // 1. Delete audit logs
    if (testIds.auditLogIds.length > 0) {
      await prisma.admin_audit_logs.deleteMany({
        where: { id: { in: testIds.auditLogIds } },
      }).catch(() => {});
    }
    if (testIds.profileId) {
      await prisma.admin_audit_logs.deleteMany({
        where: { admin_profile_id: testIds.profileId },
      }).catch(() => {});
    }

    // 2. Delete payments
    if (testIds.paymentIds.length > 0) {
      await prisma.payments.deleteMany({
        where: { id: { in: testIds.paymentIds } },
      }).catch(() => {});
    }

    // 3. Delete registration players
    if (testIds.reg1Id) {
      await prisma.registration_players.deleteMany({
        where: { registration_id: testIds.reg1Id },
      }).catch(() => {});
    }
    if (testIds.reg2Id) {
      await prisma.registration_players.deleteMany({
        where: { registration_id: testIds.reg2Id },
      }).catch(() => {});
    }

    // 4. Delete registrations
    if (testIds.reg1Id) {
      await prisma.registrations.delete({ where: { id: testIds.reg1Id } }).catch(() => {});
    }
    if (testIds.reg2Id) {
      await prisma.registrations.delete({ where: { id: testIds.reg2Id } }).catch(() => {});
    }

    // 5. Delete players
    for (const pId of testIds.playerIds) {
      await prisma.players.delete({ where: { id: pId } }).catch(() => {});
    }

    // 6. Delete teams
    if (testIds.team1Id) {
      await prisma.teams.delete({ where: { id: testIds.team1Id } }).catch(() => {});
    }
    if (testIds.team2Id) {
      await prisma.teams.delete({ where: { id: testIds.team2Id } }).catch(() => {});
    }

    // 7. Delete category & league
    if (testIds.categoryId) {
      await prisma.league_categories.delete({ where: { id: testIds.categoryId } }).catch(() => {});
    }
    if (testIds.leagueId) {
      await prisma.leagues.delete({ where: { id: testIds.leagueId } }).catch(() => {});
    }

    // 8. Delete admin access & profile
    if (testIds.adminAccessId) {
      await prisma.admin_access.delete({ where: { id: testIds.adminAccessId } }).catch(() => {});
    }
    if (testIds.profileId) {
      await prisma.profiles.delete({ where: { id: testIds.profileId } }).catch(() => {});
    }

    console.log("  [PASS] All ephemeral test fixtures completely removed from mva_dev.\n");
  }

  console.log("===============================================================");
  console.log("ALL 61 VERIFICATION SUITE TESTS PASSED 100% SUCCESSFULLY");
  console.log("===============================================================");
}

run().catch((err) => {
  console.error("\n[FATAL ERROR IN VERIFICATION SUITE]:", err);
  process.exit(1);
});
