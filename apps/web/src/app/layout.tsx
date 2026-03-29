import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist_Mono } from "next/font/google";
import { cn } from "@/lib/utils";

const geistMono = Geist_Mono({subsets:['latin'],variable:'--font-mono'});

export const metadata: Metadata = {
  title: "TrustLoop",
  description: "TrustLoop foundation scaffold",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn("font-mono", geistMono.variable)}>
      <body>{children}</body>
    </html>
  );
}
