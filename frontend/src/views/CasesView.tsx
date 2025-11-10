import { useState, useEffect } from 'react';
import { Folder, Plus } from 'lucide-react';
import { casesAPI, evidenceAPI } from '../services/api';
import type { Case, Evidence } from '../types';

export default function CasesView() {
  const [cases, setCases] = useState<Case[]>([]);
  const [evidences, setEvidences] = useState<Evidence[]>([]);
  const [selectedCase, setSelectedCase] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCases();
  }, []);

  useEffect(() => {
    if (selectedCase) {
      loadEvidences(selectedCase);
    }
  }, [selectedCase]);

  const loadCases = async () => {
    try {
      setLoading(true);
      const data = await casesAPI.list();
      setCases(data);
      if (data.length > 0 && !selectedCase) {
        setSelectedCase(data[0].case_id);
      }
    } catch (error) {
      console.error('Failed to load cases:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadEvidences = async (caseId: string) => {
    try {
      const data = await evidenceAPI.list(caseId);
      setEvidences(data);
    } catch (error) {
      console.error('Failed to load evidences:', error);
    }
  };

  if (loading) {
    return <div className="loading">Loading cases...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h2>Cases</h2>
        <p>Manage forensic investigation cases and evidence</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Cases ({cases.length})</h3>
          <button className="btn btn-primary btn-sm">
            <Plus size={16} />
            New Case
          </button>
        </div>

        {cases.length === 0 ? (
          <div className="empty-state">
            <Folder className="empty-state-icon" />
            <p>No cases found</p>
            <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
              Create a case to start your forensic investigation
            </p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Case ID</th>
                <th>Note</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((case_) => (
                <tr key={case_.case_id}>
                  <td>
                    <button
                      onClick={() => setSelectedCase(case_.case_id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--primary)',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                    >
                      {case_.case_id}
                    </button>
                  </td>
                  <td>{case_.note || '-'}</td>
                  <td>
                    <span className={`badge badge-${case_.status === 'open' ? 'success' : 'info'}`}>
                      {case_.status}
                    </span>
                  </td>
                  <td>{new Date(case_.created_at_utc).toLocaleString()}</td>
                  <td>
                    <button className="btn btn-secondary btn-sm">View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedCase && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Evidence for {selectedCase}</h3>
            <button className="btn btn-primary btn-sm">
              <Plus size={16} />
              Add Evidence
            </button>
          </div>

          {evidences.length === 0 ? (
            <div className="empty-state">
              <p>No evidence found for this case</p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Evidence UID</th>
                  <th>Local Path</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {evidences.map((evidence) => (
                  <tr key={evidence.id}>
                    <td>{evidence.evidence_uid}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                      {evidence.local_path}
                    </td>
                    <td>{new Date(evidence.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
