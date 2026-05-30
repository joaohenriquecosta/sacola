// Separation queue: lists the company's "criado" orders FIFO; each links to
// the per-item weighing screen, where the separador records weights and
// finalizes (criado → separado). Realtime is a later slice — the list
// refreshes on navigation.

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCentsBRL } from "@/lib/format-money";

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

export type QueueOrder = {
  id: string;
  client_name: string;
  item_count: number;
  total_cents: number;
  created_at: string;
};

export function SeparationQueue({ slug, orders }: { slug: string; orders: QueueOrder[] }) {
  if (orders.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fila vazia</CardTitle>
          <CardDescription>Nenhum pedido aguardando separação.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <ul className="space-y-2">
      {orders.map((o) => (
        <li
          key={o.id}
          className="border-border flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
        >
          <div className="min-w-0">
            <p className="truncate font-medium">{o.client_name}</p>
            <p className="text-muted-foreground text-xs">
              {timeFormatter.format(new Date(o.created_at))} · {o.item_count}{" "}
              {o.item_count === 1 ? "item" : "itens"} · {formatCentsBRL(o.total_cents)}
            </p>
          </div>
          <Button size="sm" asChild>
            <Link href={`/app/${slug}/separacao/${o.id}`}>Separar</Link>
          </Button>
        </li>
      ))}
    </ul>
  );
}
