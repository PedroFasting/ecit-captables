/**
 * Excel parser for dcompany.no shareholder register exports.
 *
 * Handles two formats:
 *  1. Single share class (e.g. "Common shares") - header row at ~11
 *  2. Multiple share classes (e.g. A/B/Preference) - header row at ~31
 *
 * Robust column matching: supports Norwegian + English headers,
 * common abbreviations, and fuzzy matching (trim, lowercase, ignore punctuation).
 */
import * as XLSX from "xlsx";

// ── Types ──────────────────────────────────────────────

export interface ParsedCompany {
  name: string;
  orgNumber: string;
  totalShares: number | null;
  totalVotes: number | null;
  nominalValue: number | null;
  shareCapital: number | null;
  shareClasses: ParsedShareClass[];
  shareholders: ParsedShareholder[];
}

export interface ParsedShareClass {
  name: string;
  totalShares: number | null;
  nominalValue: number | null;
  shareCapital: number | null;
  totalVotes: number | null;
  remarks: string | null;
}

export interface ParsedShareholder {
  name: string;
  orgNumber: string | null;
  dateOfBirth: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  country: string | null;
  postalCode: string | null;
  representativeName: string | null;
  totalShares: number | null;
  ownershipPct: number | null;
  totalVotes: number | null;
  votingPowerPct: number | null;
  totalCostPrice: number | null;
  entryDate: string | null;
  isPledged: boolean;
  pledgeDetails: string | null;
  gender: string | null;
  isEmployee: boolean;
  /** Per share class holdings */
  classHoldings: ParsedClassHolding[];
}

export interface ParsedClassHolding {
  className: string;
  numShares: number | null;
  shareNumbers: string | null;
  totalCostPrice: number | null;
  entryDate: string | null;
}

// ── Column Alias System ────────────────────────────────
//
// Each logical field maps to multiple known header names.
// Matching is case-insensitive with trimmed whitespace and
// stripped punctuation (./,).

/** Normalize a header string for fuzzy comparison */
function normalizeHeader(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[.,\/]/g, " ")   // dots, commas, slashes → spaces
    .replace(/\s+/g, " ")      // collapse whitespace
    .trim();
}

/** Column alias definitions: logical name → known header variants */
const COLUMN_ALIASES: Record<string, string[]> = {
  // Name column (also used for header row detection)
  name: ["name", "navn", "aksjonær", "aksjonaer", "shareholder", "eier", "owner"],

  // Org number / date of birth
  org_dob: [
    "org no date of birth", "org no /date of birth",
    "org. no./date of birth", "org no./date of birth",
    "org  no  fødselsdato", "org  no  foedselsdato",
    "orgnr fødselsdato", "orgnr foedselsdato", "orgnr/fødselsdato",
    "org nr", "orgnr", "org nummer", "organisasjonsnummer",
  ],

  // Contact
  email: ["email", "e-post", "epost", "e-mail"],
  phone: ["phone number", "phone", "telefon", "tlf", "telefonnummer", "mobilnummer"],
  address: ["address", "adresse", "postadresse"],
  country: ["country", "land"],
  postal_code: ["postal code", "postnummer", "postnr", "zip"],
  representative: ["representative name", "representant", "fullmektig"],

  // Shares and ownership
  num_shares: ["number of shares", "antall aksjer", "aksjer", "shares"],
  ownership: ["ownership", "eierandel", "eierandel %", "ownership %"],
  num_votes: ["number of votes", "antall stemmer", "stemmer", "votes"],
  voting_power: ["voting power", "stemmeandel", "stemmeandel %", "voting power %"],
  total_cost_price: ["total cost price", "total kostpris", "kostpris", "cost price"],
  entry_date: ["entry date", "dato for innføring", "dato for innfoering", "inngangsdato", "registration date"],

  // Share numbers (per-class sub-column)
  share_number: ["share number", "aksjenummer"],

  // Pledging
  pledged: ["pledged", "pantsatt"],
  pledge_details: ["pledge details", "detaljer pantsettelse", "pantedetaljer", "pantsettelse"],

  // Demographics
  gender: ["gender", "kjønn", "kjoenn"],
  employee: ["employee", "ansatt"],

  // Other
  other_remarks: ["other remarks", "andre merknader", "merknader", "kommentarer", "comments"],
};

/** Share class name aliases (for header section + column detection) */
const SHARE_CLASS_ALIASES: Record<string, string[]> = {
  "Common shares": ["common shares", "ordinære aksjer", "ordinaere aksjer", "stamaksjer", "aksjer"],
  "A-shares": ["a-shares", "a-aksjer", "klasse a", "class a"],
  "B-shares": ["b-shares", "b-aksjer", "klasse b", "class b"],
  "Preference shares": ["preference shares", "preferanseaksjer", "pref shares"],
};

/** Company info field aliases */
const COMPANY_FIELD_ALIASES: Record<string, string[]> = {
  num_shares: ["number of shares", "antall aksjer", "aksjer totalt", "total shares"],
  nominal_value: ["nominal value", "pålydende", "paalydende", "nominell verdi"],
  share_capital: ["share capital", "aksjekapital"],
  num_votes: ["number of votes", "antall stemmer", "stemmer totalt", "total votes"],
  total_share_capital: ["total share capital", "total aksjekapital"],
  remarks: ["remarks", "merknader", "kommentarer"],
};

/**
 * Build a lookup map: normalized alias → canonical key.
 */
function buildAliasLookup(aliases: Record<string, string[]>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [canonical, variants] of Object.entries(aliases)) {
    for (const v of variants) {
      map.set(normalizeHeader(v), canonical);
    }
  }
  return map;
}

const columnAliasLookup = buildAliasLookup(COLUMN_ALIASES);
const companyFieldLookup = buildAliasLookup(COMPANY_FIELD_ALIASES);
const shareClassLookup = buildAliasLookup(SHARE_CLASS_ALIASES);

/** Resolve a cell value to a canonical column name, or null if not recognized */
function resolveColumnAlias(headerText: string): string | null {
  return columnAliasLookup.get(normalizeHeader(headerText)) ?? null;
}

/** Check if a cell value matches a company info field */
function resolveCompanyField(label: string): string | null {
  return companyFieldLookup.get(normalizeHeader(label)) ?? null;
}

/** Check if a cell value matches a known share class name. Returns canonical name. */
function resolveShareClassName(label: string): string | null {
  return shareClassLookup.get(normalizeHeader(label)) ?? null;
}

// ── Parsing ────────────────────────────────────────────

/**
 * Parse a dcompany.no Excel file and return structured data.
 */
export function parseExcelFile(buffer: Buffer): ParsedCompany {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: (string | number | Date | null)[][] = XLSX.utils.sheet_to_json(
    sheet,
    {
      header: 1,
      defval: null,
      raw: false,
      dateNF: "yyyy-mm-dd",
    }
  );

  // Parse company info from row 2
  const companyInfo = parseCompanyInfo(rows);

  // Parse share classes from header section
  const shareClasses = parseShareClasses(rows);

  // Find remarks (between share classes and header row)
  const remarks = parseRemarks(rows);
  if (remarks && shareClasses.length > 0) {
    // Try to match remark to correct share class by content.
    // E.g. "A-aksjeeier kan samlet maksimalt..." → A-shares
    const matchedClass = shareClasses.find((sc) => {
      const classPrefix = sc.name.replace(/-?shares$/i, "").trim(); // "A", "B", "Preference", "Common"
      // Match patterns like "A-aksjeeier", "B-aksje", "Preference share" in the remark text
      const pattern = new RegExp(`\\b${classPrefix}[- ]?aksje`, "i");
      return pattern.test(remarks);
    });
    if (matchedClass) {
      matchedClass.remarks = remarks;
    } else {
      // Fallback: attach to first share class (most relevant for general remarks)
      shareClasses[0].remarks = remarks;
    }
  }

  // Find header row and parse shareholders
  const headerRowIndex = findHeaderRow(rows);
  if (headerRowIndex === -1) {
    // Build debug info: show first non-empty values in column A
    const sampleValues = rows
      .slice(0, 50)
      .map((r, i) => ({ row: i, val: r?.[0]?.toString()?.trim() }))
      .filter((r) => r.val)
      .slice(0, 8)
      .map((r) => `  row ${r.row}: "${r.val}"`)
      .join("\n");

    throw new Error(
      `Could not find header row in sheet "${sheetName}".\n` +
      `Looking for any of: ${COLUMN_ALIASES.name.join(", ")}\n` +
      `First column values found:\n${sampleValues}\n` +
      `Total rows: ${rows.length}. Check that the shareholder table header row exists.`
    );
  }

  const headers = rows[headerRowIndex] as string[];
  const shareholders = parseShareholders(rows, headerRowIndex, headers, shareClasses);

  return {
    name: companyInfo.name,
    orgNumber: companyInfo.orgNumber,
    totalShares: companyInfo.totalShares,
    totalVotes: companyInfo.totalVotes,
    nominalValue: companyInfo.nominalValue,
    shareCapital: companyInfo.shareCapital,
    shareClasses,
    shareholders,
  };
}

// ── Company Info ───────────────────────────────────────

function parseCompanyInfo(rows: (string | number | Date | null)[][]) {
  // Row 2 contains "COMPANY NAME (org number)"
  // Org numbers may have country prefixes: NO, SE, DK, IS, FI, etc.
  const companyRow = rows[2]?.[0]?.toString() ?? "";
  const match = companyRow.match(/^(.+?)\s*\(([A-Z]{0,2}\s*\d[\d\s]*\d)\)\s*$/);

  let name = companyRow;
  let orgNumber = "";

  if (match) {
    name = match[1].trim();
    orgNumber = match[2].replace(/\s/g, "");
  }

  // Parse total share capital info (rows 4-8 area)
  let totalShares: number | null = null;
  let totalVotes: number | null = null;
  let nominalValue: number | null = null;
  let shareCapital: number | null = null;

  for (let i = 4; i < Math.min(rows.length, 10); i++) {
    const label = rows[i]?.[0]?.toString() ?? "";
    const value = rows[i]?.[1];
    const field = resolveCompanyField(label);

    if (field === "num_shares") totalShares = toNumber(value);
    else if (field === "nominal_value") nominalValue = toNumber(value);
    else if (field === "share_capital") shareCapital = toNumber(value);
    else if (field === "num_votes") totalVotes = toNumber(value);
  }

  return { name, orgNumber, totalShares, totalVotes, nominalValue, shareCapital };
}

// ── Share Classes ──────────────────────────────────────

function parseShareClasses(
  rows: (string | number | Date | null)[][]
): ParsedShareClass[] {
  const classes: ParsedShareClass[] = [];

  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const label = rows[i]?.[0]?.toString() ?? "";
    const resolved = resolveShareClassName(label);
    const companyField = resolveCompanyField(label);

    // Skip "Total share capital" summary row
    if (companyField === "total_share_capital") continue;

    if (resolved) {
      // Next rows contain the class details
      let totalShares: number | null = null;
      let nomValue: number | null = null;
      let shareCap: number | null = null;
      let totalVotes: number | null = null;

      for (let j = i + 1; j < Math.min(i + 5, rows.length); j++) {
        const detailLabel = rows[j]?.[0]?.toString() ?? "";
        const detailValue = rows[j]?.[1];
        const field = resolveCompanyField(detailLabel);

        if (field === "num_shares") totalShares = toNumber(detailValue);
        else if (field === "nominal_value") nomValue = toNumber(detailValue);
        else if (field === "share_capital") shareCap = toNumber(detailValue);
        else if (field === "num_votes") totalVotes = toNumber(detailValue);
      }

      classes.push({
        name: resolved,  // Use canonical name
        totalShares,
        nominalValue: nomValue,
        shareCapital: shareCap,
        totalVotes,
        remarks: null,
      });
    }
  }

  return classes;
}

// ── Remarks ────────────────────────────────────────────

function parseRemarks(rows: (string | number | Date | null)[][]): string | null {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const label = rows[i]?.[0]?.toString() ?? "";
    const field = resolveCompanyField(label);
    if (field === "remarks" || normalizeHeader(label) === "remarks") {
      // Next non-empty row is the remark text
      for (let j = i + 1; j < Math.min(i + 5, rows.length); j++) {
        const text = rows[j]?.[0]?.toString();
        if (text && text.trim()) return text.trim();
      }
    }
  }
  return null;
}

// ── Header Row Detection ───────────────────────────────

function findHeaderRow(rows: (string | number | Date | null)[][]): number {
  // Look for a row containing a cell that matches "name" aliases.
  // This is the shareholder table header row.
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const row = rows[i];
    if (!row) continue;
    for (let j = 0; j < row.length; j++) {
      const val = row[j]?.toString().trim();
      if (!val) continue;
      const resolved = resolveColumnAlias(val);
      if (resolved === "name") {
        return i;
      }
    }
  }
  return -1;
}

// ── Shareholders ───────────────────────────────────────

function parseShareholders(
  rows: (string | number | Date | null)[][],
  headerRowIndex: number,
  headers: string[],
  shareClasses: ParsedShareClass[]
): ParsedShareholder[] {
  const shareholders: ParsedShareholder[] = [];

  // Build column index map using alias resolution.
  // Maps canonical field name → column index.
  const colMap = new Map<string, number>();
  headers.forEach((h, i) => {
    if (!h) return;
    const canonical = resolveColumnAlias(h);
    if (canonical && !colMap.has(canonical)) {
      colMap.set(canonical, i);
    }
  });

  // Detect share class columns (they appear as column headers matching class names)
  const classColumns = detectClassColumns(headers, shareClasses);

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;

    const name = row[0]?.toString() ?? "";

    // Skip footer rows
    if (
      name === "Total" ||
      name === "Totalt" ||
      name.startsWith("Exported") ||
      name.startsWith("Eksportert") ||
      name.startsWith("http")
    ) {
      continue;
    }

    const orgOrDob = row[col(colMap, "org_dob")]?.toString() ?? null;
    const isDateOfBirth = orgOrDob && /^\d{4}-\d{2}-\d{2}$/.test(orgOrDob);

    // Parse per-class holdings
    const classHoldings: ParsedClassHolding[] = [];
    for (const cc of classColumns) {
      const numShares = toNumber(row[cc.sharesCol]);
      if (numShares !== null && numShares > 0) {
        classHoldings.push({
          className: cc.className,
          numShares,
          shareNumbers: row[cc.shareNumberCol]?.toString() ?? null,
          totalCostPrice: toNumber(row[cc.costPriceCol]),
          entryDate: formatDate(row[cc.entryDateCol]),
        });
      }
    }

    shareholders.push({
      name,
      orgNumber: isDateOfBirth ? null : orgOrDob,
      dateOfBirth: isDateOfBirth ? orgOrDob : null,
      email: row[col(colMap, "email")]?.toString() ?? null,
      phone: row[col(colMap, "phone")]?.toString() ?? null,
      address: row[col(colMap, "address")]?.toString() ?? null,
      country: row[col(colMap, "country")]?.toString() ?? null,
      postalCode: row[col(colMap, "postal_code")]?.toString() ?? null,
      representativeName: row[col(colMap, "representative")]?.toString() ?? null,
      totalShares: toNumber(row[col(colMap, "num_shares")]),
      ownershipPct: toNumber(row[col(colMap, "ownership")]),
      totalVotes: toNumber(row[col(colMap, "num_votes")]),
      votingPowerPct: toNumber(row[col(colMap, "voting_power")]),
      totalCostPrice: toNumber(row[col(colMap, "total_cost_price")]),
      entryDate: formatDate(row[col(colMap, "entry_date")]),
      isPledged: ["yes", "ja"].includes(row[col(colMap, "pledged")]?.toString()?.toLowerCase() ?? ""),
      pledgeDetails: row[col(colMap, "pledge_details")]?.toString() || null,
      gender: row[col(colMap, "gender")]?.toString() || null,
      isEmployee: ["yes", "ja"].includes(row[col(colMap, "employee")]?.toString()?.toLowerCase() ?? ""),
      classHoldings,
    });
  }

  return shareholders;
}

// ── Share Class Column Detection ───────────────────────

interface ClassColumn {
  className: string;
  sharesCol: number;
  shareNumberCol: number;
  costPriceCol: number;
  entryDateCol: number;
}

/**
 * Detect which columns belong to which share class.
 * In multi-class files, the header looks like:
 *   ..., A-shares, Share number, Total cost price, Entry date, B-shares, Share number, ...
 * In single-class files:
 *   ..., Common shares, Share number, Total cost price, Entry date, ...
 * Norwegian variant may omit cost price:
 *   ..., Ordinære aksjer, Aksjenummer, Dato for innføring, ...
 *
 * Uses alias matching so Norwegian class names work too.
 * Detects sub-columns dynamically rather than assuming fixed offsets.
 */
function detectClassColumns(
  headers: string[],
  shareClasses: ParsedShareClass[]
): ClassColumn[] {
  const classColumns: ClassColumn[] = [];
  const classNames = shareClasses.map((sc) => sc.name);

  // If no share classes were parsed, try detecting from headers
  if (classNames.length === 0) {
    classNames.push("Common shares");
  }

  for (let i = 0; i < headers.length; i++) {
    const headerVal = headers[i];
    if (!headerVal) continue;

    // Match class name (direct or via alias)
    let matchedClassName: string | null = null;
    if (classNames.includes(headerVal)) {
      matchedClassName = headerVal;
    } else {
      const resolved = resolveShareClassName(headerVal);
      if (resolved && classNames.includes(resolved)) {
        matchedClassName = resolved;
      }
    }

    if (!matchedClassName) continue;

    // Scan ahead for sub-columns. Stop when we hit another class name,
    // a known non-class column, or end of headers.
    let shareNumberCol = -1;
    let costPriceCol = -1;
    let entryDateCol = -1;

    for (let j = i + 1; j < headers.length; j++) {
      const subHeader = headers[j];
      if (!subHeader) continue;

      const subAlias = resolveColumnAlias(subHeader);
      const subClass = resolveShareClassName(subHeader);

      // If we hit another share class or a shareholder-level column, stop
      if (subClass || (subAlias && !["share_number", "total_cost_price", "entry_date"].includes(subAlias))) {
        break;
      }

      if (subAlias === "share_number") shareNumberCol = j;
      else if (subAlias === "total_cost_price") costPriceCol = j;
      else if (subAlias === "entry_date") entryDateCol = j;
    }

    classColumns.push({
      className: matchedClassName,
      sharesCol: i,
      shareNumberCol,
      costPriceCol,
      entryDateCol,
    });
  }

  return classColumns;
}

// ── Helpers ────────────────────────────────────────────

/** Look up column index by canonical field name */
function col(colMap: Map<string, number>, canonicalName: string): number {
  return colMap.get(canonicalName) ?? -1;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return isNaN(value) ? null : value;

  let s = String(value).trim();

  // Strip currency prefixes like "NOK " or "USD "
  s = s.replace(/^[A-Z]{3}\s+/, "");
  // Strip percentage suffixes like "53.2%"
  s = s.replace(/%$/, "");
  // Strip thousands separators (commas and spaces between digits)
  s = s.replace(/,/g, "").replace(/(?<=\d)\s+(?=\d)/g, "");

  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function formatDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString().split("T")[0];
  }
  const s = String(value);
  // Already yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Try parsing
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
}
