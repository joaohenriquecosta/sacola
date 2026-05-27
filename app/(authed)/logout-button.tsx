"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import { useFormSubmit } from "@/lib/use-form-submit";

export function LogoutButton() {
  const router = useRouter();
  const { submit, isPending } = useFormSubmit();
  const [requesting, setRequesting] = useState(false);

  const busy = requesting || isPending;

  async function onClick() {
    setRequesting(true);
    await submit<unknown>({
      request: async () => {
        const res = await fetch("/api/v1/sessions", { method: "DELETE" });
        return { status: res.status, body: null };
      },
      // Logout returns 200 with the expired session body; anything 2xx works.
      success: (s) => s >= 200 && s < 400,
      then: () => {
        router.push("/");
        router.refresh();
      },
    });
    setRequesting(false);
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={busy}>
      {busy ? (
        <>
          <Spinner /> Saindo…
        </>
      ) : (
        "Sair"
      )}
    </Button>
  );
}
