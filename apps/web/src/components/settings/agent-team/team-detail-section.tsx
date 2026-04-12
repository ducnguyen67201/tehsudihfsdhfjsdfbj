"use client";

import { AddEdgeDialog } from "@/components/settings/agent-team/add-edge-dialog";
import { AddRoleDialog } from "@/components/settings/agent-team/add-role-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { AddAgentTeamEdgeInput, AddAgentTeamRoleInput, AgentTeam } from "@shared/types";

interface TeamDetailSectionProps {
  team: AgentTeam | null;
  canManage: boolean;
  onAddRole: (input: AddAgentTeamRoleInput) => Promise<void>;
  onRemoveRole: (roleId: string) => Promise<void>;
  onAddEdge: (input: AddAgentTeamEdgeInput) => Promise<void>;
  onRemoveEdge: (edgeId: string) => Promise<void>;
}

/**
 * Shows the selected team's role roster and directed handoff edges.
 */
export function TeamDetailSection({
  team,
  canManage,
  onAddRole,
  onRemoveRole,
  onAddEdge,
  onRemoveEdge,
}: TeamDetailSectionProps) {
  if (!team) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Team details</CardTitle>
          <CardDescription>Select a team to inspect or edit its configuration.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle>{team.name}</CardTitle>
              {team.isDefault ? <Badge variant="secondary">Default</Badge> : null}
            </div>
            <CardDescription>{team.description || "No description provided."}</CardDescription>
          </div>
          {canManage ? <AddRoleDialog teamId={team.id} onAddRole={onAddRole} /> : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {team.roles.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              This team has no roles yet. Add at least one specialist role.
            </div>
          ) : (
            team.roles.map((role) => (
              <div key={role.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{role.label}</p>
                      <Badge variant="outline">{role.slug}</Badge>
                      <Badge variant="outline">{role.provider}</Badge>
                      {role.model ? <Badge variant="outline">{role.model}</Badge> : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {role.description || "No role description provided."}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>Max steps: {role.maxSteps}</span>
                      {role.toolIds.map((toolId) => (
                        <Badge key={toolId} variant="secondary">
                          {toolId}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {canManage ? (
                    <Button variant="ghost" size="sm" onClick={() => void onRemoveRole(role.id)}>
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Handoffs</CardTitle>
            <CardDescription>
              Directed edges determine which role sees output before running next.
            </CardDescription>
          </div>
          {canManage ? <AddEdgeDialog team={team} onAddEdge={onAddEdge} /> : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {team.edges.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              No handoffs configured. Roles will execute in sort order unless you add edges.
            </div>
          ) : (
            team.edges.map((edge) => {
              const sourceRole = team.roles.find((role) => role.id === edge.sourceRoleId);
              const targetRole = team.roles.find((role) => role.id === edge.targetRoleId);

              return (
                <div key={edge.id} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline">{sourceRole?.label ?? edge.sourceRoleId}</Badge>
                      <span className="text-muted-foreground">→</span>
                      <Badge variant="outline">{targetRole?.label ?? edge.targetRoleId}</Badge>
                    </div>
                    {canManage ? (
                      <Button variant="ghost" size="sm" onClick={() => void onRemoveEdge(edge.id)}>
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Separator />
    </div>
  );
}
