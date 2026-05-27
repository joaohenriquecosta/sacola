"use client";

// Invite a new member. Role select acts as a preset that seeds the feature
// list, and the grouped checkboxes let the inviter narrow or widen the set
// before sending. The server re-sanitizes the payload (closes deps, drops
// non-assignable features) so a tampered client cannot bypass the rules.

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PermissionCheckboxes } from "@/components/permission-checkboxes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_DESCRIPTION_PT_BR, ROLE_LABEL_PT_BR } from "@/lib/role-labels";
import { ASSIGNABLE_ROLES, ROLE_PERMISSIONS, sanitizeFeatures, type Role } from "@/lib/roles";

type FieldError = { message: string; action?: string };

const DEFAULT_ROLE: Role = "member";

export function InviteForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>(DEFAULT_ROLE);
  const [features, setFeatures] = useState<string[]>(() => [
    ...(ROLE_PERMISSIONS[DEFAULT_ROLE] as readonly string[]),
  ]);
  const [error, setError] = useState<FieldError | null>(null);
  const [loading, setLoading] = useState(false);

  function applyPreset(target: Role) {
    setRole(target);
    setFeatures([...(ROLE_PERMISSIONS[target] as readonly string[])]);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/companies/${encodeURIComponent(slug)}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role, features: sanitizeFeatures(features) }),
      });
      const body = await res.json();
      if (res.status === 201) {
        router.push(`/app/${slug}/equipe`);
        router.refresh();
        return;
      }
      setError({ message: body.message ?? "Erro inesperado.", action: body.action });
    } catch {
      setError({
        message: "Não foi possível enviar o convite.",
        action: "Verifique sua conexão e tente novamente.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email">Email do convidado</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="role">Função (preset)</Label>
        <select
          id="role"
          name="role"
          value={role}
          onChange={(e) => applyPreset(e.target.value as Role)}
          disabled={loading}
          className="border-input bg-transparent text-foreground h-9 w-full rounded-md border px-2.5 text-sm shadow-xs"
        >
          {ASSIGNABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL_PT_BR[r]}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs">{ROLE_DESCRIPTION_PT_BR[role]}</p>
      </div>

      <div className="space-y-2">
        <Label>Permissões</Label>
        <p className="text-muted-foreground text-xs">
          Ajuste os checkboxes para refinar o preset. Permissões dependentes (ex.: editar requer
          ler) são marcadas em conjunto.
        </p>
        <PermissionCheckboxes value={features} onChange={setFeatures} disabled={loading} />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>{error.message}</AlertTitle>
          {error.action && <AlertDescription>{error.action}</AlertDescription>}
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={loading || !email.trim()}>
        {loading ? "Enviando..." : "Enviar convite"}
      </Button>
    </form>
  );
}
