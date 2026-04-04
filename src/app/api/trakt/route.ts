import { NextRequest, NextResponse } from "next/server";

const TRAKT_BASE = "https://api.trakt.tv";

function traktHeaders(clientId: string, accessToken?: string) {
  const h: Record<string, string> = {
    "Content-Type":      "application/json",
    "trakt-api-version": "2",
    "trakt-api-key":     clientId,
  };
  if (accessToken) h["Authorization"] = `Bearer ${accessToken}`;
  return h;
}

// ── GET — search / history / stats ───────────────────────────────────────
export async function GET(request: NextRequest) {
  const sp         = request.nextUrl.searchParams;
  const type       = sp.get("type") ?? "history";
  const clientId   = sp.get("clientId") ?? "";
  const username   = sp.get("username") ?? "";
  const query      = sp.get("query") ?? "";
  const limit      = sp.get("limit") ?? "30";

  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  const endpoints: Record<string, string> = {
    history:        `${TRAKT_BASE}/users/${username}/history?limit=${limit}&extended=full`,
    stats:          `${TRAKT_BASE}/users/${username}/stats`,
    search:         `${TRAKT_BASE}/search/movie,show?query=${encodeURIComponent(query)}&limit=10&extended=full`,
    search_movie:   `${TRAKT_BASE}/search/movie?query=${encodeURIComponent(query)}&limit=10&extended=full`,
    search_show:    `${TRAKT_BASE}/search/show?query=${encodeURIComponent(query)}&limit=10&extended=full`,
  };

  const url = endpoints[type];
  if (!url) return NextResponse.json({ error: "Unknown type" }, { status: 400 });

  try {
    const res = await fetch(url, { headers: traktHeaders(clientId), next: { revalidate: 60 } });
    if (!res.ok) return NextResponse.json({ error: `Trakt ${res.status}` }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// ── POST — device auth + add to history ──────────────────────────────────
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, clientId, clientSecret, deviceCode, accessToken } = body;

  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  // ── Initiate device auth ──────────────────────────────────────────────
  if (action === "device_init") {
    const res = await fetch(`${TRAKT_BASE}/oauth/device/code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Trakt device_init failed:", res.status, data);
      return NextResponse.json({ error: `Trakt ${res.status}: ${JSON.stringify(data)}` }, { status: res.status });
    }
    return NextResponse.json(data);
  }

  // ── Poll device auth ──────────────────────────────────────────────────
  if (action === "device_poll") {
    if (!clientSecret || !deviceCode)
      return NextResponse.json({ error: "clientSecret and deviceCode required" }, { status: 400 });
    const res = await fetch(`${TRAKT_BASE}/oauth/device/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: deviceCode, client_id: clientId, client_secret: clientSecret }),
    });
    // 400 = still waiting, 200 = success
    if (res.status === 400) return NextResponse.json({ pending: true });
    if (!res.ok) return NextResponse.json({ error: `Auth failed: ${res.status}` }, { status: res.status });
    return NextResponse.json(await res.json());
  }

  // ── Add to history ────────────────────────────────────────────────────
  if (action === "add_history") {
    if (!accessToken) return NextResponse.json({ error: "accessToken required" }, { status: 400 });
    const { items } = body; // [{type:"movie"|"show", ids:{trakt,imdb,tmdb}, watched_at?}]
    const payload: Record<string, unknown[]> = { movies: [], shows: [] };
    for (const item of (items ?? [])) {
      const entry = { ids: item.ids, watched_at: item.watched_at ?? new Date().toISOString() };
      if (item.type === "movie") (payload.movies as unknown[]).push(entry);
      else (payload.shows as unknown[]).push(entry);
    }
    const res = await fetch(`${TRAKT_BASE}/sync/history`, {
      method: "POST",
      headers: traktHeaders(clientId, accessToken),
      body: JSON.stringify(payload),
    });
    if (!res.ok) return NextResponse.json({ error: `Trakt ${res.status}` }, { status: res.status });
    return NextResponse.json(await res.json());
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
