"use client";

import { Button } from "@/components/ui/button";
import { ClientDialog } from "./client-dialog";

export function CreateClientButton({ slug }: { slug: string }) {
  return <ClientDialog slug={slug} trigger={<Button>Cadastrar cliente</Button>} />;
}
