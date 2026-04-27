"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import {
  formatCurrency,
  formatDisplayDate,
  formatDisplayDateShort,
  formatTimeRange,
  formatReservationId,
} from "@/utils/formatters";

type LoyaltyLevel = "Elite" | "VIP" | "Frecuente" | "Inicial";
// Las Monedas Chuy no caducan: solo earned / used / revoked.
type LoyaltyMovementType = "earned" | "used" | "revoked";
// Los créditos sí caducan.
type CreditMovementType = "earned" | "used" | "revoked" | "expired";
type TransferStatus =
  | "pending"
  | "cancelled"
  | "auto_credited"
  | "pending_claim"
  | "claimed"
  | "reverted";

interface LoyaltyMovement {
  id: string;
  type: LoyaltyMovementType;
  points: number;
  reservationId: number | null;
  createdAt: string;
  revokedAt: string | null;
}

interface CreditMovement {
  id: string;
  type: CreditMovementType;
  amount: number;
  source: string;
  reservationId: number | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

interface CustomerReservation {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  status: "confirmed" | "cancelled" | "completed";
  price: number;
  originalPrice: number;
  rescheduleCount: number;
  paymentMethod: string | null;
  paymentStatus: "pending" | "paid" | "not_applicable" | null;
  loyaltyDiscount: number;
  loyaltyPointsUsed: number;
  creditsUsed: number;
  referralDiscount: number;
  lastMinuteDiscount: number;
  discountCode: string | null;
  discountCodeDiscount: number;
  photographerStudio: string | null;
  sessionType: "xv_anos" | "boda" | "casual" | null;
}

interface Transfer {
  id: string;
  reservationId: number;
  reservationDate: string | null;
  reservationStartTime: string | null;
  fromEmail: string;
  fromUserId: string | null;
  toEmail: string;
  toUserId: string | null;
  toStudioName: string | null;
  status: TransferStatus;
  transferredPoints: number;
  createdAt: string;
  materializedAt: string | null;
  claimedAt: string | null;
  cancelledAt: string | null;
}

interface CustomerDetail {
  profile: {
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
    isPhotographer: boolean;
    studioName: string | null;
    isAdmin: boolean;
    createdAt: string;
  };
  summary: {
    reservationCount: number;
    totalSpent: number;
    loyaltyLevel: LoyaltyLevel;
    loyaltyPointsAvailable: number;
    creditsAvailable: number;
    receivedSessionsCount: number;
    lastReservationDate: string | null;
  };
  reservations: CustomerReservation[];
  loyaltyMovements: LoyaltyMovement[];
  creditMovements: CreditMovement[];
  outgoingTransfers: Transfer[];
  incomingTransfers: Transfer[];
  consistency: { ok: boolean; issues: string[] };
}

const levelStyles: Record<LoyaltyLevel, string> = {
  Elite: "bg-amber-100 text-amber-800 border-amber-300",
  VIP: "bg-purple-100 text-purple-800 border-purple-300",
  Frecuente: "bg-emerald-100 text-emerald-800 border-emerald-300",
  Inicial: "bg-zinc-100 text-zinc-700 border-zinc-300",
};

// Cubre todos los tipos posibles (Monedas Chuy: 3, créditos: 4 con caducidad).
const movementBadge: Record<CreditMovementType, string> = {
  earned: "bg-green-100 text-green-800 border-green-300",
  used: "bg-blue-100 text-blue-800 border-blue-300",
  revoked: "bg-orange-100 text-orange-800 border-orange-300",
  expired: "bg-zinc-100 text-zinc-600 border-zinc-300",
};

const movementLabel: Record<CreditMovementType, string> = {
  earned: "Ganados",
  used: "Usados",
  revoked: "Revocados",
  expired: "Caducados",
};

const transferStatusInfo: Record<
  TransferStatus,
  { label: string; className: string; description: string }
> = {
  pending: {
    label: "Pendiente",
    className: "bg-yellow-100 text-yellow-800 border-yellow-300",
    description:
      "Esperando a que pase la fecha de la sesión para acreditar las Monedas Chuy al fotógrafo.",
  },
  cancelled: {
    label: "Cancelada",
    className: "bg-zinc-100 text-zinc-600 border-zinc-300",
    description: "El cliente canceló la transferencia antes de materializarse.",
  },
  auto_credited: {
    label: "Acreditada",
    className: "bg-green-100 text-green-800 border-green-300",
    description:
      "El fotógrafo ya tenía cuenta. Las Monedas Chuy se acreditaron automáticamente.",
  },
  pending_claim: {
    label: "Esperando reclamo",
    className: "bg-blue-100 text-blue-800 border-blue-300",
    description:
      "Se envió un correo al fotógrafo para que reclame sus Monedas Chuy.",
  },
  claimed: {
    label: "Reclamada",
    className: "bg-green-100 text-green-800 border-green-300",
    description:
      "El fotógrafo abrió el correo y reclamó sus Monedas Chuy.",
  },
  reverted: {
    label: "Revertida",
    className: "bg-red-100 text-red-800 border-red-300",
    description:
      "Las Monedas Chuy volvieron al cliente porque la reserva se canceló o el fotógrafo no las reclamó.",
  },
};

const sessionTypeLabel: Record<
  "xv_anos" | "boda" | "casual",
  string
> = {
  xv_anos: "XV años",
  boda: "Boda",
  casual: "Casual",
};

const reservationStatusLabel = (
  status: "confirmed" | "cancelled" | "completed",
  rescheduleCount: number
): string => {
  if (status === "confirmed" && rescheduleCount > 0) return "Reagendada";
  return {
    confirmed: "Confirmada",
    cancelled: "Cancelada",
    completed: "Completada",
  }[status];
};

const reservationStatusClass = (
  status: "confirmed" | "cancelled" | "completed",
  rescheduleCount: number
): string => {
  if (status === "confirmed" && rescheduleCount > 0)
    return "bg-orange-100 text-orange-800";
  return {
    confirmed: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
    completed: "bg-blue-100 text-blue-800",
  }[status];
};

const formatPhoneShort = (phone: string | null): string => {
  if (!phone) return "—";
  const cleaned = phone.replace(/\s|-|\(|\)/g, "");
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 6)} ${cleaned.slice(6)}`;
  }
  return phone;
};

export default function AdminClienteDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id as string;

  const [data, setData] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    const fetchDetail = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await axios.get(`/api/admin/customers/${id}`);
        if (res.data?.success) {
          // El endpoint envuelve la respuesta con `success: true`, los datos vienen al raíz
          const { success: _ok, ...rest } = res.data;
          void _ok;
          setData(rest as CustomerDetail);
        } else {
          setError(res.data?.error || "Error al cargar detalle");
        }
      } catch (err) {
        setError(
          axios.isAxiosError(err)
            ? (err.response?.data?.error as string) || "Error al cargar"
            : "Error al cargar detalle"
        );
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [id]);

  const displayName = useMemo(() => {
    if (!data) return "";
    return (
      data.profile.name?.trim() ||
      data.profile.studioName?.trim() ||
      data.profile.email.split("@")[0]
    );
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#103948] border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm font-medium text-[#103948] hover:underline"
        >
          ← Volver
        </button>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error || "No se pudo cargar el detalle del cliente"}
        </div>
      </div>
    );
  }

  const { profile, summary, reservations, loyaltyMovements, creditMovements, outgoingTransfers, incomingTransfers, consistency } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/admin/clientes"
          className="text-sm font-medium text-[#103948] hover:underline"
        >
          ← Clientes
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 print:hidden"
        >
          Imprimir estado
        </button>
      </div>

      {/* Cabecera del cliente */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1
                className="text-3xl font-bold text-[#103948]"
                style={{ fontFamily: "var(--font-cormorant), serif" }}
              >
                {displayName}
              </h1>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${levelStyles[summary.loyaltyLevel]}`}
              >
                Nivel {summary.loyaltyLevel}
              </span>
              {profile.isPhotographer && (
                <span className="rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                  Fotógrafo
                </span>
              )}
              {profile.isAdmin && (
                <span className="rounded-full border border-zinc-300 bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
                  Admin
                </span>
              )}
            </div>
            {profile.studioName && profile.name && (
              <p className="text-sm text-zinc-600">{profile.studioName}</p>
            )}
            <div className="flex flex-col gap-1 text-sm text-zinc-700 sm:flex-row sm:items-center sm:gap-4">
              <a
                href={`mailto:${profile.email}`}
                className="hover:underline"
              >
                {profile.email}
              </a>
              {profile.phone && (
                <>
                  <a
                    href={`tel:${profile.phone}`}
                    className="hover:underline"
                  >
                    {formatPhoneShort(profile.phone)}
                  </a>
                  <a
                    href={`https://wa.me/${profile.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-700 hover:underline"
                  >
                    WhatsApp
                  </a>
                </>
              )}
            </div>
            <p className="text-xs text-zinc-500">
              Cliente desde {formatDisplayDateShort(profile.createdAt.slice(0, 10))}
            </p>
          </div>
        </div>
      </div>

      {/* Banner de inconsistencias: solo aparece cuando algo NO cuadra */}
      {!consistency.ok && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          <p className="font-semibold">
            ⚠ Se detectaron {consistency.issues.length} posibles inconsistencias
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {consistency.issues.map((issue, idx) => (
              <li key={idx}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 4 tarjetas resumen */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Reservas confirmadas"
          value={summary.reservationCount.toString()}
          help="Reservas que sí pagó (confirmadas o completadas)."
        />
        <SummaryCard
          label="Total gastado"
          value={formatCurrency(summary.totalSpent)}
          help="Suma del precio final que cobramos en sus reservas."
          accent="green"
        />
        <SummaryCard
          label="Monedas Chuy disponibles"
          value={summary.loyaltyPointsAvailable.toString()}
          help="Monedas Chuy vigentes (no usadas, no revocadas). 1 Moneda Chuy = $1 MXN de descuento. No caducan."
          accent="primary"
        />
        <SummaryCard
          label="Créditos disponibles"
          value={formatCurrency(summary.creditsAvailable)}
          help="Créditos vigentes para aplicar en futuras reservas."
          accent="primary"
        />
      </div>

      {profile.isPhotographer && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <span className="font-semibold">Sesiones recibidas:</span>{" "}
          {summary.receivedSessionsCount}{" "}
          {summary.receivedSessionsCount === 1
            ? "transferencia "
            : "transferencias "}
          de clientes consolidadas en esta cuenta.
        </div>
      )}

      {/* Movimientos de Monedas Chuy */}
      <Section
        title="Movimientos de Monedas Chuy"
        subtitle="Cada Moneda que se ha ganado, usado o revocado. Las Monedas Chuy no caducan."
      >
        {loyaltyMovements.length === 0 ? (
          <EmptyState text="Aún no hay movimientos de Monedas Chuy." />
        ) : (
          <Table
            head={["Fecha", "Movimiento", "Cantidad", "Reserva"]}
          >
            {loyaltyMovements.map((m) => (
              <tr key={m.id} className="border-b border-zinc-100 last:border-0">
                <td className="px-4 py-2.5 text-zinc-700">
                  {formatDisplayDateShort(m.createdAt.slice(0, 10))}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${movementBadge[m.type]}`}
                  >
                    {movementLabel[m.type]}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-medium text-zinc-900">
                  {m.type === "earned" ? "+" : m.type === "used" ? "−" : ""}
                  {m.points}
                </td>
                <td className="px-4 py-2.5 text-zinc-700">
                  {m.reservationId ? (
                    <Link
                      href={`/admin/reservaciones?search=${m.reservationId}`}
                      className="text-[#103948] hover:underline"
                    >
                      #{formatReservationId(m.reservationId)}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {/* Movimientos de créditos */}
      <Section
        title="Movimientos de créditos"
        subtitle="Créditos otorgados por referidos, cancelaciones u otros motivos."
      >
        {creditMovements.length === 0 ? (
          <EmptyState text="Aún no hay movimientos de créditos." />
        ) : (
          <Table
            head={[
              "Fecha",
              "Movimiento",
              "Monto",
              "Origen",
              "Reserva",
              "Caduca",
            ]}
          >
            {creditMovements.map((m) => (
              <tr key={m.id} className="border-b border-zinc-100 last:border-0">
                <td className="px-4 py-2.5 text-zinc-700">
                  {formatDisplayDateShort(m.createdAt.slice(0, 10))}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${movementBadge[m.type]}`}
                  >
                    {movementLabel[m.type]}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-medium text-zinc-900">
                  {m.type === "earned" ? "+" : m.type === "used" ? "−" : ""}
                  {formatCurrency(m.amount)}
                </td>
                <td className="px-4 py-2.5 text-zinc-700">{m.source}</td>
                <td className="px-4 py-2.5 text-zinc-700">
                  {m.reservationId ? (
                    <Link
                      href={`/admin/reservaciones?search=${m.reservationId}`}
                      className="text-[#103948] hover:underline"
                    >
                      #{formatReservationId(m.reservationId)}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2.5 text-zinc-500">
                  {m.type === "earned"
                    ? formatDisplayDateShort(m.expiresAt)
                    : "—"}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {/* Reservas */}
      <Section
        title="Reservas"
        subtitle="Todas las reservas que esta persona ha hecho como cliente."
      >
        {reservations.length === 0 ? (
          <EmptyState text="No tiene reservas en su cuenta." />
        ) : (
          <Table
            head={[
              "Reserva",
              "Fecha y horario",
              "Tipo",
              "Estado",
              "Total",
              "Descuentos aplicados",
            ]}
          >
            {reservations.map((r) => {
              const discountChips: { label: string; className: string }[] = [];
              if (r.lastMinuteDiscount > 0)
                discountChips.push({
                  label: `Última hora ${formatCurrency(r.lastMinuteDiscount)}`,
                  className: "bg-orange-50 text-orange-800 border-orange-200",
                });
              if (r.loyaltyDiscount > 0)
                discountChips.push({
                  label: `Lealtad ${formatCurrency(r.loyaltyDiscount)}`,
                  className: "bg-emerald-50 text-emerald-800 border-emerald-200",
                });
              if (r.loyaltyPointsUsed > 0)
                discountChips.push({
                  label: `Monedas −${r.loyaltyPointsUsed}`,
                  className: "bg-blue-50 text-blue-800 border-blue-200",
                });
              if (r.creditsUsed > 0)
                discountChips.push({
                  label: `Créditos −${formatCurrency(r.creditsUsed)}`,
                  className: "bg-blue-50 text-blue-800 border-blue-200",
                });
              if (r.referralDiscount > 0)
                discountChips.push({
                  label: `Referido ${formatCurrency(r.referralDiscount)}`,
                  className: "bg-purple-50 text-purple-800 border-purple-200",
                });
              if (r.discountCode && r.discountCodeDiscount > 0)
                discountChips.push({
                  label: `Código ${r.discountCode} −${formatCurrency(r.discountCodeDiscount)}`,
                  className: "bg-pink-50 text-pink-800 border-pink-200",
                });

              return (
                <tr
                  key={r.id}
                  className="border-b border-zinc-100 last:border-0 align-top"
                >
                  <td className="px-4 py-3 text-zinc-700">
                    <Link
                      href={`/admin/reservaciones?search=${r.id}`}
                      className="font-mono text-[#103948] hover:underline"
                    >
                      #{formatReservationId(r.id)}
                    </Link>
                    {r.photographerStudio && (
                      <p className="mt-1 text-xs text-zinc-500">
                        Fotógrafo: {r.photographerStudio}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {formatDisplayDate(r.date)}
                    <br />
                    <span className="text-xs text-zinc-500">
                      {formatTimeRange(r.startTime, r.endTime, r.date)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {r.sessionType ? sessionTypeLabel[r.sessionType] : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${reservationStatusClass(
                        r.status,
                        r.rescheduleCount
                      )}`}
                    >
                      {reservationStatusLabel(r.status, r.rescheduleCount)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-900">
                      {formatCurrency(r.price)}
                    </p>
                    {r.originalPrice !== r.price && (
                      <p className="text-xs text-zinc-400 line-through">
                        {formatCurrency(r.originalPrice)}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {discountChips.length === 0 ? (
                      <span className="text-xs text-zinc-400">Ninguno</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {discountChips.map((chip, idx) => (
                          <span
                            key={idx}
                            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${chip.className}`}
                          >
                            {chip.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      {/* Transferencias salientes (cliente → fotógrafo) */}
      {outgoingTransfers.length > 0 && (
        <Section
          title="Monedas Chuy transferidas a fotógrafos"
          subtitle="Reservas donde este cliente regaló sus Monedas Chuy al fotógrafo o estudio."
        >
          <TransferTable transfers={outgoingTransfers} direction="outgoing" />
        </Section>
      )}

      {/* Transferencias entrantes (fotógrafo) */}
      {incomingTransfers.length > 0 && (
        <Section
          title="Monedas Chuy recibidas de clientes"
          subtitle="Sesiones de clientes que transfirieron sus Monedas Chuy a este fotógrafo."
        >
          <TransferTable transfers={incomingTransfers} direction="incoming" />
        </Section>
      )}
    </div>
  );
}

// =====================================================
// Subcomponentes UI
// =====================================================

function SummaryCard({
  label,
  value,
  help,
  accent,
}: {
  label: string;
  value: string;
  help: string;
  accent?: "green" | "primary";
}) {
  const valueClass =
    accent === "green"
      ? "text-green-700"
      : accent === "primary"
        ? "text-[#103948]"
        : "text-zinc-900";
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-500">
        <span>{label}</span>
        <span title={help} className="cursor-help text-zinc-400">
          ?
        </span>
      </div>
      <p className={`mt-1 text-3xl font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-5 py-4">
        <h2 className="text-lg font-semibold text-[#103948]">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Table({
  head,
  children,
}: {
  head: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50">
          <tr className="text-left text-zinc-600">
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="px-5 py-8 text-center text-sm text-zinc-500">{text}</p>;
}

function TransferTable({
  transfers,
  direction,
}: {
  transfers: Transfer[];
  direction: "outgoing" | "incoming";
}) {
  return (
    <Table
      head={[
        "Reserva",
        direction === "outgoing" ? "A fotógrafo" : "De cliente",
        "Beneficios",
        "Estado",
        "Fecha",
      ]}
    >
      {transfers.map((t) => {
        const info = transferStatusInfo[t.status];
        const otherEmail = direction === "outgoing" ? t.toEmail : t.fromEmail;
        const otherName =
          direction === "outgoing" ? t.toStudioName || otherEmail : otherEmail;
        const dateStr = t.materializedAt || t.cancelledAt || t.createdAt;
        return (
          <tr key={t.id} className="border-b border-zinc-100 last:border-0">
            <td className="px-4 py-2.5 text-zinc-700">
              <Link
                href={`/admin/reservaciones?search=${t.reservationId}`}
                className="font-mono text-[#103948] hover:underline"
              >
                #{formatReservationId(t.reservationId)}
              </Link>
              {t.reservationDate && (
                <p className="text-xs text-zinc-500">
                  {formatDisplayDateShort(t.reservationDate)}
                </p>
              )}
            </td>
            <td className="px-4 py-2.5 text-zinc-700">
              <p className="font-medium">{otherName}</p>
              {direction === "outgoing" && t.toStudioName && (
                <p className="text-xs text-zinc-500">{t.toEmail}</p>
              )}
            </td>
            <td className="px-4 py-2.5 text-zinc-700">
              <p>
                {t.transferredPoints > 0
                  ? `${t.transferredPoints} ${
                      t.transferredPoints === 1 ? "Moneda Chuy" : "Monedas Chuy"
                    }`
                  : "—"}
              </p>
            </td>
            <td className="px-4 py-2.5">
              <span
                title={info.description}
                className={`inline-block cursor-help rounded-full border px-2 py-0.5 text-xs font-medium ${info.className}`}
              >
                {info.label}
              </span>
            </td>
            <td className="px-4 py-2.5 text-zinc-500">
              {formatDisplayDateShort(dateStr.slice(0, 10))}
            </td>
          </tr>
        );
      })}
    </Table>
  );
}
