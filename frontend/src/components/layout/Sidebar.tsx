import { BrandMark } from "../BrandMark";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { useAuth } from "../../contexts/AuthContext";
import type { Role } from "../../contexts/AuthContext";
import {
  Clock,
  Search,
  HardDrive,
  Wrench,
  Store,
  FileCode2,
  ShieldCheck,
  UserCheck,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Settings,
} from "lucide-react";

type CaseSummary = {
  case_id: string;
  status?: string;
  note?: string | null;
  created_at_utc?: string;
  hedgedoc_url?: string | null;
};

type NavItem = {
  key: "timeline" | "explorer" | "evidences" | "pipeline" | "marketplace" | "scripts" | "rules" | "admin" | "profile";
  label: string;
  icon: JSX.Element;
};

interface SidebarProps {
  darkMode: boolean;
  sidebarCollapsed: boolean;
  onToggleCollapse: () => void;
  cases: CaseSummary[];
  currentCaseId: string;
  onCaseSelect: (caseId: string) => void;
  selectedEvidenceUid: string | null;
  activeTab: "timeline" | "explorer" | "evidences" | "pipeline" | "marketplace" | "scripts" | "rules" | "admin" | "profile";
  onTabChange: (tab: "timeline" | "explorer" | "evidences" | "pipeline" | "marketplace" | "scripts" | "rules" | "admin" | "profile") => void;
  userRole?: Role;
  eventsCount: number;
  featureFlags?: Record<string, boolean>;
  onOpenFeatureFlags?: () => void;
}

export function Sidebar({
  darkMode,
  sidebarCollapsed,
  onToggleCollapse,
  cases,
  currentCaseId,
  onCaseSelect,
  selectedEvidenceUid,
  activeTab,
  onTabChange,
  userRole,
  eventsCount,
  featureFlags = {},
  onOpenFeatureFlags,
}: SidebarProps) {
  const { logout } = useAuth();
  const textWeak = darkMode ? "text-slate-500" : "text-slate-600";
  const isSuperAdmin = userRole === "superadmin";

  const navItems: NavItem[] = [
    { key: "timeline", label: "Timeline", icon: <Clock className="h-4 w-4" /> },
    ...(!isSuperAdmin ? [{ key: "explorer", label: "Explorer", icon: <Search className="h-4 w-4" /> }] : []),
    { key: "evidences", label: "Evidences", icon: <HardDrive className="h-4 w-4" /> },
    ...(featureFlags.pipeline !== false ? [{ key: "pipeline", label: "Pipeline", icon: <Wrench className="h-4 w-4" /> }] : []),
    ...(featureFlags.marketplace !== false ? [{ key: "marketplace", label: "Marketplace", icon: <Store className="h-4 w-4" /> }] : []),
    { key: "scripts", label: "Scripts", icon: <FileCode2 className="h-4 w-4" /> },
    { key: "rules", label: "Rules", icon: <ShieldCheck className="h-4 w-4" /> },
    ...(isSuperAdmin ? [{ key: "admin", label: "Admin", icon: <UserCheck className="h-4 w-4" /> }] : []),
  ];

  return (
    <aside
      className={`relative flex flex-col h-full gap-4 border-r px-3 py-4 transition-all duration-300 ${
        sidebarCollapsed ? "w-16" : "w-56"
      } ${darkMode ? "border-slate-900 bg-slate-950/90" : "border-gray-200 bg-slate-50"}`}
    >
      {/* Toggle button */}
      <button
        onClick={onToggleCollapse}
        className={`absolute -right-3 top-6 z-10 rounded-full border p-1 transition-colors ${
          darkMode
            ? "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-200"
        }`}
        aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>

      <div className={`space-y-3 ${sidebarCollapsed ? "hidden" : ""}`}>
        <BrandMark subtitle="Investigation Console" />
        <Badge
          className={`text-[10px] border ${
            darkMode ? "bg-emerald-500/10 text-emerald-200 border-emerald-500/30" : "bg-emerald-50 text-emerald-700 border-emerald-200"
          }`}
        >
          LIVE
        </Badge>
      </div>

      <div className={`space-y-2 ${sidebarCollapsed ? "hidden" : ""}`}>
        <p className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? "text-slate-400" : "text-gray-600"}`}>
          Current Case
        </p>
        <select
          value={cases.length ? currentCaseId : ""}
          onChange={(e) => onCaseSelect(e.target.value)}
          disabled={!cases.length}
          className={`w-full rounded-lg border px-2 py-1.5 text-sm ${
            darkMode ? "border-slate-800 bg-slate-900 text-slate-100" : "border-gray-300 bg-slate-50 text-gray-900"
          }`}
        >
          {cases.length === 0 ? (
            <option value="">No cases</option>
          ) : (
            cases.map((c) => (
              <option key={c.case_id} value={c.case_id}>
                {c.case_id} {c.status ? `• ${c.status}` : ""}
              </option>
            ))
          )}
        </select>
        <Button
          className={`h-8 w-full text-xs ${
            darkMode ? "border-slate-800 bg-slate-900 text-slate-200" : "border-gray-200 bg-gray-50 text-slate-800"
          }`}
          onClick={() => onTabChange("evidences")}
        >
          Manage cases
        </Button>
        <p className={`text-[11px] ${darkMode ? "text-slate-500" : "text-gray-500"}`}>
          Evidence focus: <span className="font-semibold">{selectedEvidenceUid ?? "—"}</span>
        </p>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto">
        <p className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? "text-slate-400" : "text-gray-600"} ${sidebarCollapsed ? "hidden" : ""}`}>
          Navigation
        </p>
        <div className="flex flex-col gap-1">
          {navItems.filter((item) => {
            const isScriptTab = item.key === "scripts";
            if (isScriptTab && userRole !== "superadmin" && userRole !== "admin") {
              return false;
            }
            return true;
          }).map((item) => {
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onTabChange(item.key)}
                className={`flex items-center ${sidebarCollapsed ? "justify-center" : "gap-2"} rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                  active
                    ? darkMode
                      ? "border-violet-500/40 bg-violet-900/30 text-violet-100"
                      : "border-violet-300 bg-violet-50 text-violet-800"
                    : darkMode
                    ? "border-slate-900 bg-slate-900/40 text-slate-300 hover:bg-slate-900/70"
                    : "border-gray-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
                title={sidebarCollapsed ? item.label : undefined}
              >
                {item.icon}
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-auto space-y-2 shrink-0 pt-4 border-t border-slate-800">
        {/* Bouton Feature Flags pour superadmin */}
        {isSuperAdmin && onOpenFeatureFlags && (
          <button
            onClick={onOpenFeatureFlags}
            className={`w-full flex items-center ${sidebarCollapsed ? "justify-center" : "gap-2"} rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
              darkMode
                ? "border-violet-600/40 bg-violet-900/30 text-violet-100 hover:bg-violet-900/50"
                : "border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
            }`}
            title={sidebarCollapsed ? "Fonctionnalités (Ctrl+Shift+F)" : undefined}
          >
            <Settings className="h-4 w-4" />
            {!sidebarCollapsed && <span className="truncate">Fonctionnalités</span>}
          </button>
        )}

        {/* Bouton utilisateur */}
        <button
          onClick={() => onTabChange("profile")}
          className={`w-full flex items-center ${sidebarCollapsed ? "justify-center" : "gap-2"} rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
            activeTab === "profile"
              ? darkMode
                ? "border-violet-500/40 bg-violet-900/30 text-violet-100"
                : "border-violet-300 bg-violet-50 text-violet-800"
              : darkMode
              ? "border-slate-900 bg-slate-900/40 text-slate-300 hover:bg-slate-900/70"
              : "border-gray-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
          }`}
          title={sidebarCollapsed ? "Profil" : undefined}
        >
          <User className="h-4 w-4" />
          {!sidebarCollapsed && <span className="truncate">Profil</span>}
        </button>

        {/* Bouton déconnexion */}
        <button
          onClick={logout}
          className={`w-full flex items-center ${sidebarCollapsed ? "justify-center" : "gap-2"} rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
            darkMode
              ? "border-rose-600/40 bg-rose-900/30 text-rose-100 hover:bg-rose-900/50"
              : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
          }`}
          title={sidebarCollapsed ? "Déconnexion" : undefined}
        >
          <LogOut className="h-4 w-4" />
          {!sidebarCollapsed && <span className="truncate">Déconnexion</span>}
        </button>

        <div className={`space-y-1 rounded-xl border px-3 py-3 text-xs ${sidebarCollapsed ? "hidden" : ""}`}>
          <p className={textWeak}>Events loaded: {eventsCount}</p>
          <p className={textWeak}>Active tab: {activeTab}</p>
        </div>
      </div>
    </aside>
  );
}
