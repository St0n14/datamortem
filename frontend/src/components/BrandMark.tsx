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
        className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${
          isLight 
            ? "border-white/40 bg-slate-50/10 text-white shadow-lg shadow-white/10" 
            : "border-violet-500/30 bg-slate-900 text-violet-200 shadow-lg shadow-violet-500/20"
        }`}
      >
        <ShieldCheck className="h-6 w-6" />
      </div>
      <div>
        <p 
          className={`text-2xl font-bold tracking-wide ${
            isLight 
              ? "text-white" 
              : "bg-gradient-to-r from-violet-400 via-purple-300 to-violet-400 bg-clip-text text-transparent"
          }`}
          style={{
            textShadow: isLight 
              ? "0 0 20px rgba(255, 255, 255, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)" 
              : "0 2px 8px rgba(139, 92, 246, 0.4)"
          }}
        >
          Requiem
        </p>
        <p
          className={`text-[10px] uppercase tracking-[0.35em] mt-0.5 ${
            isLight ? "text-white/70" : "text-slate-400"
          }`}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
};
