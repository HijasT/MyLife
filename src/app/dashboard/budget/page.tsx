import ComingSoon from "@/components/ComingSoon";

export default function BudgetPage() {
  return (
    <ComingSoon
      icon="📊"
      title="Budget"
      description="Set monthly income and category limits. Expense Tracker feeds actual spending in real time — see exactly where you stand."
      color="#1D9E75"
      phase={3}
      features={[
        "Monthly income and category budget limits",
        "Spend vs budget progress bars (live from Expense Tracker)",
        "Alert when you hit 80% of any category",
        "Savings rate calculated automatically",
        "Year-over-year budget comparison",
        "Finance Hub: savings feeds into net worth",
      ]}
    />
  );
}
