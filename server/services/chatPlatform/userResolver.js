const { db } = require('../../db');
const { externalIdentities, profiles } = require('../../db/schema');
const { eq, and } = require('drizzle-orm');

/**
 * Look up a Tendr profile from a Slack/Teams user ID + workspace.
 * Returns the profile row or null if not linked.
 */
async function resolveUser(platform, externalUserId, workspaceId) {
  const [identity] = await db
    .select()
    .from(externalIdentities)
    .where(
      and(
        eq(externalIdentities.provider, platform),
        eq(externalIdentities.externalUserId, externalUserId),
        eq(externalIdentities.externalWorkspaceId, workspaceId)
      )
    )
    .limit(1);

  if (!identity) return null;

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, identity.profileId))
    .limit(1);

  return profile || null;
}

/**
 * Link a Slack/Teams user to an existing Tendr profile.
 * Called after the user completes the OAuth linking flow.
 */
async function linkExternalIdentity({ profileId, provider, externalUserId, externalWorkspaceId, accessToken, metadata }) {
  const [identity] = await db
    .insert(externalIdentities)
    .values({
      profileId,
      provider,
      externalUserId,
      externalWorkspaceId,
      accessToken: accessToken || null,
      metadata: metadata || {},
    })
    .onConflictDoUpdate({
      target: [externalIdentities.provider, externalIdentities.externalUserId, externalIdentities.externalWorkspaceId],
      set: {
        profileId,
        accessToken: accessToken || null,
        metadata: metadata || {},
        updatedAt: new Date(),
      },
    })
    .returning();

  return identity;
}

/**
 * Get all external identities for a profile (useful for showing linked accounts).
 */
async function getLinkedIdentities(profileId) {
  return db
    .select()
    .from(externalIdentities)
    .where(eq(externalIdentities.profileId, profileId));
}

module.exports = { resolveUser, linkExternalIdentity, getLinkedIdentities };
