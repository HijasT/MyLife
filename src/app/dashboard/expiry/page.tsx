import ComingSoon from "@/components/ComingSoon";

export default function ExpiryPage() {
  return (
    <ComingSoon
      icon="📅"
      title="Expiry Tracker"
      description="Never throw away something good or keep something past its date. Color-coded urgency with push notifications."
      color="#8B5CF6"
      phase={5}
      features={[
        "Add products with name, category, and expiry date",
        "Color-coded urgency — red, amber, green",
        "Push notifications before items expire",
        "Filter by category (food, medicine, cosmetics, etc.)",
        "Bulk import from photo of receipt (future)",
        "Monthly expiry calendar view",
      ]}
    />
  );
}
