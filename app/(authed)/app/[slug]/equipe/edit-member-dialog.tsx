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
import { useMemo, useState } from "react";

import { Spinner } from "@/components/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  ASSIGNABLE_ROLES,
  FEATURE_GROUPS,
  ROLE_PERMISSIONS,
  sanitizeFeatures,
  type Role,
} from "@/lib/roles";
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
  const [picked, setPicked] = useState<Set<string>>(() => new Set(features));
  const [error, setError] = useState<ErrorPayload | null>(null);
  const { submit, isPending } = useFormSubmit();
  const [requesting, setRequesting] = useState(false);
  const busy = requesting || isPending;

  // Build a quick map of feature → dependents for cascade-uncheck. The
  // "requires" relationship is stored on the dependent in FEATURE_GROUPS;
  // we invert it here once.
  const dependents = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const group of FEATURE_GROUPS) {
      for (const f of group.features) {
        for (const req of f.requires ?? []) {
          const list = map.get(req) ?? [];
          list.push(f.id);
          map.set(req, list);
        }
      }
    }
    return map;
  }, []);

  function toggle(featureId: string, checked: boolean) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(featureId);
        // Cascade-on: enable required reads automatically.
        for (const group of FEATURE_GROUPS) {
          const f = group.features.find((x) => x.id === featureId);
          if (f?.requires) for (const r of f.requires) next.add(r);
        }
      } else {
        next.delete(featureId);
        // Cascade-off: dependent writes go off when their read does.
        const dropList = dependents.get(featureId) ?? [];
        for (const d of dropList) next.delete(d);
      }
      return next;
    });
  }

  function applyPreset(target: Role) {
    setPickedRole(target);
    setPicked(new Set(ROLE_PERMISSIONS[target] as readonly string[]));
  }

  async function onSave() {
    setError(null);
    setRequesting(true);
    const next = sanitizeFeatures([...picked]);
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
      setPicked(new Set(features));
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

          <div className="space-y-4">
            {FEATURE_GROUPS.map((group) => (
              <fieldset key={group.id} className="space-y-2">
                <legend className="text-foreground text-sm font-medium">{group.label}</legend>
                <div className="space-y-1.5">
                  {group.features.map((f) => {
                    const checked = picked.has(f.id);
                    return (
                      <label
                        key={f.id}
                        className="flex items-start gap-2 text-sm cursor-pointer select-none"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => toggle(f.id, Boolean(v))}
                          disabled={busy}
                          className="mt-0.5"
                        />
                        <span>{f.label}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>

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
