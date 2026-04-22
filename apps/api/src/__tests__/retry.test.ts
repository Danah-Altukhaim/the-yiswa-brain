import { describe, it, expect } from "vitest";
import { isTransientError, withRetry, withTimeout } from "../lib/retry.js";

describe("isTransientError", () => {
  it("recognises 5xx as transient", () => {
    expect(isTransientError({ status: 500 })).toBe(true);
    expect(isTransientError({ statusCode: 502 })).toBe(true);
    expect(isTransientError({ response: { status: 503 } })).toBe(true);
  });

  it("recognises 429 as transient", () => {
    expect(isTransientError({ status: 429 })).toBe(true);
  });

  it("treats 4xx (except 408/425/429) as fatal", () => {
    expect(isTransientError({ status: 400 })).toBe(false);
    expect(isTransientError({ status: 401 })).toBe(false);
    expect(isTransientError({ status: 403 })).toBe(false);
    expect(isTransientError({ status: 404 })).toBe(false);
  });

  it("recognises network errors by message", () => {
    expect(isTransientError(new Error("ECONNRESET"))).toBe(true);
    expect(isTransientError(new Error("socket hang up"))).toBe(true);
    expect(isTransientError(new Error("fetch failed"))).toBe(true);
    expect(isTransientError(new Error("Operation timed out"))).toBe(true);
  });

  it("treats non-error non-status as fatal", () => {
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError("boom")).toBe(false);
    expect(isTransientError({})).toBe(false);
  });
});

describe("withRetry", () => {
  it("returns on first success", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries on transient error then succeeds", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw { status: 503 };
        return "ok";
      },
      { baseMs: 1, attempts: 3 },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("does not retry on fatal error", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw { status: 400 };
        },
        { baseMs: 1 },
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(calls).toBe(1);
  });

  it("gives up after attempts exhausted", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw { status: 500 };
        },
        { baseMs: 1, attempts: 3 },
      ),
    ).rejects.toMatchObject({ status: 500 });
    expect(calls).toBe(3);
  });
});

describe("withTimeout", () => {
  it("resolves before the deadline", async () => {
    const result = await withTimeout(async () => "ok", { ms: 100 });
    expect(result).toBe("ok");
  });

  it("aborts the signal after the deadline", async () => {
    await expect(
      withTimeout(
        (signal) =>
          new Promise((_, rej) => {
            signal.addEventListener("abort", () => rej(new Error("aborted")));
          }),
        { ms: 20 },
      ),
    ).rejects.toThrow("aborted");
  });
});
