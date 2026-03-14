import ComingSoon from "@/components/ComingSoon";

export default function ExpensesPage() {
  return (
    <ComingSoon
      icon="💳"
      title="Expense Tracker"
      description="Log daily spending, tag by category, and let the Finance Hub do the maths across your budget and portfolio."
      color="#F5A623"
      phase={2}
      features={[
        "Quick-add form — amount, category, merchant, note",
        "Monthly spending breakdown by category",
        "Feeds directly into Budget module for spend vs limit bars",
        "Search and filter past transactions",
        "Export to Excel or CSV",
        "Shared Finance Ledger — net worth updates automatically",
      ]}
    />
  );
}
