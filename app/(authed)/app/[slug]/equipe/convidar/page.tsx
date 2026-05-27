import { notFound, redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadCurrentUser } from "infra/controller";
import { NotFoundError } from "infra/errors";
import { getCompanyBySlug } from "models/company";
import { getMembership } from "models/membership";
import { InviteForm } from "./invite-form";

type Params = Promise<{ slug: string }>;

export default async function ConvidarPage({ params }: { params: Params }) {
  const { slug } = await params;
  const { user } = await loadCurrentUser();
  if (!user) redirect("/login");

  let company;
  try {
    company = await getCompanyBySlug(slug);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const membership = await getMembership(user.id, company.id);
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Convidar membro</CardTitle>
          <CardDescription>
            Enviamos um link de convite por email; o convidado entra direto se aceitar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteForm slug={company.slug} />
        </CardContent>
      </Card>
    </div>
  );
}
