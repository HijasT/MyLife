import ComingSoon from "@/components/ComingSoon";

export default function PortfolioPage() {
  return (
    <ComingSoon
      icon="📈"
      title="Portfolio"
      description="Track your stocks, gold and silver with live prices. Portfolio value flows into the Finance Hub to complete your net worth picture."
      color="#378ADD"
      phase={4}
      features={[
        "Holdings table — asset, quantity, buy price, buy date",
        "Live prices via free API (Yahoo Finance + Metals-API)",
        "P&L per holding and overall",
        "Allocation pie chart",
        "Portfolio value as % of net worth (from Finance Hub)",
        "Historical performance chart",
      ]}
    />
  );
}
