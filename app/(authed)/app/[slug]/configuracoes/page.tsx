// Company settings. Edit name/slug (admin+) and delete (owner only). Role
// gates done on the server before rendering controls — no point shipping a
// "delete" button to a member who would just get a 403 if they clicked it.

import { notFound, redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadCurrentUser } from "infra/controller";
import { NotFoundError } from "infra/errors";
import { getCompanyBySlug } from "models/company";
import { getMembership } from "models/membership";
import { CompanySettingsForm } from "./settings-form";
import { DeleteCompanyButton } from "./delete-button";

type Params = Promise<{ slug: string }>;

export default async function ConfiguracoesPage({ params }: { params: Params }) {
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
    <div className="mx-auto w-full max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>

      <Card>
        <CardHeader>
          <CardTitle>Identidade</CardTitle>
          <CardDescription>O nome aparece no menu; o slug forma a URL.</CardDescription>
        </CardHeader>
        <CardContent>
          <CompanySettingsForm slug={company.slug} name={company.name} />
        </CardContent>
      </Card>

      {membership.role === "owner" && (
        <Card>
          <CardHeader>
            <CardTitle>Excluir empresa</CardTitle>
            <CardDescription>
              Apaga a empresa e todos os vínculos. Esta ação não pode ser desfeita.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteCompanyButton slug={company.slug} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
