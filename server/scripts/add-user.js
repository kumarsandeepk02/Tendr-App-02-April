#!/usr/bin/env node

/**
 * Assign a user (by WorkOS user ID or email) to a tenant.
 *
 * Usage:
 *   node scripts/add-user.js --tenant dev --workos-user-id user_01ABC
 *   node scripts/add-user.js --tenant uat --profile-id 669a6009-...
 */

require('dotenv').config({ override: true });
const { db } = require('../db');
const { tenants, profiles } = require('../db/schema');
const { eq } = require('drizzle-orm');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    opts[key] = args[i + 1];
  }
  return opts;
}

async function main() {
  const opts = parseArgs();

  if (!opts.tenant) {
    console.error('Usage: node scripts/add-user.js --tenant <slug> --workos-user-id <id> | --profile-id <uuid>');
    process.exit(1);
  }

  // Find tenant
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, opts.tenant))
    .limit(1);

  if (!tenant) {
    console.error(`Tenant "${opts.tenant}" not found. Run create-tenant.js first.`);
    process.exit(1);
  }

  // Find user
  let profile;
  if (opts['profile-id']) {
    const [p] = await db.select().from(profiles).where(eq(profiles.id, opts['profile-id'])).limit(1);
    profile = p;
  } else if (opts['workos-user-id']) {
    const [p] = await db.select().from(profiles).where(eq(profiles.workosUserId, opts['workos-user-id'])).limit(1);
    profile = p;
  } else {
    console.error('Provide either --workos-user-id or --profile-id');
    process.exit(1);
  }

  if (!profile) {
    console.error('User not found. They may need to log in first to create a profile.');
    process.exit(1);
  }

  // Assign tenant
  await db
    .update(profiles)
    .set({ tenantId: tenant.id, updatedAt: new Date() })
    .where(eq(profiles.id, profile.id));

  console.log('');
  console.log(`User assigned to tenant:`);
  console.log(`  Profile: ${profile.id} (${profile.fullName})`);
  console.log(`  Tenant:  ${tenant.slug} (${tenant.name})`);
  console.log('');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
