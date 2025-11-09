import { useState, useEffect } from 'react';
import { Clock, Calendar, ChevronDown, ChevronUp, Tag } from 'lucide-react';
import { casesAPI, searchAPI } from '../services/api';
import type { Case, SearchHit } from '../types';

export default function TimelineView() {
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedCase, setSelectedCase] = useState<string>('');
  const [events, setEvents] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [groupBy, setGroupBy] = useState<'hour' | 'day' | 'week'>('day');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadCases();
  }, []);

  useEffect(() => {
    if (selectedCase) {
      loadTimeline();
    }
  }, [selectedCase, groupBy]);

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

  const loadTimeline = async () => {
    try {
      setLoading(true);
      const response = await searchAPI.query({
        query: '*',
        case_id: selectedCase,
        size: 1000,
        sort_by: '@timestamp',
        sort_order: 'asc',
      });
      setEvents(response.hits);
    } catch (error) {
      console.error('Failed to load timeline:', error);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const getEventTypeColor = (type: string): string => {
    const colors: Record<string, string> = {
      file: 'bg-event-file border-green-500',
      process: 'bg-event-process border-blue-500',
      registry: 'bg-event-registry border-orange-500',
      network: 'bg-event-network border-purple-500',
    };
    return colors[type] || 'bg-gray-100 border-gray-400';
  };

  const getEventTypeIcon = (type: string): string => {
    const icons: Record<string, string> = {
      file: '📄',
      process: '⚙️',
      registry: '🔧',
      network: '🌐',
    };
    return icons[type] || '📌';
  };

  // Group events by time period
  const groupedEvents = events.reduce((acc, event) => {
    const timestamp = event._source?.['@timestamp'];
    if (!timestamp) return acc;

    const date = new Date(timestamp);
    let key: string;

    if (groupBy === 'hour') {
      key = date.toISOString().slice(0, 13) + ':00';
    } else if (groupBy === 'day') {
      key = date.toISOString().slice(0, 10);
    } else {
      // week
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      key = weekStart.toISOString().slice(0, 10);
    }

    if (!acc[key]) acc[key] = [];
    acc[key].push(event);
    return acc;
  }, {} as Record<string, SearchHit[]>);

  const toggleGroup = (key: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedGroups(newExpanded);
  };

  const formatGroupDate = (key: string): string => {
    const date = new Date(key);
    if (groupBy === 'hour') {
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } else if (groupBy === 'day') {
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } else {
      return `Week of ${date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })}`;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-slate-50 border-b border-gray-200 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Clock className="text-timesketch-accent" size={32} />
              Timeline
            </h1>
            <p className="text-gray-600 mt-1">
              Temporal visualization of forensic events
            </p>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4">
            {/* Case selector */}
            <select
              value={selectedCase}
              onChange={(e) => setSelectedCase(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-timesketch-accent focus:border-transparent"
            >
              <option value="">Select case...</option>
              {cases.map((c) => (
                <option key={c.id} value={c.case_id}>
                  {c.case_id}
                </option>
              ))}
            </select>

            {/* Group by */}
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as any)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-timesketch-accent focus:border-transparent"
            >
              <option value="hour">Group by Hour</option>
              <option value="day">Group by Day</option>
              <option value="week">Group by Week</option>
            </select>
          </div>
        </div>
      </div>

      {/* Timeline content */}
      <div className="flex-1 overflow-y-auto p-8">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-timesketch-accent mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading timeline...</p>
            </div>
          </div>
        ) : Object.keys(groupedEvents).length === 0 ? (
          <div className="text-center py-16">
            <Calendar className="mx-auto h-16 w-16 text-gray-400" />
            <p className="mt-4 text-gray-600 text-lg">No events found</p>
            <p className="text-gray-500 text-sm mt-2">
              Select a case or run an analysis to see the timeline
            </p>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-6">
            {Object.entries(groupedEvents)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([timeKey, groupEvents]) => {
                const isExpanded = expandedGroups.has(timeKey);
                const eventTypes = [...new Set(groupEvents.map((e) => e._source?.['event.type']).filter(Boolean))];

                return (
                  <div key={timeKey} className="ts-card">
                    {/* Group header */}
                    <button
                      onClick={() => toggleGroup(timeKey)}
                      className="w-full flex items-center justify-between hover:bg-slate-100 -m-6 p-6 rounded-t-lg transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-timesketch-lightblue rounded-lg flex items-center justify-center text-white font-bold">
                          {groupEvents.length}
                        </div>
                        <div className="text-left">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {formatGroupDate(timeKey)}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            {eventTypes.map((type) => (
                              <span
                                key={type}
                                className="text-xs px-2 py-0.5 rounded font-medium bg-gray-100 text-slate-700"
                              >
                                {getEventTypeIcon(type)} {type}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="text-gray-400" />
                      ) : (
                        <ChevronDown className="text-gray-400" />
                      )}
                    </button>

                    {/* Group events */}
                    {isExpanded && (
                      <div className="mt-6 space-y-3">
                        {groupEvents.map((event, idx) => {
                          const src = event._source || {};
                          const eventType = src['event.type'] || 'unknown';
                          const timestamp = src['@timestamp'] || '';
                          return (
                          <div
                            key={idx}
                            className={`border-l-4 rounded p-4 hover:shadow-md transition-shadow ${getEventTypeColor(eventType)}`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3">
                                  <span className="text-2xl">
                                    {getEventTypeIcon(eventType)}
                                  </span>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-sm text-gray-600">
                                        {timestamp && new Date(timestamp).toLocaleTimeString()}
                                      </span>
                                      <span className={`event-badge event-badge-${eventType}`}>
                                        {eventType}
                                      </span>
                                    </div>
                                    <p className="mt-1 text-sm text-gray-900 font-medium">
                                      {src['file.path'] ||
                                        src['process.name'] ||
                                        src['registry.key'] ||
                                        src['message'] ||
                                        'Event'}
                                    </p>
                                    {src['process.command_line'] && (
                                      <p className="mt-1 text-xs text-gray-600 font-mono">
                                        {src['process.command_line']}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right text-xs text-gray-500">
                                {src['user.name'] && (
                                  <div className="flex items-center gap-1">
                                    <Tag size={12} />
                                    {src['user.name']}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
