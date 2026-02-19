import type { Metadata } from "next";
import { db } from "@/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard | ECIT Cap Tables",
  description: "Overview of shareholder ownership across the ECIT Group",
};
import {
  companies,
  shareholders,
  holdings,
  shareClasses,
  importBatches,
} from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import {
  Building2,
  Users,
  PieChart,
  GitFork,
  Clock,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { APP_LOCALE } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

async function getStats() {
  const [companiesCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(companies);

  const [shareholdersCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(shareholders);

  const [holdingsCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(holdings);

  const entityBreakdown = await db
    .select({
      entityType: shareholders.entityType,
      count: sql<number>`count(*)`,
    })
    .from(shareholders)
    .groupBy(shareholders.entityType);

  const [crossOwners] = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(
      sql`(
        SELECT ${holdings.shareholderId}
        FROM ${holdings}
        GROUP BY ${holdings.shareholderId}
        HAVING count(distinct ${holdings.companyId}) >= 2
      ) sub`
    );

  // Top shareholders in the top-level company (most shares, descending)
  // Find the top company: the one with the most total shares (TopCo)
  const [topCompany] = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .orderBy(sql`${companies.totalShares} desc nulls last`)
    .limit(1);

  const topShareholders = topCompany
    ? await db
        .select({
          id: shareholders.id,
          canonicalName: shareholders.canonicalName,
          orgNumber: shareholders.orgNumber,
          entityType: shareholders.entityType,
          totalShares: sql<number>`coalesce(sum(${holdings.numShares}), 0)`,
          ownershipPct: sql<string>`round(sum(${holdings.ownershipPct}::numeric), 2)`,
        })
        .from(holdings)
        .innerJoin(shareholders, eq(holdings.shareholderId, shareholders.id))
        .where(eq(holdings.companyId, topCompany.id))
        .groupBy(shareholders.id)
        .orderBy(sql`sum(${holdings.numShares}) desc`)
        .limit(10)
    : [];

  const lastImport = await db
    .select({
      id: importBatches.id,
      importedAt: importBatches.importedAt,
      sourceFile: importBatches.sourceFile,
      recordsImported: importBatches.recordsImported,
      conflictsFound: importBatches.conflictsFound,
    })
    .from(importBatches)
    .orderBy(sql`${importBatches.importedAt} desc`)
    .limit(1);

  const entityMap = Object.fromEntries(
    entityBreakdown.map((e) => [e.entityType, e.count])
  );

  return {
    companies: companiesCount.count,
    shareholders: shareholdersCount.count,
    holdings: holdingsCount.count,
    companyEntities: entityMap["company"] ?? 0,
    personEntities: entityMap["person"] ?? 0,
    crossOwners: crossOwners.count,
    topCompanyName: topCompany?.name ?? null,
    topShareholders,
    lastImport: lastImport[0] ?? null,
  };
}

export default async function DashboardPage() {
  const stats = await getStats();

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-navy">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Overview of ECIT Group shareholder ownership across {stats.companies} companies
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Companies"
          value={stats.companies}
          description="Imported from dcompany.no"
          icon={<Building2 className="size-4" />}
          href="/companies"
        />
        <StatCard
          title="Shareholders"
          value={stats.shareholders}
          description={`${stats.companyEntities} companies, ${stats.personEntities} persons`}
          icon={<Users className="size-4" />}
          href="/shareholders"
        />
        <StatCard
          title="Holdings"
          value={stats.holdings}
          description="Across all share classes"
          icon={<PieChart className="size-4" />}
        />
        <StatCard
          title="Cross-Owners"
          value={stats.crossOwners}
          description="Shareholders in 2+ companies"
          icon={<GitFork className="size-4" />}
          href="/cross-ownership"
        />
      </div>

      {/* Two-column bottom section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Shareholders */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-4 text-ecit-blue" />
              Top Shareholders
            </CardTitle>
            <CardDescription>
              {stats.topCompanyName
                ? `Largest shareholders in ${stats.topCompanyName}`
                : "Largest shareholders by shares held"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.topShareholders.map((s, i) => (
                <Link
                  key={s.id}
                  href={`/shareholders/${s.id}`}
                  className="flex items-center justify-between rounded-md px-3 py-2 transition-colors hover:bg-beige"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-6 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-white">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium leading-tight">
                        {s.canonicalName}
                      </p>
                      {s.orgNumber && (
                        <p className="text-xs text-muted-foreground">
                          {s.orgNumber}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="text-xs">
                      {s.entityType === "company" ? "Company" : "Person"}
                    </Badge>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-navy">
                        {Number(s.totalShares).toLocaleString(APP_LOCALE)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {s.ownershipPct}%
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Last Import */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4 text-ecit-blue" />
              Last Import
            </CardTitle>
            <CardDescription>Most recent data import</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.lastImport ? (
              <div className="space-y-4">
                <div className="rounded-md border border-cream bg-beige-light p-4">
                  <dl className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        File
                      </dt>
                      <dd className="mt-1 font-medium">{stats.lastImport.sourceFile}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Date
                      </dt>
                      <dd className="mt-1 font-medium">
                        {new Date(stats.lastImport.importedAt).toLocaleDateString(APP_LOCALE, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Records
                      </dt>
                      <dd className="mt-1 font-semibold text-navy">
                        {stats.lastImport.recordsImported}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Conflicts
                      </dt>
                      <dd className="mt-1">
                        <Badge
                          variant={(stats.lastImport.conflictsFound ?? 0) > 0 ? "destructive" : "secondary"}
                        >
                          {stats.lastImport.conflictsFound ?? 0}
                        </Badge>
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="flex gap-2">
                  <Link
                    href="/import"
                    className="rounded-md bg-navy px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-navy-light"
                  >
                    New Import
                  </Link>
                  {(stats.lastImport.conflictsFound ?? 0) > 0 && (
                    <Link
                      href="/data-cleanup"
                      className="rounded-md border border-cream px-3 py-1.5 text-xs font-medium text-navy transition-colors hover:bg-beige"
                    >
                      Review Conflicts
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No imports yet
                </p>
                <Link
                  href="/import"
                  className="rounded-md bg-navy px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-navy-light"
                >
                  Import Data
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  description,
  icon,
  href,
}: {
  title: string;
  value: number;
  description: string;
  icon: React.ReactNode;
  href?: string;
}) {
  const content = (
    <Card className={href ? "transition-colors hover:border-ecit-blue/30" : ""}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold text-navy">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}
