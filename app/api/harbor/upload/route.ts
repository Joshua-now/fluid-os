import { NextRequest, NextResponse } from "next/server";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 });

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const buffer = Buffer.from(await file.arrayBuffer());
    let content = "";

    if (["txt", "md", "csv", "json", "ts", "js", "py"].includes(ext)) {
      content = buffer.toString("utf8");

    } else if (ext === "pdf") {
      // Dynamic import so build doesn't fail if pdf-parse isn't installed
      try {
        const pdfParse = (await import("pdf-parse")).default;
        const parsed = await pdfParse(buffer);
        content = parsed.text;
      } catch {
        return NextResponse.json({ error: "pdf-parse not installed. Run: npm install pdf-parse" }, { status: 500 });
      }

    } else if (ext === "docx") {
      try {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        content = result.value;
      } catch {
        return NextResponse.json({ error: "mammoth not installed. Run: npm install mammoth" }, { status: 500 });
      }

    } else {
      return NextResponse.json(
        { error: `Unsupported file type: .${ext}. Supported: txt, md, csv, json, pdf, docx` },
        { status: 415 }
      );
    }

    content = content.trim();
    if (content.length < 10) {
      return NextResponse.json({ error: "File appears empty or unreadable" }, { status: 422 });
    }

    // Truncate very large docs — Harbor's context window has limits
    const MAX_CHARS = 40_000;
    const truncated = content.length > MAX_CHARS;
    if (truncated) content = content.slice(0, MAX_CHARS);

    return NextResponse.json({
      filename: file.name,
      ext,
      chars: content.length,
      truncated,
      content,
    });
  } catch (err: any) {
    console.error("[Harbor Upload]", err?.message);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
