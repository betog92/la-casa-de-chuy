import { formatCurrency } from "@/utils/formatters";

interface RescheduleAdditionalRowProps {
  label: string;
  amount: number;
}

/**
 * Fila de pago adicional por reagendamiento en el desglose de precios.
 * Color naranja para alinearlo con la sección "Información de reagendamiento".
 */
export function RescheduleAdditionalRow({
  label,
  amount,
}: RescheduleAdditionalRowProps) {
  return (
    <div className="flex justify-between text-sm text-zinc-600">
      <span>{label}:</span>
      <span className="font-medium text-orange-700">
        +${formatCurrency(amount)}
      </span>
    </div>
  );
}
