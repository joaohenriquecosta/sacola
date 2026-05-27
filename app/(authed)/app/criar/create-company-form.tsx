"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Spinner } from "@/components/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { slugify } from "@/lib/slugify";
import { useFormSubmit, type ErrorPayload } from "@/lib/use-form-submit";

export function CreateCompanyForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<ErrorPayload | null>(null);
  const { submit, isPending } = useFormSubmit();
  const [requesting, setRequesting] = useState(false);

  const busy = requesting || isPending;

  // Auto-suggest slug from name until the user touches the slug field.
  const previewSlug = useMemo(() => (slugEdited ? slug : slugify(name)), [name, slug, slugEdited]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setRequesting(true);
    const result = await submit<{ slug?: string; message?: string; action?: string }>({
      request: async () => {
        const res = await fetch("/api/v1/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, slug: previewSlug || undefined }),
        });
        return { status: res.status, body: await res.json().catch(() => ({})) };
      },
      success: (s) => s === 201,
      then: (body) => {
        router.push(`/app/${body.slug}`);
        router.refresh();
      },
    });
    setRequesting(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-busy={busy}>
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
          disabled={busy}
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
          disabled={busy}
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

      <Button type="submit" className="w-full" disabled={busy || !name.trim()}>
        {busy ? (
          <>
            <Spinner /> Criando…
          </>
        ) : (
          "Criar empresa"
        )}
      </Button>
    </form>
  );
}
