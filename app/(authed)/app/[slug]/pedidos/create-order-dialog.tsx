"use client";

// Dialog de criar pedido. UX MVP — sem busca/typeahead pesado: cliente em
// dropdown nativo + tabela editável de itens com selector de produto.
// Total é calculado em tempo real client-side (snapshot final é
// recomputado no server na hora do POST).

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

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
import { formatCentsBRL } from "@/lib/format-money";
import { useFormSubmit, type ErrorPayload } from "@/lib/use-form-submit";

export type OrderClientOption = { id: string; name: string };
export type OrderProductOption = {
  id: string;
  name: string;
  unit: string;
  price_cents: number;
};

type Line = {
  // Local id pra key React + remoção sem reordenar (não vai pro server).
  uid: string;
  productId: string;
  quantity: string; // string pra suportar "0,5" / "1.25" digitado
};

type Props = {
  slug: string;
  clients: readonly OrderClientOption[];
  products: readonly OrderProductOption[];
  trigger: React.ReactNode;
};

let lineSeq = 0;
function nextLineUid(): string {
  lineSeq += 1;
  return `line-${lineSeq}`;
}

function parseQuantity(text: string): number | null {
  const normalized = text.trim().replace(",", ".");
  if (!normalized) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function CreateOrderDialog({ slug, clients, products, trigger }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState<string>(clients[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>(() =>
    products[0] ? [{ uid: nextLineUid(), productId: products[0].id, quantity: "1" }] : [],
  );
  const [error, setError] = useState<ErrorPayload | null>(null);
  const { submit, isPending } = useFormSubmit();
  const [requesting, setRequesting] = useState(false);
  const busy = requesting || isPending;

  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const totalCents = useMemo(() => {
    let sum = 0;
    for (const line of lines) {
      const product = productsById.get(line.productId);
      const qty = parseQuantity(line.quantity);
      if (product && qty !== null) sum += Math.round(product.price_cents * qty);
    }
    return sum;
  }, [lines, productsById]);

  function reset() {
    setClientId(clients[0]?.id ?? "");
    setNotes("");
    setLines(products[0] ? [{ uid: nextLineUid(), productId: products[0].id, quantity: "1" }] : []);
    setError(null);
  }

  function onOpenChange(next: boolean) {
    if (!next) reset();
    setOpen(next);
  }

  function addLine() {
    if (!products[0]) return;
    setLines((prev) => [...prev, { uid: nextLineUid(), productId: products[0].id, quantity: "1" }]);
  }

  function removeLine(uid: string) {
    setLines((prev) => prev.filter((l) => l.uid !== uid));
  }

  function updateLine(uid: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.uid === uid ? { ...l, ...patch } : l)));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setRequesting(true);

    if (!clientId) {
      setError({ message: "Selecione um cliente." });
      setRequesting(false);
      return;
    }
    if (lines.length === 0) {
      setError({ message: "Adicione pelo menos um item." });
      setRequesting(false);
      return;
    }

    const items: { product_id: string; quantity: number }[] = [];
    for (const line of lines) {
      const qty = parseQuantity(line.quantity);
      if (qty === null) {
        setError({
          message: "Quantidade inválida em algum item.",
          action: "Use número positivo (ex.: 0,5 ou 1.25).",
        });
        setRequesting(false);
        return;
      }
      items.push({ product_id: line.productId, quantity: qty });
    }

    const result = await submit<{ message?: string; action?: string }>({
      request: async () => {
        const res = await fetch(`/api/v1/companies/${encodeURIComponent(slug)}/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: clientId,
            notes: notes.trim() || null,
            items,
          }),
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

  const noProducts = products.length === 0;
  const noClients = clients.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Criar pedido</DialogTitle>
          <DialogDescription>
            Selecione cliente e itens. Os preços são travados no momento da criação.
          </DialogDescription>
        </DialogHeader>

        {(noProducts || noClients) && (
          <Alert variant="destructive">
            <AlertTitle>Cadastros faltando</AlertTitle>
            <AlertDescription>
              {noClients && "Cadastre pelo menos um cliente. "}
              {noProducts && "Cadastre pelo menos um produto."}
            </AlertDescription>
          </Alert>
        )}

        {!noProducts && !noClients && (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="client">Cliente</Label>
              <select
                id="client"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                disabled={busy}
                className="border-input bg-transparent text-foreground h-9 w-full rounded-md border px-2.5 text-sm shadow-xs"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Itens</Label>
              <div className="space-y-2">
                {lines.map((line) => {
                  const product = productsById.get(line.productId);
                  const qty = parseQuantity(line.quantity);
                  const subtotalCents =
                    product && qty !== null ? Math.round(product.price_cents * qty) : 0;
                  return (
                    <div key={line.uid} className="flex items-center gap-2">
                      <select
                        value={line.productId}
                        onChange={(e) => updateLine(line.uid, { productId: e.target.value })}
                        disabled={busy}
                        className="border-input bg-transparent text-foreground h-9 flex-1 rounded-md border px-2.5 text-sm shadow-xs"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({formatCentsBRL(p.price_cents)}/{p.unit})
                          </option>
                        ))}
                      </select>
                      <Input
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.uid, { quantity: e.target.value })}
                        disabled={busy}
                        placeholder="qtd"
                        className="w-20"
                      />
                      <span className="text-muted-foreground w-20 text-right text-xs">
                        {formatCentsBRL(subtotalCents)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy || lines.length === 1}
                        onClick={() => removeLine(line.uid)}
                        aria-label="Remover item"
                      >
                        ✕
                      </Button>
                    </div>
                  );
                })}
                <Button type="button" variant="outline" size="sm" onClick={addLine} disabled={busy}>
                  + Adicionar item
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Observações (opcional)</Label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={busy}
                placeholder="Entregar à tarde, etc."
                rows={2}
                maxLength={2000}
                className="border-input bg-transparent text-foreground w-full rounded-md border px-2.5 py-2 text-sm shadow-xs"
              />
            </div>

            <div className="flex items-center justify-between border-t pt-3 text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="text-lg font-semibold">{formatCentsBRL(totalCents)}</span>
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
              <Button type="submit" disabled={busy}>
                {busy ? (
                  <>
                    <Spinner /> Salvando…
                  </>
                ) : (
                  "Criar pedido"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
