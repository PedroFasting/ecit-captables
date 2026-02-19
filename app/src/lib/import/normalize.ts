/**
 * Data normalization for shareholder data.
 * Handles org number formatting, name casing, email normalization, etc.
 */

/**
 * Normalize an organization number:
 * - Remove all whitespace and dashes
 * - Ensure Danish companies have DK prefix
 * - Returns null for empty/invalid values
 */
export function normalizeOrgNumber(orgNumber: string | null): string | null {
  if (!orgNumber || !orgNumber.trim()) return null;

  let normalized = orgNumber.replace(/[\s-]/g, "");

  // Swedish org numbers: keep SE prefix as-is
  if (normalized.startsWith("SE")) {
    return normalized;
  }

  // Danish org numbers: always normalize to "DK" prefix
  // Danish CVR numbers are 8 digits; Norwegian are 9 digits
  if (normalized.startsWith("DK")) {
    return normalized;
  }

  // Pure 8-digit number → Danish CVR, add DK prefix for consistent matching
  if (/^\d{8}$/.test(normalized)) {
    return `DK${normalized}`;
  }

  return normalized;
}

/**
 * Normalize a shareholder name for comparison.
 * Returns a lowercased, trimmed version for matching.
 */
export function normalizeNameForComparison(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Pick the best canonical name from variants.
 * Prefers title case over UPPERCASE.
 */
export function pickCanonicalName(variants: string[]): string {
  if (variants.length === 0) return "";
  if (variants.length === 1) return variants[0];

  // Prefer the variant that is NOT all uppercase
  const titleCase = variants.find((v) => v !== v.toUpperCase());
  return titleCase ?? variants[0];
}

/**
 * Normalize an email address.
 */
export function normalizeEmail(email: string | null): string | null {
  if (!email || !email.trim()) return null;
  return email.trim().toLowerCase();
}

/**
 * Common company name suffixes across jurisdictions.
 * Used as a fallback heuristic when neither org number nor date of birth is present.
 */
const COMPANY_SUFFIXES = [
  // Nordic
  "as",
  "asa",
  "ans",
  "da",
  "ks",
  "stiftelse",
  "a/s",
  "aps",
  "ivs",
  "ab",
  "hb",
  "kb",
  "oy",
  "oyj",
  // Dutch / Belgian
  "b.v.",
  "bv",
  "n.v.",
  "nv",
  "vof",
  // German / Austrian / Swiss
  "gmbh",
  "ag",
  "kg",
  "ohg",
  "e.v.",
  "mbh",
  "ug",
  // UK / US / Ireland
  "ltd",
  "ltd.",
  "limited",
  "plc",
  "llp",
  "llc",
  "inc",
  "inc.",
  "corp",
  "corp.",
  "lp",
  "l.p.",
  // French
  "sa",
  "sas",
  "sarl",
  "sca",
  // Other
  "holding",
  "holdings",
  "invest",
  "group",
  "fund",
  "capital",
  "partners",
  "ventures",
  "trust",
];

/**
 * Check if a name looks like a company name based on common suffixes.
 */
function looksLikeCompanyName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  const words = lower.split(/\s+/);
  const lastWord = words[words.length - 1];
  // Also check the last two "words" for things like "b.v." preceded by a number
  const lastTwo = words.slice(-2).join(" ");

  return COMPANY_SUFFIXES.some(
    (suffix) =>
      lastWord === suffix ||
      lastTwo.endsWith(suffix) ||
      // Handle patterns like "Something I B.V." or "Holdings 1 B.V."
      lower.endsWith(` ${suffix}`) ||
      lower.endsWith(` ${suffix}.`)
  );
}

/**
 * Determine entity type from parsed data.
 * Priority:
 *  1. Has date of birth → person
 *  2. Has org number → company
 *  3. Name matches company suffix heuristics → company
 *  4. Default → person
 */
export function determineEntityType(
  orgNumber: string | null,
  dateOfBirth: string | null,
  name?: string
): "company" | "person" {
  if (dateOfBirth) return "person";
  if (orgNumber) return "company";
  if (name && looksLikeCompanyName(name)) return "company";
  // Default to person if we can't determine
  return "person";
}
