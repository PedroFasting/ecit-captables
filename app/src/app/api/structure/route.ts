import { db } from "@/db";
import { companies, holdings, shareholders, shareClasses } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * Corporate structure endpoint.
 *
 * Derives the parent-child hierarchy from holdings data:
 * when a shareholder is also a company in our system, that creates
 * a parent → child ownership edge.
 *
 * Returns both tree format (for tree view) and flat edges (for graph view).
 */

interface StructureNode {
  id: string;
  name: string;
  orgNumber: string;
  children: StructureNode[];
  ownershipPct: string | null;
  numShares: number | null;
  shareClasses: { name: string; numShares: number | null; pct: string | null }[];
}

interface StructureEdge {
  parentId: string;
  parentName: string;
  childId: string;
  childName: string;
  ownershipPct: string | null;
  numShares: number | null;
  shareClassName: string | null;
}

export async function GET() {
  // Get all companies
  const allCompanies = await db
    .select({
      id: companies.id,
      name: companies.name,
      orgNumber: companies.orgNumber,
      shareCapital: companies.shareCapital,
      totalShares: companies.totalShares,
    })
    .from(companies)
    .orderBy(companies.name);

  // Build org number → company map
  const orgToCompany = new Map(
    allCompanies.map((c) => [c.orgNumber, c])
  );
  const idToCompany = new Map(
    allCompanies.map((c) => [c.id, c])
  );

  // Get all holdings where the shareholder is a company entity with an org number
  const holdingRows = await db
    .select({
      shareholderOrgNumber: shareholders.orgNumber,
      companyId: holdings.companyId,
      numShares: holdings.numShares,
      ownershipPct: holdings.ownershipPct,
      shareClassName: shareClasses.name,
    })
    .from(holdings)
    .innerJoin(shareholders, eq(holdings.shareholderId, shareholders.id))
    .leftJoin(shareClasses, eq(holdings.shareClassId, shareClasses.id))
    .where(sql`${shareholders.orgNumber} is not null`);

  // Build edges: only where the shareholder's org number matches one of our companies
  const flatEdges: StructureEdge[] = [];

  const edgeSummary = new Map<
    string,
    {
      parentId: string;
      parentName: string;
      childId: string;
      childName: string;
      childOrgNumber: string;
      totalShares: number;
      shareClasses: { name: string; numShares: number | null; pct: string | null }[];
      ownershipPct: string | null;
    }
  >();

  for (const row of holdingRows) {
    if (!row.shareholderOrgNumber) continue;
    const parentCompany = orgToCompany.get(row.shareholderOrgNumber);
    if (!parentCompany) continue; // Shareholder is a company but not one of our 12
    const childCompany = idToCompany.get(row.companyId);
    if (!childCompany) continue;

    flatEdges.push({
      parentId: parentCompany.id,
      parentName: parentCompany.name,
      childId: childCompany.id,
      childName: childCompany.name,
      ownershipPct: row.ownershipPct,
      numShares: row.numShares,
      shareClassName: row.shareClassName,
    });

    const key = `${parentCompany.id}->${childCompany.id}`;
    const existing = edgeSummary.get(key);
    if (existing) {
      existing.totalShares += row.numShares ?? 0;
      if (row.shareClassName) {
        existing.shareClasses.push({
          name: row.shareClassName,
          numShares: row.numShares,
          pct: row.ownershipPct,
        });
      }
    } else {
      edgeSummary.set(key, {
        parentId: parentCompany.id,
        parentName: parentCompany.name,
        childId: childCompany.id,
        childName: childCompany.name,
        childOrgNumber: childCompany.orgNumber,
        totalShares: row.numShares ?? 0,
        shareClasses: row.shareClassName
          ? [{ name: row.shareClassName, numShares: row.numShares, pct: row.ownershipPct }]
          : [],
        ownershipPct: row.ownershipPct,
      });
    }
  }

  // Build tree: find root nodes (companies not owned by any other company in our set)
  // Exclude self-referencing edges (treasury shares) from child determination
  const childIds = new Set(
    Array.from(edgeSummary.values())
      .filter((e) => e.parentId !== e.childId)
      .map((e) => e.childId)
  );
  const parentIds = new Set(
    Array.from(edgeSummary.values()).map((e) => e.parentId)
  );

  // Roots are companies that are parents but not children, plus companies with no edges
  const roots = allCompanies.filter((c) => !childIds.has(c.id));

  function buildTree(companyId: string, visited: Set<string>): StructureNode | null {
    if (visited.has(companyId)) return null;
    visited.add(companyId);

    const company = idToCompany.get(companyId);
    if (!company) return null;

    const childEdges = Array.from(edgeSummary.values()).filter(
      (e) => e.parentId === companyId
    );

    const children: StructureNode[] = [];
    for (const edge of childEdges) {
      const child = buildTree(edge.childId, new Set(visited));
      if (child) {
        child.ownershipPct = edge.ownershipPct;
        child.numShares = edge.totalShares;
        child.shareClasses = edge.shareClasses;
        children.push(child);
      }
    }

    return {
      id: company.id,
      name: company.name,
      orgNumber: company.orgNumber,
      children,
      ownershipPct: null,
      numShares: null,
      shareClasses: [],
    };
  }

  const tree = roots
    .map((r) => buildTree(r.id, new Set()))
    .filter(Boolean) as StructureNode[];

  return NextResponse.json({
    tree,
    edges: flatEdges,
    nodes: allCompanies,
    summary: Array.from(edgeSummary.values()),
  });
}
