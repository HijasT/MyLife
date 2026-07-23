/**
 * Shared Portfolio calculation constants — previously duplicated verbatim
 * across portfolio/page.tsx and portfolio/[id]/page.tsx, with no way to
 * keep them in sync if one changed.
 *
 * NOTE: FX_TO_AED is a separate, hardcoded rate table from the one Due
 * Tracker uses (due_month_settings.fx_rates, per-month and user-editable).
 * The two currently disagree (e.g. this file's INR rate implies ~22.7
 * INR/AED, Due Tracker defaults to 25.2) and there's no shared source of
 * truth for currency conversion across the app. Reconciling that is a
 * separate product decision — likely "does Portfolio read fx_rates too,
 * or does FX become a per-profile setting" — deliberately not resolved
 * here to avoid silently changing real financial calculations.
 */

export type Currency = "AED" | "USD" | "INR" | "GBP" | "EUR";
export type AssetType = "gold" | "silver" | "stock" | "crypto" | "other";

export const FX_TO_AED: Record<string, number> = {
  AED: 1,
  USD: 3.67,
  INR: 0.044,
  GBP: 4.62,
  EUR: 4.0,
};

export function toAed(amount: number, currency: string): number {
  return amount * (FX_TO_AED[currency] ?? 1);
}

/** 24K is pure (1.0), 22K is 91.6% pure, etc. */
export const PURITY_FACTOR: Record<number, number> = {
  24: 1.0,
  22: 0.9167,
  21: 0.875,
  18: 0.75,
};

type ValuableItem = {
  currentPrice: number | null;
  assetType: AssetType;
  weightGrams?: number | null;
  goldPurityKarat?: number | null;
};

/**
 * Current value of a holding in AED.
 * Gold tracked by weight+purity: weightGrams × spot price × purity factor
 * (ignores unit/purchase count — currentPrice is AED per gram of 24K pure).
 * Everything else: currentPrice × totalUnits.
 */
export function calcCurrentValue(item: ValuableItem, totalUnits: number): number | null {
  if (item.currentPrice == null) return null;
  if (item.assetType === "gold" && item.weightGrams && item.weightGrams > 0 && item.goldPurityKarat) {
    const factor = PURITY_FACTOR[item.goldPurityKarat] ?? 1;
    return item.weightGrams * item.currentPrice * factor;
  }
  return item.currentPrice * totalUnits;
}
