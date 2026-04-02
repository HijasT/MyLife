"use client";

import { useMemo } from "react";

type PerfumeStatus = "wardrobe" | "wishlist" | "archive";

type Bottle = {
  id: string;
  status: string;
};

type Perfume = {
  id: string;
  brand: string;
  model: string;
  status: PerfumeStatus;
  ratingStars?: number;
  bottles?: Bottle[];
};

type Purchase = {
  perfumeId: string;
  price: number;
  date: string;
};

function safeNum(v: any) {
  return Number(v) || 0;
}

/**
 * Wardrobe = at least one active bottle
 */
function hasWardrobeBottle(item?: Perfume | null) {
  if (!item?.bottles?.length) return false;

  return item.bottles.some(
    (b) =>
      b.status === "Wardrobe" ||
      b.status === "In collection"
  );
}

/**
 * Archive = at least one archived bottle
 */
function hasArchiveBottle(item?: Perfume | null) {
  if (!item?.bottles?.length) return false;

  return item.bottles.some(
    (b) => b.status === "Archive"
  );
}

export default function Page({
  items,
  purchases,
  activeTab,
  search,
  sortBy,
}: {
  items: Perfume[];
  purchases: Purchase[];
  activeTab: PerfumeStatus;
  search: string;
  sortBy: string;
}) {

  /**
   * ===== TAB ITEMS =====
   */
  const tabItems = useMemo(() => {
    let list: Perfume[] = [];

    if (activeTab === "wardrobe") {
      list = items.filter((item) => hasWardrobeBottle(item));
    } else if (activeTab === "archive") {
      list = items.filter((item) => hasArchiveBottle(item));
    } else if (activeTab === "wishlist") {
      list = items.filter((item) => item.status === "wishlist");
    } else {
      return [];
    }

    // Search filter
    if (search?.trim()) {
      const q = search.toLowerCase();

      list = list.filter((item) =>
        `${item.brand ?? ""} ${item.model ?? ""}`
          .toLowerCase()
          .includes(q)
      );
    }

    // Sorting
    return [...list].sort((a, b) => {
      if (sortBy === "brand_asc") {
        return `${a.brand ?? ""} ${a.model ?? ""}`.localeCompare(
          `${b.brand ?? ""} ${b.model ?? ""}`
        );
      }

      if (sortBy === "brand_desc") {
        return `${b.brand ?? ""} ${b.model ?? ""}`.localeCompare(
          `${a.brand ?? ""} ${a.model ?? ""}`
        );
      }

      if (sortBy === "rating_desc") {
        return (b.ratingStars ?? 0) - (a.ratingStars ?? 0);
      }

      if (sortBy === "rating_asc") {
        return (a.ratingStars ?? 0) - (b.ratingStars ?? 0);
      }

      return 0;
    });
  }, [items, activeTab, search, sortBy]);

  /**
   * ===== TAB STATS =====
   */
  const tabStats = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const cutoff = thirtyDaysAgo.toISOString().slice(0, 10);

    const calc = (status: PerfumeStatus) => {
      let list: Perfume[] = [];

      if (status === "wardrobe") {
        list = items.filter((item) => hasWardrobeBottle(item));
      } else if (status === "archive") {
        list = items.filter((item) => hasArchiveBottle(item));
      } else {
        list = items.filter((item) => item.status === status);
      }

      const ids = new Set(list.map((x) => x.id));

      const paid = purchases.filter(
        (p) => ids.has(p.perfumeId) && safeNum(p.price) > 0
      );

      const total = paid.reduce((s, p) => s + safeNum(p.price), 0);
      const avg = paid.length ? total / paid.length : 0;

      return {
        count: list.length,
        total,
        avg,
      };
    };

    const newIds = new Set(
      purchases
        .filter(
          (p) =>
            p.date >= cutoff &&
            safeNum(p.price) > 0
        )
        .map((p) => p.perfumeId)
    );

    /**
     * FIXED: No fake Perfume casting
     */
    const wardrobeValue = purchases
      .filter((p) => {
        const perfume = items.find(
          (x) => x.id === p.perfumeId
        );

        if (!perfume) return false;

        return hasWardrobeBottle(perfume);
      })
      .reduce((s, p) => s + safeNum(p.price), 0);

    return {
      wardrobe: calc("wardrobe"),
      wishlist: calc("wishlist"),
      archive: calc("archive"),
      newIds,
      wardrobeValue,
    };
  }, [items, purchases]);

  return (
    <div>
      {/* Replace with your real UI */}
      <pre>
        {JSON.stringify(
          { tabItems, tabStats },
          null,
          2
        )}
      </pre>
    </div>
  );
}