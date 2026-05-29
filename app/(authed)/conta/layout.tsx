// Account-level chrome for /conta (no company context, so no sidebar).

import { AccountFrame } from "@/components/layout/account-header";

export default function ContaLayout({ children }: { children: React.ReactNode }) {
  return <AccountFrame>{children}</AccountFrame>;
}
