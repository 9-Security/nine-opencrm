import { prisma } from '../client';
import { requireTenantId } from '../errors';

export const TAG_ENTITY_TYPES = ['company', 'contact'] as const;
export type TagEntityType = (typeof TAG_ENTITY_TYPES)[number];

function cleanNames(names: string[]) {
  return [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 20);
}

export async function listTags(tenantId: string) {
  requireTenantId(tenantId);
  return prisma.tag.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}

export async function entityIdsForTag(
  tenantId: string,
  entityType: TagEntityType,
  name: string,
) {
  requireTenantId(tenantId);
  const tag = await prisma.tag.findFirst({
    where: { tenantId, name: name.trim() },
    select: { id: true },
  });
  if (!tag) return [];
  const rows = await prisma.tagging.findMany({
    where: { tenantId, entityType, tagId: tag.id },
    select: { entityId: true },
  });
  return rows.map((r) => r.entityId);
}

export async function attachTags<T extends { id: string }>(
  tenantId: string,
  entityType: TagEntityType,
  rows: T[],
): Promise<Array<T & { tags: string[] }>> {
  requireTenantId(tenantId);
  if (rows.length === 0) return [];
  const taggings = await prisma.tagging.findMany({
    where: {
      tenantId,
      entityType,
      entityId: { in: rows.map((r) => r.id) },
    },
    include: { tag: { select: { name: true } } },
  });
  const byEntity = new Map<string, string[]>();
  for (const row of taggings) {
    const list = byEntity.get(row.entityId) ?? [];
    list.push(row.tag.name);
    byEntity.set(row.entityId, list);
  }
  return rows.map((row) => ({ ...row, tags: byEntity.get(row.id) ?? [] }));
}

export async function replaceTags(
  tenantId: string,
  entityType: TagEntityType,
  entityId: string,
  names: string[],
) {
  requireTenantId(tenantId);
  const cleaned = cleanNames(names);
  await prisma.$transaction(async (tx) => {
    const tags = [];
    for (const name of cleaned) {
      const tag = await tx.tag.upsert({
        where: { tenantId_name: { tenantId, name } },
        update: {},
        create: { tenantId, name },
      });
      tags.push(tag);
    }
    await tx.tagging.deleteMany({ where: { tenantId, entityType, entityId } });
    if (tags.length > 0) {
      await tx.tagging.createMany({
        data: tags.map((tag) => ({
          tenantId,
          tagId: tag.id,
          entityType,
          entityId,
        })),
      });
    }
  });
}
