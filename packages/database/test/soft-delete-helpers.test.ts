import { describe, expect, it, vi } from "vitest";
import { findIncludingDeleted, softUpsert } from "../src/soft-delete-helpers";

// biome-ignore lint/suspicious/noExplicitAny: test mock for Prisma delegate
function createMockDelegate(findFirstResult: any = null) {
  return {
    findFirst: vi.fn().mockResolvedValue(findFirstResult),
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    update: vi.fn().mockImplementation(async (args: any) => ({
      id: findFirstResult?.id ?? "new_id",
      ...args.data,
    })),
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    create: vi.fn().mockImplementation(async (args: any) => ({
      id: "created_id",
      ...args.data,
    })),
  };
}

describe("findIncludingDeleted", () => {
  it("passes includeDeleted: true to findFirst", async () => {
    const delegate = createMockDelegate();
    await findIncludingDeleted(delegate, {
      where: { provider: "SLACK", providerInstallationId: "app_1" },
    });

    expect(delegate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ includeDeleted: true })
    );
  });

  it("forwards where clause and select", async () => {
    const delegate = createMockDelegate();
    await findIncludingDeleted(delegate, {
      where: { id: "test_id" },
      select: { id: true },
    });

    expect(delegate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "test_id" },
        select: { id: true },
      })
    );
  });

  it("returns null when no record found", async () => {
    const delegate = createMockDelegate(null);
    const result = await findIncludingDeleted(delegate, { where: { id: "missing" } });
    expect(result).toBeNull();
  });

  it("returns the soft-deleted record when found", async () => {
    const deleted = { id: "del_1", deletedAt: new Date() };
    const delegate = createMockDelegate(deleted);
    const result = await findIncludingDeleted(delegate, { where: { id: "del_1" } });
    expect(result).toEqual(deleted);
  });
});

describe("softUpsert", () => {
  it("updates existing active record", async () => {
    const active = { id: "active_1", name: "test" };
    const delegate = createMockDelegate(active);

    await softUpsert(delegate, {
      where: { workspaceId: "ws_1", canonicalKey: "key_1" },
      create: { workspaceId: "ws_1", canonicalKey: "key_1", name: "new" },
      update: { name: "updated" },
    });

    expect(delegate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "active_1" },
        data: { name: "updated" },
      })
    );
    expect(delegate.create).not.toHaveBeenCalled();
  });

  it("resurrects soft-deleted record when no active record exists", async () => {
    const delegate = createMockDelegate(null);
    // First findFirst returns null (no active), second returns deleted
    const softDeleted = { id: "del_1" };
    delegate.findFirst
      .mockResolvedValueOnce(null) // active check
      .mockResolvedValueOnce(softDeleted); // includeDeleted check

    await softUpsert(delegate, {
      where: { workspaceId: "ws_1", userId: "u_1" },
      create: { workspaceId: "ws_1", userId: "u_1", role: "MEMBER" },
      update: { role: "MEMBER" },
    });

    expect(delegate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "del_1" },
        data: expect.objectContaining({ deletedAt: null, workspaceId: "ws_1" }),
      })
    );
    expect(delegate.create).not.toHaveBeenCalled();
  });

  it("creates new record when nothing exists", async () => {
    const delegate = createMockDelegate(null);
    // Both findFirst calls return null
    delegate.findFirst.mockResolvedValue(null);

    const result = await softUpsert(delegate, {
      where: { provider: "SLACK", providerInstallationId: "app_1" },
      create: { provider: "SLACK", providerInstallationId: "app_1", teamId: "T123" },
      update: { teamId: "T123" },
    });

    expect(delegate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ provider: "SLACK", teamId: "T123" }),
      })
    );
    expect(result).toEqual(expect.objectContaining({ id: "created_id" }));
  });

  it("passes include option through to all operations", async () => {
    const active = { id: "active_1" };
    const delegate = createMockDelegate(active);

    await softUpsert(delegate, {
      where: { workspaceId: "ws_1", userId: "u_1" },
      create: { workspaceId: "ws_1", userId: "u_1", role: "MEMBER" },
      update: { role: "ADMIN" },
      include: { user: { select: { id: true, email: true } } },
    });

    expect(delegate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { user: { select: { id: true, email: true } } },
      })
    );
    expect(delegate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { user: { select: { id: true, email: true } } },
      })
    );
  });

  it("never calls Prisma upsert", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock extending delegate
    const delegate = createMockDelegate(null) as any;
    delegate.upsert = vi.fn();

    await softUpsert(delegate, {
      where: { id: "test" },
      create: { id: "test", name: "new" },
      update: { name: "updated" },
    });

    expect(delegate.upsert).not.toHaveBeenCalled();
  });
});
