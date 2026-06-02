"use client";

import { useEffect, useMemo, useState } from "react";
import { format, isValid } from "date-fns";
import { es } from "date-fns/locale";
import { AdminOnlyInfoBlock } from "@/components/admin/AdminOnlyInfoBlock";
import {
  AdminInternalNotesField,
  defaultDetailInputClass,
} from "@/components/admin/AdminInternalNotesField";
import type { Reservation } from "@/types/reservation";
import { sessionTypeLabel } from "@/utils/session-type";
import {
  buildReservationDetailPatch,
  canAdminEditImportNotes,
  isAlveroClientReservation,
} from "@/lib/admin/reservation-contact-edit";

type EditForm = {
  name: string;
  email: string;
  phone: string;
  order_number: string;
  municipio: string;
  import_notes: string;
  photographer_studio: string;
};

function orderNumberLabel(reservation: Reservation): string {
  return reservation.source === "admin"
    ? "Número de orden"
    : "Orden (web anterior)";
}

type AdminReservationInternalInfoProps = {
  reservation: Reservation;
  isSuperAdmin: boolean;
  canEditOrderNumber: boolean;
  editForm: EditForm;
  setEditForm: React.Dispatch<React.SetStateAction<EditForm>>;
  savingDetail: boolean;
  internalEditError: string | null;
  setInternalEditError: (v: string | null) => void;
  setReservation: React.Dispatch<React.SetStateAction<Reservation | null>>;
  validatingPayment: boolean;
  setValidatingPayment: (v: boolean) => void;
  patchReservationDetails: (
    fields: Record<string, string | null | undefined>,
    options?: { errorTarget?: "contact" | "internal" },
  ) => Promise<boolean>;
};

function ReservationDetailLastEdited({
  reservation,
}: {
  reservation: Reservation;
}) {
  if (!reservation.import_notes_edited_at) return null;
  const editedAt = new Date(reservation.import_notes_edited_at);
  if (Number.isNaN(editedAt.getTime())) return null;
  const editor =
    reservation.import_notes_edited_by?.name?.trim() ||
    reservation.import_notes_edited_by?.email ||
    "—";
  return (
    <p className="text-xs text-zinc-500 pt-1">
      Editado por última vez por {editor} el{" "}
      {format(editedAt, "d 'de' MMMM 'de' yyyy, h:mm a", { locale: es })}.
    </p>
  );
}

export function AdminReservationInternalInfo({
  reservation,
  isSuperAdmin,
  canEditOrderNumber,
  editForm,
  setEditForm,
  savingDetail,
  internalEditError,
  setInternalEditError,
  setReservation,
  validatingPayment,
  setValidatingPayment,
  patchReservationDetails,
}: AdminReservationInternalInfoProps) {
  const [internalSaveSuccess, setInternalSaveSuccess] = useState(false);

  useEffect(() => {
    if (!internalSaveSuccess) return;
    const t = setTimeout(() => setInternalSaveSuccess(false), 4000);
    return () => clearTimeout(t);
  }, [internalSaveSuccess]);

  const showNotesEditor = canAdminEditImportNotes(reservation);
  const showMunicipioField = isAlveroClientReservation(reservation);
  const orderLabel = orderNumberLabel(reservation);
  const showOrderField =
    canEditOrderNumber ||
    !!reservation.order_number?.trim() ||
    !!reservation.google_event_id;

  const internalDetailPatch = useMemo(
    () =>
      buildReservationDetailPatch(reservation, editForm, {
        includeOrderNumber: canEditOrderNumber,
        includeMunicipio: showMunicipioField,
        includeNotes: showNotesEditor,
        includePhotographer: true,
      }),
    [
      reservation.id,
      reservation.import_notes,
      reservation.photographer_studio,
      reservation.order_number,
      reservation.municipio,
      editForm.import_notes,
      editForm.photographer_studio,
      editForm.order_number,
      editForm.municipio,
      showNotesEditor,
      showMunicipioField,
      canEditOrderNumber,
    ],
  );

  const canSaveInternalDetail =
    Object.keys(internalDetailPatch).length > 0;

  useEffect(() => {
    if (canSaveInternalDetail) {
      setInternalEditError(null);
    }
  }, [canSaveInternalDetail, setInternalEditError]);

  const changedInternalFields = Object.keys(internalDetailPatch);
  const saveInternalLabel =
    changedInternalFields.length === 0
      ? "Guardar cambios"
      : changedInternalFields.length === 1
        ? "Guardar cambio"
        : "Guardar cambios de administración";

  const saveInternalDetails = async () => {
    if (!canSaveInternalDetail) return;
    setInternalEditError(null);
    setInternalSaveSuccess(false);
    const ok = await patchReservationDetails(internalDetailPatch, {
      errorTarget: "internal",
    });
    if (ok) {
      setInternalSaveSuccess(true);
    }
  };

  const showPaymentStatus =
    (reservation.source === "admin" &&
      reservation.import_type == null &&
      reservation.payment_method) ||
    (reservation.source === "web" &&
      (reservation.payment_method === "conekta" || reservation.payment_id));

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

      {showOrderField ? (
        <div className="grid gap-1.5">
          <label
            htmlFor="admin-order-number"
            className="text-sm text-zinc-600 block"
          >
            {orderLabel}
          </label>
          {canEditOrderNumber ? (
            <input
              id="admin-order-number"
              type="text"
              value={editForm.order_number}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, order_number: e.target.value }))
              }
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm text-[#103948] focus:border-[#103948] focus:outline-none focus:ring-1 focus:ring-[#103948]"
              placeholder="Ej. 6521"
            />
          ) : (
            <p className="text-base font-medium leading-snug text-[#103948]">
              {reservation.order_number
                ? `#${reservation.order_number}`
                : reservation.google_event_id ?? "—"}
            </p>
          )}
        </div>
      ) : null}

      {showMunicipioField ? (
        <div className="grid gap-1.5">
          <label
            htmlFor="admin-municipio"
            className="text-sm text-zinc-600 block"
          >
            Municipio
          </label>
          <input
            id="admin-municipio"
            type="text"
            maxLength={200}
            value={editForm.municipio}
            onChange={(e) =>
              setEditForm((f) => ({ ...f, municipio: e.target.value }))
            }
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm text-[#103948] focus:border-[#103948] focus:outline-none focus:ring-1 focus:ring-[#103948]"
            placeholder="Ej. Monterrey, San Pedro Garza García"
          />
        </div>
      ) : null}

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
      </div>

      {showNotesEditor ? (
        <AdminInternalNotesField
          id="edit-notes-admin-block"
          value={editForm.import_notes}
          onChange={(import_notes) =>
            setEditForm((f) => ({ ...f, import_notes }))
          }
          label="Notas internas"
          rows={4}
          labelClassName="text-sm text-zinc-600 mb-1 block"
          inputClassName={defaultDetailInputClass}
          showAdminOnlyHint
        />
      ) : null}

      {internalEditError ? (
        <p className="text-sm text-red-600">{internalEditError}</p>
      ) : null}
      {internalSaveSuccess && !internalEditError ? (
        <p className="text-sm font-medium text-green-600">
          Detalles de administración guardados correctamente.
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => void saveInternalDetails()}
        disabled={savingDetail || !canSaveInternalDetail}
        className="rounded bg-[#103948] px-4 py-2 text-sm font-medium text-white hover:bg-[#0f2d38] disabled:opacity-50"
      >
        {savingDetail ? "Guardando…" : saveInternalLabel}
      </button>

      <ReservationDetailLastEdited reservation={reservation} />

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
                      setInternalEditError(null);
                      try {
                        const res = await fetch(
                          `/api/admin/reservations/${reservation.id}/payment-status`,
                          { method: "PATCH" },
                        );
                        const data = await res.json();
                        if (!data.success) {
                          setInternalEditError(
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
                        setInternalEditError("Error de conexión");
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
    </AdminOnlyInfoBlock>
  );
}
