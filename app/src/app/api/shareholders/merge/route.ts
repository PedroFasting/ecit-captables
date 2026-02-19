import { db } from "@/db";
import {
  shareholders,
  shareholderAliases,
  shareholderContacts,
  holdings,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

/**
 * Merge two shareholder entities into one.
 *
 * Body: { keepId: string, mergeId: string }
 *
 * - All holdings from mergeId are moved to keepId
 * - All aliases from mergeId are moved to keepId
 * - All contacts from mergeId are moved to keepId
 * - mergeId shareholder record is deleted
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { keepId, mergeId } = body;

    if (!keepId || !mergeId) {
      return NextResponse.json(
        { error: "Both keepId and mergeId are required" },
        { status: 400 }
      );
    }

    if (keepId === mergeId) {
      return NextResponse.json(
        { error: "keepId and mergeId must be different" },
        { status: 400 }
      );
    }

    // Verify both exist
    const [keep] = await db
      .select()
      .from(shareholders)
      .where(eq(shareholders.id, keepId))
      .limit(1);

    const [merge] = await db
      .select()
      .from(shareholders)
      .where(eq(shareholders.id, mergeId))
      .limit(1);

    if (!keep) {
      return NextResponse.json(
        { error: `Shareholder to keep (${keepId}) not found` },
        { status: 404 }
      );
    }

    if (!merge) {
      return NextResponse.json(
        { error: `Shareholder to merge (${mergeId}) not found` },
        { status: 404 }
      );
    }

    // Move all holdings
    const movedHoldings = await db
      .update(holdings)
      .set({ shareholderId: keepId })
      .where(eq(holdings.shareholderId, mergeId))
      .returning();

    // Move all aliases
    const movedAliases = await db
      .update(shareholderAliases)
      .set({ shareholderId: keepId })
      .where(eq(shareholderAliases.shareholderId, mergeId))
      .returning();

    // Move all contacts
    const movedContacts = await db
      .update(shareholderContacts)
      .set({ shareholderId: keepId })
      .where(eq(shareholderContacts.shareholderId, mergeId))
      .returning();

    // Add the merged shareholder's name as an alias
    await db.insert(shareholderAliases).values({
      shareholderId: keepId,
      nameVariant: merge.canonicalName,
      email: null,
      sourceCompanyId: null,
    });

    // Delete the merged shareholder
    await db
      .delete(shareholders)
      .where(eq(shareholders.id, mergeId));

    return NextResponse.json({
      message: `Merged "${merge.canonicalName}" into "${keep.canonicalName}"`,
      kept: { id: keepId, name: keep.canonicalName },
      merged: { id: mergeId, name: merge.canonicalName },
      movedHoldings: movedHoldings.length,
      movedAliases: movedAliases.length,
      movedContacts: movedContacts.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Merge error:", message);
    return NextResponse.json(
      { error: `Merge failed: ${message}` },
      { status: 500 }
    );
  }
}
