"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────
type TraktHistoryItem = {
  id: number;
  watched_at: string;
  type: "movie" | "episode";
  movie?: { title: string; year: number; ids: { imdb: string; tmdb: number } };
  show?:  { title: string; year: number; ids: { imdb: string; tmdb: number } };
  episode?: { season: number; number: number; title: string };
};

type TraktStats = {
  movies:   { plays: number; watched: number };
  shows:    { watched: number };
  episodes: { plays: number; watched: number };
  ratings:  { total: number };
};

type LetterboxdEntry = {
  title: string;
  year: string;
  rating: number | null;
  watchedDate: string;
  link: string;
  rewatch: boolean;
  posterUrl: string | null;
};

type Tab = "feed" | "movies" | "tv" | "stats";

type SearchResult = {
  type: "movie" | "show";
  score: number;
  movie?: { title: string; year: number; ids: { trakt: number; imdb: string; tmdb: number }; overview?: string };
  show?:  { title: string; year: number; ids: { trakt: number; imdb: string; tmdb: number }; overview?: string };
};

type DeviceCode = {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
};

function useDarkMode() {
  const get = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const [isDark, setIsDark] = useState(get);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const obs = new MutationObserver(() => setIsDark(get()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

function Stars({ rating }: { rating: number | null }) {
  if (!rating) return <span style={{ color: "#6b7280", fontSize: 11 }}>Not rated</span>;
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  return (
    <span style={{ fontSize: 12, color: "#f59e0b", letterSpacing: 1 }}>
      {"★".repeat(full)}{half ? "½" : ""}
      <span style={{ color: "#6b7280", marginLeft: 4 }}>{rating}/5</span>
    </span>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export default function EntertainmentPage() {
  const supabase = createClient();
  const isDark = useDarkMode();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("feed");

  // Config
  const [traktUsername, setTraktUsername]   = useState("");
  const [traktClientId, setTraktClientId]   = useState("");
  const [lbUsername, setLbUsername]         = useState("");
  const [showSetup, setShowSetup]           = useState(false);
  const [savingConfig, setSavingConfig]     = useState(false);

  // Data
  const [traktHistory, setTraktHistory]     = useState<TraktHistoryItem[]>([]);
  const [traktStats, setTraktStats]         = useState<TraktStats | null>(null);
  const [lbEntries, setLbEntries]           = useState<LetterboxdEntry[]>([]);
  const [traktError, setTraktError]         = useState("");
  const [lbError, setLbError]              = useState("");
  const [traktLoading, setTraktLoading]     = useState(false);
  const [lbLoading, setLbLoading]          = useState(false);

  const V = {
    bg:     isDark ? "#0d0f14" : "#f9f8f5",
    card:   isDark ? "#16191f" : "#ffffff",
    border: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)",
    text:   isDark ? "#f0ede8" : "#1a1a1a",
    muted:  isDark ? "#9ba3b2" : "#6b7280",
    faint:  isDark ? "#5c6375" : "#9ca3af",
    input:  isDark ? "#1e2130" : "#f9fafb",
    accent: "#8b5cf6",  // purple — entertainment vibe
  };
  const btn  = { padding:"8px 14px", borderRadius:10, border:`1px solid ${V.border}`, background:V.card, color:V.text, cursor:"pointer", fontSize:13, fontWeight:600 } as const;
  const btnP = { ...btn, background:V.accent, border:"none", color:"#fff", fontWeight:700 } as const;
  const inp  = { padding:"9px 12px", borderRadius:8, border:`1px solid ${V.border}`, background:V.input, color:V.text, fontSize:13, outline:"none", width:"100%", boxSizing:"border-box" as const };

  // Search + auth state
  const [showSearch, setShowSearch]         = useState(false);
  const [searchQuery, setSearchQuery]       = useState("");
  const [searchResults, setSearchResults]   = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading]   = useState(false);
  const [traktClientSecret, setTraktClientSecret] = useState("");
  const [traktAccessToken, setTraktAccessToken]   = useState("");
  const [showAuth, setShowAuth]             = useState(false);
  const [deviceCode, setDeviceCode]         = useState<DeviceCode | null>(null);
  const [authPolling, setAuthPolling]       = useState(false);
  const [addingItem, setAddingItem]         = useState<string | null>(null);
  const [authError, setAuthError] = useState("");
  const [addedItems, setAddedItems]         = useState<Set<string>>(new Set());
  const [toast, setToast]                   = useState("");

  // Load config from DB
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("trakt_username, trakt_client_id, trakt_client_secret, trakt_access_token, letterboxd_username")
        .eq("id", user.id)
        .single();
      if (profile) {
        setTraktUsername(profile.trakt_username ?? "");
        setTraktClientId(profile.trakt_client_id ?? "");
        setTraktClientSecret(profile.trakt_client_secret ?? "");
        setTraktAccessToken(profile.trakt_access_token ?? "");
        setLbUsername(profile.letterboxd_username ?? "");
        if (!profile.trakt_username && !profile.letterboxd_username) setShowSetup(true);
      } else {
        setShowSetup(true);
      }
      setLoading(false);
    }
    load();
  }, []);

  // Fetch Trakt data when credentials available
  useEffect(() => {
    if (!traktUsername || !traktClientId) return;
    fetchTrakt();
  }, [traktUsername, traktClientId]);

  // Fetch Letterboxd when username available
  useEffect(() => {
    if (!lbUsername) return;
    fetchLetterboxd();
  }, [lbUsername]);

  async function fetchTrakt() {
    setTraktLoading(true);
    setTraktError("");
    try {
      const [histRes, statsRes] = await Promise.all([
        fetch(`/api/trakt?username=${encodeURIComponent(traktUsername)}&clientId=${encodeURIComponent(traktClientId)}&type=history&limit=10`),
        fetch(`/api/trakt?username=${encodeURIComponent(traktUsername)}&clientId=${encodeURIComponent(traktClientId)}&type=stats`),
      ]);
      if (histRes.ok)  setTraktHistory(await histRes.json());
      else { const e = await histRes.json(); setTraktError(e.error ?? "Trakt error"); }
      if (statsRes.ok) setTraktStats(await statsRes.json());
    } catch (e) {
      setTraktError(String(e));
    }
    setTraktLoading(false);
  }

  async function fetchLetterboxd() {
    setLbLoading(true);
    setLbError("");
    try {
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(`https://letterboxd.com/${lbUsername}/rss/`)}`;
      const res = await fetch(proxyUrl);
      const data = await res.json();
      const xml = data.contents as string;
      if (!xml) throw new Error("Empty response");
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, "text/xml");
      const items = Array.from(doc.querySelectorAll("item"));
      const entries: LetterboxdEntry[] = items.slice(0, 10).map(item => {
        const get = (tag: string) => item.querySelector(tag)?.textContent ?? "";
        const nsGet = (ns: string, tag: string) => {
          const el = item.getElementsByTagNameNS("https://letterboxd.com", tag)[0]
                  || item.getElementsByTagName(`${ns}:${tag}`)[0]
                  || item.getElementsByTagName(tag)[0];
          return el?.textContent ?? "";
        };
        const ratingStr = nsGet("letterboxd", "memberRating");
        const filmTitle = nsGet("letterboxd", "filmTitle") || get("title").replace(/^★+½?\s*-?\s*/, "");
        const filmYear  = nsGet("letterboxd", "filmYear");
        const watched   = nsGet("letterboxd", "watchedDate");
        const rewatch   = nsGet("letterboxd", "rewatch") === "Yes";
        const link      = get("link");

        // Try to get poster from description img
        const desc = get("description");
        const imgMatch = desc.match(/<img[^>]+src="([^"]+)"/);
        const posterUrl = imgMatch ? imgMatch[1] : null;

        return {
          title: filmTitle,
          year: filmYear,
          rating: ratingStr ? parseFloat(ratingStr) : null,
          watchedDate: watched || get("pubDate"),
          link,
          rewatch,
          posterUrl,
        };
      });
      setLbEntries(entries);
    } catch (e) {
      setLbError(`Could not load Letterboxd: ${String(e)}`);
    }
    setLbLoading(false);
  }

  async function saveConfig() {
    if (!userId) return;
    setSavingConfig(true);
    await supabase.from("profiles").update({
      trakt_username:       traktUsername || null,
      trakt_client_id:      traktClientId || null,
      trakt_client_secret:  traktClientSecret || null,
      letterboxd_username:  lbUsername || null,
    }).eq("id", userId);
    setShowSetup(false);
    setSavingConfig(false);
    if (traktUsername && traktClientId) fetchTrakt();
    if (lbUsername) fetchLetterboxd();
  }

  // Combined feed sorted by date
  const combinedFeed = useMemo(() => {
    type FeedItem = { date: string; source: "trakt" | "letterboxd"; data: TraktHistoryItem | LetterboxdEntry };
    const items: FeedItem[] = [
      ...traktHistory.map(h => ({ date: h.watched_at, source: "trakt" as const, data: h })),
      ...lbEntries.map(e => ({ date: e.watchedDate, source: "letterboxd" as const, data: e })),
    ];
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);
  }, [traktHistory, lbEntries]);

  const traktEpisodes = traktHistory.filter(h => h.type === "episode");
  const traktMovies   = traktHistory.filter(h => h.type === "movie");

  function showMsg(msg: string, isError = false) {
    setToast(msg);
    setTimeout(() => setToast(""), isError ? 8000 : 2500);
  }

  async function doSearch(q: string) {
    if (!q.trim() || !traktClientId) return;
    setSearchLoading(true);
    setSearchResults([]);
    try {
      const res = await fetch(`/api/trakt?type=search&query=${encodeURIComponent(q)}&clientId=${encodeURIComponent(traktClientId)}`);
      if (res.ok) setSearchResults(await res.json());
    } catch {}
    setSearchLoading(false);
  }

  async function startDeviceAuth() {
    if (!traktClientId) { showMsg("Enter your Trakt Client ID in setup first"); return; }
    setShowAuth(true);
    setDeviceCode(null);
    try {
      const res = await fetch("/api/trakt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "device_init", clientId: traktClientId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setShowAuth(false);
        setAuthError(`Trakt error: ${JSON.stringify(data)}`);
        return;
      }
      if (!data.device_code || !data.user_code) {
        setShowAuth(false);
        setAuthError(`Unexpected Trakt response: ${JSON.stringify(data)}`);
        return;
      }
      setAuthError("");
      setDeviceCode(data);
      setAuthPolling(true);
      pollForToken(data.device_code, data.interval ?? 5);
    } catch (e) {
      setShowAuth(false);
      setAuthError(`Network error: ${String(e)}`);
    }
  }

  async function pollForToken(dc: string, interval: number) {
    if (!traktClientSecret) { showMsg("Client Secret required for writing. Add it in Setup."); setAuthPolling(false); return; }
    const poll = async (): Promise<void> => {
      const res = await fetch("/api/trakt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "device_poll", clientId: traktClientId, clientSecret: traktClientSecret, deviceCode: dc }),
      });
      const data = await res.json();
      if (data.pending) {
        await new Promise(r => setTimeout(r, interval * 1000));
        return poll();
      }
      if (data.access_token) {
        setTraktAccessToken(data.access_token);
        if (userId) {
          await supabase.from("profiles").update({ trakt_access_token: data.access_token }).eq("id", userId);
        }
        setAuthPolling(false);
        setShowAuth(false);
        showMsg("✓ Trakt connected — you can now add to history!");
      } else {
        setAuthPolling(false);
        showMsg("Auth failed or expired. Try again.");
      }
    };
    await poll();
  }

  async function addToHistory(result: SearchResult) {
    if (!traktAccessToken) { showMsg("Connect Trakt first (click the 🔗 button)"); return; }
    const isMovie = result.type === "movie";
    const item = isMovie ? result.movie : result.show;
    if (!item) return;
    const key = `${result.type}-${item.ids.trakt}`;
    setAddingItem(key);
    try {
      const res = await fetch("/api/trakt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_history",
          clientId: traktClientId,
          accessToken: traktAccessToken,
          items: [{ type: result.type, ids: item.ids }],
        }),
      });
      if (res.ok) {
        setAddedItems(prev => new Set([...prev, key]));
        showMsg(`✓ Added "${item.title}" to Trakt history`);
        setTimeout(() => fetchTrakt(), 2000); // refresh history
      } else {
        showMsg("Failed to add — check your connection");
      }
    } catch {
      showMsg("Network error");
    }
    setAddingItem(null);
  }

  if (loading) return (
    <div style={{ minHeight:"60vh", display:"flex", alignItems:"center", justifyContent:"center", background:V.bg }}>
      <div style={{ width:28, height:28, border:`2.5px solid ${V.accent}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.7s linear infinite" }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:V.bg, color:V.text, fontFamily:"system-ui,sans-serif" }}>

      {/* Header */}
      <div style={{ padding:"22px 24px 0", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800 }}>
            <span style={{ color:V.accent }}>🎬</span> Entertainment
          </div>
          <div style={{ fontSize:13, color:V.faint, marginTop:2 }}>
            {traktUsername && <span style={{ marginRight:12 }}>📺 Trakt: @{traktUsername}</span>}
            {lbUsername && <span>🎞 Letterboxd: @{lbUsername}</span>}
          </div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {(traktUsername || lbUsername) && (
            <button style={btn} onClick={() => { fetchTrakt(); fetchLetterboxd(); }}>↻ Refresh</button>
          )}
          {traktClientId && !traktAccessToken && (
            <button style={{ ...btn, borderColor: V.accent + "66", color: V.accent }} onClick={startDeviceAuth}>🔗 Connect Trakt</button>
          )}
          {traktClientId && traktAccessToken && (
            <button style={{ ...btn, color:"#16a34a" }} onClick={() => setShowSearch(v => !v)}>🔍 Search & Add</button>
          )}
          <button style={btn} onClick={() => setShowSetup(v => !v)}>⚙ Setup</button>
        </div>
      </div>

      {/* Persistent auth error */}
      {authError && (
        <div style={{ margin:"12px 24px 0", padding:"12px 16px", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:12, color:"#ef4444", fontSize:13, display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
          <div style={{ wordBreak:"break-all", lineHeight:1.6 }}><strong>Auth error:</strong> {authError}</div>
          <button onClick={() => setAuthError("")} style={{ background:"none", border:"none", color:"#ef4444", cursor:"pointer", flexShrink:0, fontSize:16 }}>✕</button>
        </div>
      )}

      {/* Setup panel */}
      {showSetup && (
        <div style={{ margin:"12px 24px 0", background:V.card, border:`1px solid ${V.accent}44`, borderRadius:14, padding:20 }}>
          <div style={{ fontSize:14, fontWeight:800, marginBottom:4 }}>Connect your accounts</div>
          <div style={{ fontSize:12, color:V.faint, marginBottom:16 }}>
            Trakt requires a free Client ID from{" "}
            <a href="https://trakt.tv/oauth/applications" target="_blank" rel="noreferrer" style={{ color:V.accent }}>trakt.tv/oauth/applications</a>.
            Letterboxd just needs your username.
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.faint, textTransform:"uppercase" }}>
              Trakt username
              <input style={inp} value={traktUsername} onChange={e => setTraktUsername(e.target.value)} placeholder="your-trakt-username" />
            </label>
            <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.faint, textTransform:"uppercase" }}>
              Trakt Client ID
              <input style={inp} value={traktClientId} onChange={e => setTraktClientId(e.target.value)} placeholder="paste Client ID from Trakt app" type="password" />
            </label>
            <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.faint, textTransform:"uppercase" }}>
              Trakt Client Secret <span style={{ fontWeight:400, textTransform:"none", color:V.faint }}>(needed to write history)</span>
              <input style={inp} value={traktClientSecret} onChange={e => setTraktClientSecret(e.target.value)} placeholder="paste Client Secret from Trakt app" type="password" />
            </label>
            <label style={{ display:"flex", flexDirection:"column", gap:5, fontSize:12, fontWeight:700, color:V.faint, textTransform:"uppercase" }}>
              Letterboxd username
              <input style={inp} value={lbUsername} onChange={e => setLbUsername(e.target.value)} placeholder="your-letterboxd-username" />
            </label>
            <div style={{ display:"flex", alignItems:"flex-end", gap:8 }}>
              <button style={btnP} onClick={saveConfig} disabled={savingConfig}>{savingConfig ? "Saving…" : "Save"}</button>
              {(traktUsername || lbUsername) && <button style={btn} onClick={() => setShowSetup(false)}>Cancel</button>}
            </div>
          </div>
          {traktUsername && traktClientId && (
            <div style={{ fontSize:11, color:V.faint, marginTop:10 }}>
              💡 In your Trakt app settings, add <code style={{ background:isDark?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.06)", padding:"1px 5px", borderRadius:4 }}>https://mylife-in.vercel.app</code> to JavaScript CORS origins (optional but recommended).
            </div>
          )}
        </div>
      )}

      {/* Stats bar */}
      {traktStats && (
        <div style={{ margin:"12px 24px 0", display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))", gap:10 }}>
          {[
            { label:"Movies watched", value: traktStats.movies.watched, icon:"🎬" },
            { label:"Movie plays",    value: traktStats.movies.plays,   icon:"🔁" },
            { label:"Shows watched",  value: traktStats.shows.watched,  icon:"📺" },
            { label:"Episodes",       value: traktStats.episodes.watched,icon:"🎞" },
            { label:"Ratings given",  value: traktStats.ratings.total,  icon:"⭐" },
          ].map(s => (
            <div key={s.label} style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:12, padding:"10px 14px" }}>
              <div style={{ fontSize:18, marginBottom:4 }}>{s.icon}</div>
              <div style={{ fontSize:20, fontWeight:800, color:V.text }}>{s.value?.toLocaleString() ?? "—"}</div>
              <div style={{ fontSize:10, fontWeight:700, color:V.faint, textTransform:"uppercase", letterSpacing:"0.07em", marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ padding:"14px 24px 0", display:"flex", gap:4, borderBottom:`1px solid ${V.border}` }}>
        {([["feed","🌊 Feed"],["movies","🎬 Movies"],["tv","📺 TV"],["stats","📊 Stats"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ padding:"8px 16px", borderRadius:"10px 10px 0 0", border:`1px solid ${tab===key?V.border:"transparent"}`, borderBottom:"none", background:tab===key?V.card:"transparent", color:tab===key?V.text:V.muted, cursor:"pointer", fontSize:13, fontWeight:600 }}>
            {label}
          </button>
        ))}
      </div>

      {/* No accounts */}
      {!traktUsername && !lbUsername && !showSetup && (
        <div style={{ padding:"60px 24px", textAlign:"center" }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🎬</div>
          <div style={{ fontSize:16, fontWeight:600, color:V.muted }}>Connect your accounts to get started</div>
          <div style={{ fontSize:13, color:V.faint, marginTop:6, marginBottom:16 }}>Trakt.tv for TV shows · Letterboxd for movies</div>
          <button style={btnP} onClick={() => setShowSetup(true)}>⚙ Set up accounts</button>
        </div>
      )}

      {/* Feed tab */}
      {tab === "feed" && (traktUsername || lbUsername) && (
        <div style={{ padding:"16px 24px" }}>
          {(traktLoading || lbLoading) && (
            <div style={{ textAlign:"center", color:V.faint, padding:20, fontSize:13 }}>Loading your watch history…</div>
          )}
          {traktError && <div style={{ padding:"10px 14px", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:10, color:"#ef4444", fontSize:13, marginBottom:12 }}>Trakt: {traktError}</div>}
          {lbError    && <div style={{ padding:"10px 14px", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:10, color:"#ef4444", fontSize:13, marginBottom:12 }}>{lbError}</div>}
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {combinedFeed.map((item, i) => {
              if (item.source === "letterboxd") {
                const e = item.data as LetterboxdEntry;
                return (
                  <a key={`lb-${i}`} href={e.link} target="_blank" rel="noreferrer"
                    style={{ display:"flex", gap:12, alignItems:"flex-start", background:V.card, border:`1px solid ${V.border}`, borderRadius:12, padding:"12px 14px", textDecoration:"none", color:V.text }}>
                    {e.posterUrl
                      ? <img src={e.posterUrl} alt="" style={{ width:36, height:54, objectFit:"cover", borderRadius:4, flexShrink:0 }} />
                      : <div style={{ width:36, height:54, background:"rgba(139,92,246,0.1)", borderRadius:4, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>🎞</div>
                    }
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:3 }}>
                        <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:999, background:"rgba(139,92,246,0.12)", color:"#8b5cf6" }}>Letterboxd</span>
                        {e.rewatch && <span style={{ fontSize:10, color:V.faint }}>↻ Rewatch</span>}
                        <span style={{ fontSize:11, color:V.faint, marginLeft:"auto" }}>{timeAgo(e.watchedDate)}</span>
                      </div>
                      <div style={{ fontSize:14, fontWeight:700 }}>{e.title} {e.year && <span style={{ fontWeight:400, color:V.faint }}>({e.year})</span>}</div>
                      <div style={{ marginTop:3 }}><Stars rating={e.rating} /></div>
                    </div>
                  </a>
                );
              }
              const h = item.data as TraktHistoryItem;
              const isMovie = h.type === "movie";
              const title = isMovie ? h.movie?.title : h.show?.title;
              const year  = isMovie ? h.movie?.year  : h.show?.year;
              const sub   = !isMovie && h.episode ? `S${String(h.episode.season).padStart(2,"0")}E${String(h.episode.number).padStart(2,"0")} · ${h.episode.title}` : null;
              const imdbId = isMovie ? h.movie?.ids.imdb : h.show?.ids.imdb;
              const link = imdbId ? `https://www.imdb.com/title/${imdbId}` : "#";
              return (
                <a key={`trakt-${h.id}`} href={link} target="_blank" rel="noreferrer"
                  style={{ display:"flex", gap:12, alignItems:"flex-start", background:V.card, border:`1px solid ${V.border}`, borderRadius:12, padding:"12px 14px", textDecoration:"none", color:V.text }}>
                  <div style={{ width:36, height:54, background:isMovie?"rgba(59,130,246,0.1)":"rgba(16,185,129,0.1)", borderRadius:4, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>
                    {isMovie ? "🎬" : "📺"}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:3 }}>
                      <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:999, background:isMovie?"rgba(59,130,246,0.12)":"rgba(16,185,129,0.12)", color:isMovie?"#3b82f6":"#10b981" }}>
                        {isMovie ? "Movie" : "TV"}
                      </span>
                      <span style={{ fontSize:11, color:V.faint, marginLeft:"auto" }}>{timeAgo(h.watched_at)}</span>
                    </div>
                    <div style={{ fontSize:14, fontWeight:700 }}>{title} {year && <span style={{ fontWeight:400, color:V.faint }}>({year})</span>}</div>
                    {sub && <div style={{ fontSize:12, color:V.muted, marginTop:2 }}>{sub}</div>}
                  </div>
                </a>
              );
            })}
            {combinedFeed.length === 0 && !traktLoading && !lbLoading && (
              <div style={{ textAlign:"center", color:V.faint, padding:40, fontSize:13 }}>No recent activity found.</div>
            )}
          </div>
        </div>
      )}

      {/* Movies tab — Letterboxd */}
      {tab === "movies" && (
        <div style={{ padding:"16px 24px" }}>
          {!lbUsername && (
            <div style={{ textAlign:"center", color:V.faint, padding:40 }}>
              <div style={{ fontSize:32, marginBottom:8 }}>🎞</div>
              <div>Connect your Letterboxd account to see movies.</div>
              <button style={{ ...btnP, marginTop:12 }} onClick={() => setShowSetup(true)}>Set up Letterboxd</button>
            </div>
          )}
          {lbLoading && <div style={{ textAlign:"center", color:V.faint, padding:20 }}>Loading Letterboxd diary…</div>}
          {lbEntries.length > 0 && (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:12 }}>
              {lbEntries.map((e, i) => (
                <a key={i} href={e.link} target="_blank" rel="noreferrer" style={{ textDecoration:"none", color:V.text }}>
                  <div style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:12, overflow:"hidden" }}>
                    {e.posterUrl
                      ? <img src={e.posterUrl} alt="" style={{ width:"100%", height:220, objectFit:"cover", display:"block" }} />
                      : <div style={{ width:"100%", height:220, background:"rgba(139,92,246,0.08)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:36 }}>🎞</div>
                    }
                    <div style={{ padding:"8px 10px 10px" }}>
                      <div style={{ fontSize:13, fontWeight:700, lineHeight:1.3 }}>{e.title}</div>
                      {e.year && <div style={{ fontSize:11, color:V.faint }}>{e.year}</div>}
                      <div style={{ marginTop:4 }}><Stars rating={e.rating} /></div>
                      <div style={{ fontSize:10, color:V.faint, marginTop:3 }}>{timeAgo(e.watchedDate)}{e.rewatch ? " · ↻" : ""}</div>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TV tab — Trakt episodes */}
      {tab === "tv" && (
        <div style={{ padding:"16px 24px" }}>
          {!traktUsername && (
            <div style={{ textAlign:"center", color:V.faint, padding:40 }}>
              <div style={{ fontSize:32, marginBottom:8 }}>📺</div>
              <div>Connect your Trakt account to see TV history.</div>
              <button style={{ ...btnP, marginTop:12 }} onClick={() => setShowSetup(true)}>Set up Trakt</button>
            </div>
          )}
          {traktLoading && <div style={{ textAlign:"center", color:V.faint, padding:20 }}>Loading Trakt history…</div>}
          {traktEpisodes.length > 0 && (
            <div style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:14, overflow:"hidden" }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto", gap:8, padding:"10px 16px", background:isDark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.02)", fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.08em", color:V.faint }}>
                <div>Show · Episode</div><div>Episode</div><div>When</div>
              </div>
              {traktEpisodes.slice(0, 10).map(h => (
                <div key={h.id} style={{ display:"grid", gridTemplateColumns:"1fr auto auto", gap:8, padding:"11px 16px", borderTop:`1px solid ${V.border}`, alignItems:"center" }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700 }}>{h.show?.title}</div>
                    <div style={{ fontSize:11, color:V.muted }}>{h.episode?.title || ""}</div>
                  </div>
                  <div style={{ fontSize:12, color:V.faint, textAlign:"right" }}>
                    {h.episode ? `S${String(h.episode.season).padStart(2,"0")}E${String(h.episode.number).padStart(2,"0")}` : ""}
                  </div>
                  <div style={{ fontSize:12, color:V.faint, textAlign:"right", minWidth:70 }}>{timeAgo(h.watched_at)}</div>
                </div>
              ))}
            </div>
          )}
          {traktMovies.length > 0 && (
            <>
              <div style={{ fontSize:11, fontWeight:800, color:V.faint, textTransform:"uppercase", letterSpacing:"0.08em", margin:"16px 0 8px" }}>Movies via Trakt</div>
              <div style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:14, overflow:"hidden" }}>
                {traktMovies.slice(0, 10).map(h => (
                  <div key={h.id} style={{ display:"flex", justifyContent:"space-between", padding:"11px 16px", borderBottom:`1px solid ${V.border}`, alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700 }}>{h.movie?.title}</div>
                      <div style={{ fontSize:11, color:V.faint }}>{h.movie?.year}</div>
                    </div>
                    <div style={{ fontSize:12, color:V.faint }}>{timeAgo(h.watched_at)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Stats tab */}
      {tab === "stats" && (
        <div style={{ padding:"16px 24px" }}>
          {!traktStats && !lbEntries.length && (
            <div style={{ textAlign:"center", color:V.faint, padding:40 }}>Connect accounts to see stats.</div>
          )}
          {traktStats && (
            <div style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:14, padding:20, marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:800, color:V.faint, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:14 }}>📺 Trakt stats</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))", gap:12 }}>
                {[
                  ["Movies watched", traktStats.movies.watched],
                  ["Movie plays",    traktStats.movies.plays],
                  ["Shows watched",  traktStats.shows.watched],
                  ["Episodes",       traktStats.episodes.watched],
                  ["Episode plays",  traktStats.episodes.plays],
                  ["Ratings",        traktStats.ratings.total],
                ].map(([label, val]) => (
                  <div key={String(label)}>
                    <div style={{ fontSize:22, fontWeight:800, color:V.accent }}>{Number(val).toLocaleString()}</div>
                    <div style={{ fontSize:11, color:V.faint, marginTop:2 }}>{String(label)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {lbEntries.length > 0 && (
            <div style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:14, padding:20 }}>
              <div style={{ fontSize:11, fontWeight:800, color:V.faint, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:14 }}>🎞 Letterboxd recent</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))", gap:12 }}>
                <div><div style={{ fontSize:22, fontWeight:800, color:"#8b5cf6" }}>{lbEntries.length}</div><div style={{ fontSize:11, color:V.faint }}>Recent diary entries</div></div>
                <div><div style={{ fontSize:22, fontWeight:800, color:"#8b5cf6" }}>{lbEntries.filter(e => e.rating !== null).length}</div><div style={{ fontSize:11, color:V.faint }}>Rated</div></div>
                <div><div style={{ fontSize:22, fontWeight:800, color:"#8b5cf6" }}>{lbEntries.filter(e => e.rewatch).length}</div><div style={{ fontSize:11, color:V.faint }}>Rewatches</div></div>
                <div>
                  <div style={{ fontSize:22, fontWeight:800, color:"#8b5cf6" }}>
                    {lbEntries.filter(e => e.rating).length
                      ? (lbEntries.filter(e => e.rating).reduce((s, e) => s + (e.rating ?? 0), 0) / lbEntries.filter(e => e.rating).length).toFixed(1)
                      : "—"}
                  </div>
                  <div style={{ fontSize:11, color:V.faint }}>Avg rating</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Device Auth Modal */}
      {showAuth && deviceCode && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
          onClick={() => { if (!authPolling) setShowAuth(false); }}>
          <div style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:18, padding:28, width:"min(440px,100%)", textAlign:"center" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:36, marginBottom:12 }}>🔐</div>
            <div style={{ fontSize:18, fontWeight:800, marginBottom:8 }}>Connect Trakt</div>
            <div style={{ fontSize:13, color:V.muted, marginBottom:20 }}>Go to this URL and enter the code:</div>
            <a href={deviceCode.verification_url} target="_blank" rel="noreferrer"
              style={{ display:"block", fontSize:14, fontWeight:700, color:V.accent, marginBottom:12 }}>{deviceCode.verification_url}</a>
            <div style={{ fontSize:40, fontWeight:900, letterSpacing:8, color:V.text, background:V.input, borderRadius:12, padding:"14px 20px", marginBottom:20, fontFamily:"monospace" }}>
              {deviceCode.user_code}
            </div>
            {authPolling
              ? <div style={{ fontSize:13, color:V.faint }}>⏳ Waiting for authorization…</div>
              : <button style={btn} onClick={() => setShowAuth(false)}>Cancel</button>
            }
          </div>
        </div>
      )}

      {/* Search Modal */}
      {showSearch && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:50, display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"60px 16px 16px" }}
          onClick={() => setShowSearch(false)}>
          <div style={{ background:V.card, border:`1px solid ${V.border}`, borderRadius:18, width:"min(580px,100%)", maxHeight:"80vh", overflow:"auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding:"18px 20px", borderBottom:`1px solid ${V.border}`, display:"flex", gap:10 }}>
              <input style={{ ...inp, flex:1, borderRadius:999 }}
                placeholder="Search movies and TV shows…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && doSearch(searchQuery)}
                autoFocus
              />
              <button style={btnP} onClick={() => doSearch(searchQuery)} disabled={searchLoading}>
                {searchLoading ? "…" : "Search"}
              </button>
            </div>
            <div>
              {searchResults.length === 0 && !searchLoading && (
                <div style={{ padding:24, textAlign:"center", color:V.faint, fontSize:13 }}>
                  {searchQuery ? "No results" : "Start typing to search"}
                </div>
              )}
              {searchResults.map((r, i) => {
                const isMovie = r.type === "movie";
                const item = isMovie ? r.movie : r.show;
                if (!item) return null;
                const key = `${r.type}-${item.ids.trakt}`;
                const added = addedItems.has(key);
                const adding = addingItem === key;
                return (
                  <div key={i} style={{ padding:"14px 20px", borderBottom:`1px solid ${V.border}`, display:"flex", gap:14, alignItems:"flex-start" }}>
                    <div style={{ width:36, height:36, borderRadius:8, background:isMovie?"rgba(59,130,246,0.12)":"rgba(16,185,129,0.12)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
                      {isMovie ? "🎬" : "📺"}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:700 }}>{item.title} <span style={{ fontWeight:400, color:V.faint }}>({item.year})</span></div>
                      {item.overview && <div style={{ fontSize:12, color:V.muted, marginTop:3, lineClamp:2, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" as const }}>{item.overview}</div>}
                      <div style={{ fontSize:11, color:V.faint, marginTop:4 }}>
                        <span style={{ padding:"1px 6px", borderRadius:999, background:isMovie?"rgba(59,130,246,0.1)":"rgba(16,185,129,0.1)", color:isMovie?"#3b82f6":"#10b981" }}>
                          {isMovie ? "Movie" : "TV Show"}
                        </span>
                        {item.ids.imdb && (
                          <a href={`https://www.imdb.com/title/${item.ids.imdb}`} target="_blank" rel="noreferrer" style={{ marginLeft:8, color:V.accent }}>IMDb ↗</a>
                        )}
                      </div>
                    </div>
                    <button
                      style={{ ...btn, padding:"6px 12px", fontSize:12, flexShrink:0,
                        background: added ? "#16a34a" : btnP.background,
                        border: "none", color:"#fff" }}
                      onClick={() => !added && addToHistory(r)}
                      disabled={adding || added}
                    >
                      {adding ? "…" : added ? "✓ Added" : "＋ Add"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div onClick={() => setToast("")} style={{ position:"fixed", bottom:20, right:16, maxWidth:360, background:isDark?"#1a3a2a":"#f0fdf4", color:"#16a34a", border:"1px solid rgba(22,163,74,0.3)", padding:"12px 18px", borderRadius:12, fontSize:13, fontWeight:700, zIndex:200, cursor:"pointer", wordBreak:"break-all", lineHeight:1.5 }}>
          {toast} <span style={{ opacity:0.5, fontSize:11, marginLeft:6 }}>✕</span>
        </div>
      )}
    </div>
  );
}