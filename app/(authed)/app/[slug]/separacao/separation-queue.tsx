"use client";

// Separation queue actions. Lists the company's "criado" orders and lets the
// separador move each to "separado" (the existing transition). Realtime is a
// later slice — for now the list refreshes after each action.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function separate(id: string) {
    setBusyId(id);
    try {
      await fetch(
        `/api/v1/companies/${encodeURIComponent(slug)}/orders/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "separado" }),
        },
      );
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

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
          <Link href={`/app/${slug}/pedidos/${o.id}`} className="min-w-0 hover:underline">
            <p className="truncate font-medium">{o.client_name}</p>
            <p className="text-muted-foreground text-xs">
              {timeFormatter.format(new Date(o.created_at))} · {o.item_count}{" "}
              {o.item_count === 1 ? "item" : "itens"} · {formatCentsBRL(o.total_cents)}
            </p>
          </Link>
          <Button size="sm" disabled={busyId === o.id} onClick={() => separate(o.id)}>
            {busyId === o.id ? "Separando…" : "Separar"}
          </Button>
        </li>
      ))}
    </ul>
  );
}
