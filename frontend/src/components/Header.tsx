import { LogOut, Moon, Sun } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "./ui/Button";

interface HeaderProps {
  darkMode: boolean;
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({ darkMode, onToggleTheme }) => {
  const { user, logout } = useAuth();

  const initials =
    (user?.full_name || user?.username || "")
      .split(" ")
      .map((chunk) => chunk?.[0] || "")
      .join("")
      .slice(0, 2)
      .toUpperCase();

  return (
    <header
      className={`flex items-center justify-end gap-4 border-b px-6 py-4 ${
        darkMode ? "border-slate-800 bg-slate-950/60" : "border-slate-200 bg-slate-50"
      }`}
    >
      <Button
        onClick={onToggleTheme}
        className={`h-9 w-9 rounded-full ${
          darkMode
            ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
            : "border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200"
        }`}
        aria-label="Toggle dark mode"
      >
        {darkMode ? <Sun className="h-4 w-4 text-yellow-400" /> : <Moon className="h-4 w-4 text-indigo-600" />}
      </Button>

      {user && (
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col text-right leading-tight">
            <span className={`text-sm font-semibold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>
              {user.full_name || user.username}
            </span>
            <span className={`text-[11px] uppercase tracking-wide ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
              {user.role}
            </span>
          </div>
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold ${
              darkMode ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-300 bg-slate-100 text-slate-800"
            }`}
          >
            {initials || "DM"}
          </div>
          <Button
            onClick={logout}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
              darkMode
                ? "border-rose-600/40 bg-rose-900/30 text-rose-100 hover:bg-rose-900/50"
                : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
            }`}
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      )}
    </header>
  );
};
