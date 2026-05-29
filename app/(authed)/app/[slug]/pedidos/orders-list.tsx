"use client";

// Orders list with an optional "mine / all" toggle. The server passes every
// order plus the current user id; whoever can create orders (vendedor,
// gerente) gets a toggle to narrow to the ones they opened — the vendor's
// "own orders" view. Pure client-side filter; the list already carries
// created_by, so no extra request.

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCentsBRL } from "@/lib/format-money";
import { ORDER_STATUS_BADGE_CLASS, ORDER_STATUS_LABEL_PT_BR } from "@/lib/order-labels";
import type { OrderStatus } from "@/lib/order-status";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export type OrderRow = {
  id: string;
  client_name: string;
  item_count: number;
  status: OrderStatus;
  total_cents: number;
  created_at: string;
  created_by: string;
};

export function OrdersList({
  slug,
  orders,
  currentUserId,
  canFilterMine,
}: {
  slug: string;
  orders: OrderRow[];
  currentUserId: string;
  canFilterMine: boolean;
}) {
  const [mineOnly, setMineOnly] = useState(false);
  const visible = mineOnly ? orders.filter((o) => o.created_by === currentUserId) : orders;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>{mineOnly ? "Meus pedidos" : "Histórico"}</CardTitle>
          <CardDescription>
            {visible.length === 0
              ? mineOnly
                ? "Você ainda não abriu pedidos."
                : "Nenhum pedido ainda."
              : `${visible.length} ${visible.length === 1 ? "pedido" : "pedidos"}.`}
          </CardDescription>
        </div>
        {canFilterMine && (
          <div className="flex shrink-0 gap-1">
            <Button
              variant={mineOnly ? "outline" : "default"}
              size="sm"
              onClick={() => setMineOnly(false)}
            >
              Todos
            </Button>
            <Button
              variant={mineOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setMineOnly(true)}
            >
              Meus pedidos
            </Button>
          </div>
        )}
      </CardHeader>
      {visible.length > 0 && (
        <CardContent className="space-y-2">
          {visible.map((o) => (
            <Link
              key={o.id}
              href={`/app/${slug}/pedidos/${o.id}`}
              className="border-border hover:border-foreground/30 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition-colors"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{o.client_name}</p>
                <p className="text-muted-foreground text-xs">
                  {dateFormatter.format(new Date(o.created_at))} · {o.item_count}{" "}
                  {o.item_count === 1 ? "item" : "itens"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${ORDER_STATUS_BADGE_CLASS[o.status]}`}
                >
                  {ORDER_STATUS_LABEL_PT_BR[o.status]}
                </span>
                <span className="font-medium">{formatCentsBRL(o.total_cents)}</span>
              </div>
            </Link>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
