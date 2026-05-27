"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { slugify } from "@/lib/slugify";

type FieldError = { message: string; action?: string };

export function CreateCompanyForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<FieldError | null>(null);
  const [loading, setLoading] = useState(false);

  // Auto-suggest slug from name until the user touches the slug field.
  const previewSlug = useMemo(() => (slugEdited ? slug : slugify(name)), [name, slug, slugEdited]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/v1/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug: previewSlug || undefined }),
      });
      const body = await res.json();
      if (res.status === 201) {
        router.push(`/app/${body.slug}`);
        router.refresh();
        return;
      }
      setError({ message: body.message ?? "Erro inesperado.", action: body.action });
    } catch {
      setError({
        message: "Não foi possível criar a empresa.",
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
        <Label htmlFor="slug">Endereço (slug)</Label>
        <Input
          id="slug"
          name="slug"
          required
          minLength={2}
          maxLength={40}
          pattern="[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
          value={previewSlug}
          onChange={(e) => {
            setSlugEdited(true);
            setSlug(e.target.value);
          }}
          disabled={loading}
        />
        <p className="text-muted-foreground text-xs">
          Sua empresa ficará em <code>/app/{previewSlug || "..."}</code>. Letras minúsculas, números
          e hífen.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>{error.message}</AlertTitle>
          {error.action && <AlertDescription>{error.action}</AlertDescription>}
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={loading || !name.trim()}>
        {loading ? "Criando..." : "Criar empresa"}
      </Button>
    </form>
  );
}
