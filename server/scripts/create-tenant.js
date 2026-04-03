#!/usr/bin/env node

/**
 * Create a tenant in the Tendr database.
 *
 * Usage:
 *   node scripts/create-tenant.js --name "Dev Tenant" --slug dev --type individual
 *   node scripts/create-tenant.js --name "UAT Testing" --slug uat --type enterprise
 */

require('dotenv').config({ override: true });
const { db } = require('../db');
const { tenants } = require('../db/schema');
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

  if (!opts.name || !opts.slug) {
    console.error('Usage: node scripts/create-tenant.js --name "Name" --slug slug [--type individual|enterprise] [--workos-org-id org_xxx]');
    process.exit(1);
  }

  const slug = opts.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const type = opts.type || 'individual';
  const workosOrgId = opts['workos-org-id'] || null;

  // Check if slug already exists
  const [existing] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);

  if (existing) {
    console.log(`Tenant "${slug}" already exists (id: ${existing.id})`);
    process.exit(0);
  }

  const [tenant] = await db
    .insert(tenants)
    .values({
      slug,
      name: opts.name,
      type,
      workosOrgId,
      settings: {},
    })
    .returning();

  console.log('');
  console.log('Tenant created:');
  console.log(`  ID:     ${tenant.id}`);
  console.log(`  Slug:   ${tenant.slug}`);
  console.log(`  Name:   ${tenant.name}`);
  console.log(`  Type:   ${tenant.type}`);
  if (workosOrgId) console.log(`  WorkOS: ${workosOrgId}`);
  console.log('');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
