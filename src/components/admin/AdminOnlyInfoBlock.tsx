import type { ReactNode } from "react";

/** Campos visibles solo para administradores en detalle de reserva. */
export function AdminOnlyInfoBlock({ children }: { children: ReactNode }) {
  return (
    <div className="w-full border-y border-zinc-200 bg-zinc-50 px-6 pt-3 pb-2.5 sm:px-8">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Solo administración
      </p>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}
