"use client";

// Per-item weighing: the separador records the real weight (g) of each item
// and finalizes (criado → separado). Weighing is optional per item — items
// sold by unit can stay blank. Everything goes in one PATCH with the weights.

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Item = {
  id: string;
  product_name: string;
  product_unit: string;
  quantity: number;
  gramas_separado: number | null;
};

export function WeighingForm({
  slug,
  orderId,
  canFinalize,
  items,
}: {
  slug: string;
  orderId: string;
  canFinalize: boolean;
  items: Item[];
}) {
  const router = useRouter();
  const [grams, setGrams] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      items.map((i) => [i.id, i.gramas_separado != null ? String(i.gramas_separado) : ""]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finalize() {
    setBusy(true);
    setError(null);
    const weights = items
      .filter((i) => grams[i.id]?.trim() !== "")
      .map((i) => ({ item_id: i.id, gramas: Number(grams[i.id]) }));
    try {
      const res = await fetch(
        `/api/v1/companies/${encodeURIComponent(slug)}/orders/${encodeURIComponent(orderId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "separado", weights }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.message ?? "Não foi possível finalizar a separação.");
        setBusy(false);
        return;
      }
      router.push(`/app/${slug}/separacao`);
      router.refresh();
    } catch {
      setError("Falha de rede. Tente de novo.");
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Itens</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-3">
          {items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{i.product_name}</p>
                <p className="text-muted-foreground text-xs">
                  Pedido: {i.quantity} {i.product_unit}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Label htmlFor={`g-${i.id}`} className="sr-only">
                  Peso de {i.product_name} em gramas
                </Label>
                <Input
                  id={`g-${i.id}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="1"
                  placeholder="peso"
                  value={grams[i.id]}
                  onChange={(e) => setGrams((g) => ({ ...g, [i.id]: e.target.value }))}
                  disabled={!canFinalize || busy}
                  className="w-24"
                />
                <span className="text-muted-foreground text-sm">g</span>
              </div>
            </li>
          ))}
        </ul>

        {error && <p className="text-destructive text-sm">{error}</p>}

        {canFinalize ? (
          <Button onClick={finalize} disabled={busy} className="w-full">
            {busy ? "Finalizando…" : "Finalizar separação"}
          </Button>
        ) : (
          <p className="text-muted-foreground text-sm">Este pedido já saiu da fila de separação.</p>
        )}
      </CardContent>
    </Card>
  );
}
