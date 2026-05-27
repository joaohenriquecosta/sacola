"use client";

import { Button } from "@/components/ui/button";
import { ProductDialog } from "./product-dialog";

export function CreateProductButton({ slug }: { slug: string }) {
  return <ProductDialog slug={slug} trigger={<Button>Cadastrar produto</Button>} />;
}
