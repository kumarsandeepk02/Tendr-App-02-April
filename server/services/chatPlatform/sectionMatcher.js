const { db } = require('../../db');
const { documentSections } = require('../../db/schema');
const { eq } = require('drizzle-orm');

/**
 * Fuzzy-match a user's natural language reference to an actual section.
 * e.g. "the timeline section" → { id, title: "Project Timeline", content: "..." }
 *
 * Matching strategy (in order):
 * 1. Exact title match (case-insensitive)
 * 2. Title contains the query (case-insensitive)
 * 3. Query contains the title (case-insensitive)
 * 4. Word overlap scoring
 */
async function matchSection(query, projectId) {
  const sections = await db
    .select()
    .from(documentSections)
    .where(eq(documentSections.projectId, projectId))
    .orderBy(documentSections.order);

  if (sections.length === 0) return null;

  const q = query.toLowerCase().trim();

  // Strip common prefixes like "the ... section"
  const cleaned = q
    .replace(/^(the\s+)/i, '')
    .replace(/\s+section$/i, '')
    .trim();

  // 1. Exact match
  const exact = sections.find((s) => s.title.toLowerCase() === cleaned);
  if (exact) return exact;

  // 2. Title contains query
  const contains = sections.find((s) => s.title.toLowerCase().includes(cleaned));
  if (contains) return contains;

  // 3. Query contains title
  const reverse = sections.find((s) => cleaned.includes(s.title.toLowerCase()));
  if (reverse) return reverse;

  // 4. Word overlap scoring
  const queryWords = cleaned.split(/\s+/).filter((w) => w.length > 2);
  let bestMatch = null;
  let bestScore = 0;

  for (const section of sections) {
    const titleWords = section.title.toLowerCase().split(/\s+/);
    const overlap = queryWords.filter((w) => titleWords.some((tw) => tw.includes(w) || w.includes(tw)));
    const score = overlap.length / Math.max(queryWords.length, 1);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = section;
    }
  }

  // Require at least 40% word overlap
  return bestScore >= 0.4 ? bestMatch : null;
}

module.exports = { matchSection };
