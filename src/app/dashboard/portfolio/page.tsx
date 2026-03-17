"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Item = {
  id: string;
  name: string;
  symbol: string;
  live_price_symbol?: string;
  current_price?: number;
};

const LIVE_SOURCES = [
  { label: "Gold (XAU)", value: "XAU" },
  { label: "Silver (XAG)", value: "XAG" },
  { label: "DFM Stock", value: "DFM" },
];

export default function PortfolioPage() {
  const supabase = createClient();

  const [items, setItems] = useState<Item[]>([]);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [activeTab, setActiveTab] = useState<"portfolio" | "live">("portfolio");

  const [form, setForm] = useState({
    name: "",
    symbol: "",
    live_price_symbol: "",
  });

  useEffect(() => {
    fetchItems();
  }, []);

  async function fetchItems() {
    const { data } = await supabase.from("portfolio_items").select("*");
    setItems(data || []);
  }

  async function addItem() {
    await supabase.from("portfolio_items").insert([
      {
        name: form.name,
        symbol: form.symbol,
        live_price_symbol: form.live_price_symbol || null,
      },
    ]);

    setForm({ name: "", symbol: "", live_price_symbol: "" });
    fetchItems();
  }

  return (
    <div className="p-4 space-y-4">
      {/* TAB SWITCH */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab("portfolio")}
          className={activeTab === "portfolio" ? "active" : ""}
        >
          Portfolio
        </button>
        <button
          onClick={() => setActiveTab("live")}
          className={activeTab === "live" ? "active" : ""}
        >
          Live Prices
        </button>
      </div>

      {/* PORTFOLIO TAB */}
      {activeTab === "portfolio" && (
        <>
          {/* ADD ASSET */}
          <div className="card space-y-2">
            <input
              placeholder="Asset Name"
              value={form.name}
              onChange={(e) =>
                setForm({ ...form, name: e.target.value })
              }
            />
            <input
              placeholder="Symbol"
              value={form.symbol}
              onChange={(e) =>
                setForm({ ...form, symbol: e.target.value })
              }
            />

            {/* FIX: LIVE PRICE SELECT */}
            <select
              value={form.live_price_symbol}
              onChange={(e) =>
                setForm({
                  ...form,
                  live_price_symbol: e.target.value,
                })
              }
            >
              <option value="">No live price</option>
              {LIVE_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            <button onClick={addItem}>Add Asset</button>
          </div>

          {/* LIST */}
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="card cursor-pointer"
                onClick={() => setSelectedItem(item)}
              >
                <p>{item.name}</p>
                <p className="text-sm text-gray-500">{item.symbol}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* LIVE TAB */}
      {activeTab === "live" && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-2">
            Live Price Chart
          </h2>

          {selectedItem?.live_price_symbol ? (
            <div>
              {/* Replace with your chart */}
              <p>
                Showing chart for:{" "}
                {selectedItem.live_price_symbol}
              </p>
            </div>
          ) : (
            <p>No live price source linked to this asset</p>
          )}
        </div>
      )}
    </div>
  );
}