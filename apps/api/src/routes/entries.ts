import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createEntry, updateEntry } from "../services/entries.js";
import { notFound, badRequest } from "../lib/errors.js";
import { bumpVersion } from "../services/cache.js";

const routes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", app.authenticate);

  app.get("/search", async (req) => {
    const { q, limit } = z
      .object({
        q: z.string().min(1).max(200),
        limit: z.coerce.number().int().min(1).max(50).optional(),
      })
      .parse(req.query);
    const take = limit ?? 25;
    const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const results = await req.withTenant(async (tx) => {
      return tx.$queryRawUnsafe<
        Array<{
          id: string;
          module_id: string;
          module_slug: string;
          module_label: string;
          data: unknown;
          updated_at: Date;
          created_by_name: string | null;
        }>
      >(
        `SELECT e.id, e.module_id, m.slug AS module_slug, m.label AS module_label,
                e.data, e.updated_at,
                u.name AS created_by_name
         FROM entries e
         JOIN modules m ON m.id = e.module_id
         LEFT JOIN users u ON u.id = e.created_by
         WHERE e.status = 'active'
           AND (
             e.data::text ILIKE $1
             OR m.label ILIKE $1
             OR u.name ILIKE $1
           )
         ORDER BY e.updated_at DESC
         LIMIT $2`,
        pattern,
        take,
      );
    });
    return { success: true, data: results };
  });

  app.get("/:moduleSlug", async (req) => {
    const { moduleSlug } = req.params as { moduleSlug: string };
    const entries = await req.withTenant(async (tx) => {
      const mod = await tx.module.findFirst({ where: { slug: moduleSlug } });
      if (!mod) throw notFound();
      return tx.entry.findMany({
        where: { moduleId: mod.id },
        orderBy: { updatedAt: "desc" },
        take: 200,
      });
    });
    return { success: true, data: entries };
  });

  app.post("/:moduleSlug", async (req) => {
    const { moduleSlug } = req.params as { moduleSlug: string };
    const body = z
      .object({
        data: z.record(z.unknown()),
        publishAt: z.string().datetime().optional(),
        expiresAt: z.string().datetime().optional(),
        externalId: z.string().optional(),
      })
      .parse(req.body);

    const userId = (req.user as { sub: string } | undefined)?.sub;
    const entry = await req.withTenant(async (tx) => {
      const mod = await tx.module.findFirst({ where: { slug: moduleSlug } });
      if (!mod) throw notFound();
      return createEntry(tx, {
        tenantId: req.tenantId!,
        moduleId: mod.id,
        data: body.data,
        userId,
        publishAt: body.publishAt ? new Date(body.publishAt) : null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        externalId: body.externalId,
      });
    });
    return { success: true, data: entry };
  });

  app.delete("/:moduleSlug/:id", async (req) => {
    const { id } = req.params as { id: string };
    const tenantId = req.tenantId!;
    const userId = (req.user as { sub: string } | undefined)?.sub;
    await req.withTenant(async (tx) => {
      const existing = await tx.entry.findUnique({ where: { id }, select: { data: true } });
      if (!existing) throw notFound("Entry not found");
      await tx.entry.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          action: "delete",
          entityType: "entry",
          entityId: id,
          diff: (existing.data ?? null) as never,
        },
      });
      await bumpVersion(tenantId);
    });
    return { success: true, data: { deleted: id } };
  });

  app.get("/:moduleSlug/:id/versions", async (req) => {
    const { id } = req.params as { id: string };
    const versions = await req.withTenant((tx) =>
      tx.entryVersion.findMany({
        where: { entryId: id },
        orderBy: { versionNumber: "desc" },
      }),
    );
    return { success: true, data: versions };
  });

  app.post("/:moduleSlug/:id/rollback", async (req) => {
    const { id } = req.params as { id: string };
    const body = z.object({ versionNumber: z.number().int().positive() }).parse(req.body);
    const tenantId = req.tenantId!;
    const userId = (req.user as { sub: string } | undefined)?.sub;
    const entry = await req.withTenant(async (tx) => {
      const target = await tx.entryVersion.findFirst({
        where: { entryId: id, versionNumber: body.versionNumber },
      });
      if (!target) throw badRequest("Version not found", "VERSION_NOT_FOUND");
      return updateEntry(tx, {
        tenantId,
        entryId: id,
        data: target.dataSnapshot,
        userId,
        changeSummary: `rollback to v${body.versionNumber}`,
      });
    });
    return { success: true, data: entry };
  });

  app.get("/:moduleSlug/:id", async (req) => {
    const { id } = req.params as { id: string };
    const entry = await req.withTenant((tx) => tx.entry.findUnique({ where: { id } }));
    if (!entry) throw notFound();
    return { success: true, data: entry };
  });

  app.get("/:moduleSlug/export.csv", async (req, reply) => {
    const { moduleSlug } = req.params as { moduleSlug: string };
    const { entries, mod } = await req.withTenant(async (tx) => {
      const mod = await tx.module.findFirst({ where: { slug: moduleSlug } });
      if (!mod) throw notFound();
      const entries = await tx.entry.findMany({ where: { moduleId: mod.id, status: "active" } });
      return { entries, mod };
    });
    const fields = mod.fieldDefinitions as Array<{ key: string; localized: boolean }>;
    const headers: string[] = ["id"];
    for (const f of fields) {
      if (f.localized) {
        headers.push(`${f.key}_en`, `${f.key}_ar`);
      } else {
        headers.push(f.key);
      }
    }
    const rows = entries.map((e) => {
      const d = e.data as Record<string, unknown>;
      return [e.id, ...headers.slice(1).map((h) => csvEscape(d[h]))].join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", `attachment; filename="${moduleSlug}.csv"`);
    return csv;
  });

  app.patch("/:moduleSlug/:id", async (req) => {
    const { id } = req.params as { moduleSlug: string; id: string };
    const body = z
      .object({ data: z.record(z.unknown()), changeSummary: z.string().optional() })
      .parse(req.body);
    const userId = (req.user as { sub: string } | undefined)?.sub;
    const updated = await req.withTenant((tx) =>
      updateEntry(tx, {
        tenantId: req.tenantId!,
        entryId: id,
        data: body.data,
        userId,
        changeSummary: body.changeSummary,
      }),
    );
    return { success: true, data: updated };
  });
};

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default routes;
