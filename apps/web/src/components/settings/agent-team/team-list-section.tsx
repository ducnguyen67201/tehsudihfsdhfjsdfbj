"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Teams</CardTitle>
          <CardDescription>Workspace-defined blueprints for multi-agent runs.</CardDescription>
        </div>
        {canManage ? createTeamDialog : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {teams.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No teams configured yet. Create one to define roles and handoffs.
          </div>
        ) : null}

        {teams.map((team) => (
          <div
            key={team.id}
            role="button"
            tabIndex={0}
            className={`w-full rounded-lg border p-4 text-left transition ${
              team.id === selectedTeamId ? "border-primary bg-primary/5" : "hover:bg-muted/40"
            }`}
            onClick={() => onSelectTeam(team.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectTeam(team.id);
              }
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{team.name}</p>
                  {team.isDefault ? <Badge variant="secondary">Default</Badge> : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {team.description || "No description provided."}
                </p>
                <p className="text-xs text-muted-foreground">
                  {team.roles.length} roles • {team.edges.length} handoffs
                </p>
              </div>

              {canManage ? (
                <div className="flex gap-2">
                  {!team.isDefault ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        void onSetDefaultTeam(team.id);
                      }}
                    >
                      Make default
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      void onDeleteTeam(team.id);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
