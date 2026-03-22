/**
 * Parses URL query parameters that were flattened using flattenToParams
 * and reconstructs the original nested structure.
 * @param {string|URL|URLSearchParams} urlOrSearchParams
 * @return {Object|Array}
 */
export function parseFlattenedParams(urlOrSearchParams) {
  const searchParams = toSearchParams(urlOrSearchParams);
  const entries = Array.from(searchParams.entries());
  if (entries.length === 0) {
    return {};
  }

  const root = startsWithArrayToken(entries[0][0]) ? [] : {};
  const keyCounts = countByKey(entries);
  const keyProgress = new Map();

  for (const [key, value] of entries) {
    const tokens = parseKeyTokens(key);
    const seen = keyProgress.get(key) || 0;
    const total = keyCounts.get(key) || 1;
    setByTokens(root, tokens, value, { key, seen, total });
    keyProgress.set(key, seen + 1);
  }

  return root;
}

/**
 * @param {string|URL|URLSearchParams} urlOrSearchParams
 * @return {URLSearchParams}
 */
function toSearchParams(urlOrSearchParams) {
  if (urlOrSearchParams instanceof URLSearchParams) {
    return urlOrSearchParams;
  }
  if (urlOrSearchParams instanceof URL) {
    return urlOrSearchParams.searchParams;
  }
  const input = String(urlOrSearchParams || '');
  if (input.startsWith('?')) {
    return new URLSearchParams(input);
  }
  if (input.includes('://') || input.startsWith('/')) {
    try {
      return new URL(input, 'https://accelerant.local').searchParams;
    } catch {
      return new URLSearchParams(input);
    }
  }
  return new URLSearchParams(input);
}

/**
 * @param {string} key
 * @return {boolean}
 */
function startsWithArrayToken(key) {
  return key.startsWith('[');
}

/**
 * @param {Array<[string, string]>} entries
 * @return {Map<string, number>}
 */
function countByKey(entries) {
  const counts = new Map();
  for (const [key] of entries) {
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

/**
 * Turns `a[b][][c]` into `["a", "b", "", "c"]`.
 * @param {string} key
 * @return {string[]}
 */
function parseKeyTokens(key) {
  const tokens = [];
  const re = /([^[\]]+)|\[(.*?)\]/g;
  let match = re.exec(key);
  while (match) {
    tokens.push(match[1] ?? match[2] ?? '');
    match = re.exec(key);
  }
  return tokens;
}

/**
 * @param {Object|Array} root
 * @param {string[]} tokens
 * @param {string} value
 * @param {{ key: string, seen: number, total: number }} info
 */
function setByTokens(root, tokens, value, info) {
  let current = root;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const isLast = i === tokens.length - 1;
    const next = tokens[i + 1];
    const nextNext = tokens[i + 2];

    if (token !== '') {
      if (isLast) {
        current[token] = value;
      } else {
        if (current[token] === undefined) {
          current[token] = next === '' ? [] : {};
        }
        current = current[token];
      }
      continue;
    }

    // Array token: []
    if (!Array.isArray(current)) {
      throw new TypeError('Invalid flattened parameter structure for array token');
    }

    if (isLast) {
      current.push(value);
      continue;
    }

    if (next === '') {
      // Handle [][] as a nested array. Since query params do not encode row boundaries
      // for anonymous nested arrays, use a stable chunk heuristic when possible.
      const rowSize = inferAnonymous2DRowSize(info.total);
      if (
        current.length === 0 ||
        !Array.isArray(current[current.length - 1]) ||
        current[current.length - 1].length >= rowSize
      ) {
        current.push([]);
      }
      current = current[current.length - 1];
      continue;
    }

    if (current.length === 0 || typeof current[current.length - 1] !== 'object') {
      current.push({});
    }

    let candidate = current[current.length - 1];
    const assignsDirectScalar = nextNext === undefined;
    if (assignsDirectScalar && Object.hasOwn(candidate, next)) {
      candidate = {};
      current.push(candidate);
    }
    current = candidate;
  }
}

/**
 * Query params do not preserve explicit boundaries for anonymous 2D arrays
 * (e.g. `matrix[][]=1&matrix[][]=2...`), so pick a deterministic grouping.
 * @param {number} total
 * @return {number}
 */
function inferAnonymous2DRowSize(total) {
  const root = Math.sqrt(total);
  if (Number.isInteger(root) && root > 0) {
    return root;
  }
  return total > 0 ? total : 1;
}
