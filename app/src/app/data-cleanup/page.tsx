import type { Metadata } from "next";
import { db } from "@/db";
import {
  shareholderAliases,
  shareholderContacts,
  shareholders,
  companies,
} from "@/db/schema";
import { eq, sql, inArray } from "drizzle-orm";
import Link from "next/link";
import { Wrench, AlertTriangle, Mail, Building2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Data Cleanup | ECIT Cap Tables",
  description: "Review and resolve entity resolution conflicts",
};

async function getConflicts() {
  const conflicting = await db
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

  if (conflicting.length === 0) return [];

  // Batch query: fetch all aliases for all conflicting shareholders at once
  const allAliases = await db
    .select({
      shareholderId: shareholderAliases.shareholderId,
      nameVariant: shareholderAliases.nameVariant,
      email: shareholderAliases.email,
      sourceCompanyName: companies.name,
    })
    .from(shareholderAliases)
    .leftJoin(
      companies,
      eq(shareholderAliases.sourceCompanyId, companies.id)
    )
    .where(
      inArray(
        shareholderAliases.shareholderId,
        conflicting.map((s) => s.shareholderId)
      )
    );

  // Group aliases by shareholder ID
  const aliasesByShareholder = new Map<string, typeof allAliases>();
  for (const a of allAliases) {
    const existing = aliasesByShareholder.get(a.shareholderId);
    if (existing) {
      existing.push(a);
    } else {
      aliasesByShareholder.set(a.shareholderId, [a]);
    }
  }

  return conflicting.map((s) => ({
    shareholderId: s.shareholderId,
    canonicalName: s.canonicalName,
    orgNumber: s.orgNumber,
    entityType: s.entityType,
    emailCount: s.emailCount,
    sources: (aliasesByShareholder.get(s.shareholderId) ?? []).filter(
      (a) => a.email
    ),
  }));
}

export default async function DataCleanupPage() {
  const conflicts = await getConflicts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-navy">
          Data Cleanup
        </h1>
        <p className="text-sm text-muted-foreground">
          {conflicts.length} entity resolution conflicts to review
        </p>
      </div>

      {conflicts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Wrench className="size-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-navy">No conflicts found</p>
            <p className="text-xs text-muted-foreground">
              All shareholders have been cleanly resolved
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {conflicts.map((conflict) => (
            <Card key={conflict.shareholderId}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-md bg-ecit-red/10">
                      <AlertTriangle className="size-4 text-ecit-red" />
                    </div>
                    <div>
                      <Link
                        href={`/shareholders/${conflict.shareholderId}`}
                        className="font-medium text-navy hover:underline"
                      >
                        {conflict.canonicalName}
                      </Link>
                      {conflict.orgNumber && (
                        <p className="text-xs text-muted-foreground">
                          {conflict.orgNumber}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {conflict.entityType === "company" ? "Company" : "Person"}
                    </Badge>
                    <Badge variant="destructive" className="text-xs">
                      {conflict.emailCount} emails
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Email Variants by Source
                </p>
                <div className="space-y-2">
                  {conflict.sources.map((source, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-md border border-cream bg-beige-light px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Mail className="size-3 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          {source.email}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {source.nameVariant !== conflict.canonicalName && (
                          <span className="text-xs text-muted-foreground">
                            as &quot;{source.nameVariant}&quot;
                          </span>
                        )}
                        {source.sourceCompanyName && (
                          <Badge variant="outline" className="text-[10px]">
                            <Building2 className="mr-1 size-2.5" />
                            {source.sourceCompanyName}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
