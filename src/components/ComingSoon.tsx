import Link from "next/link";

interface ComingSoonProps {
  icon: string;
  title: string;
  description: string;
  color: string;
  features: string[];
  phase: number;
}

export default function ComingSoon({ icon, title, description, color, features, phase }: ComingSoonProps) {
  return (
    <div className="p-8 max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[70vh] text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-6"
        style={{ background: `${color}18`, border: `1px solid ${color}35` }}
      >
        {icon}
      </div>

      <div
        className="text-xs font-bold tracking-widest uppercase mb-3 px-3 py-1 rounded-full"
        style={{ background: `${color}18`, color }}
      >
        Phase {phase} — Coming soon
      </div>

      <h1 className="font-display text-3xl mb-3" style={{ color: "var(--text-primary)" }}>
        {title}
      </h1>
      <p className="text-sm mb-8 max-w-sm" style={{ color: "var(--text-muted)" }}>
        {description}
      </p>

      <div className="w-full rounded-2xl border p-6 text-left mb-8"
        style={{ background: "var(--card-bg)", borderColor: "var(--card-border)" }}>
        <p className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: "var(--text-muted)" }}>
          What&apos;s included
        </p>
        <div className="flex flex-col gap-3">
          {features.map((f) => (
            <div key={f} className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{f}</span>
            </div>
          ))}
        </div>
      </div>

      <Link href="/dashboard" className="text-sm transition-colors"
        style={{ color: "var(--text-muted)" }}
        onMouseOver={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
        onMouseOut={(e) => (e.currentTarget.style.color = "var(--text-muted)")}>
        ← Back to overview
      </Link>
    </div>
  );
}
