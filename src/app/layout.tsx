import type { Metadata } from "next";
import { Geist, Geist_Mono, Cormorant } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Header from "@/components/Header";
import { AuthProvider } from "@/contexts/AuthContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cormorant = Cormorant({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "La Casa de Chuy el Rico - Reservas",
  description: "Reserva en línea la locación fotográfica de La Casa de Chuy el Rico",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${cormorant.variable} antialiased`}
      >
        {/* Inicialización de Conekta */}
        {/* Define la función callback ANTES de cargar el script de Conekta */}
        <Script
          id="conekta-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                'use strict';
                if (typeof window !== 'undefined') {
                  // Definir función callback para el script de antifraude de Conekta
                  // Esta función debe estar definida ANTES de que se cargue el script de Conekta
                  window.conekta_antifraud_config_jsonp = window.conekta_antifraud_config_jsonp || function() {};
                }
              })();
            `,
          }}
        />
        <Script
          src="https://cdn.conekta.io/js/latest/conekta.js"
          strategy="beforeInteractive"
        />
        <AuthProvider>
          <Header />
          {children}
        </AuthProvider>
        {process.env.NODE_ENV === "production" ? (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        ) : null}
      </body>
    </html>
  );
}
