import { NextResponse } from "next/server";
import { z } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiData<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(typeof error.details === "undefined"
            ? {}
            : { details: error.details }),
        },
      },
      { status: error.status }
    );
  }

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Некорректные данные запроса",
          details: error.flatten(),
        },
      },
      { status: 400 }
    );
  }

  console.error("[api:v1] unexpected error", error);
  return NextResponse.json(
    {
      error: {
        code: "internal_error",
        message: "Внутренняя ошибка сервера",
      },
    },
    { status: 500 }
  );
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Тело запроса должно быть JSON");
  }
}
