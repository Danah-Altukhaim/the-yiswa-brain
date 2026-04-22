/**
 * Ensure every tenant has a demo user (demo@example.com / password1, CLIENT_EDITOR,
 * walkthrough pre-completed). Safe to run repeatedly: upsert semantics per tenant.
 *
 * Also migrates the legacy per-tenant demo conventions (sara@example.com on
 * future-kid, demo@<slug>.pair elsewhere) to the unified demo@example.com account.
 *
 * Run (from the-brain root):
 *   vercel env pull .env.production --environment=production --yes
 *   (cd apps/api && set -a && source ../../.env.production && set +a && \
 *     node --import tsx ../../scripts/backfill-demo-users.ts)
 */

import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  const hash = await bcrypt.hash("password1", 10);
  const DEMO_EMAIL = "demo@example.com";

  const created: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.is_admin = 'true'`);
    const tenants = await tx.tenant.findMany({ select: { id: true, slug: true, name: true } });
    for (const t of tenants) {
      const existing = await tx.user.findUnique({
        where: { tenantId_email: { tenantId: t.id, email: DEMO_EMAIL } },
      });
      if (existing) {
        if (
          existing.role !== "CLIENT_EDITOR" ||
          !existing.walkthroughCompleted ||
          existing.passwordHash !== hash
        ) {
          await tx.user.update({
            where: { id: existing.id },
            data: {
              role: "CLIENT_EDITOR",
              walkthroughCompleted: true,
              passwordHash: hash,
            },
          });
          updated.push(t.slug);
        } else {
          skipped.push(t.slug);
        }
        continue;
      }
      await tx.user.create({
        data: {
          tenantId: t.id,
          email: DEMO_EMAIL,
          name: `${t.name} Demo`,
          role: "CLIENT_EDITOR",
          passwordHash: hash,
          walkthroughCompleted: true,
        },
      });
      created.push(t.slug);
    }
  });

  console.log("\n========== DEMO USER BACKFILL ==========");
  console.log(`Created:         ${created.length} (${created.join(", ") || "-"})`);
  console.log(`Reset to canon:  ${updated.length} (${updated.join(", ") || "-"})`);
  console.log(`Already canon:   ${skipped.length} (${skipped.join(", ") || "-"})`);
  console.log(`\nEach demo user: ${DEMO_EMAIL} / password1 (CLIENT_EDITOR, walkthrough done)`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
