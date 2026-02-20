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
import { eq, and, sql } from "drizzle-orm";
import { parseExcelFile, type ParsedCompany, type ParsedShareholder } from "./excel-parser";
import {
  normalizeOrgNumber,
  normalizeNameForComparison,
  pickCanonicalName,
  normalizeEmail,
  determineEntityType,
} from "./normalize";

// ── Types ──────────────────────────────────────────────

/** Transaction-capable database type (works with both db and tx) */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface ImportResult {
  companyName: string;
  companyOrgNumber: string;
  shareholdersImported: number;
  holdingsCreated: number;
  conflicts: ImportConflict[];
}

export interface ImportConflict {
  type: "name_mismatch" | "email_mismatch" | "org_number_format" | "possible_wrong_org";
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

  return await db.transaction(async (tx) => {
    const conflicts: ImportConflict[] = [];

    // 1. Upsert company
    const company = await upsertCompany(tx, parsed);

    // 2. Create import batch
    const [batch] = await tx
      .insert(importBatches)
      .values({
        sourceFile: fileName,
        companyId: company.id,
        recordsImported: parsed.shareholders.length,
        conflictsFound: 0, // Updated at the end
      })
      .returning();

    // 3. Upsert share classes
    const classMap = await upsertShareClasses(tx, parsed, company.id);

    // 4. Import shareholders with entity resolution
    let holdingsCount = 0;
    for (const sh of parsed.shareholders) {
      const result = await importShareholder(
        tx,
        sh,
        company.id,
        classMap,
        batch.id,
        conflicts
      );
      holdingsCount += result.holdingsCreated;
    }

    // 5. Update batch with conflict count
    await tx
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
  });
}

// ── Company Upsert ─────────────────────────────────────

async function upsertCompany(tx: Tx, parsed: ParsedCompany) {
  const orgNum = normalizeOrgNumber(parsed.orgNumber);
  if (!orgNum) {
    throw new Error(`Company has no org number: ${parsed.name}`);
  }

  const existing = await tx
    .select()
    .from(companies)
    .where(eq(companies.orgNumber, orgNum))
    .limit(1);

  if (existing.length > 0) {
    await tx
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

  const [company] = await tx
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
  tx: Tx,
  parsed: ParsedCompany,
  companyId: string
): Promise<Map<string, string>> {
  // Delete existing holdings for this company first (they reference share classes)
  await tx
    .delete(holdings)
    .where(eq(holdings.companyId, companyId));

  // Now safe to delete share classes
  await tx
    .delete(shareClasses)
    .where(eq(shareClasses.companyId, companyId));

  const classMap = new Map<string, string>(); // className -> classId

  for (const sc of parsed.shareClasses) {
    const [created] = await tx
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
  tx: Tx,
  parsed: ParsedShareholder,
  companyId: string,
  classMap: Map<string, string>,
  batchId: string,
  conflicts: ImportConflict[]
): Promise<{ holdingsCreated: number }> {
  const entityType = determineEntityType(parsed.orgNumber, parsed.dateOfBirth, parsed.name);
  const normalizedOrg = normalizeOrgNumber(parsed.orgNumber);
  const normalizedName = normalizeNameForComparison(parsed.name);

  // Try to find existing shareholder
  let match = await findExistingShareholder(
    tx,
    normalizedOrg,
    parsed.dateOfBirth,
    normalizedName,
    entityType
  );

  // Cross-validate: if org-number matched but name differs significantly,
  // check if the org belongs to a different known entity and try name-based match
  if (match && match.matchedBy === "org_number" && normalizedOrg) {
    match = await crossValidateOrgMatch(
      tx,
      match,
      parsed.name,
      normalizedName,
      normalizedOrg,
      entityType,
      conflicts
    );
  }

  let shareholder = match?.shareholder ?? null;

  if (shareholder) {
    // Check for conflicts (name mismatch that wasn't caught by cross-validation)
    const existingNormalized = normalizeNameForComparison(
      shareholder.canonicalName
    );
    if (existingNormalized !== normalizedName) {
      const isCasingOnly =
        existingNormalized.toLowerCase() === normalizedName.toLowerCase();
      if (!isCasingOnly) {
        // Only add name_mismatch if we didn't already flag as possible_wrong_org
        const alreadyFlagged = conflicts.some(
          (c) => c.type === "possible_wrong_org" && c.shareholderName === parsed.name
        );
        if (!alreadyFlagged) {
          conflicts.push({
            type: "name_mismatch",
            shareholderName: parsed.name,
            orgNumber: normalizedOrg,
            details: `Existing: "${shareholder.canonicalName}", New: "${parsed.name}"`,
          });
        }
      }
    }

    // Update canonical name if new one is better (title case preferred)
    const bestName = pickCanonicalName([
      shareholder.canonicalName,
      parsed.name,
    ]);
    if (bestName !== shareholder.canonicalName) {
      await tx
        .update(shareholders)
        .set({ canonicalName: bestName, updatedAt: new Date() })
        .where(eq(shareholders.id, shareholder.id));
    }
  } else {
    // Create new shareholder
    const [created] = await tx
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

  // Add alias for this specific appearance (dedup: remove existing from same source first)
  await tx
    .delete(shareholderAliases)
    .where(
      and(
        eq(shareholderAliases.shareholderId, shareholder.id),
        eq(shareholderAliases.sourceCompanyId, companyId)
      )
    );
  await tx.insert(shareholderAliases).values({
    shareholderId: shareholder.id,
    nameVariant: parsed.name,
    email: normalizeEmail(parsed.email),
    sourceCompanyId: companyId,
  });

  // Add/update contact info (dedup: remove existing for this shareholder+company first)
  if (parsed.email || parsed.phone || parsed.address) {
    const normalizedEmail = normalizeEmail(parsed.email);

    // Check for email conflicts against other sources
    if (normalizedEmail) {
      const existingContacts = await tx
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

    // Upsert: check if identical contact already exists
    const existingContact = await tx
      .select()
      .from(shareholderContacts)
      .where(eq(shareholderContacts.shareholderId, shareholder.id));

    const alreadyExists = existingContact.some(
      (c) =>
        c.email === (normalizeEmail(parsed.email) ?? null) &&
        c.phone === (parsed.phone ?? null) &&
        c.address === (parsed.address ?? null)
    );

    if (!alreadyExists) {
      await tx.insert(shareholderContacts).values({
        shareholderId: shareholder.id,
        email: normalizeEmail(parsed.email),
        phone: parsed.phone,
        address: parsed.address,
        isPrimary: false,
      });
    }
  }

  // Delete existing holdings for this shareholder + company (re-import)
  await tx
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
    // Multi-class: one holding per class.
    // Ownership % and voting power % are shareholder-level totals (not per-class),
    // so we only store them on the first holding row to avoid double-counting.
    let isFirst = true;
    for (const ch of parsed.classHoldings) {
      if (!ch.numShares || ch.numShares === 0) continue;

      const shareClassId = classMap.get(ch.className) ?? null;
      await tx.insert(holdings).values({
        shareholderId: shareholder.id,
        companyId,
        shareClassId,
        numShares: ch.numShares,
        ownershipPct: isFirst ? (parsed.ownershipPct?.toString() ?? null) : null,
        votingPowerPct: isFirst ? (parsed.votingPowerPct?.toString() ?? null) : null,
        totalCostPrice: ch.totalCostPrice?.toString() ?? null,
        entryDate: ch.entryDate,
        shareNumbers: ch.shareNumbers,
        isPledged: parsed.isPledged,
        pledgeDetails: parsed.pledgeDetails,
        importBatchId: batchId,
      });
      holdingsCreated++;
      isFirst = false;
    }
  } else {
    // Single class or no class info - create one holding
    const shareClassId =
      classMap.size === 1
        ? classMap.values().next().value ?? null
        : null;

    await tx.insert(holdings).values({
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

interface MatchResult {
  shareholder: typeof shareholders.$inferSelect;
  matchedBy: "org_number" | "date_of_birth" | "name";
}

async function findExistingShareholder(
  tx: Tx,
  orgNumber: string | null,
  dateOfBirth: string | null,
  normalizedName: string,
  entityType: "company" | "person"
): Promise<MatchResult | null> {
  // Strategy 1: Match on org number (most reliable)
  if (orgNumber) {
    const byOrg = await tx
      .select()
      .from(shareholders)
      .where(eq(shareholders.orgNumber, orgNumber))
      .limit(1);

    if (byOrg.length > 0) return { shareholder: byOrg[0], matchedBy: "org_number" };
  }

  // Strategy 2: Match on date of birth + similar name (for persons)
  if (dateOfBirth && entityType === "person") {
    const byDob = await tx
      .select()
      .from(shareholders)
      .where(eq(shareholders.dateOfBirth, dateOfBirth))
      .limit(10);

    for (const s of byDob) {
      if (normalizeNameForComparison(s.canonicalName) === normalizedName) {
        return { shareholder: s, matchedBy: "date_of_birth" };
      }
    }
  }

  // Strategy 3: Match on normalized name + entity type (fallback for entities
  // without org_number or date_of_birth). Less reliable than strategies 1-2
  // but prevents creating duplicates for the same entity across files.
  if (!orgNumber && !dateOfBirth) {
    const byName = await tx
      .select()
      .from(shareholders)
      .where(
        and(
          eq(shareholders.entityType, entityType),
          sql`lower(trim(${shareholders.canonicalName})) = ${normalizedName}`
        )
      )
      .limit(1);

    if (byName.length > 0) return { shareholder: byName[0], matchedBy: "name" };
  }

  return null;
}

/**
 * Cross-validate: when org-number matched a shareholder with a very different name,
 * check if the org number belongs to a known company with a different name.
 * If so, try to find the correct shareholder by name instead.
 *
 * This catches errors where the source data (e.g. dcompany.no) has a wrong org number
 * next to a shareholder name.
 */
async function crossValidateOrgMatch(
  tx: Tx,
  match: MatchResult,
  importedName: string,
  normalizedName: string,
  orgNumber: string,
  entityType: "company" | "person",
  conflicts: ImportConflict[]
): Promise<MatchResult> {
  const existingNormalized = normalizeNameForComparison(match.shareholder.canonicalName);

  // If names are similar (just casing), the match is fine
  if (existingNormalized.toLowerCase() === normalizedName.toLowerCase()) {
    return match;
  }

  // Names differ significantly — check if the org number belongs to a known company
  const knownCompany = await tx
    .select()
    .from(companies)
    .where(eq(companies.orgNumber, orgNumber))
    .limit(1);

  const orgBelongsToOtherCompany =
    knownCompany.length > 0 &&
    normalizeNameForComparison(knownCompany[0].name).toLowerCase() !== normalizedName.toLowerCase();

  // Try to find a shareholder that matches by name instead
  const byName = await tx
    .select()
    .from(shareholders)
    .where(
      and(
        eq(shareholders.entityType, entityType),
        sql`lower(trim(${shareholders.canonicalName})) = ${normalizedName}`
      )
    )
    .limit(1);

  if (byName.length > 0 && byName[0].id !== match.shareholder.id) {
    // Found the correct shareholder by name — the org number in the source is wrong
    conflicts.push({
      type: "possible_wrong_org",
      shareholderName: importedName,
      orgNumber,
      details: `Source has org ${orgNumber} (belongs to "${match.shareholder.canonicalName}") but name "${importedName}" matches existing shareholder with org ${byName[0].orgNumber}. Using name match instead.`,
    });
    return { shareholder: byName[0], matchedBy: "name" };
  }

  if (orgBelongsToOtherCompany) {
    // Org belongs to a different known company and we didn't find a name match —
    // still flag it as suspicious but use the org match as fallback
    conflicts.push({
      type: "possible_wrong_org",
      shareholderName: importedName,
      orgNumber,
      details: `Source has org ${orgNumber} (belongs to company "${knownCompany[0].name}") but imported name is "${importedName}". Org number in source may be wrong.`,
    });
  }

  return match;
}
