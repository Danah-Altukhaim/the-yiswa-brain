/**
 * Entries route integration test. Exercises the core editing path.
 *
 * Covers:
 *  - unauthenticated requests are rejected
 *  - create then read round-trips the data
 *  - list returns the newly-created entry
 *  - invalid payload (missing required field) returns 400
 *  - patch produces a new version row and updates the entry
 *  - versions list reflects create + update history
 *  - rollback restores the prior snapshot and bumps version counter
 *  - unknown module slug returns 404
 *
 * Seed dependency: `pnpm seed` must have run; uses the `future-kid` tenant,
 * `demo@example.com` / `password1`, and the `faqs` module.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../server.js";

const TENANT = "future-kid";
const EMAIL = "demo@example.com";
const PASSWORD = "password1";
const MODULE = "faqs";

async function login(app: FastifyInstance): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { tenantSlug: TENANT, email: EMAIL, password: PASSWORD },
  });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  return res.json().data.token as string;
}

describe("entries routes", () => {
  let app: FastifyInstance;
  let token: string;
  let createdId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    token = await login(app);
  });

  afterAll(async () => {
    if (createdId) {
      await app.inject({
        method: "DELETE",
        url: `/api/v1/entries/${MODULE}/${createdId}`,
        headers: { authorization: `Bearer ${token}` },
      });
    }
    await app.close();
  });

  it("rejects unauthenticated reads", async () => {
    const res = await app.inject({ method: "GET", url: `/api/v1/entries/${MODULE}` });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 for unknown module", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/entries/no-such-module`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("creates an entry and round-trips on read", async () => {
    const payload = {
      data: {
        question_en: "What are the Future Kid opening hours?",
        question_ar: "ما هي ساعات عمل فيوتشر كيد؟",
        answer_en: "We are open 9 to 9 daily.",
        answer_ar: "نعمل من 9 إلى 9 يوميا.",
        category: "hours",
      },
    };
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/entries/${MODULE}`,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(created.statusCode).toBe(200);
    const body = created.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toMatch(/^[0-9a-f-]{36}$/i);
    createdId = body.data.id;

    const read = await app.inject({
      method: "GET",
      url: `/api/v1/entries/${MODULE}/${createdId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().data.data.category).toBe("hours");
  });

  it("lists entries and includes the newly created one", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/entries/${MODULE}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().data.map((e: { id: string }) => e.id);
    expect(ids).toContain(createdId);
  });

  it("rejects create with missing required field", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/entries/${MODULE}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { data: { question_en: "Only one field" } },
    });
    expect(res.statusCode).toBe(400);
  });

  it("patches the entry and writes a v2 version", async () => {
    const patched = await app.inject({
      method: "PATCH",
      url: `/api/v1/entries/${MODULE}/${createdId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        data: {
          question_en: "What are the opening hours?",
          question_ar: "ما هي ساعات العمل؟",
          answer_en: "9 to 9 daily.",
          answer_ar: "من 9 إلى 9 يوميا.",
          category: "hours",
        },
        changeSummary: "shortened copy",
      },
    });
    expect(patched.statusCode).toBe(200);

    const versions = await app.inject({
      method: "GET",
      url: `/api/v1/entries/${MODULE}/${createdId}/versions`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(versions.statusCode).toBe(200);
    const nums = versions.json().data.map((v: { versionNumber: number }) => v.versionNumber);
    expect(nums).toEqual(expect.arrayContaining([1, 2]));
    expect(Math.max(...nums)).toBe(2);
  });

  it("rolls back to v1 and writes a v3 that matches v1 snapshot", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/entries/${MODULE}/${createdId}/rollback`,
      headers: { authorization: `Bearer ${token}` },
      payload: { versionNumber: 1 },
    });
    expect(res.statusCode).toBe(200);

    const read = await app.inject({
      method: "GET",
      url: `/api/v1/entries/${MODULE}/${createdId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(read.json().data.data.answer_en).toBe("We are open 9 to 9 daily.");

    const versions = await app.inject({
      method: "GET",
      url: `/api/v1/entries/${MODULE}/${createdId}/versions`,
      headers: { authorization: `Bearer ${token}` },
    });
    const nums = versions.json().data.map((v: { versionNumber: number }) => v.versionNumber);
    expect(Math.max(...nums)).toBe(3);
  });

  it("rejects rollback to a non-existent version", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/entries/${MODULE}/${createdId}/rollback`,
      headers: { authorization: `Bearer ${token}` },
      payload: { versionNumber: 999 },
    });
    expect(res.statusCode).toBe(400);
  });
});
