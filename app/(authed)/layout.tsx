// Gate for all authenticated routes. Verifies the session here so nested
// layouts/pages can assume loadCurrentUser() returns a user. Chrome lives one
// level down: AccountFrame for the account routes, AppShell for /app/[slug].

import { redirect } from "next/navigation";

import { loadCurrentUser } from "infra/controller";

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const { user } = await loadCurrentUser();
  if (!user) redirect("/login");

  return <>{children}</>;
}
