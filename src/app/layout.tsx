import "./globals.css";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { destroySessionAction } from "./actions";
import HeaderNav from "./HeaderNav";

export const metadata = { title: "Fold", description: "Event management and attendee analytics" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          {user && (
            <header className="relative border-b border-black/5 dark:border-white/10">
              <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-6">
                <Link href="/" className="font-semibold tracking-tight">
                  ✶ Fold
                </Link>
                <HeaderNav displayName={user.displayName} signOutAction={destroySessionAction} />
              </div>
            </header>
          )}
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
