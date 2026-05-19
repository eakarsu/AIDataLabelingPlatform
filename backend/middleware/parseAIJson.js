/**
 * parseAIJson - Robust 3-strategy JSON parser for AI responses.
 *
 * Strategy 1: direct JSON.parse on the trimmed string
 * Strategy 2: extract first {...} or [...] block with regex and parse
 * Strategy 3: strip markdown code fences (```json ... ```) and parse remainder
 *
 * Returns { ok: true, data } on success, { ok: false, error, raw } on failure.
 */
function parseAIJson(input) {
  if (input === null || input === undefined) {
    return { ok: false, error: 'empty input', raw: input };
  }

  if (typeof input === 'object') {
    return { ok: true, data: input };
  }

  const text = String(input).trim();
  if (!text) {
    return { ok: false, error: 'empty string', raw: input };
  }

  // Strategy 1: direct parse
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch (e1) {
    // continue
  }

  // Strategy 2: extract first JSON object or array
  const objectMatch = text.match(/\{[\s\S]*\}/);
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  const candidates = [];
  if (objectMatch) candidates.push(objectMatch[0]);
  if (arrayMatch) candidates.push(arrayMatch[0]);

  for (const c of candidates) {
    try {
      return { ok: true, data: JSON.parse(c) };
    } catch (e2) {
      // try next
    }
  }

  // Strategy 3: strip markdown code fences
  const fenceStripped = text
    .replace(/^```(?:json|JSON)?\s*/m, '')
    .replace(/```\s*$/m, '')
    .trim();
  if (fenceStripped !== text) {
    try {
      return { ok: true, data: JSON.parse(fenceStripped) };
    } catch (e3) {
      // try one more nested object extraction on the stripped text
      const stripObj = fenceStripped.match(/\{[\s\S]*\}/);
      if (stripObj) {
        try {
          return { ok: true, data: JSON.parse(stripObj[0]) };
        } catch (e4) {
          // give up
        }
      }
    }
  }

  return { ok: false, error: 'unable to parse AI response as JSON', raw: text };
}

module.exports = { parseAIJson };
