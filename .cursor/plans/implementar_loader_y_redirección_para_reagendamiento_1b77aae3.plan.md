# Implementar loader y redirección para reagendamiento con pago adicional

## Resumen
Agregar un loader durante el proceso de reagendamiento, detectar si se requiere pago adicional (cuando la nueva fecha tiene mayor costo), redirigir al flujo de pago si es necesario, y finalmente redirigir a la página de confirmación adaptada para reagendamientos.

## Cambios necesarios

### 1. Modificar endpoint de reschedule para calcular precio adicional
- En `src/app/api/reservations/[id]/reschedule/route.ts`:
  - Calcular el precio base de la nueva fecha usando `calculatePriceWithCustom()`
  - Comparar con el precio actual de la reserva (`reservation.price`)
  - Si el nuevo precio es mayor:
    - Devolver `requiresPayment: true` y `additionalAmount: nuevoPrecio - precioActual`
    - NO actualizar la reserva todavía (solo validar disponibilidad)
  - Si el nuevo precio es igual o menor:
    - Proceder con el reagendamiento directamente (como está ahora)
    - Devolver `requiresPayment: false`

### 2. Agregar estado de loading al modal de reagendamiento
- En `src/components/RescheduleModal.tsx`:
  - Aceptar prop `isRescheduling?: boolean`
  - Mostrar estado de loading en el botón "Confirmar Reagendamiento" cuando `isRescheduling` sea true
  - Deshabilitar todos los controles del modal (calendario, horarios, checkbox) durante el loading
  - Opcional: Mostrar un overlay/spinner en el modal durante el proceso

### 3. Modificar handleReschedule para manejar pago adicional
- En `src/app/reservaciones/[id]/page.tsx`:
  - Actualizar `handleReschedule` para:
    - Pasar el estado `rescheduling` como prop `isRescheduling` al `RescheduleModal`
    - Después de llamar al API de reschedule, verificar si `result.requiresPayment === true`
    - Si requiere pago:
      - Guardar los datos del reagendamiento (date, startTime, reservationId) en sessionStorage o state
      - Redirigir a `/reservar/reagendar/pago?reservationId=${reservationId}&newDate=${date}&newStartTime=${startTime}&additionalAmount=${additionalAmount}`
    - Si NO requiere pago:
      - Proceder con redirección a confirmación como antes

### 4. Crear página de pago para reagendamiento
- Crear `src/app/reservar/reagendar/pago/page.tsx`:
  - Similar a `src/app/reservar/formulario/page.tsx` pero adaptado para reagendamiento
  - Leer parámetros de query: `reservationId`, `newDate`, `newStartTime`, `additionalAmount`
  - Mostrar información de la reserva actual (fecha/hora anterior)
  - Mostrar información de la nueva fecha/hora seleccionada
  - Mostrar el monto adicional a pagar
  - Usar `ConektaPaymentForm` para procesar el pago del monto adicional
  - Después del pago exitoso:
    - Llamar a un nuevo endpoint `/api/reservations/[id]/reschedule/complete` que actualice la reserva
    - Redirigir a `/reservar/confirmacion?id=${reservationId}&rescheduled=true&paid=true`

### 5. Crear endpoint para completar reagendamiento con pago
- Crear `src/app/api/reservations/[id]/reschedule/complete/route.ts`:
  - Recibir: `reservationId`, `date`, `startTime`, `paymentId` (del pago adicional)
  - Actualizar la reserva con la nueva fecha/hora
  - Actualizar `payment_id` con el ID del pago adicional (o guardar ambos IDs si es necesario)
  - Incrementar `reschedule_count`
  - Opcional: Actualizar `price` a la suma del precio original + adicional si se desea mantener historial
  - Retornar la reserva actualizada

### 6. Adaptar página de confirmación para reagendamientos
- En `src/app/reservar/confirmacion/page.tsx`:
  - Leer parámetros `rescheduled` y `paid` de `useSearchParams()`
  - Si `rescheduled === 'true'`:
    - Título: "¡Reserva Reagendada!" en lugar de "¡Reserva Confirmada!"
    - Mensaje: Adaptar según si hubo pago (`paid === 'true'`):
      - Con pago: "Tu reserva ha sido reagendada exitosamente. Se ha procesado el pago adicional."
      - Sin pago: "Tu reserva ha sido reagendada exitosamente."
    - Opcional: Destacar visualmente la nueva fecha y hora con algún indicador (ej: badge o color diferente)
    - Mostrar información del pago adicional si `paid === 'true'`

## Flujo completo

### Caso 1: Reagendamiento sin costo adicional (mismo precio o menor)
1. Usuario selecciona nueva fecha/hora en modal
2. Clic en "Confirmar Reagendamiento" → muestra loader
3. API valida y actualiza reserva directamente
4. Redirige a `/reservar/confirmacion?id=XXX&rescheduled=true`

### Caso 2: Reagendamiento con costo adicional (precio mayor)
1. Usuario selecciona nueva fecha/hora en modal
2. Clic en "Confirmar Reagendamiento" → muestra loader
3. API detecta que requiere pago adicional
4. Redirige a `/reservar/reagendar/pago?reservationId=XXX&newDate=YYY&newStartTime=ZZZ&additionalAmount=WWW`
5. Usuario completa formulario de pago y paga monto adicional
6. Después del pago, se llama a `/api/reservations/[id]/reschedule/complete`
7. Redirige a `/reservar/confirmacion?id=XXX&rescheduled=true&paid=true`

## Archivos a modificar/crear

1. `src/app/api/reservations/[id]/reschedule/route.ts` - Calcular precio y detectar si requiere pago
2. `src/components/RescheduleModal.tsx` - Agregar prop `isRescheduling` y UI de loading
3. `src/app/reservaciones/[id]/page.tsx` - Manejar respuesta del API y redirigir según caso
4. `src/app/reservar/reagendar/pago/page.tsx` - **NUEVO**: Página de pago para reagendamiento
5. `src/app/api/reservations/[id]/reschedule/complete/route.ts` - **NUEVO**: Endpoint para completar reagendamiento con pago
6. `src/app/reservar/confirmacion/page.tsx` - Adaptar para reagendamientos con/sin pago

## Consideraciones
- El loader debe ser visible y claro para el usuario
- La redirección debe ser suave (router.push es suficiente)
- La página de confirmación debe funcionar tanto para reservas nuevas como reagendamientos (con y sin pago)
- No afectar el flujo existente de confirmación de reservas nuevas
- Mantener consistencia con el flujo de pago de reservas nuevas
- Considerar manejo de errores en cada paso del flujo de pago

