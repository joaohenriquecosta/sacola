"use client";

// Card de pagamentos do pedido. Mostra lista + total pago + saldo.
// Quando o usuário tem create:payment e o pedido não está cancelado,
// abre dialog pra registrar; quando tem delete:payment, mostra ✕ pra
// estornar.

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Spinner } from "@/components/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatCentsBRL, parseBRLToCents } from "@/lib/format-money";
import type { OrderStatus } from "@/lib/order-status";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL_PT_BR,
  type PaymentMethod,
} from "@/lib/payment-method";
import { useFormSubmit, type ErrorPayload } from "@/lib/use-form-submit";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

type PaymentView = {
  id: string;
  amount_cents: number;
  method: PaymentMethod;
  paid_at: string;
  notes: string | null;
};

type Props = {
  slug: string;
  orderId: string;
  orderStatus: OrderStatus;
  totalCents: number;
  totalPaidCents: number;
  balanceDueCents: number;
  payments: readonly PaymentView[];
  canCreate: boolean;
  canDelete: boolean;
};

export function PaymentsCard({
  slug,
  orderId,
  orderStatus,
  totalCents,
  totalPaidCents,
  balanceDueCents,
  payments,
  canCreate,
  canDelete,
}: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Pagamentos</CardTitle>
          <CardDescription>
            {payments.length === 0
              ? "Nenhum pagamento registrado."
              : `${payments.length} ${payments.length === 1 ? "lançamento" : "lançamentos"}.`}
          </CardDescription>
        </div>
        {canCreate && orderStatus !== "cancelado" && (
          <RegisterPaymentDialog
            slug={slug}
            orderId={orderId}
            suggestedCents={balanceDueCents > 0 ? balanceDueCents : 0}
          />
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {payments.length > 0 && (
          <div className="space-y-2">
            {payments.map((p) => (
              <PaymentRow
                key={p.id}
                slug={slug}
                orderId={orderId}
                payment={p}
                canDelete={canDelete}
              />
            ))}
          </div>
        )}
        <div className="space-y-1 border-t pt-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Total do pedido</span>
            <span className="font-medium">{formatCentsBRL(totalCents)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Pago</span>
            <span className="font-medium">{formatCentsBRL(totalPaidCents)}</span>
          </div>
          <div className="flex items-center justify-between border-t pt-1">
            <span className="text-muted-foreground">Saldo a pagar</span>
            <span
              className={`text-base font-semibold ${
                balanceDueCents <= 0
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {formatCentsBRL(Math.max(balanceDueCents, 0))}
              {balanceDueCents < 0 && ` (troco ${formatCentsBRL(-balanceDueCents)})`}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentRow({
  slug,
  orderId,
  payment,
  canDelete,
}: {
  slug: string;
  orderId: string;
  payment: PaymentView;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm("Estornar este pagamento?")) return;
    setBusy(true);
    try {
      await fetch(
        `/api/v1/companies/${encodeURIComponent(slug)}/orders/${encodeURIComponent(orderId)}/payments/${encodeURIComponent(payment.id)}`,
        { method: "DELETE" },
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-border flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="font-medium">{formatCentsBRL(payment.amount_cents)}</p>
        <p className="text-muted-foreground text-xs">
          {PAYMENT_METHOD_LABEL_PT_BR[payment.method]} ·{" "}
          {dateFormatter.format(new Date(payment.paid_at))}
          {payment.notes && ` · ${payment.notes}`}
        </p>
      </div>
      {canDelete && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={remove} aria-label="Estornar">
          ✕
        </Button>
      )}
    </div>
  );
}

function RegisterPaymentDialog({
  slug,
  orderId,
  suggestedCents,
}: {
  slug: string;
  orderId: string;
  suggestedCents: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amountText, setAmountText] = useState(
    suggestedCents > 0 ? (suggestedCents / 100).toFixed(2).replace(".", ",") : "",
  );
  const [method, setMethod] = useState<PaymentMethod>("dinheiro");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<ErrorPayload | null>(null);
  const { submit, isPending } = useFormSubmit();
  const [requesting, setRequesting] = useState(false);
  const busy = requesting || isPending;

  function reset() {
    setAmountText(suggestedCents > 0 ? (suggestedCents / 100).toFixed(2).replace(".", ",") : "");
    setMethod("dinheiro");
    setNotes("");
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

    const cents = parseBRLToCents(amountText);
    if (cents === null || cents <= 0) {
      setError({ message: "Valor inválido.", action: 'Use o formato "10,00".' });
      setRequesting(false);
      return;
    }

    const result = await submit<{ message?: string; action?: string }>({
      request: async () => {
        const res = await fetch(
          `/api/v1/companies/${encodeURIComponent(slug)}/orders/${encodeURIComponent(orderId)}/payments`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              amount_cents: cents,
              method,
              notes: notes.trim() || null,
            }),
          },
        );
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
      <DialogTrigger asChild>
        <Button size="sm">Registrar pagamento</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pagamento</DialogTitle>
          <DialogDescription>
            Pagamentos parciais OK — registre um por vez conforme entrar.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Valor (R$)</Label>
            <Input
              id="amount"
              inputMode="decimal"
              required
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              disabled={busy}
              placeholder="10,00"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="method">Método</Label>
            <select
              id="method"
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              disabled={busy}
              className="border-input bg-transparent text-foreground h-9 w-full rounded-md border px-2.5 text-sm shadow-xs"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABEL_PT_BR[m]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Observações (opcional)</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={busy}
              placeholder="Comprovante #1234, pago em 2 vezes…"
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
                "Registrar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
