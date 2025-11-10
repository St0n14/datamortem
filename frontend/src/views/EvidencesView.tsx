import { useState, useEffect } from "react";
import { Card, CardContent } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Plus, HardDrive, Trash2, X, BookOpen } from "lucide-react";
import { casesAPI, evidenceAPI } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import type { Case as ApiCase } from "../types";

interface Evidence {
  id: number;
  evidence_uid: string;
  case_id: string;
  local_path: string | null;
  added_at_utc: string;
}

interface EvidencesViewProps {
  darkMode: boolean;
  currentCaseId: string;
  onCaseChange?: (caseId: string) => void;
  onCasesUpdated?: () => void;
}

export function EvidencesView({ darkMode, currentCaseId, onCaseChange, onCasesUpdated }: EvidencesViewProps) {
  const [evidences, setEvidences] = useState<Evidence[]>([]);
  const [cases, setCases] = useState<ApiCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddCaseModal, setShowAddCaseModal] = useState(false);
  const [caseNoteDraft, setCaseNoteDraft] = useState("");
  const [caseStatusDraft, setCaseStatusDraft] = useState("open");

  // Form state for new evidence
  const [newEvidence, setNewEvidence] = useState({
    evidence_uid: "",
    case_id: currentCaseId,
    local_path: "",
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Form state for new case
  const [newCase, setNewCase] = useState({
    case_id: "",
    note: "",
  });

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const currentCase = cases.find((c) => c.case_id === currentCaseId);
  const { user } = useAuth();
  const role = user?.role ?? "viewer";
  const isSuperAdmin = role === "superadmin";
  const isAdmin = role === "admin";
  const isAnalyst = role === "analyst";
  const isViewer = role === "viewer";
  const canManageCases = !isViewer;
  const canCreateCase = isSuperAdmin || isAdmin || (isAnalyst && cases.length === 0);
  const canManageEvidence = canManageCases;

  useEffect(() => {
    setCaseNoteDraft(currentCase?.note ?? "");
    setCaseStatusDraft(currentCase?.status ?? "open");
  }, [currentCaseId, currentCase?.note, currentCase?.status]);

  useEffect(() => {
    loadCases();
    loadEvidences();
  }, [currentCaseId]);

  const loadCases = async () => {
    try {
      const data = await casesAPI.list();
      setCases(data);
      if (!currentCaseId && data.length > 0) {
        onCaseChange?.(data[0].case_id);
      }
      return data;
    } catch (err) {
      console.error("Failed to load cases:", err);
      return [];
    }
  };

  const loadEvidences = async () => {
    setLoading(true);
    try {
      const data = await evidenceAPI.list(currentCaseId || undefined);
      setEvidences(data);
    } catch (err) {
      console.error("Failed to load evidences:", err);
      setError("Failed to load evidences");
    } finally {
      setLoading(false);
    }
  };

  const handleAddEvidence = async () => {
    setError(null);
    setSuccess(null);

    if (!canManageEvidence) {
      setError("Votre profil est en lecture seule. Impossible d'ajouter une evidence.");
      return;
    }

    if (!newEvidence.evidence_uid || !newEvidence.case_id) {
      setError("Evidence UID and Case ID are required");
      return;
    }

    if (!selectedFile) {
      setError("Please select a Velociraptor collector ZIP file");
      return;
    }

    setUploading(true);

    try {
      await evidenceAPI.upload(selectedFile, newEvidence.evidence_uid, newEvidence.case_id);
      setSuccess("Evidence uploaded and extracted successfully!");
      setShowAddModal(false);
      setNewEvidence({
        evidence_uid: "",
        case_id: currentCaseId,
        local_path: "",
      });
      setSelectedFile(null);
      loadEvidences();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleAddCase = async () => {
    setError(null);
    setSuccess(null);

    if (!canManageCases) {
      setError("Votre profil est en lecture seule. Contactez un superadmin pour modifier les cases.");
      return;
    }

    if (!canCreateCase) {
      setError("Vous avez déjà un case. Contactez un administrateur pour en créer un autre.");
      return;
    }
    if (!newCase.case_id) {
      setError("Case ID is required");
      return;
    }

    try {
      await casesAPI.create(newCase);
      setSuccess("Case created successfully!");
      setShowAddCaseModal(false);
      const createdCaseId = newCase.case_id;
      setNewCase({ case_id: "", note: "" });
      const updatedCases = await loadCases();
      onCasesUpdated?.();
      if (createdCaseId) {
        onCaseChange?.(createdCaseId);
      } else if (updatedCases.length > 0) {
        onCaseChange?.(updatedCases[0].case_id);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateCaseMeta = async () => {
    if (!currentCaseId) {
      setError("Select a case first");
      return;
    }

    setError(null);
    setSuccess(null);

    if (!canManageCases) {
      setError("Votre profil est en lecture seule. Impossible de modifier ce case.");
      return;
    }

    try {
      await casesAPI.update(currentCaseId, {
        note: caseNoteDraft,
        status: caseStatusDraft,
      });
      setSuccess("Case updated");
      onCasesUpdated?.();
      await loadCases();
    } catch (err: any) {
      setError(err.message || "Failed to update case");
    }
  };

  const handleDeleteCase = async () => {
    if (!currentCaseId) return;
    if (!canManageCases) {
      setError("Votre profil est en lecture seule. Impossible de supprimer un case.");
      return;
    }
    if (!window.confirm(`Delete case ${currentCaseId}? This will remove evidences and events linked to it.`)) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      await casesAPI.delete(currentCaseId);

      setSuccess("Case deleted");
      const updatedCases = await loadCases();
      onCasesUpdated?.();
      if (updatedCases.length > 0) {
        onCaseChange?.(updatedCases[0].case_id);
      } else {
        onCaseChange?.("");
      }
    } catch (err: any) {
      setError(err.message || "Failed to delete case");
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const bgCard = darkMode ? "bg-slate-900 border-slate-700" : "bg-slate-50 border-gray-200";
  const textStrong = darkMode ? "text-slate-100" : "text-gray-900";
  const textWeak = darkMode ? "text-slate-400" : "text-gray-500";
  const inputBg = darkMode ? "bg-slate-800 border-slate-700 text-slate-200" : "bg-slate-50 border-gray-300 text-gray-900";
  const newCaseButtonTitle = !canManageCases
    ? "Profil en lecture seule : création de case désactivée."
    : !canCreateCase
    ? "Limite atteinte : un seul case par analyste standard (contactez un superadmin)."
    : "Create a new case";
  const addEvidenceDisabled = !currentCaseId || !canManageEvidence;
  const addEvidenceButtonTitle = !canManageEvidence
    ? "Profil en lecture seule : import d'evidence désactivé."
    : currentCaseId
    ? "Add evidence to the selected case"
    : "Create or select a case before adding evidences.";

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-2xl font-bold ${textStrong}`}>Evidence Management</h2>
          <p className={`text-sm ${textWeak}`}>Manage forensic evidences for your investigations</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setShowAddCaseModal(true)}
            disabled={!canCreateCase}
            className={`${darkMode ? "border-sky-600/30 bg-sky-900/20 text-sky-200 hover:bg-sky-900/30" : "border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100"}`}
            title={newCaseButtonTitle}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Case
          </Button>
          <Button
            onClick={() => setShowAddModal(true)}
            disabled={addEvidenceDisabled}
            className={`${darkMode ? "border-violet-600/30 bg-violet-950/40 text-violet-200 hover:bg-violet-900/30" : "border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"}`}
            title={addEvidenceButtonTitle}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Evidence
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <Card className={`border-rose-600/30 ${darkMode ? "bg-rose-950/20" : "bg-rose-50"}`}>
          <CardContent className="p-3 flex items-center justify-between">
            <span className={darkMode ? "text-rose-300" : "text-rose-700"}>{error}</span>
            <button onClick={() => setError(null)} className={darkMode ? "text-rose-400 hover:text-rose-300" : "text-rose-600 hover:text-rose-700"}>
              <X className="h-4 w-4" />
            </button>
          </CardContent>
        </Card>
      )}

      {success && (
        <Card className={`border-emerald-600/30 ${darkMode ? "bg-emerald-950/20" : "bg-emerald-50"}`}>
          <CardContent className="p-3 flex items-center justify-between">
            <span className={darkMode ? "text-emerald-300" : "text-emerald-700"}>{success}</span>
            <button onClick={() => setSuccess(null)} className={darkMode ? "text-emerald-400 hover:text-emerald-300" : "text-emerald-600 hover:text-emerald-700"}>
              <X className="h-4 w-4" />
            </button>
          </CardContent>
        </Card>
      )}

      {!canManageCases && (
        <Card className={`border-amber-500/30 ${darkMode ? "bg-amber-950/20" : "bg-amber-50"}`}>
          <CardContent className="p-3 text-sm">
            Profil en lecture seule : vous pouvez consulter les cases mais pas en créer/modifier. Contactez un superadmin pour obtenir plus de droits.
          </CardContent>
        </Card>
      )}

      {canManageCases && !canCreateCase && (
        <Card className={`border-amber-500/30 ${darkMode ? "bg-amber-950/20" : "bg-amber-50"}`}>
          <CardContent className="p-3 text-sm">
            Vous avez atteint la limite d'un case. Demandez à un administrateur pour en créer d'autres.
          </CardContent>
        </Card>
      )}

      {/* Case Selector */}
      <Card className={bgCard}>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <label className={`text-sm font-medium ${textStrong}`}>Active Case:</label>
            <select
              value={currentCaseId}
              onChange={(e) => onCaseChange?.(e.target.value)}
              disabled={cases.length === 0}
              className={`px-3 py-2 rounded-lg border text-sm ${inputBg}`}
            >
              {cases.length === 0 ? (
                <option value="">No cases available</option>
              ) : (
                cases.map((c) => (
                  <option key={c.case_id} value={c.case_id}>
                    {c.case_id} - {c.status}
                  </option>
                ))
              )}
            </select>
          </div>
        </CardContent>
      </Card>

      {currentCase ? (
        <Card className={bgCard}>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className={`text-base font-semibold ${textStrong}`}>{currentCase.case_id}</h3>
                <p className={`text-xs ${textWeak}`}>Created {formatDate(currentCase.created_at_utc)}</p>
              </div>
              <Badge
                className={`text-[10px] border ${
                  caseStatusDraft === "closed"
                    ? darkMode
                      ? "bg-rose-900/30 text-rose-200 border-rose-500/30"
                      : "bg-rose-100 text-rose-700 border-rose-300"
                    : darkMode
                    ? "bg-emerald-900/20 text-emerald-200 border-emerald-500/30"
                    : "bg-emerald-100 text-emerald-700 border-emerald-300"
                }`}
              >
                {caseStatusDraft.toUpperCase()}
              </Badge>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className={`text-sm font-medium ${textStrong}`}>Case note</label>
                {currentCase?.hedgedoc_url && (
                  <Button
                    type="button"
                    onClick={() => window.open(currentCase.hedgedoc_url ?? undefined, "_blank", "noopener,noreferrer")}
                    className={`${darkMode ? "border-sky-600/30 bg-sky-900/20 text-sky-200 hover:bg-sky-900/30" : "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100"} h-9 px-3 text-xs`}
                  >
                    <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                    Ouvrir dans HedgeDoc
                  </Button>
                )}
              </div>
              <textarea
                value={caseNoteDraft}
                onChange={(e) => setCaseNoteDraft(e.target.value)}
                rows={3}
                disabled={!canManageCases}
                className={`w-full rounded-lg border px-3 py-2 text-sm resize-none ${
                  darkMode ? "border-slate-700 bg-slate-900 text-slate-100" : "border-gray-300 bg-slate-50 text-gray-900"
                }`}
                placeholder="Add investigation notes, context, or summary..."
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className={`text-sm font-medium ${textStrong}`}>Status</label>
              <select
                value={caseStatusDraft}
                onChange={(e) => setCaseStatusDraft(e.target.value)}
                disabled={!canManageCases}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  darkMode ? "border-slate-700 bg-slate-900 text-slate-100" : "border-gray-300 bg-slate-50 text-gray-900"
                }`}
              >
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 justify-between">
              <Button
                onClick={handleUpdateCaseMeta}
                disabled={!canManageCases}
                title={!canManageCases ? "Profil en lecture seule : mise à jour désactivée." : undefined}
                className={`${darkMode ? "border-emerald-600/30 bg-emerald-900/20 text-emerald-200 hover:bg-emerald-900/30" : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}
              >
                Save changes
              </Button>
              <Button
                onClick={handleDeleteCase}
                disabled={!canManageCases}
                title={!canManageCases ? "Profil en lecture seule : suppression désactivée." : undefined}
                className={`${darkMode ? "border-rose-600/30 bg-rose-900/20 text-rose-200 hover:bg-rose-900/30" : "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"}`}
              >
                Delete case
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className={bgCard}>
          <CardContent className="p-4 flex flex-col gap-3">
            <p className={textWeak}>No case selected. Create one to start managing evidences.</p>
            {canCreateCase ? (
              <Button
                onClick={() => setShowAddCaseModal(true)}
                className={`${darkMode ? "border-sky-600/30 bg-sky-900/20 text-sky-200" : "border-sky-300 bg-sky-50 text-sky-700"}`}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create first case
              </Button>
            ) : (
              <p className={textWeak}>Demandez à un administrateur de créer un nouveau case.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Evidences List */}
      <Card className={`flex-1 ${bgCard}`}>
        <CardContent className="p-0">
          <div className={`border-b px-4 py-3 ${darkMode ? "border-slate-700" : "border-gray-200"}`}>
            <h3 className={`font-semibold ${textStrong}`}>
              Evidences {currentCaseId && `for ${currentCaseId}`}
            </h3>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <p className={textWeak}>Loading evidences...</p>
            </div>
          ) : evidences.length === 0 ? (
            <div className="p-8 text-center">
              <HardDrive className={`h-12 w-12 mx-auto mb-3 ${textWeak}`} />
              <p className={`${textWeak} mb-4`}>No evidences found for this case</p>
              <Button
                onClick={() => setShowAddModal(true)}
                disabled={addEvidenceDisabled}
                className={`${darkMode ? "border-violet-600/30 bg-violet-950/40 text-violet-200" : "border-violet-300 bg-violet-50 text-violet-700"}`}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add First Evidence
              </Button>
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className={`border-b text-xs uppercase ${darkMode ? "border-slate-700 bg-slate-900 text-slate-500" : "border-gray-200 bg-gray-50 text-gray-500"}`}>
                  <tr>
                    <th className="px-4 py-3 text-left">Evidence UID</th>
                    <th className="px-4 py-3 text-left">Case</th>
                    <th className="px-4 py-3 text-left">Local Path</th>
                    <th className="px-4 py-3 text-left">Added At</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className={darkMode ? "divide-y divide-slate-800" : "divide-y divide-gray-100"}>
                  {evidences.map((ev) => (
                    <tr key={ev.id} className={darkMode ? "hover:bg-slate-800/50" : "hover:bg-slate-100"}>
                      <td className={`px-4 py-3 font-mono font-semibold ${textStrong}`}>
                        {ev.evidence_uid}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`${darkMode ? "bg-violet-950/40 text-violet-200 border-violet-600/30" : "bg-violet-50 text-violet-700 border-violet-300"}`}>
                          {ev.case_id}
                        </Badge>
                      </td>
                      <td className={`px-4 py-3 font-mono text-xs ${textWeak}`}>
                        {ev.local_path || "-"}
                      </td>
                      <td className={`px-4 py-3 text-xs ${textWeak}`}>
                        {formatDate(ev.added_at_utc)}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          className={`h-8 px-2 text-xs ${darkMode ? "border-rose-600/30 bg-rose-950/20 text-rose-300 hover:bg-rose-900/30" : "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Evidence Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className={`w-full max-w-lg ${bgCard}`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-semibold ${textStrong}`}>Add New Evidence</h3>
                <button onClick={() => setShowAddModal(false)} className={textWeak}>
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${textStrong}`}>
                    Evidence UID *
                  </label>
                  <Input
                    value={newEvidence.evidence_uid}
                    onChange={(e) => setNewEvidence({ ...newEvidence, evidence_uid: e.target.value })}
                    placeholder="e.g., DISK_001, MEMORY_DUMP_001"
                    className={inputBg}
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-1 ${textStrong}`}>
                    Case ID *
                  </label>
                  <select
                    value={newEvidence.case_id}
                    onChange={(e) => setNewEvidence({ ...newEvidence, case_id: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border ${inputBg}`}
                  >
                    {cases.map((c) => (
                      <option key={c.case_id} value={c.case_id}>
                        {c.case_id}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-1 ${textStrong}`}>
                    Velociraptor Offline Collector (ZIP) *
                  </label>
                  <div className={`border-2 border-dashed rounded-lg p-4 ${darkMode ? "border-slate-700 bg-slate-800" : "border-gray-300 bg-gray-50"}`}>
                    <input
                      type="file"
                      accept=".zip"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      className="hidden"
                      id="file-upload"
                    />
                    <label
                      htmlFor="file-upload"
                      className="cursor-pointer flex flex-col items-center gap-2"
                    >
                      <HardDrive className={`h-8 w-8 ${textWeak}`} />
                      <span className={`text-sm ${textStrong}`}>
                        {selectedFile ? selectedFile.name : "Click to select ZIP file"}
                      </span>
                      <span className={`text-xs ${textWeak}`}>
                        Only Velociraptor offline collector ZIP files
                      </span>
                    </label>
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    onClick={handleAddEvidence}
                    disabled={uploading || !canManageEvidence}
                    title={!canManageEvidence ? "Profil en lecture seule : import d'evidence désactivé." : undefined}
                    className={`flex-1 ${uploading ? "opacity-50 cursor-not-allowed" : ""} ${
                      darkMode ? "border-violet-600/30 bg-violet-950/40 text-violet-200 hover:bg-violet-900/30"
                        : "border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
                    }`}
                  >
                    {uploading ? "Uploading..." : "Upload Evidence"}
                  </Button>
                  <Button
                    onClick={() => setShowAddModal(false)}
                    className={`${darkMode ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-gray-300 bg-slate-50 text-slate-800 hover:bg-slate-200"}`}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add Case Modal */}
      {showAddCaseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className={`w-full max-w-lg ${bgCard}`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-semibold ${textStrong}`}>Create New Case</h3>
                <button onClick={() => setShowAddCaseModal(false)} className={textWeak}>
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${textStrong}`}>
                    Case ID * <span className={`text-xs font-normal ${textWeak}`}>(max 24 chars, uppercase, no spaces)</span>
                  </label>
                  <Input
                    value={newCase.case_id}
                    onChange={(e) => {
                      // Transform to uppercase, remove spaces, limit to 24 characters
                      const sanitized = e.target.value
                        .toUpperCase()
                        .replace(/\s+/g, '')
                        .slice(0, 24);
                      setNewCase({ ...newCase, case_id: sanitized });
                    }}
                    placeholder="e.g., INC-2025-001"
                    maxLength={24}
                    disabled={!canManageCases}
                    className={`${darkMode ? "bg-slate-800 border-slate-600 text-slate-100 placeholder:text-slate-500" : "bg-white border-gray-300 text-gray-900 placeholder:text-gray-400"} rounded-lg`}
                  />
                  {newCase.case_id && (
                    <p className={`text-xs mt-1 ${textWeak}`}>
                      {newCase.case_id.length}/24 characters
                    </p>
                  )}
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-1 ${textStrong}`}>
                    Note
                  </label>
                  <textarea
                    value={newCase.note}
                    onChange={(e) => setNewCase({ ...newCase, note: e.target.value })}
                    placeholder="Brief description of the investigation"
                    rows={3}
                    disabled={!canManageCases}
                    className={`w-full px-3 py-2 rounded-lg border resize-none ${darkMode ? "bg-slate-800 border-slate-600 text-slate-100 placeholder:text-slate-500" : "bg-white border-gray-300 text-gray-900 placeholder:text-gray-400"}`}
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    onClick={handleAddCase}
                    disabled={!canCreateCase}
                    title={!canCreateCase ? newCaseButtonTitle : undefined}
                    className={`flex-1 ${darkMode ? "border-sky-600/30 bg-sky-900/20 text-sky-200 hover:bg-sky-900/30" : "border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100"}`}
                  >
                    Create Case
                  </Button>
                  <Button
                    onClick={() => setShowAddCaseModal(false)}
                    className={`${darkMode ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-gray-300 bg-slate-50 text-slate-800 hover:bg-slate-200"}`}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
