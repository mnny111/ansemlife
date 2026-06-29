import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "AnsemLife", description: "Creator rewards, deployed into a 10x long on AsterDex." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-black text-white min-h-screen">{children}</body>
    </html>
  );
}
