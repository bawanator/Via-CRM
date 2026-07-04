import { requireAllowedUser } from "@/lib/auth";
import { AppShell } from "@/components/shell/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAllowedUser();
  return <AppShell>{children}</AppShell>;
}
