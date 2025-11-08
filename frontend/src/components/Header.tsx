import { LogOut } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { BrandMark } from "./BrandMark";
import { Button } from "./ui/Button";

export const Header: React.FC = () => {
  const { user, logout } = useAuth();

  const initials =
    (user?.full_name || user?.username || "")
      .split(" ")
      .map((chunk) => chunk[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  return (
    <header className="sticky top-0 z-50 border-b border-slate-900/70 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
        <BrandMark subtitle="Cloud DFIR Console" />
        <div className="flex flex-1 items-center justify-end gap-4">
          <span className="hidden sm:inline-flex items-center gap-2 rounded-full border border-emerald-500/30 px-3 py-1 text-[11px] font-semibold text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            GCP ready
          </span>
          {user && (
            <>
              <div className="hidden md:flex flex-col items-end leading-tight">
                <span className="text-sm font-semibold text-slate-100">{user.full_name || user.username}</span>
                <span className="text-[11px] uppercase tracking-wide text-slate-400">{user.role}</span>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-sm font-semibold text-slate-100">
                {initials || "DM"}
              </div>
              <Button
                onClick={logout}
                className="inline-flex items-center gap-2 rounded-full border border-rose-500/60 bg-rose-600/20 px-4 py-2 text-sm font-semibold text-rose-50 hover:bg-rose-600/40"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
