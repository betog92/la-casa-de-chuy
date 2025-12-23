"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { navigation } from "@/constants/navigation";
import { useAuth } from "@/hooks/useAuth";

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, signOut } = useAuth();

  // Cerrar menú al presionar Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      // Prevenir scroll del body cuando el menú está abierto
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 left-0 z-50 w-full max-w-sm bg-white shadow-xl transform transition-transform duration-300 ease-in-out">
        <div className="flex flex-col h-full">
          {/* Header del drawer */}
          <div className="flex items-center justify-between p-4 border-b border-zinc-200">
            <h2
              className="text-lg font-semibold text-[#103948]"
              style={{ fontFamily: "var(--font-cormorant), serif" }}
            >
              Menú
            </h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-[#103948BF] hover:bg-zinc-100 hover:text-[#103948] transition-colors"
              aria-label="Cerrar menú"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Navegación */}
          <nav className="flex-1 overflow-y-auto py-4">
            <ul className="space-y-1 px-4">
              {navigation.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      className={`block px-4 py-3 rounded-lg text-base font-medium transition-colors ${
                        isActive
                          ? "bg-[#103948] text-white"
                          : "text-[#103948BF] hover:bg-zinc-100 hover:text-[#103948]"
                      }`}
                      style={{ fontFamily: "var(--font-cormorant), serif" }}
                    >
                      {item.name}
                    </Link>
                  </li>
                );
              })}

              {/* Usuario o Iniciar sesión */}
              <li className="pt-2 border-t border-zinc-200 mt-2">
                {loading ? (
                  <div className="px-4 py-3 flex items-center gap-3">
                    <div className="w-5 h-5 animate-pulse bg-zinc-300 rounded-full" />
                    <span className="text-base text-zinc-400">Cargando...</span>
                  </div>
                ) : user ? (
                  <>
                    <div className="px-4 pt-3 pb-4 border-b border-zinc-200">
                      <p className="text-sm font-medium text-[#103948] truncate leading-relaxed">
                        {user.email}
                      </p>
                    </div>
                    <Link
                      href="/account"
                      onClick={onClose}
                      className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-base font-medium transition-colors text-[#103948BF] hover:bg-zinc-100 hover:text-[#103948]"
                      style={{ fontFamily: "var(--font-cormorant), serif" }}
                    >
                      <svg
                        className="w-5 h-5"
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
                      <span>Mi cuenta</span>
                    </Link>
                    <button
                      type="button"
                      onClick={async () => {
                        await signOut();
                        onClose();
                        router.push("/");
                      }}
                      className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-base font-medium transition-colors text-[#103948BF] hover:bg-zinc-100 hover:text-[#103948]"
                      style={{ fontFamily: "var(--font-cormorant), serif" }}
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="1.5"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
                        />
                      </svg>
                      <span>Cerrar sesión</span>
                    </button>
                  </>
                ) : (
                  <Link
                    href="/auth/login"
                    onClick={onClose}
                    className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-base font-medium transition-colors text-[#103948BF] hover:bg-zinc-100 hover:text-[#103948]"
                    style={{ fontFamily: "var(--font-cormorant), serif" }}
                  >
                    <svg
                      className="w-5 h-5"
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
                    <span>Iniciar sesión</span>
                  </Link>
                )}
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </>
  );
}
