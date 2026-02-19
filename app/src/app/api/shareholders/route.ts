import { db } from "@/db";
import { shareholders, holdings } from "@/db/schema";
import { ilike, eq, sql, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const search = searchParams.get("search")?.trim();
  const entityType = searchParams.get("type"); // "company" | "person"

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        ilike(shareholders.canonicalName, `%${search}%`),
        ilike(shareholders.orgNumber, `%${search}%`)
      )
    );
  }
  if (entityType === "company" || entityType === "person") {
    conditions.push(eq(shareholders.entityType, entityType));
  }

  const rows = await db
    .select({
      id: shareholders.id,
      canonicalName: shareholders.canonicalName,
      orgNumber: shareholders.orgNumber,
      entityType: shareholders.entityType,
      country: shareholders.country,
      companiesCount: sql<number>`count(distinct ${holdings.companyId})`,
      totalHoldings: sql<number>`count(${holdings.id})`,
    })
    .from(shareholders)
    .leftJoin(holdings, eq(holdings.shareholderId, shareholders.id))
    .where(conditions.length > 0 ? sql`${conditions.reduce((a, b) => sql`${a} AND ${b}`)}` : undefined)
    .groupBy(shareholders.id)
    .orderBy(shareholders.canonicalName);

  return NextResponse.json(rows);
}
