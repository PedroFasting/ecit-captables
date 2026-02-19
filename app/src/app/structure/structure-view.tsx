"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, ChevronDown, Building2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { APP_LOCALE } from "@/lib/utils";

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

interface StructureData {
  tree: StructureNode[];
  edges: StructureEdge[];
  nodes: { id: string; name: string; orgNumber: string }[];
  summary: {
    parentId: string;
    parentName: string;
    childId: string;
    childName: string;
    totalShares: number;
    ownershipPct: string | null;
  }[];
}

function formatPct(pct: string | null): string {
  if (!pct) return "";
  const n = parseFloat(pct);
  if (isNaN(n)) return "";
  return `${n.toFixed(2)}%`;
}

export function StructureView({ data }: { data: StructureData }) {
  const [view, setView] = useState<"tree" | "table">("tree");

  return (
    <div className="space-y-4">
      {/* View toggle */}
      <div className="flex gap-1" role="group" aria-label="View mode">
        {(["tree", "table"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ecit-blue focus-visible:ring-offset-2 ${
              view === v
                ? "bg-navy text-white"
                : "border border-cream text-muted-foreground hover:bg-beige"
            }`}
          >
            {v} View
          </button>
        ))}
      </div>

      {view === "tree" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ownership Hierarchy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {data.tree.map((node) => (
                <TreeNode key={node.id} node={node} depth={0} />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ownership Links</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parent Company</TableHead>
                  <TableHead>Child Company</TableHead>
                  <TableHead>Share Class</TableHead>
                  <TableHead className="text-right">Shares</TableHead>
                  <TableHead className="text-right">Ownership</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.edges.map((edge, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Link
                        href={`/companies/${edge.parentId}`}
                        className="font-medium text-navy hover:underline"
                      >
                        {edge.parentName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/companies/${edge.childId}`}
                        className="font-medium text-navy hover:underline"
                      >
                        {edge.childName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {edge.shareClassName && (
                        <Badge variant="outline" className="text-xs">
                          {edge.shareClassName}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {(edge.numShares ?? 0).toLocaleString(APP_LOCALE)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPct(edge.ownershipPct)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TreeNode({ node, depth }: { node: StructureNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 3);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-beige"
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${node.name}`}
            className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-navy/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ecit-blue"
          >
            {expanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>
        ) : (
          <span className="size-5" />
        )}

        <Building2 className="size-4 text-navy/60" />

        <Link
          href={`/companies/${node.id}`}
          className="text-sm font-medium text-navy hover:underline"
        >
          {node.name}
        </Link>

        {node.ownershipPct && (
          <Badge variant="outline" className="ml-1 text-[10px]">
            {formatPct(node.ownershipPct)}
          </Badge>
        )}

        {node.numShares != null && node.numShares > 0 && (
          <span className="text-xs text-muted-foreground">
            ({node.numShares.toLocaleString(APP_LOCALE)} shares)
          </span>
        )}
      </div>

      {expanded &&
        hasChildren &&
        node.children.map((child) => (
          <TreeNode key={child.id} node={child} depth={depth + 1} />
        ))}
    </div>
  );
}
