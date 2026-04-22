/**
 * WhatsApp send retry behaviour. No live Meta call; fetch is mocked.
 *
 * Covers:
 *  - 503 is retried and the send eventually succeeds
 *  - 429 is retried (rate limit is transient)
 *  - 400 is NOT retried (client error is fatal)
 *  - stub path: token missing, fetch is never called
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../lib/env.js", () => ({
  env: {
    WHATSAPP_TOKEN: "test-token",
    WHATSAPP_PHONE_ID: "1234567890",
  },
}));

type FetchMock = ReturnType<typeof vi.fn>;

function response(status: number, body = ""): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as unknown as Response;
}

describe("sendWhatsApp", () => {
  let fetchMock: FetchMock;
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("retries on 503 and eventually succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(response(503, "overloaded"))
      .mockResolvedValueOnce(response(200));

    const { sendWhatsApp } = await import("../services/whatsapp.js");
    await expect(
      sendWhatsApp({ to: "+11234567890", template: "t", body: "hi" }),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 10_000);

  it("retries on 429", async () => {
    fetchMock
      .mockResolvedValueOnce(response(429, "rate limited"))
      .mockResolvedValueOnce(response(200));

    const { sendWhatsApp } = await import("../services/whatsapp.js");
    await expect(
      sendWhatsApp({ to: "+11234567890", template: "t", body: "hi" }),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 10_000);

  it("does not retry on 400 (client error is fatal)", async () => {
    fetchMock.mockResolvedValueOnce(response(400, "bad template"));

    const { sendWhatsApp } = await import("../services/whatsapp.js");
    await expect(sendWhatsApp({ to: "+11234567890", template: "t", body: "hi" })).rejects.toThrow(
      /whatsapp send failed: 400/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after 3 attempts on persistent 503", async () => {
    fetchMock.mockResolvedValue(response(503, "still overloaded"));

    const { sendWhatsApp } = await import("../services/whatsapp.js");
    await expect(sendWhatsApp({ to: "+11234567890", template: "t", body: "hi" })).rejects.toThrow(
      /whatsapp send failed: 503/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }, 15_000);
});

describe("sendWhatsApp stub path", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.resetModules();
  });

  it("logs and returns without calling fetch when token missing", async () => {
    vi.doMock("../lib/env.js", () => ({
      env: { WHATSAPP_TOKEN: undefined, WHATSAPP_PHONE_ID: undefined },
    }));
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { sendWhatsApp } = await import("../services/whatsapp.js");
    await sendWhatsApp({ to: "+11234567890", template: "t", body: "hi" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[whatsapp:stub]"));
  });
});
