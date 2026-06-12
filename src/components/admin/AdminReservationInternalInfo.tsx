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
import {
  SESSION_TYPE_VALUES,
  sessionTypeLabel,
} from "@/utils/session-type";
import {
  buildReservationDetailPatch,
  canAdminEditImportNotes,
  isAlveroClientReservation,
} from "@/lib/admin/reservation-contact-edit";
import {
  isManualChuyReservation,
  isStampCardGiftReservation,
} from "@/lib/admin/stamp-card-code";

const fieldInputClass =
  "w-full rounded border border-zinc-300 px-3 py-2 text-sm text-[#103948] focus:border-[#103948] focus:outline-none focus:ring-1 focus:ring-[#103948]";

const readOnlyValueClass = "text-sm font-medium text-[#103948]";

type EditForm = {
  name: string;
  email: string;
  phone: string;
  order_number: string;
  municipio: string;
  import_notes: string;
  stamp_card_code: string;
  photographer_studio: string;
  session_type: string;
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

function ReservationDetailAudit({ reservation }: { reservation: Reservation }) {
  const lines: string[] = [];

  if (reservation.created_at) {
    const createdAt = new Date(reservation.created_at);
    if (!Number.isNaN(createdAt.getTime())) {
      const when = format(createdAt, "d 'de' MMMM 'de' yyyy, h:mm a", {
        locale: es,
      });
      const creator =
        reservation.created_by?.name?.trim() ||
        reservation.created_by?.email ||
        null;
      if (creator) {
        lines.push(`Creada por ${creator} el ${when}.`);
      } else if (reservation.source === "google_import") {
        lines.push(`Creada el ${when} (importación desde calendario).`);
      } else {
        lines.push(`Creada el ${when}.`);
      }
    }
  }

  if (reservation.import_notes_edited_at) {
    const editedAt = new Date(reservation.import_notes_edited_at);
    if (!Number.isNaN(editedAt.getTime())) {
      const editor =
        reservation.import_notes_edited_by?.name?.trim() ||
        reservation.import_notes_edited_by?.email ||
        "—";
      lines.push(
        `Último cambio guardado por ${editor} el ${format(editedAt, "d 'de' MMMM 'de' yyyy, h:mm a", { locale: es })}.`,
      );
    }
  }

  if (lines.length === 0) return null;

  return (
    <div className="space-y-1 border-t border-zinc-200 pt-3">
      {lines.map((line, i) => (
        <p key={i} className="text-xs leading-relaxed text-zinc-500">
          {line}
        </p>
      ))}
    </div>
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
  const showStampCardField = isManualChuyReservation(reservation);
  const isGiftSession =
    isStampCardGiftReservation(reservation) ||
    (showStampCardField && editForm.stamp_card_code.trim().length > 0);
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
        includeStampCard: showStampCardField,
        includePhotographer: true,
        includeSessionType: isSuperAdmin,
      }),
    [
      reservation.id,
      reservation.import_notes,
      reservation.photographer_studio,
      reservation.order_number,
      reservation.municipio,
      reservation.session_type,
      reservation.stamp_card_code,
      editForm.import_notes,
      editForm.stamp_card_code,
      editForm.photographer_studio,
      editForm.order_number,
      editForm.municipio,
      editForm.session_type,
      showNotesEditor,
      showMunicipioField,
      showStampCardField,
      canEditOrderNumber,
      isSuperAdmin,
    ],
  );

  const canSaveInternalDetail =
    Object.keys(internalDetailPatch).length > 0;

  useEffect(() => {
    if (canSaveInternalDetail) {
      setInternalEditError(null);
    }
  }, [canSaveInternalDetail, setInternalEditError]);

  const saveInternalLabel = savingDetail
    ? "Guardando…"
    : canSaveInternalDetail
      ? "Guardar cambios"
      : "Sin cambios";

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
      {showPaymentStatus ? (
        <section className="flex flex-col gap-2">
          {reservation.source === "web" &&
            (reservation.payment_method === "conekta" ||
              reservation.payment_id) && (
              <p className="text-sm font-medium text-emerald-700">
                Pagado (en línea)
              </p>
            )}
          {reservation.source === "admin" &&
            reservation.payment_status === "pending" && (
              <>
                <p className="text-sm font-medium text-amber-700">
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
                    className="w-fit rounded-lg bg-[#103948] px-4 py-2 text-sm font-medium text-white hover:bg-[#0d2d39] disabled:opacity-50"
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
                <p className="text-sm font-medium text-emerald-700">
                  Pagado (validado)
                </p>
                {reservation.payment_validated_at &&
                  reservation.payment_validated_by &&
                  (() => {
                    const validatedAt = new Date(
                      reservation.payment_validated_at,
                    );
                    return (
                      <p className="text-xs text-zinc-500">
                        Validado por{" "}
                        {reservation.payment_validated_by.name ||
                          reservation.payment_validated_by.email}
                        {isValid(validatedAt)
                          ? ` el ${format(validatedAt, "d 'de' MMMM 'de' yyyy, h:mm a", { locale: es })}`
                          : ""}
                        .
                      </p>
                    );
                  })()}
              </>
            )}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="grid gap-1.5">
          <label
            htmlFor="admin-session-type"
            className="text-sm text-zinc-600 block"
          >
            Tipo de sesión
          </label>
          {isSuperAdmin ? (
            <select
              id="admin-session-type"
              value={editForm.session_type}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, session_type: e.target.value }))
              }
              className={fieldInputClass}
            >
              <option value="">— Sin asignar</option>
              {SESSION_TYPE_VALUES.map((value) => (
                <option key={value} value={value}>
                  {sessionTypeLabel(value)}
                </option>
              ))}
            </select>
          ) : (
            <p className={readOnlyValueClass}>
              {reservation.session_type
                ? sessionTypeLabel(reservation.session_type)
                : "—"}
            </p>
          )}
        </div>

        {(showOrderField || showMunicipioField) && (
          <div
            className={`grid gap-3 ${showOrderField && showMunicipioField ? "sm:grid-cols-2" : ""}`}
          >
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
                      setEditForm((f) => ({
                        ...f,
                        order_number: e.target.value,
                      }))
                    }
                    className={fieldInputClass}
                    placeholder="Ej. 6521"
                  />
                ) : (
                  <p className={readOnlyValueClass}>
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
                  className={fieldInputClass}
                  placeholder="Ej. Monterrey"
                />
              </div>
            ) : null}
          </div>
        )}

        {showStampCardField ? (
          <div className="grid gap-1.5">
            <label
              htmlFor="admin-stamp-card-code"
              className="text-sm text-zinc-600 block"
            >
              Cupón (tarjetero)
            </label>
            <input
              id="admin-stamp-card-code"
              type="text"
              maxLength={64}
              value={editForm.stamp_card_code}
              onChange={(e) =>
                setEditForm((f) => ({
                  ...f,
                  stamp_card_code: e.target.value,
                }))
              }
              className={fieldInputClass}
              placeholder="Ej. TARJ-0042"
            />
            <p className="text-xs text-zinc-500">
              Solo sesión regalo. Al guardar con cupón, la cita queda en $0 sin
              cobro.
            </p>
            {isGiftSession ? (
              <p className="text-xs font-medium text-emerald-700">
                Sesión regalo — precio $0, sin Pagos manuales.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
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
            className={fieldInputClass}
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
            showAdminOnlyHint={false}
          />
        ) : null}
      </section>

      <div className="flex flex-col gap-2">
        {internalEditError ? (
          <p className="text-sm text-red-600">{internalEditError}</p>
        ) : null}
        {internalSaveSuccess && !internalEditError ? (
          <p className="text-sm font-medium text-green-600">
            Cambios guardados correctamente.
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void saveInternalDetails()}
          disabled={savingDetail || !canSaveInternalDetail}
          className={
            canSaveInternalDetail && !savingDetail
              ? "rounded-lg bg-[#103948] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0f2d38] disabled:opacity-50"
              : "rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-400 cursor-default"
          }
        >
          {saveInternalLabel}
        </button>
        <ReservationDetailAudit reservation={reservation} />
      </div>
    </AdminOnlyInfoBlock>
  );
}
