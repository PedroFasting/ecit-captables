import type { Metadata } from "next";
import { db } from "@/db";
import { companies, holdings, shareholders, shareClasses } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { StructureView } from "./structure-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Corporate Structure - ECIT Cap Tables",
};

interface StructureNode {
  id: string;
  name: string;
  orgNumber: string;
  children: StructureNode[];
  ownershipPct: string | null;
  numShares: number | null;
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

async function getStructure() {
  const allCompanies = await db
    .select({
      id: companies.id,
      name: companies.name,
      orgNumber: companies.orgNumber,
    })
    .from(companies)
    .orderBy(companies.name);

  const orgToCompany = new Map(allCompanies.map((c) => [c.orgNumber, c]));
  const idToCompany = new Map(allCompanies.map((c) => [c.id, c]));

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

  // Build summarized edges
  const edgeSummary = new Map<
    string,
    {
      parentId: string;
      parentName: string;
      childId: string;
      childName: string;
      totalShares: number;
      ownershipPct: string | null;
    }
  >();

  const flatEdges: StructureEdge[] = [];

  for (const row of holdingRows) {
    if (!row.shareholderOrgNumber) continue;
    const parent = orgToCompany.get(row.shareholderOrgNumber);
    if (!parent) continue;
    const child = idToCompany.get(row.companyId);
    if (!child) continue;

    flatEdges.push({
      parentId: parent.id,
      parentName: parent.name,
      childId: child.id,
      childName: child.name,
      ownershipPct: row.ownershipPct,
      numShares: row.numShares,
      shareClassName: row.shareClassName,
    });

    const key = `${parent.id}->${child.id}`;
    const existing = edgeSummary.get(key);
    if (existing) {
      existing.totalShares += row.numShares ?? 0;
    } else {
      edgeSummary.set(key, {
        parentId: parent.id,
        parentName: parent.name,
        childId: child.id,
        childName: child.name,
        totalShares: row.numShares ?? 0,
        ownershipPct: row.ownershipPct,
      });
    }
  }

  // Build tree
  const childIds = new Set(
    Array.from(edgeSummary.values())
      .filter((e) => e.parentId !== e.childId) // exclude treasury shares
      .map((e) => e.childId)
  );

  const roots = allCompanies.filter((c) => !childIds.has(c.id));

  function buildTree(companyId: string, visited: Set<string>): StructureNode | null {
    if (visited.has(companyId)) return null;
    visited.add(companyId);

    const company = idToCompany.get(companyId);
    if (!company) return null;

    const childEdges = Array.from(edgeSummary.values()).filter(
      (e) => e.parentId === companyId && e.childId !== companyId
    );

    const children: StructureNode[] = [];
    for (const edge of childEdges) {
      const child = buildTree(edge.childId, new Set(visited));
      if (child) {
        child.ownershipPct = edge.ownershipPct;
        child.numShares = edge.totalShares;
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
    };
  }

  const tree = roots
    .map((r) => buildTree(r.id, new Set()))
    .filter(Boolean) as StructureNode[];

  return {
    tree,
    edges: flatEdges,
    nodes: allCompanies,
    summary: Array.from(edgeSummary.values()),
  };
}

export default async function StructurePage() {
  const data = await getStructure();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-navy">
          Corporate Structure
        </h1>
        <p className="text-sm text-muted-foreground">
          Ownership hierarchy across {data.nodes.length} companies with{" "}
          {data.summary.length} ownership links
        </p>
      </div>

      <StructureView data={data} />
    </div>
  );
}
