"use client";

import Link from "next/link";

const linkClass =
  "block px-4 py-2 text-sm text-[#103948BF] hover:bg-zinc-50 hover:text-[#103948] transition-colors";

type UserMenuLinksProps = {
  isAdmin: boolean;
  onNavigate?: () => void;
};

/**
 * Enlaces del menú de usuario (Header desktop).
 * Admin: Panel admin + Vista cliente. Cliente: Mi cuenta.
 */
export function UserMenuLinks({ isAdmin, onNavigate }: UserMenuLinksProps) {
  if (isAdmin) {
    return (
      <>
        <Link href="/admin" className={linkClass} onClick={onNavigate}>
          Panel admin
        </Link>
        <Link href="/account" className={linkClass} onClick={onNavigate}>
          Vista cliente
        </Link>
      </>
    );
  }

  return (
    <Link href="/account" className={linkClass} onClick={onNavigate}>
      Mi cuenta
    </Link>
  );
}
