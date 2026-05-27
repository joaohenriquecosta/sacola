// Company settings. Open to any member; cards inside are role-gated:
//
//   Identidade        admin+
//   Transferir prop.  owner only
//   Excluir empresa   owner only
//   Sair da empresa   admin/member (owner must transfer first)
//
// We render the controls only when the requester is allowed to use them so
// nobody sees buttons that would 403 if clicked.

import { notFound, redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isManagementRole } from "@/lib/roles";
import { loadCurrentUser } from "infra/controller";
import { NotFoundError } from "infra/errors";
import { getCompanyBySlug } from "models/company";
import { getMembership, listMembersByCompany } from "models/membership";
import { CompanySettingsForm } from "./settings-form";
import { DeleteCompanyButton } from "./delete-button";
import { LeaveCompanyButton } from "./leave-button";
import { TransferOwnershipForm } from "./transfer-form";

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
  if (!membership) notFound();

  const isOwner = membership.role === "owner";
  const isAdmin = isManagementRole(membership.role);
  const otherMembers = isOwner
    ? (await listMembersByCompany(company.id)).filter((m) => m.user_id !== user.id)
    : [];

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Identidade</CardTitle>
            <CardDescription>O nome aparece no menu; o slug forma a URL.</CardDescription>
          </CardHeader>
          <CardContent>
            <CompanySettingsForm slug={company.slug} name={company.name} />
          </CardContent>
        </Card>
      )}

      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Transferir propriedade</CardTitle>
            <CardDescription>
              Você se torna administrador; o novo dono assume controle total da empresa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TransferOwnershipForm
              slug={company.slug}
              candidates={otherMembers.map((m) => ({
                user_id: m.user_id,
                username: m.username,
              }))}
            />
          </CardContent>
        </Card>
      )}

      {!isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Sair desta empresa</CardTitle>
            <CardDescription>
              Você perde acesso imediato. Pode voltar a entrar se for convidado de novo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LeaveCompanyButton slug={company.slug} companyName={company.name} />
          </CardContent>
        </Card>
      )}

      {isOwner && (
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
