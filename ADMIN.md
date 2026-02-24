# Panel de Administración

## Configuración inicial

### 1. Ejecutar migración SQL

En el SQL Editor de Supabase, ejecuta los archivos en orden:

1. `sql/09-migration-add-admin-role.sql` – agrega la columna `is_admin` a `users`
2. `sql/11-migration-add-payment-method.sql` – agrega `payment_method` a `reservations` (necesario para reservas manuales)
3. `sql/12-migration-add-created-by-user-id.sql` – agrega `created_by_user_id` a `reservations` (qué admin creó la reserva manual)
4. `sql/13-migration-add-additional-payment-method.sql` – agrega `additional_payment_method` a `reservations` (reportes de cobro por reagendamiento)
5. `sql/14-migration-add-rescheduled-by-user-id.sql` – agrega `rescheduled_by_user_id` a `reservations` (qué admin reagendó, si aplica)
6. `sql/15-migration-add-reservation-reschedule-history.sql` – tabla `reservation_reschedule_history` (historial de todos los reagendamientos, visible para admins y usuarios)

### 2. Asignar tu cuenta como administrador

Ejecuta en el SQL Editor (reemplaza con tu email):

```sql
UPDATE users SET is_admin = TRUE WHERE email = 'tu-email@ejemplo.com';
```

Si tu usuario aún no existe en `public.users`, primero regístrate en la aplicación y luego ejecuta el `UPDATE` con tu email.

### 3. Acceder al panel

1. Inicia sesión con tu cuenta de administrador
2. Haz clic en tu ícono de usuario (esquina superior derecha)
3. Selecciona **"Panel admin"** en el menú

O navega directamente a: `/admin`

## Secciones del panel

- **Dashboard**: Resumen del día, ingresos, próximas reservas
- **Reservaciones**: Listado con filtros por fecha y estado, crear reservas manuales (efectivo/transferencia)
- **Disponibilidad**: Configurar fechas cerradas, festivos y precios personalizados
- **Códigos de descuento**: Crear y editar códigos promocionales

## Seguridad

- Solo usuarios con `is_admin = TRUE` pueden acceder al panel
- Las APIs de admin verifican la sesión y el rol antes de procesar solicitudes
- El enlace "Panel admin" aparece para todos los usuarios autenticados; los no-admins son redirigidos a la página principal
