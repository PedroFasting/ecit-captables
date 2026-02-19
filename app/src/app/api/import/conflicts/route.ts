import { db } from "@/db";
import {
  shareholderAliases,
  shareholderContacts,
  shareholders,
  companies,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * List entity resolution conflicts: shareholders with multiple
 * different email addresses across their appearances.
 */
export async function GET() {
  // Find shareholders with conflicting emails across contacts
  const conflictingShareholders = await db
    .select({
      shareholderId: shareholderContacts.shareholderId,
      canonicalName: shareholders.canonicalName,
      orgNumber: shareholders.orgNumber,
      entityType: shareholders.entityType,
      emailCount: sql<number>`count(distinct ${shareholderContacts.email})`,
    })
    .from(shareholderContacts)
    .innerJoin(
      shareholders,
      eq(shareholderContacts.shareholderId, shareholders.id)
    )
    .where(sql`${shareholderContacts.email} is not null`)
    .groupBy(shareholderContacts.shareholderId, shareholders.id)
    .having(sql`count(distinct ${shareholderContacts.email}) > 1`)
    .orderBy(shareholders.canonicalName);

  // For each, get the detail: which emails from which source companies
  const result = await Promise.all(
    conflictingShareholders.map(async (s) => {
      const aliases = await db
        .select({
          nameVariant: shareholderAliases.nameVariant,
          email: shareholderAliases.email,
          sourceCompanyName: companies.name,
        })
        .from(shareholderAliases)
        .leftJoin(
          companies,
          eq(shareholderAliases.sourceCompanyId, companies.id)
        )
        .where(eq(shareholderAliases.shareholderId, s.shareholderId));

      // Also get name variants (different casing etc)
      const nameVariants = [...new Set(aliases.map((a) => a.nameVariant))];
      const emails = [
        ...new Set(aliases.map((a) => a.email).filter(Boolean)),
      ];

      return {
        shareholderId: s.shareholderId,
        canonicalName: s.canonicalName,
        orgNumber: s.orgNumber,
        entityType: s.entityType,
        nameVariants,
        emails,
        sources: aliases
          .filter((a) => a.email)
          .map((a) => ({
            nameVariant: a.nameVariant,
            email: a.email,
            sourceCompany: a.sourceCompanyName,
          })),
      };
    })
  );

  return NextResponse.json({
    totalConflicts: result.length,
    conflicts: result,
  });
}
