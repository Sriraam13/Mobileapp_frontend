
/**
 * menuMatching.ts
 *
 * Resolves a SPOKEN dish name to a real menu item.
 *
 * Speech-to-text output is noisy in ways plain string equality cannot handle:
 *   - filler and politeness: "can I get a masala dosa please"
 *   - spoken quantities:     "two plates of idli"
 *   - transliteration drift: "dosai" / "thosai" / "dosa", "roti" / "rotti"
 *   - spacing/hyphens:       "masaladosa", "gobi-manchurian"
 *   - plurals:               "dosas", "idlis"
 *
 * Strategy (highest confidence first):
 *   1. exact match on the normalized name
 *   2. containment match (query is a full token-subsequence of the item)
 *   3. fuzzy match on token overlap + edit distance, above a confidence floor
 *
 * When several items are equally plausible we deliberately return `ambiguous`
 * so the agent asks a clarifying question instead of silently adding the wrong
 * dish to the cart.
 */

export interface MatchableMenuItem {
  id: number | string;
  name: string;
  price?: number;
  category?: string | number;
  description?: string;
  is_available?: boolean;
  image?: string;
  [key: string]: any;
}

export type MenuMatchStatus = 'exact' | 'fuzzy' | 'ambiguous' | 'none';

export interface MenuMatchResult {
  status: MenuMatchStatus;
  item: MatchableMenuItem | null;
  /** Populated for `ambiguous` so the agent can read out the options. */
  candidates: MatchableMenuItem[];
  confidence: number;
}

/** Words that carry no dish meaning when someone orders out loud. */
const FILLER_WORDS = new Set([
  'a', 'an', 'the', 'some', 'any',
  'please', 'pls', 'thanks', 'thank', 'you',
  'i', 'id', 'ill', 'we', 'me', 'my',
  'want', 'wanted', 'like', 'need', 'get', 'give', 'take', 'have', 'add',
  'can', 'could', 'would', 'will', 'may', 'do', 'does',
  'order', 'orders', 'ordering',
  'plate', 'plates', 'piece', 'pieces', 'portion', 'portions',
  'serving', 'servings', 'bowl', 'bowls', 'cup', 'cups', 'glass', 'glasses',
  'of', 'to', 'for', 'and', 'with', 'in', 'on', 'from',
  'cart', 'menu', 'item', 'items',
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
]);

/**
 * Transliteration variants collapse to a single canonical token so "dosai",
 * "thosai" and "dosa" all compare equal.
 */
const TOKEN_SYNONYMS: Record<string, string> = {
  dosai: 'dosa',
  thosai: 'dosa',
  dose: 'dosa',
  idly: 'idli',
  idlis: 'idli',
  vada: 'vadai',
  wada: 'vadai',
  rotti: 'roti',
  rotti2: 'roti',
  chapathi: 'chapati',
  chappati: 'chapati',
  chapathy: 'chapati',
  poori: 'puri',
  phulka: 'roti',
  paneeer: 'paneer',
  panner: 'paneer',
  gobhi: 'gobi',
  gobie: 'gobi',
  cauliflower: 'gobi',
  manchuria: 'manchurian',
  manchurion: 'manchurian',
  biriyani: 'biryani',
  briyani: 'biryani',
  biryani2: 'biryani',
  sambhar: 'sambar',
  sambaar: 'sambar',
  rasam2: 'rasam',
  coffe: 'coffee',
  kaapi: 'coffee',
  chai: 'tea',
  curd: 'curd',
  dhal: 'dal',
  daal: 'dal',
  parotta: 'paratha',
  porotta: 'paratha',
  parantha: 'paratha',
  uthappam: 'uttapam',
  oothappam: 'uttapam',
  uttappam: 'uttapam',
  pongal2: 'pongal',
  upma2: 'upma',
};

function canonicalToken(token: string): string {
  const synonym = TOKEN_SYNONYMS[token];
  if (synonym) return synonym;
  // Strip a trailing plural 's' ("dosas" -> "dosa") but keep short words intact.
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) {
    const singular = token.slice(0, -1);
    return TOKEN_SYNONYMS[singular] || singular;
  }
  return token;
}

/** Lowercase, strip punctuation/diacritics, collapse whitespace, and map colloquial phrases. */
export function normalizeName(value: unknown): string {
  let s = String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Colloquial spoken food synonyms mapped to real Data Udipi menu item names
  s = s
    .replace(/\b(filter coffee|degree coffee|kumbakonam degree coffee|hot coffee|coffee)\b/g, 'mini coffee')
    .replace(/\b(filter tea|hot tea|tea|chai)\b/g, 'mini tea')
    .replace(/\brava kesari\b/g, 'kesari')
    // Distinct dosa varieties: NEVER replace missing varieties (like ragi dosa or masala dosa) with random items
    .replace(/\b(rava dosa|rava dosai)\b/g, 'rava masala dosai')
    .replace(/\b(spl masala dosa|spl masala dosai|special masala dosa)\b/g, 'special masala dosai')
    .replace(/\b(paneer biryani|paneer briyani)\b/g, 'paneer biriyani')
    .replace(/\b(veg biryani|vegetable biryani)\b/g, 'veg. biryani / onion raitha')
    // Idly mapping: "idly" alone means "Idly (2)". Only "mini idly" is "Mini Idly(14)". Single piece is "Idly single piece".
    .replace(/\b(mini idli|mini idly|mini idlies)\b/g, 'mini idly(14)')
    .replace(/\b(single idly|single idli|1 idly|1 idli|one idli|one idly|single piece idly|single piece idli|idly single piece)\b/g, 'idly single piece')
    .replace(/\b(2 idly|2 idli|2 idlis|two idly|two idlis|two idli|plate idly|plate idli|idlis|idly|idli|steamed idli)\b/g, 'idly (2)')
    // Sambar: keep pure sambar distinct from sambar vadai / sambar idly
    .replace(/\b(sambar vadai|sambar vada)\b/g, 'sambar vadai')
    .replace(/\b(sambar idly|sambar idli)\b/g, 'sambar idly')
    .replace(/\b(tiffin sambar|extra sambar)\b/g, 'tiffin sambar')
    .replace(/\b(spl vadai|special vadai|vadais|medu vada|medu vadai)\b/g, 'spl vadai')
    .replace(/\b(poori masala|poori bhaji|poori|puri)\b/g, 'poori masala')
    .replace(/\b(veg fried rice)\b/g, 'veg fried rice mini')
    .replace(/\b(gobi fried rice)\b/g, 'gobi fried rice mini')
    .replace(/\b(aloo paneer)\b/g, 'aloo paneer mini')
    .replace(/\b(gobi masala)\b/g, 'gobi masala mini')
    .replace(/\b(mushroom 65)\b/g, 'mushroom 65 mini');

  return s;
}

/** Normalized, filler-stripped, synonym-folded tokens. */
export function tokenize(value: unknown, keepFiller = false): string[] {
  const tokens = normalizeName(value)
    .split(' ')
    .filter(Boolean)
    .map(canonicalToken);

  const meaningful = keepFiller ? tokens : tokens.filter((t) => !FILLER_WORDS.has(t));
  // If filtering removed everything (e.g. someone literally orders "tea"),
  // fall back to the raw tokens rather than matching nothing.
  return meaningful.length > 0 ? meaningful : tokens;
}

/** Levenshtein distance with a small rolling buffer. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);

  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[b.length];
}

/** 0..1 similarity between two tokens, tolerant of small spelling drift. */
function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const longer = Math.max(a.length, b.length);
  if (longer === 0) return 1;
  // Only allow fuzz on tokens long enough that a typo is plausible.
  if (longer <= 3) return 0;
  const distance = editDistance(a, b);
  const similarity = 1 - distance / longer;
  return similarity >= 0.75 ? similarity : 0;
}

/**
 * Score how well a spoken query matches an item name, 0..1.
 * Weighted toward "every word the user said is present in the dish name",
 * which is the realistic ordering pattern.
 */
export function scoreMatch(queryTokens: string[], itemTokens: string[]): number {
  if (queryTokens.length === 0 || itemTokens.length === 0) return 0;

  let matched = 0;
  const used = new Set<number>();

  for (const qt of queryTokens) {
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < itemTokens.length; i++) {
      if (used.has(i)) continue;
      const score = tokenSimilarity(qt, itemTokens[i]);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      used.add(bestIdx);
      matched += bestScore;
    }
  }

  const coverage = matched / queryTokens.length;          // did we hear all their words?
  const precision = matched / itemTokens.length;           // is the dish mostly those words?
  // Coverage dominates: "dosa" should still match "Masala Dosa" reasonably,
  // but an exact-length match should outrank a long unrelated dish.
  return coverage * 0.75 + precision * 0.25;
}

const FUZZY_ACCEPT_THRESHOLD = 0.62;
/** Two candidates this close together are treated as genuinely ambiguous. */
const AMBIGUITY_MARGIN = 0.08;

/**
 * Resolve a spoken dish name against the menu.
 * `availableOnly` drops sold-out dishes from consideration.
 */
export function matchMenuItem(
  query: string,
  items: MatchableMenuItem[],
  options: { availableOnly?: boolean } = {}
): MenuMatchResult {
  const empty: MenuMatchResult = { status: 'none', item: null, candidates: [], confidence: 0 };

  if (!query || !Array.isArray(items) || items.length === 0) return empty;

  const pool = options.availableOnly
    ? items.filter((i) => i.is_available !== false)
    : items;
  if (pool.length === 0) return empty;

  const normalizedQuery = normalizeName(query);
  const queryTokens = tokenize(query);
  const queryJoined = queryTokens.join('');

  // 0. Strict availability & disambiguation guards based on user requirements:
  const isExplicitRava = /\brava\b/i.test(query);
  const isMasalaDosa = /\bmasala\s*dosa/i.test(query);
  const isRagiDosa = /\bragi\s*dosa/i.test(query);
  const isPureSambar = /\bsambar\b/i.test(query) && !/\b(vadai|vada|idly|idli|rice)\b/i.test(query);
  const isMiniIdly = /\bmini\b/i.test(query);
  const isIdly = !isMiniIdly && /\b(idli|idly|idlis)\b/i.test(query);
  const isSingleIdly = /\b(single|one|1)\b/i.test(query);

  // If user specifically asked for "Masala Dosa" without "rava", do NOT substitute with "Rava Masala Dosai"
  if (isMasalaDosa && !isExplicitRava) {
    const exactMasala = pool.find((i) => {
      const n = normalizeName(i.name);
      return (n === 'masala dosa' || n === 'masala dosai') && !n.includes('rava');
    });
    if (!exactMasala) {
      return empty;
    }
  }

  // If user asked for Ragi Dosa, it is not on the menu
  if (isRagiDosa) {
    return empty;
  }

  // If user asked for pure Sambar, do NOT match Sambar Vadai or Sambar Idly
  if (isPureSambar) {
    const sambarItem = pool.find((i) => {
      const n = normalizeName(i.name);
      return (n === 'sambar' || n === 'tiffin sambar') && !/\b(vadai|vada|idly|idli|rice)\b/i.test(n);
    });
    if (sambarItem) {
      return { status: 'exact', item: sambarItem, candidates: [sambarItem], confidence: 1 };
    }
    return empty;
  }

  // If user asked for Idly (without saying mini), pick Idly (2) or Idly single piece, NEVER Mini Idly
  if (isIdly) {
    if (isSingleIdly) {
      const singleItem = pool.find((i) => /single piece|idly\(1\)/i.test(i.name));
      if (singleItem) return { status: 'exact', item: singleItem, candidates: [singleItem], confidence: 1 };
    } else {
      const twoItem = pool.find((i) => /idly\s*\(2\)|idly\(2\)/i.test(i.name));
      if (twoItem) return { status: 'exact', item: twoItem, candidates: [twoItem], confidence: 1 };
    }
  }

  // STRICT GUARD: Standalone Paneer Butter Masala curry without pulkha/phulka/naan combo
  const isExplicitCombo = /\b(pulkha|phulka|nan\s*with|naan\s*with|combo|roti\s*with)\b/i.test(query);
  const isPaneerButter = /\bpaneer\s*butter(\s*masala)?\b/i.test(query) || /\bpaneer\s*masala\b/i.test(query);
  if (isPaneerButter && !isExplicitCombo) {
    const standalone = pool.find((i) => {
      const n = normalizeName(i.name);
      return (n === 'paneer butter masala' || n === 'paneer butter' || n === 'paneer masala') && !/\b(pulkha|phulka|naan|nan|roti|combo)\b/i.test(n);
    });
    if (!standalone) {
      // Do NOT silently substitute combo dishes like "Pulkha with Paneer Butter Masala"!
      return empty;
    }
  }

  // 1. Exact match on the normalized / token-folded name.
  const exact = pool.filter((item) => {
    const itemTokens = tokenize(item.name);
    return (
      normalizeName(item.name) === normalizedQuery ||
      itemTokens.join(' ') === queryTokens.join(' ') ||
      // handles "masaladosa" vs "masala dosa"
      itemTokens.join('') === queryJoined
    );
  });

  if (exact.length === 1) {
    return { status: 'exact', item: exact[0], candidates: exact, confidence: 1 };
  }
  if (exact.length > 1) {
    // Same name, different price/variant - the customer must choose.
    const distinct = dedupeByNameAndPrice(exact);
    if (distinct.length === 1) {
      return { status: 'exact', item: distinct[0], candidates: distinct, confidence: 1 };
    }
    return { status: 'ambiguous', item: null, candidates: distinct, confidence: 1 };
  }

  // 2 + 3. Score everything, then decide between confident pick vs. clarification.
  const STAPLE_CARRIERS = ['pulkha', 'phulka', 'roti', 'chapati', 'paratha', 'parotta', 'combo', 'meals', 'thali'];
  const queryLower = query.toLowerCase();

  const scored = pool
    .map((item) => {
      const itemLower = item.name.toLowerCase();
      // If item has a major staple/carrier (e.g. "pulkha with...") that query did not ask for, do NOT allow fuzzy match!
      const hasUnrequestedCarrier = STAPLE_CARRIERS.some(
        (c) => itemLower.includes(c) && !queryLower.includes(c)
      );
      if (hasUnrequestedCarrier) {
        return { item, score: 0 };
      }
      return { item, score: scoreMatch(queryTokens, tokenize(item.name)) };
    })
    .filter((entry) => entry.score >= FUZZY_ACCEPT_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return empty;

  const best = scored[0];
  const rivals = scored.filter(
    (entry) => best.score - entry.score <= AMBIGUITY_MARGIN
  );
  const distinctRivals = dedupeByNameAndPrice(rivals.map((r) => r.item));

  if (distinctRivals.length > 1) {
    return {
      status: 'ambiguous',
      item: null,
      candidates: distinctRivals.slice(0, 5),
      confidence: best.score,
    };
  }

  return {
    status: 'fuzzy',
    item: best.item,
    candidates: [best.item],
    confidence: best.score,
  };
}

function dedupeByNameAndPrice(items: MatchableMenuItem[]): MatchableMenuItem[] {
  const seen = new Set<string>();
  const out: MatchableMenuItem[] = [];
  for (const item of items) {
    const sig = `${normalizeName(item.name)}|${Number(item.price ?? 0)}`;
    if (!seen.has(sig)) {
      seen.add(sig);
      out.push(item);
    }
  }
  return out;
}

/**
 * Distinct dish words from the menu, for speech-recognition keyword boosting.
 * Biasing the transcriber toward real dish names is the single biggest win for
 * recognising regional food vocabulary correctly.
 */
export function buildMenuKeyterms(items: MatchableMenuItem[], limit = 120): string[] {
  if (!Array.isArray(items)) return [];

  const seen = new Set<string>();
  const terms: string[] = [];

  for (const item of items) {
    const name = String(item?.name ?? '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(name);
    if (terms.length >= limit) break;
  }

  return terms;
}

