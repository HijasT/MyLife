import ComingSoon from "@/components/ComingSoon";

export default function PerfumesPage() {
  return (
    <ComingSoon
      icon="🪔"
      title="Perfume Collection"
      description="Your Aromatica tracker — beautifully rebuilt. Browse your collection, rate fragrances, plan your next purchase."
      color="#D85A30"
      phase={5}
      features={[
        "Full collection view with filters by brand, season, gender",
        "Ratings, sillage, longevity, and notes per fragrance",
        "Wishlist and purchase priority tracking",
        "Got compliments? log it",
        "Clone / similar fragrance linking",
        "Migrate existing Excel data automatically",
      ]}
    />
  );
}
