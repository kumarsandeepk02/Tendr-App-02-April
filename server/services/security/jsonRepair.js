/**
 * Attempt to repair truncated JSON by closing open brackets/braces.
 * This handles the most common failure: LLM output gets cut off at maxTokens
 * mid-JSON, leaving unclosed arrays/objects.
 *
 * Returns parsed object or null if repair fails.
 */
function repairAndParse(text) {
  if (!text) return null;

  // First try normal parse
  try {
    return JSON.parse(text);
  } catch (e) {
    // Continue to repair
  }

  // Extract JSON-like content
  let json = text;
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    json = fenceMatch[1].trim();
  }

  const objMatch = json.match(/\{[\s\S]*/);
  if (objMatch) {
    json = objMatch[0];
  } else {
    return null;
  }

  // Try parsing as-is
  try {
    return JSON.parse(json);
  } catch (e) {
    // Continue to repair
  }

  // Truncation repair: close open brackets and braces
  // Remove trailing incomplete string (ends mid-quote)
  json = json.replace(/,\s*"[^"]*$/, '');  // remove trailing incomplete key
  json = json.replace(/,\s*$/, '');          // remove trailing comma

  // Count open/close brackets
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escaped = false;

  for (const char of json) {
    if (escaped) { escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (char === '{') openBraces++;
    if (char === '}') openBraces--;
    if (char === '[') openBrackets++;
    if (char === ']') openBrackets--;
  }

  // Close any remaining open structures
  // Remove trailing incomplete value
  json = json.replace(/,\s*"[^"]*":\s*("[^"]*)?$/, '');
  json = json.replace(/,\s*$/, '');

  while (openBrackets > 0) { json += ']'; openBrackets--; }
  while (openBraces > 0) { json += '}'; openBraces--; }

  try {
    return JSON.parse(json);
  } catch (e) {
    // Last resort: try to find the largest valid JSON substring
    for (let end = json.length; end > 10; end--) {
      try {
        let attempt = json.substring(0, end);
        // Close structures
        let ob = 0, oq = 0;
        for (const c of attempt) {
          if (c === '{') ob++; if (c === '}') ob--;
          if (c === '[') oq++; if (c === ']') oq--;
        }
        while (oq > 0) { attempt += ']'; oq--; }
        while (ob > 0) { attempt += '}'; ob--; }
        return JSON.parse(attempt);
      } catch { continue; }
    }
    return null;
  }
}

module.exports = { repairAndParse };
