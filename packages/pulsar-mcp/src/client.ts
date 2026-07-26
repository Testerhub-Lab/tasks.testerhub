import { randomUUID } from "node:crypto";

type ApiEnvelope<T> = {
  data: T;
};

type ApiErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export class PulsarApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "PulsarApiError";
  }
}

export type PulsarClientOptions = {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
};

export class PulsarClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(options: PulsarClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async request<T>(
    path: string,
    options: {
      method?: "GET" | "POST" | "PATCH";
      body?: unknown;
      idempotentCreate?: boolean;
    } = {}
  ): Promise<T> {
    const requestId = randomUUID();
    const method = options.method ?? "GET";
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.token}`,
        "User-Agent": "@testerhub/pulsar-mcp/0.1.0",
        "X-Request-Id": requestId,
        ...(typeof options.body === "undefined"
          ? {}
          : { "Content-Type": "application/json" }),
        ...(options.idempotentCreate
          ? { "Idempotency-Key": requestId }
          : {}),
      },
      body:
        typeof options.body === "undefined"
          ? undefined
          : JSON.stringify(options.body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const payload = (await response.json().catch(() => null)) as
      | ApiEnvelope<T>
      | ApiErrorEnvelope
      | null;
    if (!response.ok) {
      const error = payload && "error" in payload ? payload.error : undefined;
      throw new PulsarApiError(
        error?.message ?? `Pulsar API returned HTTP ${response.status}`,
        response.status,
        error?.code ?? "http_error",
        error?.details
      );
    }
    if (!payload || !("data" in payload)) {
      throw new PulsarApiError(
        "Pulsar API returned an invalid response",
        response.status,
        "invalid_response"
      );
    }
    return payload.data;
  }
}

export function createPulsarClientFromEnv() {
  const token = process.env.PULSAR_API_TOKEN?.trim();
  if (!token) {
    throw new Error("PULSAR_API_TOKEN is required");
  }

  return new PulsarClient({
    baseUrl:
      process.env.PULSAR_BASE_URL?.trim() ||
      "https://pulsar.testerhub.ru",
    token,
  });
}
