"use client";

// Granular permission editor. The dialog opens from a member-row's "Editar"
// button. Inside it the caller picks either a role preset (applies the
// preset's full feature list) or toggles individual checkboxes grouped by
// resource (with auto-cascade through the dependency graph in
// @/lib/roles:FEATURE_GROUPS).
//
// On save we send `{ features }` to PATCH /members/[user_id]. The server
// sanitizes again (closes deps, drops non-assignable features), so a
// malformed client can't write a half-broken set.

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PermissionCheckboxes } from "@/components/permission-checkboxes";
import { Spinner } from "@/components/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { ROLE_DESCRIPTION_PT_BR, ROLE_LABEL_PT_BR } from "@/lib/role-labels";
import { ASSIGNABLE_ROLES, ROLE_PERMISSIONS, sanitizeFeatures, type Role } from "@/lib/roles";
import { useFormSubmit, type ErrorPayload } from "@/lib/use-form-submit";

type Props = {
  slug: string;
  userId: string;
  username: string;
  role: Role;
  features: string[];
};

export function EditMemberDialog({ slug, userId, username, role, features }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pickedRole, setPickedRole] = useState<Role>(role);
  const [picked, setPicked] = useState<string[]>(() => [...features]);
  const [error, setError] = useState<ErrorPayload | null>(null);
  const { submit, isPending } = useFormSubmit();
  const [requesting, setRequesting] = useState(false);
  const busy = requesting || isPending;

  function applyPreset(target: Role) {
    setPickedRole(target);
    setPicked([...(ROLE_PERMISSIONS[target] as readonly string[])]);
  }

  async function onSave() {
    setError(null);
    setRequesting(true);
    const next = sanitizeFeatures(picked);
    const result = await submit<{ message?: string; action?: string }>({
      request: async () => {
        const res = await fetch(
          `/api/v1/companies/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ features: next }),
          },
        );
        return { status: res.status, body: await res.json().catch(() => ({})) };
      },
      then: () => {
        setOpen(false);
        router.refresh();
      },
    });
    setRequesting(false);
    if (!result.ok) setError(result.error);
  }

  function onOpenChange(next: boolean) {
    if (!next) {
      // Reset on close so the next open shows the current persisted state.
      setPickedRole(role);
      setPicked([...features]);
      setError(null);
    }
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Permissões de {username}</DialogTitle>
          <DialogDescription>
            Comece com um preset ou ajuste individualmente. Permissões dependentes (ex.: editar
            requer ler) são marcadas em conjunto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="preset">Preset</Label>
            <select
              id="preset"
              value={pickedRole}
              onChange={(e) => applyPreset(e.target.value as Role)}
              disabled={busy}
              className="border-input bg-transparent text-foreground h-9 w-full rounded-md border px-2.5 text-sm shadow-xs"
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL_PT_BR[r]}
                </option>
              ))}
            </select>
            <p className="text-muted-foreground text-xs">{ROLE_DESCRIPTION_PT_BR[pickedRole]}</p>
          </div>

          <PermissionCheckboxes value={picked} onChange={setPicked} disabled={busy} />

          {error && (
            <Alert variant="destructive">
              <AlertTitle>{error.message}</AlertTitle>
              {error.action && <AlertDescription>{error.action}</AlertDescription>}
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={onSave} disabled={busy}>
            {busy ? (
              <>
                <Spinner /> Salvando…
              </>
            ) : (
              "Salvar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
