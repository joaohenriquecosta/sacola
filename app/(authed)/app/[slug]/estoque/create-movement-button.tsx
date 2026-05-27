"use client";

import { Button } from "@/components/ui/button";
import { CreateMovementDialog, type StockProductOption } from "./create-movement-dialog";

export function CreateMovementButton({
  slug,
  products,
}: {
  slug: string;
  products: readonly StockProductOption[];
}) {
  return (
    <CreateMovementDialog
      slug={slug}
      products={products}
      trigger={<Button>Lançar movimento</Button>}
    />
  );
}
