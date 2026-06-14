import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site-seo";

export const metadata: Metadata = pageMetadata(
  "Agendar cita",
  "Elige fecha y horario para tu sesión en la locación fotográfica de Monterrey. Reserva en línea en minutos.",
  { path: "/reservar" },
);

export default function ReservarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
