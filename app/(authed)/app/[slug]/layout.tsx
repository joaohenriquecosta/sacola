// In-company layout: resolves the company + the caller's membership once,
// then wraps every nested page in AppShell with a feature-gated sidebar.
// Pages still do their own lookups (they stay self-contained); this layer
// guarantees access and supplies the chrome.

import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { loadCurrentUser } from "infra/controller";
import { NotFoundError } from "infra/errors";
import { getCompanyBySlug } from "models/company";
import { getMembership } from "models/membership";

type Params = Promise<{ slug: string }>;

export default async function CompanyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Params;
}) {
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

  return (
    <AppShell
      company={{ name: company.name, slug: company.slug }}
      user={{ username: user.username, email: user.email }}
      features={membership.features}
    >
      {children}
    </AppShell>
  );
}
