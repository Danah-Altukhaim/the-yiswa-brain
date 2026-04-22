import { createHmac } from "crypto";

const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? "";

interface JwtPayload {
  sub: string;
  tenantId: string;
  role: string;
  exp: number;
}

function base64url(str: string): string {
  return Buffer.from(str).toString("base64url");
}

export function signJwt(payload: Omit<JwtPayload, "exp">): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 900 }));
  const sig = createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    const [header, body, sig] = token.split(".");
    const expected = createHmac("sha256", JWT_SECRET)
      .update(`${header}.${body}`)
      .digest("base64url");
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as JwtPayload;
    if (payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function authenticate(
  authHeader?: string,
): Promise<{ userId: string; tenantId: string; role: string; isAdmin: boolean } | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const payload = verifyJwt(token);
  if (!payload) return null;
  return {
    userId: payload.sub,
    tenantId: payload.tenantId,
    role: payload.role,
    isAdmin: payload.role === "PAIR_ADMIN",
  };
}
