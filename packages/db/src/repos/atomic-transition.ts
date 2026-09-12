import type { Prisma } from '../generated/client';
import { prisma } from '../client';
import { ConflictError, NotFoundError, requireTenantId } from '../errors';

export async function runAtomicTransition<T>(args: {
  tenantId: string;
  id: string;
  entityType: string;
  toStatus: string;
  actorMembershipId: string;
  notFoundMessage: string;
  load: (tx: Prisma.TransactionClient) => Promise<{ from: string } | null>;
  assert: (from: string) => void;
  apply: (tx: Prisma.TransactionClient, from: string) => Promise<number>;
  reload: (tx: Prisma.TransactionClient) => Promise<T>;
}): Promise<T> {
  requireTenantId(args.tenantId);
  return prisma.$transaction(async (tx) => {
    const current = await args.load(tx);
    if (!current) throw new NotFoundError(args.notFoundMessage);
    args.assert(current.from);
    const count = await args.apply(tx, current.from);
    if (count !== 1) {
      throw new ConflictError(`${args.entityType} state changed, retry`);
    }
    await tx.statusEvent.create({
      data: {
        tenantId: args.tenantId,
        entityType: args.entityType,
        entityId: args.id,
        fromStatus: current.from,
        toStatus: args.toStatus,
        actorMembershipId: args.actorMembershipId,
      },
    });
    return args.reload(tx);
  });
}
