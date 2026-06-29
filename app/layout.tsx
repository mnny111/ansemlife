import "./globals.css";
import type { ReactNode } from "react";
import { Inter, Fraunces, Archivo_Black } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", weight: ["400", "700", "900"] });
const archivo = Archivo_Black({ subsets: ["latin"], variable: "--font-archivo", weight: "400" });

export const metadata = {
  title: "AnsemLife",
  description: "Every creator reward deployed into a 10x long on Ansem's coin.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${archivo.variable}`}>
      <body className="min-h-screen bg-black font-sans text-white antialiased">
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
