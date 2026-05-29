// Account-level chrome for /app and /app/criar (company list + creation).
// Grouped under (home) so [slug] stays out of this layout and gets AppShell.

import { AccountFrame } from "@/components/layout/account-header";

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return <AccountFrame>{children}</AccountFrame>;
}
