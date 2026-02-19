import { db } from "@/db";
import { companies, shareClasses, holdings } from "@/db/schema";
import { ilike, sql, count } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const search = searchParams.get("search")?.trim();

  const conditions = [];
  if (search) {
    conditions.push(ilike(companies.name, `%${search}%`));
  }

  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      orgNumber: companies.orgNumber,
      shareCapital: companies.shareCapital,
      totalShares: companies.totalShares,
      totalVotes: companies.totalVotes,
      nominalValue: companies.nominalValue,
      shareClassCount: count(shareClasses.id),
      shareholderCount: sql<number>`count(distinct ${holdings.shareholderId})`,
    })
    .from(companies)
    .leftJoin(shareClasses, sql`${shareClasses.companyId} = ${companies.id}`)
    .leftJoin(holdings, sql`${holdings.companyId} = ${companies.id}`)
    .where(conditions.length > 0 ? conditions[0] : undefined)
    .groupBy(companies.id)
    .orderBy(companies.name);

  return NextResponse.json(rows);
}
