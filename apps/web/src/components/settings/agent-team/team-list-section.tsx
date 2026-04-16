"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RiDeleteBinLine } from "@remixicon/react";
import type { AgentTeam } from "@shared/types";

interface TeamListSectionProps {
  teams: AgentTeam[];
  selectedTeamId: string | null;
  canManage: boolean;
  onSelectTeam: (teamId: string) => void;
  onSetDefaultTeam: (teamId: string) => Promise<void>;
  onDeleteTeam: (teamId: string) => Promise<void>;
  createTeamDialog: React.ReactNode;
}

/**
 * Lists configured teams and lets the user choose the active detail view.
 */
export function TeamListSection({
  teams,
  selectedTeamId,
  canManage,
  onSelectTeam,
  onSetDefaultTeam,
  onDeleteTeam,
  createTeamDialog,
}: TeamListSectionProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 py-3">
        <div>
          <CardTitle className="text-sm">Teams</CardTitle>
          <CardDescription className="text-xs">Select a team to configure.</CardDescription>
        </div>
        {canManage ? createTeamDialog : null}
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-3">
        {teams.length === 0 ? (
          <div className="border border-dashed p-4 text-sm text-muted-foreground">
            No teams configured yet. Create one to get started.
          </div>
        ) : null}

        {teams.map((team) => {
          const isSelected = team.id === selectedTeamId;
          return (
            <button
              key={team.id}
              type="button"
              aria-pressed={isSelected}
              className={`group w-full border p-3 text-left transition-colors ${
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/40 hover:border-foreground/30"
              }`}
              onClick={() => onSelectTeam(team.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="mb-0.5 flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{team.name}</p>
                    {team.isDefault ? (
                      <Badge
                        variant="secondary"
                        className="shrink-0 rounded-none px-1.5 py-0 text-xs"
                      >
                        Default
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <span className="tabular-nums">{team.roles.length}</span> roles ·{" "}
                    <span className="tabular-nums">{team.edges.length}</span> connections
                  </p>
                </div>

                {canManage ? (
                  <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    {!team.isDefault ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          void onSetDefaultTeam(team.id);
                        }}
                      >
                        Set default
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(event) => {
                        event.stopPropagation();
                        void onDeleteTeam(team.id);
                      }}
                    >
                      <RiDeleteBinLine className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                ) : null}
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
