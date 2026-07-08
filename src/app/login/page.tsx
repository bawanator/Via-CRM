import { Suspense } from "react";
import { LoginCard } from "./LoginCard";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="dotted-canvas flex min-h-dvh items-center justify-center p-6">
      <Suspense>
        <LoginCard />
      </Suspense>
    </main>
  );
}
