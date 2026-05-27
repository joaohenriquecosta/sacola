"use client";

// Reused for both criar e editar — `initial` indica edição (PATCH no id),
// undefined = criação (POST). Phone/notes são opcionais; vazio vira null
// no envio.

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
import { useFormSubmit, type ErrorPayload } from "@/lib/use-form-submit";

export type ClientDialogInitial = {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
};

type Props = {
  slug: string;
  trigger: React.ReactNode;
  initial?: ClientDialogInitial;
};

export function ClientDialog({ slug, trigger, initial }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<ErrorPayload | null>(null);
  const { submit, isPending } = useFormSubmit();
  const [requesting, setRequesting] = useState(false);
  const busy = requesting || isPending;

  const isEditing = Boolean(initial);

  function reset() {
    setName(initial?.name ?? "");
    setPhone(initial?.phone ?? "");
    setNotes(initial?.notes ?? "");
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

    const body = JSON.stringify({
      name,
      phone: phone.trim() || null,
      notes: notes.trim() || null,
    });
    const url = isEditing
      ? `/api/v1/companies/${encodeURIComponent(slug)}/clients/${encodeURIComponent(initial!.id)}`
      : `/api/v1/companies/${encodeURIComponent(slug)}/clients`;

    const result = await submit<{ message?: string; action?: string }>({
      request: async () => {
        const res = await fetch(url, {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar cliente" : "Cadastrar cliente"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Atualize nome, telefone ou observações." : "Adicione um cliente novo."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              placeholder="Maria da Silva"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Telefone</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={busy}
              placeholder="(11) 99999-9999"
              maxLength={32}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={busy}
              placeholder="Prefere entregar à tarde, etc."
              rows={3}
              maxLength={2000}
              className="border-input bg-transparent text-foreground w-full rounded-md border px-2.5 py-2 text-sm shadow-xs"
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
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? (
                <>
                  <Spinner /> Salvando…
                </>
              ) : isEditing ? (
                "Salvar"
              ) : (
                "Cadastrar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
