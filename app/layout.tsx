import "./globals.css";
import type { Metadata } from "next";
import { ShellHeader } from "@/components/layout/ShellHeader";
import { ShellFooter } from "@/components/layout/ShellFooter";
import { WhopProvider } from "@/components/providers/WhopProvider";

export const metadata: Metadata = {
  title: "LinkVault - Sell securely. Share instantly.",
  description: "Sell digital files securely and share them instantly with LinkVault",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WhopProvider>
          <div className="app-shell">
            <ShellHeader />
            <main className="app-main">
              <div className="container">
                {children}
              </div>
            </main>
            <ShellFooter />
          </div>
        </WhopProvider>
      </body>
    </html>
  );
}
