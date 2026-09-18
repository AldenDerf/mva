import pg from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Safe local development administrator provisioning utility.
 * 
 * Enforces strict safety probes:
 * - Must connect to local database "mva_dev" on localhost:5432.
 * - Fails closed immediately if connected to any non-local or production environment.
 * 
 * Usage:
 *   npx tsx scripts/provision-admin.ts --auth-id <UUID> [--email <email>] [--name <displayName>]
 */

interface ProvisionArgs {
  authUserId: string;
  email?: string;
  displayName?: string;
}

function parseArgs(): ProvisionArgs | null {
  const args = process.argv.slice(2);
  let authUserId = "";
  let email = "";
  let displayName = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--auth-id" && args[i + 1]) {
      authUserId = args[++i].trim();
    } else if (args[i] === "--email" && args[i + 1]) {
      email = args[++i].trim();
    } else if (args[i] === "--name" && args[i + 1]) {
      displayName = args[++i].trim();
    }
  }

  if (!authUserId) {
    console.log(`
MVA Admin Provisioning Utility (Local Development Only)

Usage:
  npx tsx scripts/provision-admin.ts --auth-id <Supabase-Auth-UUID> [--email <email>] [--name <name>]

Example:
  npx tsx scripts/provision-admin.ts --auth-id 11111111-2222-3333-4444-555555555555 --email admin@example.com --name "Administrator"
    `);
    return null;
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(authUserId)) {
    throw new Error(`Invalid UUID format for --auth-id: "${authUserId}"`);
  }

  return { authUserId, email: email || undefined, displayName: displayName || undefined };
}

async function verifyLocalSafetyProbe(connectionString: string) {
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const probeRes = await client.query(
      "SELECT current_database(), current_user, inet_server_addr(), inet_server_port();"
    );
    const probe = probeRes.rows[0];

    console.log("[SAFETY PROBE] Validating target database environment...");
    console.log(`  - Database: "${probe.current_database}"`);
    console.log(`  - User: "${probe.current_user}"`);
    console.log(`  - Server Addr: ${probe.inet_server_addr ?? "local socket / ::1"}`);
    console.log(`  - Server Port: ${probe.inet_server_port ?? 5432}`);

    if (probe.current_database !== "mva_dev") {
      throw new Error(
        `CRITICAL SAFETY GUARD: Target database is "${probe.current_database}". Provisioning only permitted on "mva_dev"!`
      );
    }

    const addr = String(probe.inet_server_addr || "");
    const isLocal =
      addr === "" ||
      addr === "127.0.0.1" ||
      addr === "::1" ||
      addr === "localhost";

    if (!isLocal) {
      throw new Error(`CRITICAL SAFETY GUARD: Non-local database address detected ("${addr}"). Aborting.`);
    }

    const port = probe.inet_server_port ?? 5432;
    if (port !== 5432) {
      throw new Error(`CRITICAL SAFETY GUARD: Unexpected database port ${port} (expected 5432). Aborting.`);
    }

    console.log("[SAFETY PROBE PASS] Target confirmed: local development mva_dev.\n");
  } finally {
    await client.end();
  }
}

async function main() {
  const args = parseArgs();
  if (!args) {
    process.exit(0);
  }

  const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL or DIRECT_URL environment variable.");
  }

  // 1. Enforce strict safety probe
  await verifyLocalSafetyProbe(connectionString);

  // 2. Connect via Prisma client with pg adapter
  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log(`Provisioning administrator for Auth User ID: ${args.authUserId}`);

    // Upsert profile
    const profile = await prisma.profiles.upsert({
      where: { auth_user_id: args.authUserId },
      update: {
        ...(args.email ? { email: args.email } : {}),
        ...(args.displayName ? { display_name: args.displayName } : {}),
      },
      create: {
        auth_user_id: args.authUserId,
        email: args.email,
        display_name: args.displayName || "MVA Administrator",
      },
    });

    console.log(`[PASS] Profile record established: ID=${profile.id}`);

    // Upsert admin_access
    const adminAccess = await prisma.admin_access.upsert({
      where: { profile_id: profile.id },
      update: {
        role: "ADMIN",
        is_active: true,
      },
      create: {
        profile_id: profile.id,
        role: "ADMIN",
        is_active: true,
      },
    });

    console.log(`[PASS] Admin authorization record established:`);
    console.log(`  - Role: ${adminAccess.role}`);
    console.log(`  - Active: ${adminAccess.is_active}`);
    console.log(`\nAdministrator account provisioned successfully!`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("\n[PROVISIONING ERROR]:", err.message || err);
  process.exit(1);
});
