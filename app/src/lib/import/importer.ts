/**
 * Import pipeline: orchestrates Excel parsing, normalization,
 * entity resolution, and database insertion.
 */
import { db } from "@/db";
import {
  companies,
  shareClasses,
  shareholders,
  shareholderAliases,
  shareholderContacts,
  holdings,
  importBatches,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { parseExcelFile, type ParsedCompany, type ParsedShareholder } from "./excel-parser";
import {
  normalizeOrgNumber,
  normalizeNameForComparison,
  pickCanonicalName,
  normalizeEmail,
  determineEntityType,
} from "./normalize";

// ── Types ──────────────────────────────────────────────

export interface ImportResult {
  companyName: string;
  companyOrgNumber: string;
  shareholdersImported: number;
  holdingsCreated: number;
  conflicts: ImportConflict[];
}

export interface ImportConflict {
  type: "name_mismatch" | "email_mismatch" | "org_number_format";
  shareholderName: string;
  orgNumber: string | null;
  details: string;
}

// ── Main Import Function ───────────────────────────────

export async function importExcelFile(
  buffer: Buffer,
  fileName: string
): Promise<ImportResult> {
  const parsed = parseExcelFile(buffer);
  const conflicts: ImportConflict[] = [];

  // 1. Upsert company
  const company = await upsertCompany(parsed);

  // 2. Create import batch
  const [batch] = await db
    .insert(importBatches)
    .values({
      sourceFile: fileName,
      companyId: company.id,
      recordsImported: parsed.shareholders.length,
      conflictsFound: 0, // Updated at the end
    })
    .returning();

  // 3. Upsert share classes
  const classMap = await upsertShareClasses(parsed, company.id);

  // 4. Import shareholders with entity resolution
  let holdingsCount = 0;
  for (const sh of parsed.shareholders) {
    const result = await importShareholder(
      sh,
      company.id,
      classMap,
      batch.id,
      conflicts
    );
    holdingsCount += result.holdingsCreated;
  }

  // 5. Update batch with conflict count
  await db
    .update(importBatches)
    .set({ conflictsFound: conflicts.length })
    .where(eq(importBatches.id, batch.id));

  return {
    companyName: parsed.name,
    companyOrgNumber: parsed.orgNumber,
    shareholdersImported: parsed.shareholders.length,
    holdingsCreated: holdingsCount,
    conflicts,
  };
}

// ── Company Upsert ─────────────────────────────────────

async function upsertCompany(parsed: ParsedCompany) {
  const orgNum = normalizeOrgNumber(parsed.orgNumber);
  if (!orgNum) {
    throw new Error(`Company has no org number: ${parsed.name}`);
  }

  const existing = await db
    .select()
    .from(companies)
    .where(eq(companies.orgNumber, orgNum))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(companies)
      .set({
        name: parsed.name,
        shareCapital: parsed.shareCapital?.toString() ?? null,
        totalShares: parsed.totalShares,
        totalVotes: parsed.totalVotes,
        nominalValue: parsed.nominalValue?.toString() ?? null,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, existing[0].id));
    return existing[0];
  }

  const [company] = await db
    .insert(companies)
    .values({
      name: parsed.name,
      orgNumber: orgNum,
      shareCapital: parsed.shareCapital?.toString() ?? null,
      totalShares: parsed.totalShares,
      totalVotes: parsed.totalVotes,
      nominalValue: parsed.nominalValue?.toString() ?? null,
    })
    .returning();

  return company;
}

// ── Share Classes Upsert ───────────────────────────────

async function upsertShareClasses(
  parsed: ParsedCompany,
  companyId: string
): Promise<Map<string, string>> {
  // Delete existing classes for this company and re-create
  await db
    .delete(shareClasses)
    .where(eq(shareClasses.companyId, companyId));

  const classMap = new Map<string, string>(); // className -> classId

  for (const sc of parsed.shareClasses) {
    const [created] = await db
      .insert(shareClasses)
      .values({
        companyId,
        name: sc.name,
        totalShares: sc.totalShares,
        nominalValue: sc.nominalValue?.toString() ?? null,
        shareCapital: sc.shareCapital?.toString() ?? null,
        totalVotes: sc.totalVotes,
        remarks: sc.remarks,
      })
      .returning();

    classMap.set(sc.name, created.id);
  }

  return classMap;
}

// ── Shareholder Import with Entity Resolution ──────────

async function importShareholder(
  parsed: ParsedShareholder,
  companyId: string,
  classMap: Map<string, string>,
  batchId: string,
  conflicts: ImportConflict[]
): Promise<{ holdingsCreated: number }> {
  const entityType = determineEntityType(parsed.orgNumber, parsed.dateOfBirth);
  const normalizedOrg = normalizeOrgNumber(parsed.orgNumber);
  const normalizedName = normalizeNameForComparison(parsed.name);

  // Try to find existing shareholder
  let shareholder = await findExistingShareholder(
    normalizedOrg,
    parsed.dateOfBirth,
    normalizedName,
    entityType
  );

  if (shareholder) {
    // Check for conflicts
    const existingNormalized = normalizeNameForComparison(
      shareholder.canonicalName
    );
    if (existingNormalized !== normalizedName) {
      // Name differs but org matches - auto-merge casing, flag significant diffs
      const isCasingOnly =
        existingNormalized.toLowerCase() === normalizedName.toLowerCase();
      if (!isCasingOnly) {
        conflicts.push({
          type: "name_mismatch",
          shareholderName: parsed.name,
          orgNumber: normalizedOrg,
          details: `Existing: "${shareholder.canonicalName}", New: "${parsed.name}"`,
        });
      }
    }

    // Update canonical name if new one is better (title case preferred)
    const bestName = pickCanonicalName([
      shareholder.canonicalName,
      parsed.name,
    ]);
    if (bestName !== shareholder.canonicalName) {
      await db
        .update(shareholders)
        .set({ canonicalName: bestName, updatedAt: new Date() })
        .where(eq(shareholders.id, shareholder.id));
    }
  } else {
    // Create new shareholder
    const [created] = await db
      .insert(shareholders)
      .values({
        canonicalName: parsed.name,
        orgNumber: normalizedOrg,
        dateOfBirth: parsed.dateOfBirth,
        entityType,
        country: parsed.country,
      })
      .returning();
    shareholder = created;
  }

  // Add alias for this specific appearance
  await db.insert(shareholderAliases).values({
    shareholderId: shareholder.id,
    nameVariant: parsed.name,
    email: normalizeEmail(parsed.email),
    sourceCompanyId: companyId,
  });

  // Add/update contact info
  if (parsed.email || parsed.phone || parsed.address) {
    const normalizedEmail = normalizeEmail(parsed.email);

    // Check for email conflicts
    if (normalizedEmail) {
      const existingContacts = await db
        .select()
        .from(shareholderContacts)
        .where(eq(shareholderContacts.shareholderId, shareholder.id));

      const existingEmails = existingContacts
        .map((c) => c.email)
        .filter(Boolean);

      if (
        existingEmails.length > 0 &&
        !existingEmails.includes(normalizedEmail)
      ) {
        conflicts.push({
          type: "email_mismatch",
          shareholderName: parsed.name,
          orgNumber: normalizedOrg,
          details: `Existing: ${existingEmails.join(", ")}, New: ${normalizedEmail}`,
        });
      }
    }

    await db.insert(shareholderContacts).values({
      shareholderId: shareholder.id,
      email: normalizedEmail,
      phone: parsed.phone,
      address: parsed.address,
      isPrimary: false,
    });
  }

  // Delete existing holdings for this shareholder + company (re-import)
  await db
    .delete(holdings)
    .where(
      and(
        eq(holdings.shareholderId, shareholder.id),
        eq(holdings.companyId, companyId)
      )
    );

  // Create holdings per share class
  let holdingsCreated = 0;

  if (parsed.classHoldings.length > 0) {
    // Multi-class: one holding per class
    for (const ch of parsed.classHoldings) {
      if (!ch.numShares || ch.numShares === 0) continue;

      const shareClassId = classMap.get(ch.className) ?? null;
      await db.insert(holdings).values({
        shareholderId: shareholder.id,
        companyId,
        shareClassId,
        numShares: ch.numShares,
        ownershipPct: parsed.ownershipPct?.toString() ?? null,
        votingPowerPct: parsed.votingPowerPct?.toString() ?? null,
        totalCostPrice: ch.totalCostPrice?.toString() ?? null,
        entryDate: ch.entryDate,
        shareNumbers: ch.shareNumbers,
        isPledged: parsed.isPledged,
        pledgeDetails: parsed.pledgeDetails,
        importBatchId: batchId,
      });
      holdingsCreated++;
    }
  } else {
    // Single class or no class info - create one holding
    const shareClassId =
      classMap.size === 1
        ? classMap.values().next().value ?? null
        : null;

    await db.insert(holdings).values({
      shareholderId: shareholder.id,
      companyId,
      shareClassId,
      numShares: parsed.totalShares,
      ownershipPct: parsed.ownershipPct?.toString() ?? null,
      votingPowerPct: parsed.votingPowerPct?.toString() ?? null,
      totalCostPrice: parsed.totalCostPrice?.toString() ?? null,
      entryDate: parsed.entryDate,
      shareNumbers: null,
      isPledged: parsed.isPledged,
      pledgeDetails: parsed.pledgeDetails,
      importBatchId: batchId,
    });
    holdingsCreated++;
  }

  return { holdingsCreated };
}

// ── Entity Resolution: Find Existing Shareholder ───────

async function findExistingShareholder(
  orgNumber: string | null,
  dateOfBirth: string | null,
  normalizedName: string,
  entityType: "company" | "person"
) {
  // Strategy 1: Match on org number (most reliable)
  if (orgNumber) {
    const byOrg = await db
      .select()
      .from(shareholders)
      .where(eq(shareholders.orgNumber, orgNumber))
      .limit(1);

    if (byOrg.length > 0) return byOrg[0];
  }

  // Strategy 2: Match on date of birth + similar name (for persons)
  if (dateOfBirth && entityType === "person") {
    const byDob = await db
      .select()
      .from(shareholders)
      .where(eq(shareholders.dateOfBirth, dateOfBirth))
      .limit(10);

    for (const s of byDob) {
      if (normalizeNameForComparison(s.canonicalName) === normalizedName) {
        return s;
      }
    }
  }

  return null;
}
