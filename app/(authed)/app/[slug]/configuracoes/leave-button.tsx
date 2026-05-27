"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function LeaveCompanyButton({ slug, companyName }: { slug: string; companyName: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (!confirm(`Sair de "${companyName}"? Você perde acesso imediato.`)) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/companies/${encodeURIComponent(slug)}/members/me`, {
        method: "DELETE",
      });
      if (res.status === 204) {
        router.push("/app");
        router.refresh();
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.message ?? "Não foi possível sair da empresa.");
    } catch {
      setError("Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>{error}</AlertTitle>
          <AlertDescription>Tente novamente em instantes.</AlertDescription>
        </Alert>
      )}
      <Button variant="destructive" onClick={onClick} disabled={loading}>
        {loading ? "Saindo..." : "Sair desta empresa"}
      </Button>
    </div>
  );
}
