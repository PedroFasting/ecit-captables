/**
 * Excel parser for dcompany.no shareholder register exports.
 *
 * Handles two formats:
 *  1. Single share class (e.g. "Common shares") - header row at ~11
 *  2. Multiple share classes (e.g. A/B/Preference) - header row at ~31
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
    // Attach remarks to last share class (or first - usually applies broadly)
    shareClasses[shareClasses.length - 1].remarks = remarks;
  }

  // Find header row and parse shareholders
  const headerRowIndex = findHeaderRow(rows);
  if (headerRowIndex === -1) {
    throw new Error(
      `Could not find header row (looking for 'Name' column) in sheet "${sheetName}"`
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
  const companyRow = rows[2]?.[0]?.toString() ?? "";
  const match = companyRow.match(/^(.+?)\s*\((\d[\d\s]*\d)\)\s*$/);

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

    if (label === "Number of shares") totalShares = toNumber(value);
    else if (label === "Nominal value") nominalValue = toNumber(value);
    else if (label === "Share capital") shareCapital = toNumber(value);
    else if (label === "Number of votes") totalVotes = toNumber(value);
  }

  return { name, orgNumber, totalShares, totalVotes, nominalValue, shareCapital };
}

// ── Share Classes ──────────────────────────────────────

function parseShareClasses(
  rows: (string | number | Date | null)[][]
): ParsedShareClass[] {
  const classes: ParsedShareClass[] = [];

  // Known share class labels
  const classNames = [
    "Common shares",
    "A-shares",
    "B-shares",
    "Preference shares",
  ];

  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const label = rows[i]?.[0]?.toString() ?? "";

    if (classNames.includes(label) || label === "Total share capital") {
      // "Total share capital" is a summary, not a class - skip but note its presence
      if (label === "Total share capital") continue;

      // Next rows contain the class details
      let totalShares: number | null = null;
      let nomValue: number | null = null;
      let shareCap: number | null = null;
      let totalVotes: number | null = null;

      for (let j = i + 1; j < Math.min(i + 5, rows.length); j++) {
        const detailLabel = rows[j]?.[0]?.toString() ?? "";
        const detailValue = rows[j]?.[1];

        if (detailLabel === "Number of shares")
          totalShares = toNumber(detailValue);
        else if (detailLabel === "Nominal value")
          nomValue = toNumber(detailValue);
        else if (detailLabel === "Share capital")
          shareCap = toNumber(detailValue);
        else if (detailLabel === "Number of votes")
          totalVotes = toNumber(detailValue);
      }

      classes.push({
        name: label,
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
    if (rows[i]?.[0]?.toString() === "Remarks") {
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
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    if (rows[i]?.[0]?.toString() === "Name") {
      return i;
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

  // Build column index map
  const colMap = new Map<string, number>();
  headers.forEach((h, i) => {
    if (h) colMap.set(h, i);
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
      name.startsWith("Exported") ||
      name.startsWith("http")
    ) {
      continue;
    }

    const orgOrDob = row[col(colMap, "Org. no./date of birth")]?.toString() ?? null;
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
      email: row[col(colMap, "Email")]?.toString() ?? null,
      phone: row[col(colMap, "Phone number")]?.toString() ?? null,
      address: row[col(colMap, "Address")]?.toString() ?? null,
      country: row[col(colMap, "Country")]?.toString() ?? null,
      postalCode: row[col(colMap, "Postal code")]?.toString() ?? null,
      representativeName: row[col(colMap, "Representative name")]?.toString() ?? null,
      totalShares: toNumber(row[col(colMap, "Number of shares")]),
      ownershipPct: toNumber(row[col(colMap, "Ownership")]),
      totalVotes: toNumber(row[col(colMap, "Number of votes")]),
      votingPowerPct: toNumber(row[col(colMap, "Voting power")]),
      totalCostPrice: toNumber(row[col(colMap, "Total cost price")]),
      entryDate: formatDate(row[col(colMap, "Entry date")]),
      isPledged: row[col(colMap, "Pledged")]?.toString()?.toLowerCase() === "yes",
      pledgeDetails: row[col(colMap, "Pledge details")]?.toString() || null,
      gender: row[col(colMap, "Gender")]?.toString() || null,
      isEmployee: row[col(colMap, "Employee")]?.toString()?.toLowerCase() === "yes",
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
    if (classNames.includes(headers[i])) {
      classColumns.push({
        className: headers[i],
        sharesCol: i,
        shareNumberCol: i + 1,
        costPriceCol: i + 2,
        entryDateCol: i + 3,
      });
    }
  }

  return classColumns;
}

// ── Helpers ────────────────────────────────────────────

function col(colMap: Map<string, number>, name: string): number {
  return colMap.get(name) ?? -1;
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
