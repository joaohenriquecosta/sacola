"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DeleteCompanyButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const armed = confirmation === slug;

  async function onClick() {
    if (!armed) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/companies/${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      if (res.status === 204) {
        router.push("/app");
        router.refresh();
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.message ?? "Não foi possível excluir a empresa.");
    } catch {
      setError("Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="confirm-slug">
          Digite <code>{slug}</code> para confirmar
        </Label>
        <Input
          id="confirm-slug"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          disabled={loading}
        />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>{error}</AlertTitle>
          <AlertDescription>Tente novamente em instantes.</AlertDescription>
        </Alert>
      )}
      <Button variant="destructive" onClick={onClick} disabled={!armed || loading}>
        {loading ? "Excluindo..." : "Excluir definitivamente"}
      </Button>
    </div>
  );
}
