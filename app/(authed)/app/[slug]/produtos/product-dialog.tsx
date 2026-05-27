"use client";

// Reused for both criar e editar — recebe `initial` (undefined no criar,
// preenchido no editar) e um `endpoint`/`method` por modo. Form de price
// usa string para aceitar "12,90" estilo BRL; convertemos para inteiro em
// cents na hora do submit.

import { useRouter } from "next/navigation";
import { useState } from "react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseBRLToCents } from "@/lib/format-money";
import { useFormSubmit, type ErrorPayload } from "@/lib/use-form-submit";

export type ProductDialogInitial = {
  id: string;
  name: string;
  priceCents: number;
  costCents: number;
  unit: string;
};

type Props = {
  slug: string;
  trigger: React.ReactNode;
  // When `initial` is provided, we PATCH; otherwise POST.
  initial?: ProductDialogInitial;
};

export function ProductDialog({ slug, trigger, initial }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "kg");
  const [priceText, setPriceText] = useState(
    initial ? (initial.priceCents / 100).toFixed(2).replace(".", ",") : "",
  );
  // Cost defaults to empty when 0 (treat as "not informed") so the user
  // sees a placeholder instead of a misleading "0,00".
  const [costText, setCostText] = useState(
    initial && initial.costCents > 0 ? (initial.costCents / 100).toFixed(2).replace(".", ",") : "",
  );
  const [error, setError] = useState<ErrorPayload | null>(null);
  const { submit, isPending } = useFormSubmit();
  const [requesting, setRequesting] = useState(false);
  const busy = requesting || isPending;

  const isEditing = Boolean(initial);

  function reset() {
    setName(initial?.name ?? "");
    setUnit(initial?.unit ?? "kg");
    setPriceText(initial ? (initial.priceCents / 100).toFixed(2).replace(".", ",") : "");
    setCostText(
      initial && initial.costCents > 0
        ? (initial.costCents / 100).toFixed(2).replace(".", ",")
        : "",
    );
    setError(null);
  }

  function onOpenChange(next: boolean) {
    if (!next) reset();
    setOpen(next);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setRequesting(true);

    const priceCents = parseBRLToCents(priceText);
    if (priceCents === null) {
      setError({ message: "Preço inválido.", action: 'Use o formato "12,90".' });
      setRequesting(false);
      return;
    }

    // Cost is optional. Empty input → 0 ("não informado"); a typed value
    // must parse, otherwise surface the same kind of error as price.
    let costCents = 0;
    if (costText.trim()) {
      const parsed = parseBRLToCents(costText);
      if (parsed === null) {
        setError({ message: "Custo inválido.", action: 'Use o formato "8,50".' });
        setRequesting(false);
        return;
      }
      costCents = parsed;
    }

    const body = JSON.stringify({ name, price_cents: priceCents, cost_cents: costCents, unit });
    const url = isEditing
      ? `/api/v1/companies/${encodeURIComponent(slug)}/products/${encodeURIComponent(initial!.id)}`
      : `/api/v1/companies/${encodeURIComponent(slug)}/products`;

    const result = await submit<{ message?: string; action?: string }>({
      request: async () => {
        const res = await fetch(url, {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar produto" : "Cadastrar produto"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Atualize nome, preço ou unidade."
              : "Adicione um item ao catálogo da empresa."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              placeholder="Tomate italiano"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="price">Preço de venda (R$)</Label>
              <Input
                id="price"
                inputMode="decimal"
                required
                value={priceText}
                onChange={(e) => setPriceText(e.target.value)}
                disabled={busy}
                placeholder="12,90"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cost">Custo (R$)</Label>
              <Input
                id="cost"
                inputMode="decimal"
                value={costText}
                onChange={(e) => setCostText(e.target.value)}
                disabled={busy}
                placeholder="opcional"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="unit">Unidade</Label>
            <Input
              id="unit"
              required
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              disabled={busy}
              placeholder="kg / un / pacote"
              maxLength={16}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>{error.message}</AlertTitle>
              {error.action && <AlertDescription>{error.action}</AlertDescription>}
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={busy || !name.trim() || !priceText.trim()}>
              {busy ? (
                <>
                  <Spinner /> Salvando…
                </>
              ) : isEditing ? (
                "Salvar"
              ) : (
                "Cadastrar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
