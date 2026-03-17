"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function PortfolioItemPage() {
  const { id } = useParams();
  const supabase = createClient();

  const [item, setItem] = useState<any>(null);
  const [purchases, setPurchases] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const { data: itemData } = await supabase
      .from("portfolio_items")
      .select("*")
      .eq("id", id)
      .single();

    const { data: purchaseData } = await supabase
      .from("portfolio_purchases")
      .select("*")
      .eq("item_id", id);

    setItem(itemData);
    setPurchases(purchaseData || []);
  }

  if (!item) return <p>Loading...</p>;

  // FIXED: INVESTED CALCULATION
  const invested =
    purchases
      .filter((p) => p.transaction_type === "buy")
      .reduce((sum, p) => sum + p.total_paid, 0) -
    purchases
      .filter((p) => p.transaction_type === "sell")
      .reduce((sum, p) => sum + p.total_paid, 0);

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">{item.name}</h1>

      <div className="card">
        <div className="flex justify-between">
          <span>Invested</span>
          <span>{invested.toFixed(2)}</span>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-2">Transactions</h2>

        {purchases.map((p) => (
          <div key={p.id} className="flex justify-between text-sm">
            <span>{p.transaction_type}</span>
            <span>{p.total_paid}</span>
          </div>
        ))}
      </div>
    </div>
  );
}