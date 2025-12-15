"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import MobileMenu from "./MobileMenu";
import { navigation } from "@/constants/navigation";

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <header
        className="border-b border-[#103948]/10"
        style={{ backgroundColor: "#EBECED" }}
      >
        <nav
          className="mx-auto flex max-w-7xl items-center justify-between px-6 sm:px-8 lg:px-16 py-4 sm:py-5 lg:py-6 min-h-[80px] sm:min-h-[100px] lg:min-h-[128px]"
          aria-label="Global"
        >
          {/* Logo y Menú Desktop */}
          <div className="flex items-center gap-x-6 sm:gap-x-8 lg:gap-x-12">
            <Link href="/" className="flex items-center">
              <span className="sr-only">La Casa de Chuy el Rico</span>
              <Image
                src="/logo.webp"
                alt="La Casa de Chuy el Rico"
                width={130}
                height={130}
                className="h-16 w-16 sm:h-20 sm:w-20 lg:h-[130px] lg:w-[130px] object-contain"
                priority
                unoptimized
              />
            </Link>

            {/* Menú Desktop */}
            <div className="hidden lg:flex lg:gap-x-10 lg:items-center">
              {navigation.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`font-medium leading-6 transition-colors relative ${
                      isActive
                        ? "text-[#103948] font-semibold"
                        : "text-[#103948BF] hover:text-[#103948]"
                    }`}
                    style={{
                      fontFamily: "var(--font-cormorant), serif",
                      fontSize: "18px",
                    }}
                  >
                    {item.name}
                    {isActive && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#103948]"></span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Icono de usuario (Desktop) */}
          <div className="hidden lg:flex lg:items-center">
            <button
              type="button"
              className="text-[#103948BF] hover:text-[#103948] transition-colors"
              aria-label="Iniciar sesión"
              onClick={() => {
                // Placeholder - implementar después
              }}
            >
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                />
              </svg>
            </button>
          </div>

          {/* Botón hamburguesa (Mobile) */}
          <div className="flex lg:hidden">
            <button
              type="button"
              className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-[#103948BF] hover:text-[#103948] transition-colors"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menú"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              </svg>
            </button>
          </div>
        </nav>
      </header>

      {/* Menú móvil */}
      <MobileMenu
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />
    </>
  );
}
