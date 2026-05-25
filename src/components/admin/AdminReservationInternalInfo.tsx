"use client";

import { useEffect, useState } from "react";
import { format, isValid } from "date-fns";
import { es } from "date-fns/locale";
import { AdminOnlyInfoBlock } from "@/components/admin/AdminOnlyInfoBlock";
import type { Reservation } from "@/types/reservation";
import { sessionTypeLabel } from "@/utils/session-type";

type EditForm = {
  name: string;
  email: string;
  phone: string;
  order_number: string;
  import_notes: string;
  photographer_studio: string;
};

type AdminReservationInternalInfoProps = {
  reservation: Reservation;
  isSuperAdmin: boolean;
  editForm: EditForm;
  setEditForm: React.Dispatch<React.SetStateAction<EditForm>>;
  savingDetail: boolean;
  setSavingDetail: (v: boolean) => void;
  editDetailError: string | null;
  setEditDetailError: (v: string | null) => void;
  setReservation: React.Dispatch<React.SetStateAction<Reservation | null>>;
  validatingPayment: boolean;
  setValidatingPayment: (v: boolean) => void;
  /** Muestra editor de fotógrafo con guardado propio (reservas web). */
  showPhotographerEditor: boolean;
};

export function AdminReservationInternalInfo({
  reservation,
  isSuperAdmin,
  editForm,
  setEditForm,
  savingDetail,
  setSavingDetail,
  editDetailError,
  setEditDetailError,
  setReservation,
  validatingPayment,
  setValidatingPayment,
  showPhotographerEditor,
}: AdminReservationInternalInfoProps) {
  const [photographerSaveSuccess, setPhotographerSaveSuccess] = useState(false);

  useEffect(() => {
    if (!photographerSaveSuccess) return;
    const t = setTimeout(() => setPhotographerSaveSuccess(false), 4000);
    return () => clearTimeout(t);
  }, [photographerSaveSuccess]);

  const showPaymentStatus =
    (reservation.source === "admin" &&
      reservation.import_type == null &&
      reservation.payment_method) ||
    (reservation.source === "web" &&
      (reservation.payment_method === "conekta" || reservation.payment_id));

  const isManualClientImport =
    (reservation.source === "google_import" ||
      reservation.source === "admin") &&
    reservation.import_type === "manual_client";

  const savePhotographerWeb = async () => {
    setEditDetailError(null);
    setPhotographerSaveSuccess(false);
    setSavingDetail(true);
    try {
      const res = await fetch(`/api/reservations/${reservation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photographer_studio: editForm.photographer_studio.trim() || null,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setEditDetailError(data.error || "Error al guardar");
        return;
      }
      const updated = data.reservation;
      setReservation((prev) =>
        prev
          ? {
              ...prev,
              photographer_studio:
                updated.photographer_studio ?? prev.photographer_studio ?? null,
            }
          : null,
      );
      setPhotographerSaveSuccess(true);
    } catch {
      setEditDetailError("Error de conexión");
    } finally {
      setSavingDetail(false);
    }
  };

  return (
    <AdminOnlyInfoBlock>
      <div className="grid gap-0.5">
        <p className="text-sm text-zinc-600">Tipo de sesión</p>
        <p className="text-base font-medium leading-snug text-[#103948]">
          {reservation.session_type
            ? sessionTypeLabel(reservation.session_type)
            : "—"}
        </p>
      </div>

      {showPhotographerEditor ? (
        <div className="grid gap-1.5">
          <label
            htmlFor="admin-photographer-studio"
            className="text-sm text-zinc-600 block"
          >
            Fotógrafo / estudio
          </label>
          <input
            id="admin-photographer-studio"
            type="text"
            maxLength={500}
            value={editForm.photographer_studio}
            onChange={(e) =>
              setEditForm((f) => ({
                ...f,
                photographer_studio: e.target.value,
              }))
            }
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm text-[#103948] focus:border-[#103948] focus:outline-none focus:ring-1 focus:ring-[#103948]"
            placeholder="Ej. Estudio Luz o nombre del fotógrafo"
          />
          <button
            type="button"
            onClick={() => void savePhotographerWeb()}
            disabled={savingDetail}
            className="mt-0.5 rounded bg-[#103948] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#0f2d38] disabled:opacity-50"
          >
            {savingDetail ? "Guardando…" : "Guardar fotógrafo / estudio"}
          </button>
          {photographerSaveSuccess ? (
            <p className="text-sm font-medium text-green-600">
              Fotógrafo / estudio guardado correctamente.
            </p>
          ) : null}
        </div>
      ) : null}

      {reservation.created_at ? (
        <div className="grid gap-0.5">
          <p className="text-sm text-zinc-600">Creada el</p>
          <p className="text-base font-medium leading-snug text-[#103948]">
            {format(
              new Date(reservation.created_at),
              "d 'de' MMMM yyyy, h:mm a",
              { locale: es },
            )}
          </p>
        </div>
      ) : null}

      {showPaymentStatus ? (
        <div className="grid gap-0.5">
          <p className="text-sm text-zinc-600">Estado del pago</p>
          {reservation.source === "web" &&
            (reservation.payment_method === "conekta" ||
              reservation.payment_id) && (
              <p className="text-base font-medium text-emerald-700">
                Pagado (en línea)
              </p>
            )}
          {reservation.source === "admin" &&
            reservation.payment_status === "pending" && (
              <>
                <p className="text-base font-medium text-amber-700">
                  Pago pendiente
                </p>
                {isSuperAdmin ? (
                  <button
                    type="button"
                    onClick={async () => {
                      setValidatingPayment(true);
                      setEditDetailError(null);
                      try {
                        const res = await fetch(
                          `/api/admin/reservations/${reservation.id}/payment-status`,
                          { method: "PATCH" },
                        );
                        const data = await res.json();
                        if (!data.success) {
                          setEditDetailError(
                            data.error || "Error al validar pago",
                          );
                          return;
                        }
                        const detailRes = await fetch(
                          `/api/reservations/${reservation.id}`,
                        );
                        if (detailRes.ok) {
                          const detailData = await detailRes.json();
                          if (detailData.reservation) {
                            setReservation(
                              detailData.reservation as Reservation,
                            );
                          } else {
                            setReservation((prev) =>
                              prev
                                ? { ...prev, payment_status: "paid" as const }
                                : null,
                            );
                          }
                        } else {
                          setReservation((prev) =>
                            prev
                              ? { ...prev, payment_status: "paid" as const }
                              : null,
                          );
                        }
                      } catch {
                        setEditDetailError("Error de conexión");
                      } finally {
                        setValidatingPayment(false);
                      }
                    }}
                    disabled={validatingPayment}
                    className="mt-2 rounded-lg bg-[#103948] px-4 py-2 text-sm font-medium text-white hover:bg-[#0d2d39] disabled:opacity-50"
                  >
                    {validatingPayment
                      ? "Validando…"
                      : "Validar / Marcar como pagado"}
                  </button>
                ) : null}
              </>
            )}
          {reservation.source === "admin" &&
            reservation.payment_status === "paid" && (
              <>
                <p className="text-base font-medium text-emerald-700">
                  Pagado (validado)
                </p>
                {reservation.payment_validated_at &&
                  reservation.payment_validated_by &&
                  (() => {
                    const validatedAt = new Date(
                      reservation.payment_validated_at,
                    );
                    return (
                      <p className="text-sm text-zinc-500 mt-1">
                        Validado por{" "}
                        {reservation.payment_validated_by.name ||
                          reservation.payment_validated_by.email}
                        {isValid(validatedAt)
                          ? ` el ${format(validatedAt, "d 'de' MMMM 'de' yyyy 'a las' h:mm a", { locale: es })}`
                          : ""}
                        .
                      </p>
                    );
                  })()}
              </>
            )}
          {reservation.source === "admin" &&
            (reservation.payment_status == null ||
              reservation.payment_status === "not_applicable") && (
              <p className="text-zinc-500 text-sm">—</p>
            )}
        </div>
      ) : null}

      {editDetailError && !isManualClientImport ? (
        <p className="text-sm text-red-600">{editDetailError}</p>
      ) : null}
    </AdminOnlyInfoBlock>
  );
}
