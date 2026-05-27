"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FieldError = { message: string; action?: string };

export function CompanySettingsForm({
  slug: initialSlug,
  name: initialName,
}: {
  slug: string;
  name: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const [error, setError] = useState<FieldError | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const patch: Record<string, string> = {};
    if (name !== initialName) patch.name = name;
    if (slug !== initialSlug) patch.slug = slug;
    if (Object.keys(patch).length === 0) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/v1/companies/${encodeURIComponent(initialSlug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json();
      if (res.status === 200) {
        const nextSlug: string = body.slug ?? initialSlug;
        if (nextSlug !== initialSlug) {
          router.push(`/app/${nextSlug}/configuracoes`);
        }
        router.refresh();
        return;
      }
      setError({ message: body.message ?? "Erro inesperado.", action: body.action });
    } catch {
      setError({
        message: "Não foi possível salvar.",
        action: "Verifique sua conexão e tente novamente.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nome</Label>
        <Input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">Slug</Label>
        <Input
          id="slug"
          name="slug"
          required
          minLength={2}
          maxLength={40}
          pattern="[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          disabled={loading}
        />
        <p className="text-muted-foreground text-xs">
          Mudar o slug troca a URL pública da empresa.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>{error.message}</AlertTitle>
          {error.action && <AlertDescription>{error.action}</AlertDescription>}
        </Alert>
      )}

      <Button type="submit" disabled={loading || (name === initialName && slug === initialSlug)}>
        {loading ? "Salvando..." : "Salvar"}
      </Button>
    </form>
  );
}
