import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "La Casa de Chuy el Rico - Reservas",
  description: "Sistema de reservas para estudio de locación fotográfica",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
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
        {children}
      </body>
    </html>
  );
}
