"use client";

import { Button } from "@/components/ui/button";
import {
  CreateOrderDialog,
  type OrderClientOption,
  type OrderProductOption,
} from "./create-order-dialog";

export function CreateOrderButton({
  slug,
  clients,
  products,
}: {
  slug: string;
  clients: OrderClientOption[];
  products: OrderProductOption[];
}) {
  return (
    <CreateOrderDialog
      slug={slug}
      clients={clients}
      products={products}
      trigger={<Button>Criar pedido</Button>}
    />
  );
}
