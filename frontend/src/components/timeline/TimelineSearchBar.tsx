import { Search, Filter } from "lucide-react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface TimelineSearchBarProps {
  darkMode: boolean;
  currentCaseId: string;
  query: string;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
}

export function TimelineSearchBar({
  darkMode,
  currentCaseId,
  query,
  onQueryChange,
  onSearch,
}: TimelineSearchBarProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Label avec badge du case */}
      <div className={`text-xs font-semibold flex items-center gap-2 ${darkMode ? "text-slate-100" : "text-slate-900"}`}>
        <span>OpenSearch Query</span>
        <Badge
          className={`rounded-md border text-[11px] ${
            darkMode ? "bg-violet-950/40 text-violet-200 border-violet-600/30" : "bg-violet-50 text-violet-700 border-violet-300"
          }`}
        >
          {currentCaseId}
        </Badge>
      </div>

      {/* Barre de recherche avec tous les boutons alignés */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Champ de recherche */}
        <div className="relative flex-1 min-w-[280px]">
          <Search className={`absolute left-3 top-2.5 h-4 w-4 ${darkMode ? "text-slate-500" : "text-gray-400"}`} />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && onSearch()}
            className="pl-9 pr-20 h-9"
            placeholder="Enter query..."
          />
          <div
            className={`absolute right-2 top-2 text-[10px] font-mono rounded-md px-1.5 py-0.5 border ${
              darkMode ? "text-slate-400 bg-slate-900 border-slate-700" : "text-slate-600 bg-slate-50 border-slate-300"
            }`}
          >
            ⏎ Run
          </div>
        </div>

        {/* Bouton Search */}
        <Button
          onClick={onSearch}
          className={`h-9 px-4 rounded-lg border text-sm font-medium whitespace-nowrap ${
            darkMode ? "border-violet-600/30 bg-violet-950/40 text-violet-200 hover:bg-violet-900/30" : "border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
          }`}
        >
          <Search className="h-4 w-4 mr-2" />
          Search
        </Button>

        {/* Bouton Filters */}
        <Button
          className={`h-9 px-4 rounded-lg border text-sm font-medium whitespace-nowrap ${
            darkMode ? "border-sky-600/30 bg-sky-900/20 text-sky-200 hover:bg-sky-900/30" : "border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100"
          }`}
        >
          <Filter className="h-4 w-4 mr-2" />
          Filters
        </Button>

        {/* Bouton Export CSV */}
        <Button
          className={`h-9 px-4 rounded-lg border text-sm font-medium whitespace-nowrap ${
            darkMode ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-200"
          }`}
        >
          Export CSV
        </Button>
      </div>
    </div>
  );
}
