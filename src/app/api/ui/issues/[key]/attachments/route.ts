import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import {
  listApiAttachments,
  prepareApiAttachmentUpload,
} from "@/server/api/zero-attachment-domain";
import { prepareAttachmentUploadApiSchema } from "@/server/api/schemas";
import { apiErrorResponse } from "@/server/api/errors";

export const dynamic = "force-dynamic";

function actor(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  return { id: user.id, email: null, name: user.name };
}

type AttachmentRouteProps = {
  params: Promise<{ key: string }>;
};

export async function GET(
  _request: Request,
  { params }: AttachmentRouteProps
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { key } = await params;
    return NextResponse.json({
      ok: true,
      attachments: await listApiAttachments(actor(user), key),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: AttachmentRouteProps
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const input = prepareAttachmentUploadApiSchema.parse(
      await request.json()
    );
    const { key } = await params;
    const upload = await prepareApiAttachmentUpload(actor(user), key, input);
    const response = NextResponse.json({ ok: true, ...upload }, { status: 201 });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
