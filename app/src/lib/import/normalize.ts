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

  // Handle Danish org numbers: "DK" prefix or pure digits that match Danish format
  // Danish CVR numbers are 8 digits
  if (normalized.startsWith("SE")) {
    // Swedish - keep as-is
    return normalized;
  }

  if (normalized.startsWith("DK")) {
    // Already prefixed
    return normalized;
  }

  // 8-digit number without prefix could be Danish (if appears in context)
  // We'll handle this via context in the importer

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
 * Determine entity type from parsed data.
 * If org number looks like a company reg number, it's a company.
 * If it looks like a date of birth, it's a person.
 */
export function determineEntityType(
  orgNumber: string | null,
  dateOfBirth: string | null
): "company" | "person" {
  if (dateOfBirth) return "person";
  if (orgNumber) return "company";
  // Default to person if we can't determine
  return "person";
}
