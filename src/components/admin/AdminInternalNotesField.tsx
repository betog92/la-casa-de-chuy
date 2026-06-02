"use client";

type AdminInternalNotesFieldProps = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  /** Etiqueta del campo; por defecto notas internas opcionales. */
  label?: string;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  /** Texto bajo el campo (detalle admin). */
  showAdminOnlyHint?: boolean;
  labelClassName?: string;
  inputClassName?: string;
};

const defaultDetailInputClass =
  "w-full rounded border border-zinc-300 px-3 py-2 text-[#103948] focus:border-[#103948] focus:outline-none focus:ring-1 focus:ring-[#103948]";

const defaultCreateInputClass =
  "w-full rounded border border-zinc-300 px-3 py-2 text-sm";

/**
 * Notas internas de reserva (La Casa de Chuy y Alvero).
 * Solo las ven y editan administradores.
 */
export function AdminInternalNotesField({
  value,
  onChange,
  id = "admin-internal-notes",
  label = "Notas internas (opcional)",
  rows = 3,
  maxLength = 10000,
  placeholder = "Solo visible para el equipo administrativo",
  showAdminOnlyHint = false,
  labelClassName = "mb-1 block text-xs font-medium text-zinc-600",
  inputClassName = defaultCreateInputClass,
}: AdminInternalNotesFieldProps) {
  return (
    <div>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        maxLength={maxLength}
        className={inputClassName}
        placeholder={placeholder}
      />
      {showAdminOnlyHint ? (
        <p className="text-xs text-zinc-500 mt-1">
          Solo visible para administradores.
        </p>
      ) : null}
    </div>
  );
}

export { defaultDetailInputClass };
