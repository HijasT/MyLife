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
export type TxType = "buy" | "sell";
export type AlertType = "above" | "below";

export const ASSET_ICONS: Record<AssetType, string> = {
  gold: "🥇",
  silver: "🥈",
  stock: "📊",
  crypto: "₿",
  other: "💼",
};

export type PortfolioItem = {
  id: string;
  symbol: string;
  name: string;
  assetType: AssetType;
  unitLabel: string;
  mainCurrency: Currency;
  currentPrice: number | null;
  currentPriceUpdatedAt: string | null;
  notes: string;
  livePriceSymbol?: string | null;
  goldPurityKarat?: number | null;
  weightGrams?: number | null;
};

// Optional itemId/itemName/itemSymbol/notes cover both call sites: the list
// page's recent/expanded-drawer queries join portfolio_items(name,symbol)
// and don't select `notes`; the detail page selects notes but never joins.
export type Purchase = {
  id: string;
  itemId?: string;
  purchasedAt: string;
  unitPrice: number;
  units: number;
  totalPaid: number;
  currency: Currency;
  source: string;
  notes?: string;
  itemName?: string;
  itemSymbol?: string;
  transactionType: TxType;
};

export type PortfolioAlert = {
  id: string;
  itemId?: string;
  itemName?: string;
  itemSymbol?: string;
  alertType: AlertType;
  targetPrice: number;
  isActive: boolean;
  triggeredAt: string | null;
  createdAt: string;
};

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
  mainCurrency: string;
};

/**
 * Current value of a holding in AED.
 * Gold tracked by weight+purity: weightGrams × spot price × purity factor
 * (ignores unit/purchase count — currentPrice is AED per gram of 24K pure).
 * Everything else: currentPrice × totalUnits.
 *
 * currentPrice is stored in the item's own mainCurrency (e.g. "USD per share"),
 * so it's converted to AED via toAed() before being combined with AED-denominated
 * totals — previously this was skipped, silently misvaluing anything priced in a
 * non-AED currency.
 */
export function calcCurrentValue(item: ValuableItem, totalUnits: number): number | null {
  if (item.currentPrice == null) return null;
  if (item.assetType === "gold" && item.weightGrams && item.weightGrams > 0 && item.goldPurityKarat) {
    const factor = PURITY_FACTOR[item.goldPurityKarat] ?? 1;
    return toAed(item.weightGrams * item.currentPrice * factor, item.mainCurrency);
  }
  return toAed(item.currentPrice * totalUnits, item.mainCurrency);
}

/**
 * Shared price-alert trigger check, used by both the list page (after a bulk
 * price refresh) and the detail page (its own syncAlerts effect) so the two
 * don't drift — previously only the detail page checked alerts, meaning they
 * never fired unless the user happened to open that specific item's page
 * right after a price update.
 */
export type AlertRow = {
  id: string;
  alert_type: "above" | "below";
  target_price: number;
  is_active: boolean;
  triggered_at: string | null;
};

export function alertsToTrigger(alerts: AlertRow[], currentPrice: number | null): string[] {
  if (currentPrice == null) return [];
  return alerts
    .filter(
      (a) =>
        a.is_active &&
        !a.triggered_at &&
        ((a.alert_type === "above" && currentPrice >= a.target_price) ||
          (a.alert_type === "below" && currentPrice <= a.target_price))
    )
    .map((a) => a.id);
}

// ============================================================
// Formatters — previously duplicated (fmtN/fmtNum, fmtSignedAed) across
// both page files.
// ============================================================

export function fmtN(n: number, dec = 2): string {
  return n.toLocaleString("en-AE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AE", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AE", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function fmtSignedAed(n: number | null): string {
  if (n === null) return "—";
  return `${n >= 0 ? "+" : "-"}AED ${fmtN(Math.abs(n))}`;
}

// ============================================================
// DB row → model mappers
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dbToItem(r: any): PortfolioItem {
  return {
    id: r.id,
    symbol: r.symbol,
    name: r.name,
    assetType: (r.asset_type ?? "other") as AssetType,
    unitLabel: r.unit_label ?? "unit",
    mainCurrency: (r.main_currency ?? "AED") as Currency,
    currentPrice: r.current_price ?? null,
    currentPriceUpdatedAt: r.current_price_updated_at ?? null,
    notes: r.notes ?? "",
    livePriceSymbol: r.live_price_symbol ?? null,
    goldPurityKarat: r.gold_purity_karat ?? null,
    weightGrams: r.weight_grams ?? null,
  };
}

// Prefers the explicit `transaction_type` column, falling back to inferring
// from the sign of units/total_paid only when it's missing — the detail
// page always did this; the list page previously inferred from sign alone
// even when transaction_type was present, which only matters for legacy
// rows written before that column existed (current write paths always set
// both consistently, so this is a no-op for anything the app itself wrote).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dbToPurchase(r: any): Purchase {
  const transactionType: TxType = r.transaction_type ?? (Number(r.units) < 0 || Number(r.total_paid) < 0 ? "sell" : "buy");
  return {
    id: r.id,
    itemId: r.item_id,
    purchasedAt: r.purchased_at,
    unitPrice: Math.abs(Number(r.unit_price) || 0),
    units: Math.abs(Number(r.units) || 0),
    totalPaid: Math.abs(Number(r.total_paid) || 0),
    currency: (r.currency ?? "AED") as Currency,
    source: r.source ?? "",
    notes: r.notes ?? "",
    itemName: r.portfolio_items?.name,
    itemSymbol: r.portfolio_items?.symbol,
    transactionType,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dbToAlert(r: any): PortfolioAlert {
  return {
    id: r.id,
    itemId: r.item_id,
    itemName: r.portfolio_items?.name ?? "Unknown",
    itemSymbol: r.portfolio_items?.symbol ?? "",
    alertType: r.alert_type,
    targetPrice: Number(r.target_price) || 0,
    isActive: !!r.is_active,
    triggeredAt: r.triggered_at ?? null,
    createdAt: r.created_at,
  };
}

// ============================================================
// Live price fetchers — GoldAPI (when a key is available) → Yahoo Finance
// via the allorigins.win proxy → Parkin.ae scrape for the DFM-listed stock.
// Previously duplicated between both page files; the detail page's copy of
// fetchPriceForLiveLink was dead code (fetchLinkedLivePrice there reads the
// cached profiles.metal_prices value instead of calling it), so only the
// list page's more complete version — which additionally falls through to
// fetchLivePrice for arbitrary custom symbols — is kept here.
// ============================================================

const OZ_TO_G = 31.1034768;

function allOriginsProxy(url: string): string {
  return `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
}

async function getUsdToAed(): Promise<number> {
  try {
    const fxRes = await fetch("https://api.frankfurter.app/latest?from=USD&to=AED");
    const fxData = await fxRes.json();
    if (fxData?.rates?.AED) return fxData.rates.AED;
  } catch {
    // fallback to static FX
  }
  return FX_TO_AED.USD;
}

export async function fetchLivePrice(symbol: string): Promise<number | null> {
  const sym = symbol.toUpperCase();
  try {
    const usdToAed = await getUsdToAed();
    const tickerMap: Record<string, string> = {
      XAU: "XAUUSD=X",
      XAG: "XAGUSD=X",
      BTC: "BTC-USD",
      ETH: "ETH-USD",
    };
    const ticker = tickerMap[sym] ?? sym;
    const r = await fetch(allOriginsProxy(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`));
    const wrapper = await r.json();
    const data = JSON.parse(wrapper?.contents ?? "{}");
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    const currency = data?.chart?.result?.[0]?.meta?.currency ?? "USD";
    if (!price || price <= 0) return null;
    return currency === "USD" ? price * usdToAed : price;
  } catch {
    return null;
  }
}

export async function fetchPriceForLiveLink(link: string): Promise<number | null> {
  const sym = (link || "").toUpperCase();
  const usdToAed = await getUsdToAed();

  if (sym === "XAU_OZ" || sym === "XAU_G" || sym === "XAG_OZ" || sym === "XAG_G") {
    const metal = sym.startsWith("XAU") ? "XAU" : "XAG";
    const keyToUse = process.env.NEXT_PUBLIC_GOLDAPI_KEY || "";

    if (keyToUse) {
      try {
        const r = await fetch(`https://www.goldapi.io/api/${metal}/AED`, {
          headers: { "x-access-token": keyToUse, "Content-Type": "application/json" },
        });
        if (r.ok) {
          const data = await r.json();
          if (data?.price > 0) {
            return sym.endsWith("_G") ? data.price / OZ_TO_G : data.price;
          }
        }
      } catch {
        // fallback below
      }
    }

    const yahooTicker = metal === "XAU" ? "XAUUSD=X" : "XAGUSD=X";
    try {
      const r = await fetch(allOriginsProxy(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&range=5d`));
      const wrapper = await r.json();
      const data = JSON.parse(wrapper?.contents ?? "{}");
      const usdPrice = data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? 0;
      if (usdPrice > 0) {
        const aedPrice = usdPrice * usdToAed;
        return sym.endsWith("_G") ? aedPrice / OZ_TO_G : aedPrice;
      }
    } catch {
      return null;
    }
  }

  if (sym === "PARKIN.DFM") {
    try {
      const r = await fetch(allOriginsProxy("https://parkin.ae/stock-price"));
      const wrapper = await r.json();
      const html = wrapper?.contents ?? "";
      const pats = [
        /TickerValueTD_LastPrice[^>]*>([\d.]+)/,
        /TickerValueTD[^>]*LastPrice[^>]*>([\d.]+)/,
        /"lastPrice"\s*:\s*"?([\d.]+)"?/,
        /"last"\s*:\s*([\d.]+)/,
        /PARK[A-Z.]*[^<]{0,30}([\d]{1,3}\.[\d]{1,4})/,
      ];
      for (const pat of pats) {
        const m = html.match(pat);
        if (m) {
          const price = parseFloat(m[1]);
          if (price > 0) return price;
        }
      }
    } catch {
      return null;
    }
  }

  return fetchLivePrice(sym);
}

/**
 * Fetches AED spot prices for 24K gold and 999 silver (oz + gram) plus any
 * custom Yahoo-ticker symbols, using GoldAPI when a key is available and
 * falling back to Yahoo/Parkin otherwise. Pulled out of the list page's
 * fetchSpotPrices verbatim (minus the Supabase persistence and toast/state
 * side effects, which stay page-side) so the fetch chain lives in one place.
 */
export async function fetchAllSpotPrices(
  customSymbols: string[],
  goldApiKey: string,
  nowLabel: string,
): Promise<Record<string, { bid: number; ask: number; updated: string }>> {
  const results: Record<string, { bid: number; ask: number; updated: string }> = {};
  const usdToAed = await getUsdToAed();

  const getYahooAed = async (ticker: string): Promise<number | null> => {
    try {
      const r = await fetch(allOriginsProxy(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`));
      const wrapper = await r.json();
      const text = wrapper?.contents;
      if (!text) return null;
      const data = JSON.parse(text);
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      const currency = data?.chart?.result?.[0]?.meta?.currency ?? "USD";
      if (!price || price <= 0) return null;
      return currency === "USD" ? price * usdToAed : price;
    } catch {
      return null;
    }
  };

  const keyToUse = goldApiKey || process.env.NEXT_PUBLIC_GOLDAPI_KEY || "";

  if (keyToUse) {
    try {
      const [goldRes, silverRes] = await Promise.all([
        fetch("https://www.goldapi.io/api/XAU/AED", { headers: { "x-access-token": keyToUse, "Content-Type": "application/json" } }),
        fetch("https://www.goldapi.io/api/XAG/AED", { headers: { "x-access-token": keyToUse, "Content-Type": "application/json" } }),
      ]);

      if (goldRes.ok) {
        const gold = await goldRes.json();
        if (gold?.price > 0) {
          const ozAed = gold.price;
          const gAed = ozAed / OZ_TO_G;
          results.XAU_OZ = { bid: gold.prev_close_price ?? ozAed * 0.999, ask: ozAed, updated: nowLabel };
          results.XAU_G = { bid: (gold.prev_close_price ?? ozAed * 0.999) / OZ_TO_G, ask: gAed, updated: nowLabel };
        }
      }

      if (silverRes.ok) {
        const silver = await silverRes.json();
        if (silver?.price > 0) {
          const ozAed = silver.price;
          const gAed = ozAed / OZ_TO_G;
          results.XAG_OZ = { bid: silver.prev_close_price ?? ozAed * 0.999, ask: ozAed, updated: nowLabel };
          results.XAG_G = { bid: (silver.prev_close_price ?? ozAed * 0.999) / OZ_TO_G, ask: gAed, updated: nowLabel };
        }
      }
    } catch {
      // fallback below
    }
  }

  if (!results.XAU_OZ || !results.XAG_OZ) {
    try {
      const r = await fetch(allOriginsProxy("https://query1.finance.yahoo.com/v8/finance/chart/XAUUSD=X?interval=1d&range=5d"));
      const w = await r.json();
      const p = JSON.parse(w?.contents ?? "{}")?.chart?.result?.[0]?.meta?.regularMarketPrice ?? 0;
      if (p > 0) {
        const ozAed = p * usdToAed;
        const gAed = ozAed / OZ_TO_G;
        results.XAU_OZ = { bid: ozAed * 0.999, ask: ozAed, updated: nowLabel };
        results.XAU_G = { bid: gAed * 0.999, ask: gAed, updated: nowLabel };
      }
    } catch {
      // skip
    }

    try {
      const r = await fetch(allOriginsProxy("https://query1.finance.yahoo.com/v8/finance/chart/XAGUSD=X?interval=1d&range=5d"));
      const w = await r.json();
      const p = JSON.parse(w?.contents ?? "{}")?.chart?.result?.[0]?.meta?.regularMarketPrice ?? 0;
      if (p > 0) {
        const ozAed = p * usdToAed;
        const gAed = ozAed / OZ_TO_G;
        results.XAG_OZ = { bid: ozAed * 0.999, ask: ozAed, updated: nowLabel };
        results.XAG_G = { bid: gAed * 0.999, ask: gAed, updated: nowLabel };
      }
    } catch {
      // skip
    }
  }

  try {
    const r = await fetch(allOriginsProxy("https://parkin.ae/stock-price"));
    const wrapper = await r.json();
    const html: string = wrapper?.contents ?? "";
    let parkinPrice = 0;
    const pats = [
      /TickerValueTD_LastPrice[^>]*>([\d.]+)/,
      /TickerValueTD[^>]*LastPrice[^>]*>([\d.]+)/,
      /"lastPrice"\s*:\s*"?([\d.]+)"?/,
      /"last"\s*:\s*([\d.]+)/,
      /PARK[A-Z.]*[^<]{0,30}([\d]{1,3}\.[\d]{1,4})/,
    ];
    for (const pat of pats) {
      const m = html.match(pat);
      if (m) {
        parkinPrice = parseFloat(m[1]);
        if (parkinPrice > 0) break;
      }
    }
    if (parkinPrice > 0) {
      results["PARKIN.DFM"] = { bid: parkinPrice * 0.999, ask: parkinPrice, updated: nowLabel };
    }
  } catch {
    // skip
  }

  for (const sym of customSymbols.filter((s) => s !== "PARKIN.DFM")) {
    const price = await getYahooAed(sym);
    if (price && price > 0) {
      results[sym] = { bid: price * 0.999, ask: price, updated: nowLabel };
    }
  }

  return results;
}

// ============================================================
// Cost-basis engines — two distinct, deliberately separate algorithms.
// Do not merge: one attributes a single item's own transactions to
// broker/platform buckets across the whole portfolio (list page); the other
// walks one item's transactions for its own per-item and per-transaction
// P&L view (detail page). Both use the same pooled-average-cost mechanics,
// but solve different aggregation problems.
// ============================================================

export type ItemStats = {
  totalUnits: number;
  costBasisAed: number;
  totalBuysAed: number;
  totalSellsAed: number;
  realizedPlAed: number;
  avgUnitPrice: number;
};

export const EMPTY_ITEM_STATS: ItemStats = {
  totalUnits: 0,
  costBasisAed: 0,
  totalBuysAed: 0,
  totalSellsAed: 0,
  realizedPlAed: 0,
  avgUnitPrice: 0,
};

// Per broker/platform (the free-text "source" field on each transaction),
// pooled across every asset that has at least one transaction recorded
// under that name.
export type BrokerStat = {
  label: string; // display name — first-seen casing for this broker, case-insensitive key
  totalBoughtAed: number;
  totalSoldAed: number;
  remainingCostBasisAed: number; // true remaining cost basis of units still held — used for P&L
  currentValueAed: number;
  realizedPlAed: number;
  hasUnknownPrice: boolean; // true if currentValueAed excludes ≥1 item lacking a price
};

type BrokerBucketContribution = {
  label: string;
  totalBoughtAed: number;
  totalSoldAed: number;
  remainingCostBasisAed: number;
  currentValueAed: number | null; // null means "unknown price" for this bucket
  realizedPlAed: number;
};

type RawPurchaseRow = {
  units: number | string;
  total_paid: number | string;
  currency: string;
  purchased_at: string;
  source: string | null;
};

/**
 * Pooled average-cost-basis walk over one item's purchases, plus an
 * independent per-broker/platform breakdown of the same algorithm.
 *
 * This is the single riskiest calculation in the module — it has a real
 * bugfix history (see commits 771bc22, a1c156a, ab75797): the broker
 * shortfall-spreading logic below fixes a case where a sell's Broker/
 * platform field doesn't match the spelling used on its buys, which used
 * to fabricate profit for that broker without reducing the real holder's
 * cost basis. Moved here verbatim from the list page's `loadStats` — do
 * not change this algorithm without deliberately re-deriving it.
 */
export function computeItemCostBasis(
  rows: RawPurchaseRow[],
  item: { assetType: AssetType; weightGrams?: number | null; goldPurityKarat?: number | null; mainCurrency: string; currentPrice: number | null },
): { stats: ItemStats; brokerContributions: Record<string, BrokerBucketContribution> } {
  let totalUnits = 0;
  let costBasisAed = 0;
  let totalBuysAed = 0;
  let totalSellsAed = 0;
  let realizedPlAed = 0;

  const bySource: Record<
    string,
    { label: string; totalUnits: number; costBasisAed: number; totalBoughtAed: number; totalSoldAed: number; realizedPlAed: number }
  > = {};

  for (const row of rows) {
    const units = Number(row.units) || 0;
    const amountAed = Math.abs(toAed(Number(row.total_paid) || 0, row.currency));
    const rawSrc = (row.source ?? "").trim().replace(/\s+/g, " ") || "Unspecified";
    // Group case-insensitively so "Liv" and "LIV" are the same broker.
    const src = rawSrc.toLowerCase();
    const b = bySource[src] ?? (bySource[src] = { label: rawSrc, totalUnits: 0, costBasisAed: 0, totalBoughtAed: 0, totalSoldAed: 0, realizedPlAed: 0 });

    if (units >= 0) {
      totalUnits += units;
      costBasisAed += amountAed;
      totalBuysAed += amountAed;

      b.totalUnits += units;
      b.costBasisAed += amountAed;
      b.totalBoughtAed += amountAed;
    } else {
      const sellUnits = Math.min(Math.abs(units), totalUnits);
      const avgCostBeforeSell = totalUnits > 0 ? costBasisAed / totalUnits : 0;
      const costRemoved = avgCostBeforeSell * sellUnits;

      totalUnits = Math.max(0, totalUnits - sellUnits);
      costBasisAed = Math.max(0, costBasisAed - costRemoved);
      totalSellsAed += amountAed;
      realizedPlAed += amountAed - costRemoved;

      // Broker-level: draw the sold units from the named bucket first. If
      // that bucket doesn't hold enough recorded units to cover the sell —
      // e.g. the sell's Broker/platform field wasn't spelled identically to
      // the buys it's actually closing out — spread the shortfall across
      // whichever other buckets still hold units, proportional to their
      // share, using each bucket's own average cost. Previously the
      // shortfall was left in the named bucket with no cost removed, which
      // fabricated a large "profit" for that broker and left the real
      // holder's cost basis never drawn down.
      b.totalSoldAed += amountAed;

      let remainingSellUnits = sellUnits;
      const ownRemove = Math.min(remainingSellUnits, b.totalUnits);
      if (ownRemove > 0) {
        const bAvgCost = b.totalUnits > 0 ? b.costBasisAed / b.totalUnits : 0;
        const bCostRemoved = bAvgCost * ownRemove;
        b.totalUnits = Math.max(0, b.totalUnits - ownRemove);
        b.costBasisAed = Math.max(0, b.costBasisAed - bCostRemoved);
        b.realizedPlAed += amountAed * (ownRemove / sellUnits) - bCostRemoved;
        remainingSellUnits -= ownRemove;
      }

      if (remainingSellUnits > 1e-9) {
        const otherBuckets = Object.values(bySource).filter((other) => other !== b && other.totalUnits > 0);
        const otherUnitsTotal = otherBuckets.reduce((sum, o) => sum + o.totalUnits, 0);
        if (otherUnitsTotal > 0) {
          for (const other of otherBuckets) {
            const share = other.totalUnits / otherUnitsTotal;
            const unitsFromOther = Math.min(other.totalUnits, remainingSellUnits * share);
            const otherAvgCost = other.totalUnits > 0 ? other.costBasisAed / other.totalUnits : 0;
            const otherCostRemoved = otherAvgCost * unitsFromOther;
            other.totalUnits = Math.max(0, other.totalUnits - unitsFromOther);
            other.costBasisAed = Math.max(0, other.costBasisAed - otherCostRemoved);
            other.realizedPlAed += amountAed * (unitsFromOther / sellUnits) - otherCostRemoved;
          }
        }
        // If no other bucket has recorded units either (every buy was
        // logged under a different/typo'd source), there's nothing
        // truthful left to attribute — leave it rather than inventing
        // more profit.
      }
    }
  }

  const stats: ItemStats = {
    totalUnits,
    costBasisAed,
    totalBuysAed,
    totalSellsAed,
    realizedPlAed,
    avgUnitPrice: totalUnits > 0 ? costBasisAed / totalUnits : 0,
  };

  // Attribute this item's current value to each broker bucket. Units-based
  // assets convert exactly (calcCurrentValue on the broker's own remaining
  // units). Weight-based gold has no per-unit valuation to split, so its
  // current value is approximated by each broker's share of the item's
  // remaining cost basis.
  const isWeightGold = item.assetType === "gold" && !!item.weightGrams && item.weightGrams > 0 && !!item.goldPurityKarat;
  const fullCurrentValue = calcCurrentValue(item, totalUnits);
  const sourceCount = Object.keys(bySource).length;

  const brokerContributions: Record<string, BrokerBucketContribution> = {};
  for (const [src, b] of Object.entries(bySource)) {
    let valueAed: number | null;
    if (isWeightGold) {
      valueAed = fullCurrentValue === null ? null : costBasisAed > 0 ? fullCurrentValue * (b.costBasisAed / costBasisAed) : sourceCount === 1 ? fullCurrentValue : 0;
    } else {
      valueAed = calcCurrentValue(item, b.totalUnits);
    }
    brokerContributions[src] = {
      label: b.label,
      totalBoughtAed: b.totalBoughtAed,
      totalSoldAed: b.totalSoldAed,
      remainingCostBasisAed: b.costBasisAed,
      currentValueAed: valueAed,
      realizedPlAed: b.realizedPlAed,
    };
  }

  return { stats, brokerContributions };
}

export type ItemTransactionInfo = {
  amountAed: number;
  plAed: number | null;
  plLabel: "Unrealized P&L" | "Realized P&L";
};

export type ItemPnl = {
  totalUnits: number;
  costBasisAed: number;
  totalBuysAed: number;
  totalSellsAed: number;
  realizedPlAed: number;
  avgUnitPrice: number;
  currentValueAed: number | null;
  pl: number | null;
  plPct: number | null;
  infoByPurchaseId: Map<string, ItemTransactionInfo>;
};

/**
 * Single-item pooled average-cost P&L walk, used by the detail page.
 * Deliberately separate from computeItemCostBasis above (which does
 * cross-item broker attribution) — this only ever looks at one item's own
 * transactions. Previously duplicated between the detail page's `stats` and
 * `transactionRows` memos (same walk, one aggregating, one per-row); merged
 * into one pass here since both derive from the same running totals.
 */
export function computeItemPnl(purchases: Purchase[], item: PortfolioItem | null): ItemPnl {
  const ordered = [...purchases].sort((a, b) => new Date(a.purchasedAt).getTime() - new Date(b.purchasedAt).getTime());

  let totalUnits = 0;
  let costBasisAed = 0;
  let totalBuysAed = 0;
  let totalSellsAed = 0;
  let realizedPlAed = 0;
  const infoByPurchaseId = new Map<string, ItemTransactionInfo>();

  for (const p of ordered) {
    const amountAed = toAed(p.totalPaid, p.currency);

    if (p.transactionType === "buy") {
      const currentValAed = item?.currentPrice != null ? toAed(item.currentPrice * p.units, item.mainCurrency) : null;
      infoByPurchaseId.set(p.id, {
        amountAed,
        plAed: currentValAed !== null ? currentValAed - amountAed : null,
        plLabel: "Unrealized P&L",
      });

      totalUnits += p.units;
      costBasisAed += amountAed;
      totalBuysAed += amountAed;
    } else {
      const sellUnits = Math.min(p.units, totalUnits);
      const avgCostBeforeSell = totalUnits > 0 ? costBasisAed / totalUnits : 0;
      const costRemoved = avgCostBeforeSell * sellUnits;
      const realizedForThisSale = amountAed - costRemoved;

      infoByPurchaseId.set(p.id, {
        amountAed,
        plAed: realizedForThisSale,
        plLabel: "Realized P&L",
      });

      totalUnits = Math.max(0, totalUnits - sellUnits);
      costBasisAed = Math.max(0, costBasisAed - costRemoved);
      totalSellsAed += amountAed;
      realizedPlAed += realizedForThisSale;
    }
  }

  const avgUnitPrice = totalUnits > 0 ? costBasisAed / totalUnits : 0;
  const currentValueAed = item ? calcCurrentValue(item, totalUnits) : null;
  const pl = currentValueAed !== null ? currentValueAed - costBasisAed : null;
  const plPct = pl !== null && costBasisAed > 0 ? (pl / costBasisAed) * 100 : null;

  return {
    totalUnits,
    costBasisAed,
    totalBuysAed,
    totalSellsAed,
    realizedPlAed,
    avgUnitPrice,
    currentValueAed,
    pl,
    plPct,
    infoByPurchaseId,
  };
}
