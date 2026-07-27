import { NextResponse } from "next/server";
import { pulsarOpenApi } from "@/server/api/openapi";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(pulsarOpenApi);
}
