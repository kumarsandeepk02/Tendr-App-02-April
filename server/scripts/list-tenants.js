#!/usr/bin/env node

/**
 * List all tenants with user counts.
 *
 * Usage:
 *   node scripts/list-tenants.js
 */

require('dotenv').config({ override: true });
const { db } = require('../db');
const { tenants, profiles } = require('../db/schema');
const { eq, count, desc } = require('drizzle-orm');

async function main() {
  const allTenants = await db
    .select()
    .from(tenants)
    .orderBy(desc(tenants.createdAt));

  if (allTenants.length === 0) {
    console.log('No tenants found. Run create-tenant.js to create one.');
    return;
  }

  console.log('');
  console.log('Tenants:');
  console.log('─'.repeat(70));

  for (const t of allTenants) {
    const [userCount] = await db
      .select({ count: count() })
      .from(profiles)
      .where(eq(profiles.tenantId, t.id));

    console.log(`  ${t.slug.padEnd(20)} ${t.name.padEnd(25)} ${t.type.padEnd(12)} ${Number(userCount?.count || 0)} users`);
  }

  console.log('─'.repeat(70));
  console.log(`Total: ${allTenants.length} tenants`);
  console.log('');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
