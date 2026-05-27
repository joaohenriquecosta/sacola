"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Candidate = { user_id: string; username: string };
type FieldError = { message: string; action?: string };

export function TransferOwnershipForm({
  slug,
  candidates,
}: {
  slug: string;
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [targetId, setTargetId] = useState(candidates[0]?.user_id ?? "");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<FieldError | null>(null);
  const [loading, setLoading] = useState(false);

  const targetUsername = candidates.find((c) => c.user_id === targetId)?.username ?? "";
  const armed = targetId !== "" && confirmation === targetUsername;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!armed) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/companies/${encodeURIComponent(slug)}/transfer-ownership`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: targetId }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 200) {
        router.push(`/app/${slug}`);
        router.refresh();
        return;
      }
      setError({ message: body.message ?? "Erro inesperado.", action: body.action });
    } catch {
      setError({
        message: "Não foi possível transferir.",
        action: "Verifique sua conexão e tente novamente.",
      });
    } finally {
      setLoading(false);
    }
  }

  if (candidates.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Convide outro membro antes de transferir a propriedade.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="target">Novo dono</Label>
        <select
          id="target"
          value={targetId}
          onChange={(e) => {
            setTargetId(e.target.value);
            setConfirmation("");
          }}
          disabled={loading}
          className="border-input bg-transparent text-foreground h-9 w-full rounded-md border px-2.5 text-sm shadow-xs"
        >
          {candidates.map((c) => (
            <option key={c.user_id} value={c.user_id}>
              {c.username}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm">
          Digite <code>{targetUsername}</code> para confirmar
        </Label>
        <Input
          id="confirm"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          disabled={loading}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>{error.message}</AlertTitle>
          {error.action && <AlertDescription>{error.action}</AlertDescription>}
        </Alert>
      )}

      <Button type="submit" disabled={!armed || loading}>
        {loading ? "Transferindo..." : "Transferir propriedade"}
      </Button>
    </form>
  );
}
