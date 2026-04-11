import { prisma } from "@shared/database";
import { router } from "@shared/rest/trpc";
import { workspaceProcedure, workspaceRoleProcedure } from "@shared/rest/trpc";
import { type ToneConfig, WORKSPACE_ROLE, toneConfigSchema } from "@shared/types";

function toToneConfig(settings: {
  defaultTone: string;
  responseStyle: string | null;
  signatureLine: string | null;
  maxDraftLength: number;
  includeCodeRefs: boolean;
}): ToneConfig {
  return toneConfigSchema.parse({
    defaultTone: settings.defaultTone,
    responseStyle: settings.responseStyle,
    signatureLine: settings.signatureLine,
    maxDraftLength: settings.maxDraftLength,
    includeCodeRefs: settings.includeCodeRefs,
  });
}

export const workspaceAiSettingsRouter = router({
  get: workspaceProcedure.query(async ({ ctx }) => {
    const settings = await prisma.workspaceAiSettings.findUnique({
      where: { workspaceId: ctx.workspaceId },
    });
    return settings ? toToneConfig(settings) : toneConfigSchema.parse({});
  }),

  update: workspaceRoleProcedure(WORKSPACE_ROLE.ADMIN)
    .input(toneConfigSchema)
    .mutation(async ({ ctx, input }) => {
      const settings = await prisma.workspaceAiSettings.upsert({
        where: { workspaceId: ctx.workspaceId },
        update: input,
        create: { workspaceId: ctx.workspaceId, ...input },
      });
      return toToneConfig(settings);
    }),
});
