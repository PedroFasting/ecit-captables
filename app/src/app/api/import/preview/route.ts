import { previewImport } from "@/lib/import/importer";
import { NextRequest, NextResponse } from "next/server";

/**
 * Preview an import: parse Excel and return diff against current DB state.
 * No database writes — safe to call repeatedly.
 *
 * Accepts multipart/form-data with a single "file" field.
 * Returns the ImportDiff for UI preview.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided. Send a 'file' field in form-data." },
        { status: 400 }
      );
    }

    if (!file.name.endsWith(".xlsx")) {
      return NextResponse.json(
        { error: "Only .xlsx files are supported" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await previewImport(buffer, file.name);

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Preview error:", message);
    return NextResponse.json(
      { error: `Preview failed: ${message}` },
      { status: 500 }
    );
  }
}
