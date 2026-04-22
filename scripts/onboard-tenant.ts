/**
 * Onboard a new tenant and its first admin user.
 *
 * Creates the Tenant row, hashes a cryptographically strong random password,
 * creates a CLIENT_EDITOR admin user, and emails the initial credentials if
 * SMTP_URL is configured. The password is also printed to stdout as a fallback.
 *
 * Run (tsx is resolvable from apps/api/node_modules):
 *   cd /Users/mac/Documents/The\ Brain/the-brain && \
 *   export $(grep -v '^#' .env | xargs) && \
 *   (cd apps/api && node --import tsx ../../scripts/onboard-tenant.ts \
 *     --slug=flare --name=Flare \
 *     --admin-email=owner@flare.com --admin-name="Flare Owner" \
 *     [--primary-color=#FF6B35] [--logo-url=https://...] [--favicon-url=https://...] \
 *     [--timezone=Asia/Kuwait] [--weekly-report-email=ops@flare.com])
 */

import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of argv.slice(2)) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function required(args: Record<string, string>, key: string): string {
  const v = args[key];
  if (!v) {
    console.error(`Missing required --${key}`);
    process.exit(1);
  }
  return v;
}

const SLUG_RE = /^[a-z][a-z0-9-]{0,63}$/;

async function sendCredentialsEmail(args: {
  to: string;
  tenantName: string;
  loginUrl: string;
  password: string;
}): Promise<boolean> {
  if (!process.env.SMTP_URL) return false;
  // Local import to avoid loading nodemailer when SMTP is not configured.
  const { default: nodemailer } = await import("nodemailer");
  const transporter = nodemailer.createTransport(process.env.SMTP_URL, {
    connectionTimeout: 10_000,
    greetingTimeout: 5_000,
    socketTimeout: 20_000,
  });
  const text = [
    `Your ${args.tenantName} workspace on The Brain is ready.`,
    ``,
    `Login: ${args.loginUrl}`,
    `Email: ${args.to}`,
    `Temporary password: ${args.password}`,
    ``,
    `Please change your password after your first sign-in.`,
  ].join("\n");
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? "brain@pairai.com",
    to: args.to,
    subject: `Welcome to The Brain, your ${args.tenantName} workspace is ready`,
    text,
  });
  return true;
}

async function main() {
  const args = parseArgs(process.argv);
  const slug = required(args, "slug");
  const name = required(args, "name");
  const adminEmail = required(args, "admin-email");
  const adminName = required(args, "admin-name");
  const primaryColor = args["primary-color"];
  const logoUrl = args["logo-url"];
  const faviconUrl = args["favicon-url"];
  const timezone = args["timezone"];
  const weeklyReportEmail = args["weekly-report-email"];
  const noDemoUser = args["no-demo-user"] === "true" || args["no-demo-user"] === "1";
  const publicUrlBase = process.env.PUBLIC_URL_BASE ?? "https://thebrain.app";

  if (!SLUG_RE.test(slug)) {
    console.error(`Invalid slug "${slug}". Must match ${SLUG_RE}.`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const password = randomBytes(18).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 10);
  // Demo user convention: demo@example.com / password1 (CLIENT_EDITOR, walkthrough done).
  // Shared across every tenant; Prisma's (tenantId,email) unique constraint keeps them distinct.
  // Powers the one-click tenant dropdown on the apex login.
  const demoEmail = "demo@example.com";
  const demoPasswordHash = await bcrypt.hash("password1", 10);

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.is_admin = 'true'`);
    const tenant = await tx.tenant.create({
      data: {
        slug,
        name,
        primaryColor: primaryColor ?? null,
        logoUrl: logoUrl ?? null,
        faviconUrl: faviconUrl ?? null,
        weeklyReportEmail: weeklyReportEmail ?? null,
        ...(timezone ? { timezone } : {}),
      },
    });
    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email: adminEmail,
        name: adminName,
        role: "CLIENT_EDITOR",
        passwordHash,
      },
    });
    const demoUser = noDemoUser
      ? null
      : await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: demoEmail,
            name: `${name} Demo`,
            role: "CLIENT_EDITOR",
            passwordHash: demoPasswordHash,
            walkthroughCompleted: true,
          },
        });
    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        action: "tenant.onboarded",
        entityType: "tenant",
        entityId: tenant.id,
        diff: { source: "onboard-tenant.ts", demoUser: !noDemoUser },
      },
    });
    return { tenant, user, demoUser };
  });

  const loginUrl = publicUrlBase.includes("thebrain.app")
    ? `https://${slug}.thebrain.app`
    : `${publicUrlBase}?tenant=${slug}`;

  let emailed = false;
  try {
    emailed = await sendCredentialsEmail({
      to: adminEmail,
      tenantName: name,
      loginUrl,
      password,
    });
  } catch (err) {
    console.warn(
      `[email] failed to send credentials: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  console.log("\n========== TENANT ONBOARDED ==========");
  console.log(`Tenant:    ${result.tenant.name} (${result.tenant.slug})`);
  console.log(`Tenant ID: ${result.tenant.id}`);
  console.log(`Admin:     ${result.user.name} <${result.user.email}>`);
  console.log(`Login URL: ${loginUrl}`);
  console.log(`Temp password: ${password}`);
  console.log(`Email sent: ${emailed ? "yes" : "no (SMTP not configured or send failed)"}`);
  if (result.demoUser) {
    console.log(`\nDemo user: ${demoEmail} / password1 (CLIENT_EDITOR, for one-click dropdown)`);
  }
  console.log(
    "\nShare the admin credentials securely. The admin should change the password after first login.",
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
