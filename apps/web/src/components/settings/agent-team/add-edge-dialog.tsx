"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AddAgentTeamEdgeInput, AgentTeam } from "@shared/types";
import { useMemo, useState } from "react";

interface AddEdgeDialogProps {
  team: AgentTeam;
  onAddEdge: (input: AddAgentTeamEdgeInput) => Promise<void>;
}

/**
 * Creates a directed handoff edge between two existing roles.
 */
export function AddEdgeDialog({ team, onAddEdge }: AddEdgeDialogProps) {
  const orderedRoles = useMemo(() => team.roles, [team.roles]);
  const [open, setOpen] = useState(false);
  const [sourceRoleId, setSourceRoleId] = useState<string>(orderedRoles[0]?.id ?? "");
  const [targetRoleId, setTargetRoleId] = useState<string>(orderedRoles[1]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setIsSubmitting(true);
    setError(null);

    try {
      await onAddEdge({
        teamId: team.id,
        sourceRoleId,
        targetRoleId,
      });
      setOpen(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to add handoff");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={orderedRoles.length < 2}>
          Add handoff
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add handoff</DialogTitle>
          <DialogDescription>
            Connect one role to the next role that should receive its output.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edge-source-role">Source role</Label>
            <Select value={sourceRoleId} onValueChange={setSourceRoleId}>
              <SelectTrigger id="edge-source-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {orderedRoles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edge-target-role">Target role</Label>
            <Select value={targetRoleId} onValueChange={setTargetRoleId}>
              <SelectTrigger id="edge-target-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {orderedRoles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting || !sourceRoleId || !targetRoleId}>
            {isSubmitting ? "Adding..." : "Add handoff"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
