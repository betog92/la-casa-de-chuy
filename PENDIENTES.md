# Pendientes (para después del commit actual)

## 1. Cancelación – total pagado y reembolso

- **API** `src/app/api/reservations/[id]/cancel/route.ts`: dejar de usar `calculateTotalPaid(price, additional_payment_amount)` y usar `reservation.price` como total pagado (ya que `price` se mantiene acumulado en reagendos).
- **Modales de cancelación** en `reservaciones/[id]/page.tsx` y `reservas/[token]/page.tsx`: mismo criterio para el monto a reembolsar (80 %) mostrado en el modal.

## 2. "Pendiente de cobro" – no desglosar hasta cobrar

- No incluir en el desglose de precios los pagos adicionales con `additional_payment_method === "pendiente"` hasta que el admin los cambie a efectivo/transferencia (o conekta).
- Ajustar:
  - Cálculo de `additionalFromHistory` y líneas "Pago adicional por reagendamiento" para considerar solo métodos ya cobrados (conekta, efectivo, transferencia).
  - Decidir si, cuando el admin marca "pendiente", se actualiza o no `reservation.price`; si no se actualiza, definir cómo se actualiza cuando luego se cambie a efectivo/transferencia.

## 3. Opcionales / mejoras

- **Key en el `.map` del historial:** usar un key estable (p. ej. `rescheduled_at` + id) en lugar de `key={idx}` en los bloques de historial de reagendamiento.
- **Descuentos + pagos por reagendo:** si hay descuentos y además pagos por reagendamiento, opcionalmente mostrar también las líneas "Pago adicional por reagendamiento" en el desglose (el total ya es `reservation.price`).
