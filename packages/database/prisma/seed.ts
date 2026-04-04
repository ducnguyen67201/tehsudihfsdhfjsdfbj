import "dotenv/config";

import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const PASSWORD_HASH_OPTIONS = {
  algorithm: 2 as const,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/trustloop?schema=public";

const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SEED_USER_EMAIL = "duc@gmail.com";
const SEED_USER_PASSWORD = "test1234";
const WORKSPACE_ID = "workspace_default";
const WORKSPACE_NAME = "Default Workspace";

/* ------------------------------------------------------------------ */
/*  Seed logic — designed for fresh DB after `prisma migrate reset`    */
/* ------------------------------------------------------------------ */

async function main() {
  console.log("Seeding database...\n");

  // 1. User
  const passwordHash = await hash(SEED_USER_PASSWORD, PASSWORD_HASH_OPTIONS);
  const user = await prisma.user.upsert({
    where: { email: SEED_USER_EMAIL },
    update: {},
    create: {
      email: SEED_USER_EMAIL,
      passwordHash,
    },
  });
  console.log(`User: ${user.email} (${user.id})`);

  // 2. Workspace
  const workspace = await prisma.workspace.upsert({
    where: { id: WORKSPACE_ID },
    update: {},
    create: {
      id: WORKSPACE_ID,
      name: WORKSPACE_NAME,
    },
  });
  console.log(`Workspace: ${workspace.name} (${workspace.id})`);

  // 3. Membership (OWNER)
  // Uses partial unique index — create directly (safe after reset).
  await prisma.workspaceMembership.create({
    data: {
      workspaceId: workspace.id,
      userId: user.id,
      role: "OWNER",
    },
  });
  console.log(`Membership: ${user.email} → OWNER of ${workspace.name}`);

  // 4. GitHub Installation
  await prisma.gitHubInstallation.upsert({
    where: { workspaceId: workspace.id },
    update: {},
    create: {
      workspaceId: workspace.id,
      status: "connected",
      installationOwner: "ducnguyen67201",
      missingPermissions: [],
    },
  });
  console.log("GitHub Installation: ducnguyen67201 (connected)");

  // 5. Repository (TrustLoop monorepo)
  const repo = await prisma.repository.upsert({
    where: {
      workspaceId_fullName: {
        workspaceId: workspace.id,
        fullName: "ducnguyen67201/TrustLoop",
      },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      owner: "ducnguyen67201",
      name: "TrustLoop",
      fullName: "ducnguyen67201/TrustLoop",
      sourceRoot: ".",
      defaultBranch: "main",
      branchPolicy: "default_branch_only",
      selected: true,
    },
  });
  console.log(`Repository: ${repo.fullName} (selected: true)`);

  // 6. Slack Support Installation (stub for local dev)
  // Uses partial unique index — create directly (safe after reset).
  const slackInstallation = await prisma.supportInstallation.create({
    data: {
      workspaceId: workspace.id,
      provider: "SLACK",
      providerInstallationId: "local-dev-slack",
      teamId: "T0AQB0129QD",
      botUserId: "U0BOTLOCAL",
      metadata: {
        groupingWindowMinutes: 5,
        maxGroupingWindowMinutes: 60,
      },
    },
  });
  console.log(`Slack Installation: ${slackInstallation.teamId} (${slackInstallation.id})`);

  console.log("\nSeed complete.");
  console.log(`\nLogin: ${SEED_USER_EMAIL} / ${SEED_USER_PASSWORD}`);
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
