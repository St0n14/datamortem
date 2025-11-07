import { useState, useEffect } from 'react';
import { Search, Filter, Database, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { casesAPI, searchAPI } from '../services/api';
import type { Case, SearchHit, IndexStats } from '../types';

export default function ExplorerView() {
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedCase, setSelectedCase] = useState<string>('');
  const [query, setQuery] = useState('*');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<IndexStats | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<SearchHit | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('@timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    loadCases();
  }, []);

  useEffect(() => {
    if (selectedCase) {
      loadStats();
    }
  }, [selectedCase]);

  const loadCases = async () => {
    try {
      const data = await casesAPI.list();
      setCases(data);
      if (data.length > 0 && !selectedCase) {
        setSelectedCase(data[0].case_id);
      }
    } catch (error) {
      console.error('Failed to load cases:', error);
    }
  };

  const loadStats = async () => {
    try {
      const data = await searchAPI.stats(selectedCase);
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
      setStats(null);
    }
  };

  const handleSearch = async () => {
    if (!selectedCase) return;

    try {
      setLoading(true);
      const response = await searchAPI.query({
        query,
        case_id: selectedCase,
        size: pageSize,
        from_: page * pageSize,
        sort_by: sortBy,
        sort_order: sortOrder,
      });

      setResults(response.hits);
      setTotal(response.total);
    } catch (error) {
      console.error('Search failed:', error);
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setPage(0);
      handleSearch();
    }
  };

  const getNestedValue = (obj: any, path: string): any => {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="page-header">
        <h2>Explorer</h2>
        <p>Search and analyze forensic events from OpenSearch</p>
      </div>

      {/* Case Selector */}
      <div className="card">
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem', display: 'block' }}>
              Select Case
            </label>
            <select
              className="select"
              value={selectedCase}
              onChange={(e) => {
                setSelectedCase(e.target.value);
                setResults([]);
                setPage(0);
              }}
            >
              <option value="">-- Select Case --</option>
              {cases.map((case_) => (
                <option key={case_.id} value={case_.case_id}>
                  {case_.case_id} - {case_.note || 'No description'}
                </option>
              ))}
            </select>
          </div>

          {stats && (
            <div style={{ display: 'flex', gap: '1rem', padding: '0.5rem', background: 'var(--bg)', borderRadius: '0.375rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>Documents</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{stats.document_count.toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>Index Size</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                  {(stats.size_in_bytes / 1024 / 1024).toFixed(2)} MB
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>Health</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                  <span className={`badge badge-${stats.health === 'green' ? 'success' : stats.health === 'yellow' ? 'warning' : 'error'}`}>
                    {stats.health}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedCase && (
        <>
          {/* Search Bar */}
          <div className="card">
            <div className="search-bar">
              <input
                type="text"
                className="input"
                placeholder="Enter search query (e.g., svchost.exe, event.type:file, @timestamp:[2024-01-01 TO *])"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={handleKeyPress}
              />
              <button
                className="btn btn-primary"
                onClick={() => {
                  setPage(0);
                  handleSearch();
                }}
                disabled={loading}
              >
                <Search size={16} />
                Search
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter size={16} />
                Filters
              </button>
            </div>

            {showFilters && (
              <div className="filters">
                <div className="filter-group">
                  <label>Sort By</label>
                  <select className="select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                    <option value="@timestamp">Timestamp</option>
                    <option value="event.type">Event Type</option>
                    <option value="file.path">File Path</option>
                    <option value="process.name">Process Name</option>
                  </select>
                </div>

                <div className="filter-group">
                  <label>Sort Order</label>
                  <select className="select" value={sortOrder} onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}>
                    <option value="desc">Descending</option>
                    <option value="asc">Ascending</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Results */}
          {loading ? (
            <div className="loading">Searching...</div>
          ) : results.length > 0 ? (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  Results ({total.toLocaleString()} events)
                </h3>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setPage(Math.max(0, page - 1));
                      handleSearch();
                    }}
                    disabled={page === 0}
                  >
                    <ChevronLeft size={14} />
                    Previous
                  </button>
                  <span style={{ fontSize: '0.875rem' }}>
                    Page {page + 1} of {totalPages}
                  </span>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setPage(Math.min(totalPages - 1, page + 1));
                      handleSearch();
                    }}
                    disabled={page >= totalPages - 1}
                  >
                    Next
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              <table className="table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Event Type</th>
                    <th>Source Parser</th>
                    <th>Key Fields</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((hit) => {
                    const source = hit._source;
                    const timestamp = getNestedValue(source, '@timestamp') || '-';
                    const eventType = getNestedValue(source, 'event.type') || '-';
                    const parser = getNestedValue(source, 'source.parser') || '-';
                    const filePath = getNestedValue(source, 'file.path');
                    const processName = getNestedValue(source, 'process.name');

                    return (
                      <tr key={hit._id}>
                        <td style={{ fontSize: '0.8125rem', fontFamily: 'monospace' }}>
                          {new Date(timestamp).toLocaleString()}
                        </td>
                        <td>
                          <span className="badge badge-info">{eventType}</span>
                        </td>
                        <td style={{ fontSize: '0.875rem' }}>{parser}</td>
                        <td style={{ fontSize: '0.875rem' }}>
                          {filePath && <div><strong>File:</strong> {filePath}</div>}
                          {processName && <div><strong>Process:</strong> {processName}</div>}
                          {!filePath && !processName && <span style={{ color: 'var(--text-light)' }}>-</span>}
                        </td>
                        <td>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setSelectedEvent(hit)}
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card">
              <div className="empty-state">
                <Database className="empty-state-icon" />
                <p>No results found</p>
                <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                  {stats?.document_count === 0
                    ? 'No events indexed for this case. Run a pipeline task and index the results.'
                    : 'Try a different search query or filters'}
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {!selectedCase && (
        <div className="card">
          <div className="empty-state">
            <AlertCircle className="empty-state-icon" />
            <p>Select a case to start exploring</p>
          </div>
        </div>
      )}

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setSelectedEvent(null)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '0.5rem',
              maxWidth: '800px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
              padding: '1.5rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Event Details</h3>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedEvent(null)}
              >
                Close
              </button>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>Document ID</div>
              <code style={{ fontSize: '0.8125rem' }}>{selectedEvent._id}</code>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>Index</div>
              <code style={{ fontSize: '0.8125rem' }}>{selectedEvent._index}</code>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-light)', marginBottom: '0.5rem' }}>Raw Document</div>
              <pre
                style={{
                  background: 'var(--bg)',
                  padding: '1rem',
                  borderRadius: '0.375rem',
                  fontSize: '0.8125rem',
                  overflow: 'auto',
                  maxHeight: '400px',
                }}
              >
                {JSON.stringify(selectedEvent._source, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
