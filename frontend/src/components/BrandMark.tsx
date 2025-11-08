import { ShieldCheck } from "lucide-react";

interface BrandMarkProps {
  subtitle?: string;
  variant?: "dark" | "light";
  className?: string;
}

export const BrandMark = ({
  subtitle = "Digital Forensics Platform",
  variant = "dark",
  className = "",
}: BrandMarkProps) => {
  const isLight = variant === "light";

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${
          isLight ? "border-white/40 bg-white/10 text-white" : "border-violet-500/30 bg-slate-900 text-violet-200"
        }`}
      >
        <ShieldCheck className="h-5 w-5" />
      </div>
      <div>
        <p className={`text-base font-semibold tracking-tight ${isLight ? "text-white" : "text-slate-100"}`}>dataMortem</p>
        <p
          className={`text-[10px] uppercase tracking-[0.35em] ${
            isLight ? "text-white/70" : "text-slate-400"
          }`}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
};
