import { formatCurrency } from "@/utils/formatters";

interface DiscountRowProps {
  label: string;
  amount: number;
}

/**
 * Componente reutilizable para mostrar una fila de descuento
 */
export function DiscountRow({ label, amount }: DiscountRowProps) {
  return (
    <div className="flex justify-between text-sm text-zinc-600">
      <span>{label}:</span>
      <span className="text-green-600">-${formatCurrency(amount)}</span>
    </div>
  );
}

