import type { Metadata, Viewport } from "next";
import { RegisterServiceWorker } from "@/components/shell/RegisterServiceWorker";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Vía OS", template: "%s — Vía OS" },
  description: "Broker & deal CRM for Vía Private.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Vía OS",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
