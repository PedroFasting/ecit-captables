/**
 * Diff engine: compares current holdings state against parsed Excel data
 * to produce a structured diff for preview before import.
 */
import type { SnapshotData, SnapshotHolding } from "./snapshot";
import type { ParsedCompany, ParsedShareholder } from "./excel-parser";
import {
  normalizeOrgNumber,
  normalizeNameForComparison,
  determineEntityType,
} from "./normalize";

// ── Types ──────────────────────────────────────────────

export interface ImportDiff {
  companyName: string;
  companyOrgNumber: string;
  isFirstImport: boolean;

  shareClassChanges: ShareClassChange[];
  shareholderChanges: ShareholderChange[];

  summary: {
    newShareholders: number;
    exitedShareholders: number;
    changedHoldings: number;
    unchangedHoldings: number;
    newShareClasses: number;
    removedShareClasses: number;
    changedShareClasses: number;
  };
}

export interface ShareClassChange {
  type: "added" | "removed" | "changed" | "unchanged";
  name: string;
  before?: {
    totalShares: number | null;
    nominalValue: string | null;
    shareCapital: string | null;
  };
  after?: {
    totalShares: number | null;
    nominalValue: string | null;
    shareCapital: string | null;
  };
}

export interface ShareholderChange {
  type: "new" | "exited" | "increased" | "decreased" | "class_changed" | "unchanged";
  shareholderName: string;
  shareholderId?: string;
  orgNumber?: string | null;

  holdingChanges: HoldingChange[];

  totalSharesBefore: number;
  totalSharesAfter: number;
  ownershipPctBefore: number;
  ownershipPctAfter: number;
}

export interface HoldingChange {
  shareClassName: string;
  sharesBefore: number;
  sharesAfter: number;
  ownershipPctBefore: number;
  ownershipPctAfter: number;
}

// ── Diff Calculation ───────────────────────────────────

/**
 * Calculate the diff between current DB state and a parsed Excel file.
 * This is a pure function — no DB access.
 */
export function calculateDiff(
  currentState: SnapshotData | null,
  parsed: ParsedCompany
): ImportDiff {
  // First import: no current state
  if (!currentState || currentState.holdings.length === 0) {
    return createFirstImportDiff(parsed);
  }

  // Share class diff
  const shareClassChanges = diffShareClasses(currentState, parsed);

  // Build a lookup of current holdings by shareholder
  const currentByShareholder = groupHoldingsByShareholder(currentState.holdings);

  // Match parsed shareholders to existing ones
  const { matched, unmatched } = matchShareholders(
    parsed.shareholders,
    currentByShareholder
  );

  // Build shareholder changes
  const shareholderChanges: ShareholderChange[] = [];

  // Process matched shareholders (existing in both)
  for (const { parsed: parsedSh, currentKey, currentHoldings } of matched) {
    const change = diffShareholder(parsedSh, currentHoldings, parsed);
    shareholderChanges.push(change);
  }

  // Process unmatched new shareholders (in Excel but not in DB)
  for (const parsedSh of unmatched) {
    shareholderChanges.push(createNewShareholderChange(parsedSh, parsed));
  }

  // Process exited shareholders (in DB but not matched to any Excel entry)
  const matchedKeys = new Set(matched.map((m) => m.currentKey));
  for (const [key, holdings] of currentByShareholder.entries()) {
    if (!matchedKeys.has(key)) {
      shareholderChanges.push(createExitedShareholderChange(holdings));
    }
  }

  // Sort: new first, then exited, then changed, then unchanged
  const typeOrder: Record<string, number> = {
    new: 0,
    exited: 1,
    increased: 2,
    decreased: 3,
    class_changed: 4,
    unchanged: 5,
  };
  shareholderChanges.sort(
    (a, b) => (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9)
  );

  return {
    companyName: parsed.name,
    companyOrgNumber: parsed.orgNumber,
    isFirstImport: false,
    shareClassChanges,
    shareholderChanges,
    summary: {
      newShareholders: shareholderChanges.filter((c) => c.type === "new").length,
      exitedShareholders: shareholderChanges.filter((c) => c.type === "exited").length,
      changedHoldings: shareholderChanges.filter(
        (c) => c.type === "increased" || c.type === "decreased" || c.type === "class_changed"
      ).length,
      unchangedHoldings: shareholderChanges.filter((c) => c.type === "unchanged").length,
      newShareClasses: shareClassChanges.filter((c) => c.type === "added").length,
      removedShareClasses: shareClassChanges.filter((c) => c.type === "removed").length,
      changedShareClasses: shareClassChanges.filter((c) => c.type === "changed").length,
    },
  };
}

// ── First Import ───────────────────────────────────────

function createFirstImportDiff(parsed: ParsedCompany): ImportDiff {
  const shareholderChanges: ShareholderChange[] = parsed.shareholders.map(
    (sh) => createNewShareholderChange(sh, parsed)
  );

  const shareClassChanges: ShareClassChange[] = parsed.shareClasses.map((sc) => ({
    type: "added" as const,
    name: sc.name,
    after: {
      totalShares: sc.totalShares,
      nominalValue: sc.nominalValue?.toString() ?? null,
      shareCapital: sc.shareCapital?.toString() ?? null,
    },
  }));

  return {
    companyName: parsed.name,
    companyOrgNumber: parsed.orgNumber,
    isFirstImport: true,
    shareClassChanges,
    shareholderChanges,
    summary: {
      newShareholders: shareholderChanges.length,
      exitedShareholders: 0,
      changedHoldings: 0,
      unchangedHoldings: 0,
      newShareClasses: shareClassChanges.length,
      removedShareClasses: 0,
      changedShareClasses: 0,
    },
  };
}

// ── Share Class Diff ───────────────────────────────────

function diffShareClasses(
  current: SnapshotData,
  parsed: ParsedCompany
): ShareClassChange[] {
  const changes: ShareClassChange[] = [];
  const currentByName = new Map(
    current.shareClasses.map((sc) => [sc.name.toLowerCase().trim(), sc])
  );
  const matchedCurrent = new Set<string>();

  for (const parsedSc of parsed.shareClasses) {
    const key = parsedSc.name.toLowerCase().trim();
    const existing = currentByName.get(key);

    if (!existing) {
      changes.push({
        type: "added",
        name: parsedSc.name,
        after: {
          totalShares: parsedSc.totalShares,
          nominalValue: parsedSc.nominalValue?.toString() ?? null,
          shareCapital: parsedSc.shareCapital?.toString() ?? null,
        },
      });
    } else {
      matchedCurrent.add(key);
      const changed =
        existing.totalShares !== parsedSc.totalShares ||
        parseFloat(existing.nominalValue ?? "0") !== (parsedSc.nominalValue ?? 0) ||
        parseFloat(existing.shareCapital ?? "0") !== (parsedSc.shareCapital ?? 0);

      changes.push({
        type: changed ? "changed" : "unchanged",
        name: parsedSc.name,
        before: {
          totalShares: existing.totalShares,
          nominalValue: existing.nominalValue,
          shareCapital: existing.shareCapital,
        },
        after: {
          totalShares: parsedSc.totalShares,
          nominalValue: parsedSc.nominalValue?.toString() ?? null,
          shareCapital: parsedSc.shareCapital?.toString() ?? null,
        },
      });
    }
  }

  // Share classes in current but not in parsed = removed
  for (const [key, sc] of currentByName.entries()) {
    if (!matchedCurrent.has(key)) {
      changes.push({
        type: "removed",
        name: sc.name,
        before: {
          totalShares: sc.totalShares,
          nominalValue: sc.nominalValue,
          shareCapital: sc.shareCapital,
        },
      });
    }
  }

  return changes;
}

// ── Shareholder Matching ───────────────────────────────

interface MatchedShareholder {
  parsed: ParsedShareholder;
  currentKey: string;
  currentHoldings: SnapshotHolding[];
}

/**
 * Group snapshot holdings by a shareholder key for matching.
 * Key priority: orgNumber > shareholderId
 */
function groupHoldingsByShareholder(
  holdings: SnapshotHolding[]
): Map<string, SnapshotHolding[]> {
  const groups = new Map<string, SnapshotHolding[]>();

  for (const h of holdings) {
    // Use org number as primary key, fall back to shareholder ID
    const key = h.shareholderOrgNumber
      ? `org:${normalizeOrgNumber(h.shareholderOrgNumber) ?? h.shareholderOrgNumber}`
      : `id:${h.shareholderId}`;

    const group = groups.get(key) ?? [];
    group.push(h);
    groups.set(key, group);
  }

  return groups;
}

/**
 * Match parsed shareholders from Excel to existing shareholders in DB.
 * Uses org number and normalized name matching.
 */
function matchShareholders(
  parsedShareholders: ParsedShareholder[],
  currentByShareholder: Map<string, SnapshotHolding[]>
): { matched: MatchedShareholder[]; unmatched: ParsedShareholder[] } {
  const matched: MatchedShareholder[] = [];
  const unmatched: ParsedShareholder[] = [];
  const usedKeys = new Set<string>();

  for (const parsed of parsedShareholders) {
    const normalizedOrg = parsed.orgNumber
      ? normalizeOrgNumber(parsed.orgNumber)
      : null;

    let matchKey: string | null = null;

    // Strategy 1: Match by org number
    if (normalizedOrg) {
      const orgKey = `org:${normalizedOrg}`;
      if (currentByShareholder.has(orgKey) && !usedKeys.has(orgKey)) {
        matchKey = orgKey;
      }
    }

    // Strategy 2: Match by normalized name (for entities without org number)
    if (!matchKey) {
      const normalizedName = normalizeNameForComparison(parsed.name);
      for (const [key, holdings] of currentByShareholder.entries()) {
        if (usedKeys.has(key)) continue;
        const existingName = normalizeNameForComparison(
          holdings[0].shareholderName
        );
        if (existingName === normalizedName) {
          matchKey = key;
          break;
        }
      }
    }

    if (matchKey) {
      usedKeys.add(matchKey);
      matched.push({
        parsed,
        currentKey: matchKey,
        currentHoldings: currentByShareholder.get(matchKey)!,
      });
    } else {
      unmatched.push(parsed);
    }
  }

  return { matched, unmatched };
}

// ── Shareholder-Level Diff ─────────────────────────────

function diffShareholder(
  parsed: ParsedShareholder,
  currentHoldings: SnapshotHolding[],
  _company: ParsedCompany
): ShareholderChange {
  const holdingChanges: HoldingChange[] = [];

  // Build current holdings map by share class name
  const currentByClass = new Map<string, SnapshotHolding>();
  for (const h of currentHoldings) {
    const className = h.shareClassName ?? "Default";
    currentByClass.set(className.toLowerCase().trim(), h);
  }

  // Build parsed holdings map by share class name
  const parsedByClass = new Map<string, { numShares: number }>();
  for (const h of parsed.classHoldings) {
    const className = h.className ?? "Default";
    parsedByClass.set(className.toLowerCase().trim(), {
      numShares: h.numShares ?? 0,
    });
  }

  const allClasses = new Set([...currentByClass.keys(), ...parsedByClass.keys()]);

  let totalSharesBefore = 0;
  let totalSharesAfter = 0;
  let ownershipBefore = 0;
  let ownershipAfter = 0;

  for (const classKey of allClasses) {
    const current = currentByClass.get(classKey);
    const parsedH = parsedByClass.get(classKey);

    const sharesBefore = current?.numShares ?? 0;
    const sharesAfter = parsedH?.numShares ?? 0;
    const ownershipPctBefore = parseFloat(current?.ownershipPct ?? "0");
    // Per-class ownership not available from parsed data; will use shareholder-level total below
    const ownershipPctAfter = 0;

    // Find display name for this share class
    const displayName = current?.shareClassName ?? classKey;

    holdingChanges.push({
      shareClassName: current?.shareClassName ?? displayName,
      sharesBefore,
      sharesAfter,
      ownershipPctBefore,
      ownershipPctAfter,
    });

    totalSharesBefore += sharesBefore;
    totalSharesAfter += sharesAfter;
    ownershipBefore += ownershipPctBefore;
  }

  // Use shareholder-level ownership percentage from parsed data
  ownershipAfter = parsed.ownershipPct ?? 0;

  // Determine change type
  let type: ShareholderChange["type"];
  if (totalSharesBefore === totalSharesAfter) {
    // Check if class composition changed
    const classChanged = holdingChanges.some(
      (h) => h.sharesBefore !== h.sharesAfter
    );
    type = classChanged ? "class_changed" : "unchanged";
  } else if (totalSharesAfter > totalSharesBefore) {
    type = "increased";
  } else {
    type = "decreased";
  }

  return {
    type,
    shareholderName: parsed.name,
    shareholderId: currentHoldings[0]?.shareholderId,
    orgNumber: parsed.orgNumber ?? currentHoldings[0]?.shareholderOrgNumber,
    holdingChanges,
    totalSharesBefore,
    totalSharesAfter,
    ownershipPctBefore: ownershipBefore,
    ownershipPctAfter: ownershipAfter,
  };
}

function createNewShareholderChange(
  parsed: ParsedShareholder,
  _company: ParsedCompany
): ShareholderChange {
  const holdingChanges: HoldingChange[] = parsed.classHoldings.map((h) => ({
    shareClassName: h.className ?? "Default",
    sharesBefore: 0,
    sharesAfter: h.numShares ?? 0,
    ownershipPctBefore: 0,
    ownershipPctAfter: 0, // Per-class ownership not available
  }));

  const totalSharesAfter = holdingChanges.reduce(
    (sum, h) => sum + h.sharesAfter,
    0
  );

  return {
    type: "new",
    shareholderName: parsed.name,
    orgNumber: parsed.orgNumber,
    holdingChanges,
    totalSharesBefore: 0,
    totalSharesAfter: totalSharesAfter,
    ownershipPctBefore: 0,
    ownershipPctAfter: parsed.ownershipPct ?? 0,
  };
}

function createExitedShareholderChange(
  currentHoldings: SnapshotHolding[]
): ShareholderChange {
  const holdingChanges: HoldingChange[] = currentHoldings.map((h) => ({
    shareClassName: h.shareClassName ?? "Default",
    sharesBefore: h.numShares ?? 0,
    sharesAfter: 0,
    ownershipPctBefore: parseFloat(h.ownershipPct ?? "0"),
    ownershipPctAfter: 0,
  }));

  const totalSharesBefore = holdingChanges.reduce(
    (sum, h) => sum + h.sharesBefore,
    0
  );
  const ownershipBefore = holdingChanges.reduce(
    (sum, h) => sum + h.ownershipPctBefore,
    0
  );

  return {
    type: "exited",
    shareholderName: currentHoldings[0].shareholderName,
    shareholderId: currentHoldings[0].shareholderId,
    orgNumber: currentHoldings[0].shareholderOrgNumber,
    holdingChanges,
    totalSharesBefore,
    totalSharesAfter: 0,
    ownershipPctBefore: ownershipBefore,
    ownershipPctAfter: 0,
  };
}
