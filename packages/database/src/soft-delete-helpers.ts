import type { prisma } from "./index";

/**
 * Transaction client type derived from the extended prisma client.
 */
type Tx = Parameters<Parameters<(typeof prisma)["$transaction"]>[0]>[0];

/** Any Prisma delegate that has findFirst + update + create methods. */
type SoftDeletableDelegate = {
  findFirst: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
  create: (args: any) => Promise<any>;
};

/**
 * Query a soft-deletable model including soft-deleted records.
 * Typed wrapper that avoids `as any` casts for the `includeDeleted` escape hatch.
 *
 * @example
 * const deleted = await findIncludingDeleted(tx.supportInstallation, {
 *   where: { provider: "SLACK", providerInstallationId: appId },
 * });
 */
export async function findIncludingDeleted<T extends SoftDeletableDelegate>(
  delegate: T,
  args: { where: Record<string, unknown>; select?: Record<string, unknown> }
): Promise<Awaited<ReturnType<T["findFirst"]>> | null> {
  return (delegate.findFirst as any)({
    ...args,
    includeDeleted: true,
  });
}

/**
 * Replaces Prisma's `upsert` for soft-deletable models.
 *
 * Prisma's upsert generates ON CONFLICT that doesn't match partial unique
 * indexes (WHERE deletedAt IS NULL). This function uses findFirst + create/update
 * instead, and also handles resurrecting soft-deleted records.
 *
 * Flow:
 * 1. Find active record matching `where` (auto-filtered by extension)
 * 2. If found → update with `update` data
 * 3. If not → check for soft-deleted record to resurrect
 * 4. If soft-deleted found → clear deletedAt + apply `create` data
 * 5. If nothing found → create new record with `create` data
 *
 * @example
 * const conversation = await softUpsert(tx.supportConversation, {
 *   where: { workspaceId: "ws_1", canonicalConversationKey: "key" },
 *   create: { workspaceId: "ws_1", installationId: "inst_1", ...data },
 *   update: { ...data },
 * });
 */
export async function softUpsert<T extends SoftDeletableDelegate>(
  delegate: T,
  args: {
    where: Record<string, unknown>;
    create: Record<string, unknown>;
    update: Record<string, unknown>;
    include?: Record<string, unknown>;
  }
): Promise<Awaited<ReturnType<T["update"]>>> {
  const { where, create, update, include } = args;

  // 1. Check for active record (extension auto-filters deletedAt: null)
  const existing = await delegate.findFirst({ where, ...(include ? { include } : {}) });

  if (existing) {
    return delegate.update({
      where: { id: (existing as any).id },
      data: update,
      ...(include ? { include } : {}),
    });
  }

  // 2. Check for soft-deleted record to resurrect
  const softDeleted = await findIncludingDeleted(delegate, {
    where: { ...where, deletedAt: { not: null } },
    select: { id: true },
  });

  if (softDeleted) {
    return delegate.update({
      where: { id: (softDeleted as any).id },
      data: { deletedAt: null, ...create },
      ...(include ? { include } : {}),
    });
  }

  // 3. Create new
  return delegate.create({
    data: create,
    ...(include ? { include } : {}),
  });
}

/**
 * @deprecated Use `softUpsert` instead. This function's fallback pattern
 * still relies on Prisma's upsert which doesn't work with partial unique indexes.
 */
export const resurrectOrUpsert = softUpsert;
