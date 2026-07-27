import { authenticateApiRequest } from "@/server/api/auth";
import { apiData, apiErrorResponse } from "@/server/api/errors";
import { listApiWorkspaces } from "@/server/api/zero-domain";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await authenticateApiRequest(request, ["projects:read"]);
    return apiData(await listApiWorkspaces(context.user));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
