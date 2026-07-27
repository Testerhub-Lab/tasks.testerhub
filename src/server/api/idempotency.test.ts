import { describe, expect, it, vi } from "vitest";
import type { ZeroTransaction } from "@/zero/db";
import type { ApiContext } from "./auth";
import {
  getIdempotentResponse,
  requireIdempotencyKey,
  storeIdempotentResponse,
} from "./idempotency";

const context = {
  requestId: "request-1",
  tokenId: "00000000-0000-7000-8000-000000000001",
  tokenName: "test",
  scopes: ["issues:write"],
  user: {
    id: "00000000-0000-7000-8000-000000000002",
    email: null,
    name: "Test",
  },
} satisfies ApiContext;

function fakeTransaction(query: ReturnType<typeof vi.fn>) {
  return {
    dbTransaction: { query },
  } as unknown as ZeroTransaction;
}

describe("API idempotency store", () => {
  it("validates the public idempotency key contract", () => {
    const request = new Request("http://localhost", {
      headers: { "Idempotency-Key": "mcp:create_issue:123" },
    });
    expect(requireIdempotencyKey(request)).toBe("mcp:create_issue:123");
    expect(() =>
      requireIdempotencyKey(
        new Request("http://localhost", {
          headers: { "Idempotency-Key": "contains spaces" },
        })
      )
    ).toThrow("Idempotency-Key");
  });

  it("locks a token/key and returns a stored response", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          operation: "issues.create",
          response: { id: "issue-1" },
          status_code: 201,
        },
      ]);

    await expect(
      getIdempotentResponse(
        fakeTransaction(query),
        context,
        "request-key",
        "issues.create"
      )
    ).resolves.toEqual({
      response: { id: "issue-1" },
      statusCode: 201,
    });
    expect(query.mock.calls[0]?.[0]).toContain("pg_advisory_xact_lock");
    expect(query.mock.calls[2]?.[1]).toEqual([
      context.tokenId,
      "request-key",
    ]);
  });

  it("rejects reuse of a key for another operation", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          operation: "projects.create",
          response: {},
          status_code: 201,
        },
      ]);

    await expect(
      getIdempotentResponse(
        fakeTransaction(query),
        context,
        "request-key",
        "issues.create"
      )
    ).rejects.toMatchObject({
      status: 409,
      code: "idempotency_conflict",
    });
  });

  it("stores the response in the same server transaction", async () => {
    const query = vi.fn().mockResolvedValue([]);
    await storeIdempotentResponse(fakeTransaction(query), context, {
      key: "request-key",
      operation: "issues.create",
      response: { id: "issue-1" },
      statusCode: 201,
    });

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain(
      "INSERT INTO api_idempotency_keys"
    );
    expect(query.mock.calls[0]?.[1]?.slice(1, 6)).toEqual([
      context.tokenId,
      "request-key",
      "issues.create",
      JSON.stringify({ id: "issue-1" }),
      201,
    ]);
  });
});
