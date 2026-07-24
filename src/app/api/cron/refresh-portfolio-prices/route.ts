/**
 * Server-side scheduled price refresh for the Portfolio module.
 *
 * Previously all live-price fetching only happened client-side, when a user
 * had the Portfolio page open and clicked "Update prices" / "Refresh". This
 * route performs the same price resolution (goldapi.io for gold/silver when a
 * key is available, Yahoo Finance via the allorigins.win proxy as fallback,
 * parkin.ae scrape for the DFM-listed stock) but server-side and across every
 * user, intended to be hit on a schedule via Vercel Cron (see vercel.json).
 *
 * Auth: Vercel automatically attaches `Authorization: Bearer ${CRON_SECRET}`
 * to requests it triggers for a configured cron schedule when CRON_SECRET is
 * set as an env var — this route just verifies that header matches.
 *
 * Uses the Supabase service role key (server-only, never exposed to the
 * client) rather than a user session, since this needs to touch every user's
 * rows, not just the caller's — there is no user session here at all.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const OZ_TO_G = 31.1034768;

function proxy(url: string) {
  return `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
}

async function getUsdToAed(): Promise<number> {
  try {
    const r = await fetch("https://api.frankfurter.app/latest?from=USD&to=AED");
    const data = await r.json();
    if (data?.rates?.AED) return Number(data.rates.AED);
  } catch {
    // fall through to static fallback
  }
  return 3.67;
}

async function fetchYahooAed(ticker: string, usdToAed: number): Promise<number | null> {
  try {
    const r = await fetch(
      proxy(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`)
    );
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

async function fetchGoldApiAed(metal: "XAU" | "XAG", key: string): Promise<number | null> {
  try {
    const r = await fetch(`https://www.goldapi.io/api/${metal}/AED`, {
      headers: { "x-access-token": key, "Content-Type": "application/json" },
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data?.price > 0 ? Number(data.price) : null;
  } catch {
    return null;
  }
}

async function fetchParkinPrice(): Promise<number | null> {
  try {
    const r = await fetch(proxy("https://parkin.ae/stock-price"));
    const wrapper = await r.json();
    const html: string = wrapper?.contents ?? "";
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
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolves a live_price_symbol (XAU_OZ/XAU_G/XAG_OZ/XAG_G/PARKIN.DFM/custom
 * Yahoo ticker) to an AED price — mirrors fetchPriceForLiveLink in
 * portfolio/page.tsx and portfolio/[id]/page.tsx so the three stay consistent.
 */
async function resolveLivePrice(
  link: string,
  usdToAed: number,
  goldApiKey: string | null
): Promise<number | null> {
  const sym = (link || "").toUpperCase();

  if (["XAU_OZ", "XAU_G", "XAG_OZ", "XAG_G"].includes(sym)) {
    const metal = sym.startsWith("XAU") ? "XAU" : "XAG";

    if (goldApiKey) {
      const ozPrice = await fetchGoldApiAed(metal, goldApiKey);
      if (ozPrice != null) return sym.endsWith("_G") ? ozPrice / OZ_TO_G : ozPrice;
    }

    const yahooTicker = metal === "XAU" ? "XAUUSD=X" : "XAGUSD=X";
    const ozPrice = await fetchYahooAed(yahooTicker, usdToAed);
    if (ozPrice != null) return sym.endsWith("_G") ? ozPrice / OZ_TO_G : ozPrice;
    return null;
  }

  if (sym === "PARKIN.DFM") return fetchParkinPrice();

  return fetchYahooAed(sym, usdToAed);
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    // Guard clause rather than throwing — misconfiguration shouldn't ever
    // leak into a stack trace that might include env var names.
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const usdToAed = await getUsdToAed();

  const { data: items, error: itemsError } = await supabase
    .from("portfolio_items")
    .select("id,user_id,live_price_symbol,current_price")
    .not("live_price_symbol", "is", null)
    .neq("live_price_symbol", "");

  if (itemsError) {
    return NextResponse.json({ error: "Failed to load portfolio items" }, { status: 500 });
  }

  const rows = items ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ updated: 0, users: 0 });
  }

  // Per-user goldapi key + existing metal_prices cache — fetched once per
  // distinct user, not per item.
  const userIds = Array.from(new Set(rows.map((r) => r.user_id as string)));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,goldapi_key,metal_prices")
    .in("id", userIds);

  const goldApiKeyByUser = new Map<string, string | null>();
  const metalPricesByUser = new Map<string, Record<string, unknown>>();
  for (const p of profiles ?? []) {
    goldApiKeyByUser.set(p.id, p.goldapi_key ?? null);
    metalPricesByUser.set(p.id, (p.metal_prices as Record<string, unknown>) ?? {});
  }

  // Resolve each distinct (symbol, goldapi key) pair once, then fan out to
  // every item that links to it, instead of refetching per-item.
  const symbolPriceCache = new Map<string, number | null>();
  const nowIso = new Date().toISOString();
  let updatedCount = 0;

  for (const item of rows) {
    const link = String(item.live_price_symbol);
    const userId = String(item.user_id);
    const goldApiKey = goldApiKeyByUser.get(userId) ?? null;
    const cacheKey = `${link}::${goldApiKey ?? ""}`;

    if (!symbolPriceCache.has(cacheKey)) {
      symbolPriceCache.set(cacheKey, await resolveLivePrice(link, usdToAed, goldApiKey));
    }

    const price = symbolPriceCache.get(cacheKey);
    if (price == null || price <= 0) continue;

    const { error: updateError } = await supabase
      .from("portfolio_items")
      .update({ current_price: price, current_price_updated_at: nowIso })
      .eq("id", item.id);

    if (!updateError) updatedCount += 1;

    // Cache into this user's profiles.metal_prices under the live_price_symbol
    // key, same bid/ask/updated shape the client's fetchSpotPrices writes, so
    // the Live Prices tab reflects the refresh even if the user never opens
    // the page. metalPricesByUser already carries this user's existing
    // __custom_symbols entry forward untouched.
    const cache = metalPricesByUser.get(userId) ?? {};
    cache[link] = { bid: price * 0.999, ask: price, updated: nowIso };
    metalPricesByUser.set(userId, cache);
  }

  for (const [userId, cache] of metalPricesByUser) {
    await supabase.from("profiles").update({ metal_prices: cache }).eq("id", userId);
  }

  return NextResponse.json({ updated: updatedCount, users: metalPricesByUser.size });
}
