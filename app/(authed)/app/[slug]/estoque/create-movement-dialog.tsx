"use client";

// Dialog de lançamento de movimento de estoque. Tipo (entrada/saída/
// ajuste), produto, qtd, motivo. Para ajuste, aceita sinal negativo;
// para in/out, apenas magnitude positiva (o sign vem do kind).

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
import {
  STOCK_MOVEMENT_KINDS,
  STOCK_MOVEMENT_KIND_LABEL_PT_BR,
  type StockMovementKind,
} from "@/lib/stock-kind";
import { useFormSubmit, type ErrorPayload } from "@/lib/use-form-submit";

export type StockProductOption = { id: string; name: string; unit: string };

type Props = {
  slug: string;
  products: readonly StockProductOption[];
  trigger: React.ReactNode;
};

function parseQuantity(text: string, kind: StockMovementKind): number | null {
  const normalized = text.trim().replace(",", ".");
  if (!normalized) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  if (kind === "adjust") {
    if (n === 0) return null;
    return n;
  }
  if (n <= 0) return null;
  return n;
}

export function CreateMovementDialog({ slug, products, trigger }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState<string>(products[0]?.id ?? "");
  const [kind, setKind] = useState<StockMovementKind>("in");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<ErrorPayload | null>(null);
  const { submit, isPending } = useFormSubmit();
  const [requesting, setRequesting] = useState(false);
  const busy = requesting || isPending;

  function reset() {
    setProductId(products[0]?.id ?? "");
    setKind("in");
    setQuantity("");
    setReason("");
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

    const qty = parseQuantity(quantity, kind);
    if (qty === null) {
      setError({
        message: "Quantidade inválida.",
        action:
          kind === "adjust"
            ? "Use número assinado (ex.: 0,5 ou -2)."
            : "Use número positivo (ex.: 5 ou 0,5).",
      });
      setRequesting(false);
      return;
    }

    const result = await submit<{ message?: string; action?: string }>({
      request: async () => {
        const res = await fetch(`/api/v1/companies/${encodeURIComponent(slug)}/stock/movements`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: productId,
            kind,
            quantity: qty,
            reason: reason.trim() || null,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lançar movimento</DialogTitle>
          <DialogDescription>
            Entrada soma; saída subtrai; ajuste aplica o delta assinado.
          </DialogDescription>
        </DialogHeader>

        {noProducts ? (
          <Alert variant="destructive">
            <AlertTitle>Cadastros faltando</AlertTitle>
            <AlertDescription>Cadastre pelo menos um produto.</AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="kind">Tipo</Label>
              <select
                id="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as StockMovementKind)}
                disabled={busy}
                className="border-input bg-transparent text-foreground h-9 w-full rounded-md border px-2.5 text-sm shadow-xs"
              >
                {STOCK_MOVEMENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {STOCK_MOVEMENT_KIND_LABEL_PT_BR[k]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="product">Produto</Label>
              <select
                id="product"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                disabled={busy}
                className="border-input bg-transparent text-foreground h-9 w-full rounded-md border px-2.5 text-sm shadow-xs"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.unit})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">Quantidade</Label>
              <Input
                id="quantity"
                inputMode={kind === "adjust" ? "text" : "decimal"}
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={busy}
                placeholder={kind === "adjust" ? "ex.: -2 ou 5,5" : "ex.: 10"}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Motivo (opcional)</Label>
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={busy}
                placeholder="Compra do fornecedor X / Recontagem / Perda"
                maxLength={120}
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
              <Button type="submit" disabled={busy}>
                {busy ? (
                  <>
                    <Spinner /> Salvando…
                  </>
                ) : (
                  "Lançar"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
