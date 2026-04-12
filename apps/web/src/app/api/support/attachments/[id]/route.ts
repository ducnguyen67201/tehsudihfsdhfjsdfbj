import { resolveSessionFromRequest } from "@shared/rest/security/session";
import * as supportAttachments from "@shared/rest/services/support/support-attachment-service";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await resolveSessionFromRequest(request);
  if (!session?.user || !session.activeWorkspaceId) {
    return NextResponse.json(
      { error: { message: "Unauthorized", code: "UNAUTHORIZED" } },
      { status: 401 }
    );
  }

  const { id } = await params;

  const result = await supportAttachments.readFileData(id, session.activeWorkspaceId);
  if (!result) {
    return NextResponse.json(
      { error: { message: "Attachment not found", code: "NOT_FOUND" } },
      { status: 404 }
    );
  }

  return new NextResponse(result.data, {
    status: 200,
    headers: {
      "Content-Type": result.mimeType,
      "Content-Length": String(result.data.length),
      "Cache-Control": "private, max-age=240",
      ...(result.filename
        ? { "Content-Disposition": `inline; filename="${result.filename}"` }
        : {}),
    },
  });
}
