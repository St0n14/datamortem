import { useEffect, useRef, useState } from "react";
import { LogOut, Moon, Sun, Settings } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "./ui/Button";
import { AccountMenu } from "./AccountMenu";
import { FeatureFlagsDrawer } from "./FeatureFlagsDrawer";

interface HeaderProps {
  darkMode: boolean;
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({ darkMode, onToggleTheme }) => {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [featureFlagsDrawerOpen, setFeatureFlagsDrawerOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isSuperAdmin = user?.role === "superadmin";

  const initials =
    (user?.full_name || user?.username || "")
      .split(" ")
      .map((chunk) => chunk?.[0] || "")
      .join("")
      .slice(0, 2)
      .toUpperCase();

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) {
        return;
      }
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [menuOpen]);

  useEffect(() => {
    if (!user) {
      setMenuOpen(false);
    }
  }, [user?.id]);

  // Keyboard shortcut: Ctrl/Cmd + Shift + F to open feature flags drawer
  useEffect(() => {
    if (!isSuperAdmin) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setFeatureFlagsDrawerOpen((prev) => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSuperAdmin]);

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

      {isSuperAdmin && (
        <Button
          onClick={() => setFeatureFlagsDrawerOpen(true)}
          className={`h-9 px-3 rounded-full ${
            darkMode
              ? "border-violet-700 bg-violet-900/40 text-violet-200 hover:bg-violet-900/60"
              : "border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
          }`}
          aria-label="Gérer les fonctionnalités"
          title="Gérer les fonctionnalités"
        >
          <Settings className="h-4 w-4" />
        </Button>
      )}

      {user && (
        <div className="flex items-center gap-3">
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((prev) => !prev)}
              className={`flex items-center gap-3 rounded-full border px-3 py-2 transition ${
                darkMode
                  ? "border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"
                  : "border-slate-300 bg-slate-100 text-slate-900 hover:bg-slate-200"
              }`}
            >
              <div className="hidden sm:flex flex-col text-right leading-tight">
                <span className="text-sm font-semibold">{user.full_name || user.username}</span>
                <span className="text-[11px] uppercase tracking-wide opacity-70">{user.role}</span>
              </div>
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold ${
                  darkMode ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-300 bg-slate-50 text-slate-800"
                }`}
              >
                {initials || "DM"}
              </div>
            </button>
            {menuOpen && <AccountMenu darkMode={darkMode} onClose={() => setMenuOpen(false)} />}
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
      
      <FeatureFlagsDrawer
        darkMode={darkMode}
        isOpen={featureFlagsDrawerOpen}
        onClose={() => setFeatureFlagsDrawerOpen(false)}
      />
    </header>
  );
};
