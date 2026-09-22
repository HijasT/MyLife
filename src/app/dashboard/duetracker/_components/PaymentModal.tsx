"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import type { Currency } from "@/lib/duetracker";
import type { ThemeVars } from "./theme";
import { Modal } from "./Modal";

/**
 * Shared payment-recording modal — previously duplicated (markup and submit
 * logic both) between page.tsx and [id]/page.tsx. Each caller still owns its
 * own Supabase insert (the two pages refresh slightly different local state
 * afterward), passed in as `onSubmit`; this component only owns the amount/note
 * form state, the quick-amount buttons, and the total/paid/remaining summary.
 */
export function PaymentModal({
  V,
  btn,
  btnP,
  inp,
  itemName,
  monthLabel,
  currency,
  totalDue,
  amountPaid,
  remaining,
  onClose,
  onSubmit,
  onSaved,
  onError,
}: {
  V: ThemeVars;
  btn: CSSProperties;
  btnP: CSSProperties;
  inp: CSSProperties;
  itemName: string;
  monthLabel: string;
  currency: Currency;
  totalDue: number;
  amountPaid: number;
  remaining: number;
  onClose: () => void;
  onSubmit: (amount: number, note: string) => Promise<void>;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [amount, setAmount] = useState(remaining.toFixed(2));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  function close() {
    if (saving) return;
    onClose();
  }

  async function handleSave() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      onError("Enter a valid payment amount");
      return;
    }
    setSaving(true);
    try {
      await onSubmit(amt, note.trim());
      onSaved(amt >= remaining ? "Payment saved and cleared" : "Partial payment saved");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not save payment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      V={V}
      btn={btn}
      title="Record payment"
      subtitle={`${itemName} · ${monthLabel}`}
      onClose={close}
      closeDisabled={saving}
      zIndex={60}
      footer={
        <>
          <div style={{ flex: 1, fontSize: 12, color: V.faint, alignSelf: "center" }}>
            New remaining after this payment: {currency} {(remaining - (Number(amount) || 0)).toFixed(2)}
          </div>
          <button style={btn} onClick={close} disabled={saving}>
            Cancel
          </button>
          <button style={btnP} onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving..." : "Save payment"}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10 }}>
        <div style={{ background: V.input, border: `1px solid ${V.border}`, borderRadius: 12, padding: "10px 12px" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: V.faint, textTransform: "uppercase", letterSpacing: "0.08em" }}>Total</div>
          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>{currency} {totalDue.toFixed(2)}</div>
        </div>
        <div style={{ background: V.input, border: `1px solid ${V.border}`, borderRadius: 12, padding: "10px 12px" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: V.faint, textTransform: "uppercase", letterSpacing: "0.08em" }}>Paid so far</div>
          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4, color: amountPaid > 0 ? V.pos : V.text }}>{currency} {amountPaid.toFixed(2)}</div>
        </div>
        <div style={{ background: V.input, border: `1px solid ${V.border}`, borderRadius: 12, padding: "10px 12px" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: V.faint, textTransform: "uppercase", letterSpacing: "0.08em" }}>Remaining</div>
          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4, color: V.accent }}>{currency} {remaining.toFixed(2)}</div>
        </div>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Payment amount
        <input type="text" inputMode="decimal" style={inp} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={remaining.toFixed(2)} disabled={saving} />
      </label>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {remaining > 0 &&
          [
            { label: "¼", frac: 0.25 },
            { label: "½", frac: 0.5 },
            { label: "¾", frac: 0.75 },
            { label: "Full", frac: 1 },
          ].map(({ label, frac }) => (
            <button
              key={label}
              type="button"
              style={{ ...btn, padding: "6px 14px", fontSize: 12, fontWeight: 800, color: frac === 1 ? V.accent : V.text }}
              onClick={() => setAmount((remaining * frac).toFixed(2))}
              disabled={saving}
            >
              {label}
            </button>
          ))}
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Note
        <textarea
          style={{ ...inp, minHeight: 92, resize: "vertical" as const }}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note, reference, transfer details, emotional damage, whatever helps later."
          disabled={saving}
        />
      </label>
    </Modal>
  );
}
