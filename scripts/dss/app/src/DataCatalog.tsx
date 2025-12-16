import { useState, useEffect, useMemo } from 'react';
import './DataCatalog.css';

interface CatalogEntry {
  id: string;
  name: string;
  type: 'parquet' | 'csv' | 'xlsx' | 'tsv' | 'json';
  path: string;
  fileSize: string;
  lastModified: string;
  category: 'source' | 'cached' | 'output';
  description?: string;
  tags: string[];
  columns?: string[];
  rowCount?: number;
}

interface DataCatalogProps {
  onClose: () => void;
}

const TYPE_ICONS: Record<string, string> = {
  parquet: 'P',
  csv: 'C',
  xlsx: 'X',
  tsv: 'T',
  json: 'J',
};

const TYPE_COLORS: Record<string, string> = {
  parquet: '#22c55e',
  csv: '#f59e0b',
  xlsx: '#10b981',
  tsv: '#3b82f6',
  json: '#8b5cf6',
};

const TAG_COLORS: Record<string, string> = {
  'PARQUET': '#22c55e',
  'CSV': '#f59e0b',
  'XLSX': '#10b981',
  'TSV': '#3b82f6',
  'JSON': '#8b5cf6',
  'Source': '#0066CC',
  'Cached': '#FF9900',
};

const CATEGORY_LABELS: Record<string, string> = {
  source: 'Source Data',
  cached: 'Cached Outputs',
  output: 'Other Outputs',
};

export default function DataCatalog({ onClose }: DataCatalogProps) {
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  // Fetch catalog data
  useEffect(() => {
    async function fetchCatalog() {
      try {
        setLoading(true);
        const response = await fetch('/api/catalog');
        if (!response.ok) throw new Error('Failed to fetch catalog');
        const data = await response.json();
        setEntries(data.entries || []);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetchCatalog();
  }, []);

  // Get unique categories and types
  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const entry of entries) {
      cats.add(entry.category);
    }
    return Array.from(cats);
  }, [entries]);

  const types = useMemo(() => {
    const t = new Set<string>();
    for (const entry of entries) {
      t.add(entry.type);
    }
    return Array.from(t);
  }, [entries]);

  // Filter entries based on search and filters
  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = entry.name.toLowerCase().includes(query);
        const matchesPath = entry.path.toLowerCase().includes(query);
        const matchesTags = entry.tags.some(t => t.toLowerCase().includes(query));
        if (!matchesName && !matchesPath && !matchesTags) {
          return false;
        }
      }

      // Category filter
      if (selectedCategory && entry.category !== selectedCategory) {
        return false;
      }

      // Type filter
      if (selectedType && entry.type !== selectedType) {
        return false;
      }

      return true;
    });
  }, [entries, searchQuery, selectedCategory, selectedType]);

  // Group entries by category
  const groupedEntries = useMemo(() => {
    const groups: Record<string, CatalogEntry[]> = {
      source: [],
      cached: [],
      output: [],
    };
    for (const entry of filteredEntries) {
      groups[entry.category].push(entry);
    }
    return groups;
  }, [filteredEntries]);

  if (loading) {
    return (
      <div className="catalog-modal" onClick={onClose}>
        <div className="catalog-modal-content" onClick={e => e.stopPropagation()}>
          <div className="catalog-loading">
            <div className="spinner" />
            <p>Loading data catalog...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="catalog-modal" onClick={onClose}>
      <div className="catalog-modal-content" onClick={e => e.stopPropagation()}>
        <div className="catalog-header">
          <div className="catalog-title">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
            </svg>
            <h2>Data Catalog</h2>
          </div>
          <div className="catalog-stats">
            <span>{entries.length} files</span>
          </div>
          <button className="close-modal" onClick={onClose}>&times;</button>
        </div>

        {error ? (
          <div className="catalog-error">
            <p>Error loading catalog: {error}</p>
          </div>
        ) : (
          <>
            {/* Search and Filters */}
            <div className="catalog-filters">
              <div className="search-box">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="text"
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  autoFocus
                />
                {searchQuery && (
                  <button className="clear-search" onClick={() => setSearchQuery('')}>&times;</button>
                )}
              </div>

              <div className="type-filters">
                {categories.map(cat => (
                  <button
                    key={cat}
                    className={`type-btn ${selectedCategory === cat ? 'active' : ''}`}
                    style={{ '--type-color': TAG_COLORS[cat === 'source' ? 'Source' : 'Cached'] || '#666' } as React.CSSProperties}
                    onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                  >
                    {CATEGORY_LABELS[cat] || cat}
                  </button>
                ))}
              </div>

              <div className="type-filters">
                {types.map(type => (
                  <button
                    key={type}
                    className={`type-btn ${selectedType === type ? 'active' : ''}`}
                    style={{ '--type-color': TYPE_COLORS[type] } as React.CSSProperties}
                    onClick={() => setSelectedType(selectedType === type ? null : type)}
                  >
                    <span className="type-icon">{TYPE_ICONS[type]}</span>
                    {type.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Results count */}
            <div className="catalog-results-count">
              Showing {filteredEntries.length} of {entries.length} files
              {(searchQuery || selectedCategory || selectedType) && (
                <button
                  className="clear-filters"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory(null);
                    setSelectedType(null);
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>

            {/* Entries by category */}
            <div className="catalog-sections">
              {(['source', 'cached', 'output'] as const).map(category => {
                const categoryEntries = groupedEntries[category];
                if (categoryEntries.length === 0) return null;

                return (
                  <div key={category} className="catalog-section">
                    <h3 className="section-title">{CATEGORY_LABELS[category]}</h3>
                    <div className="catalog-grid">
                      {categoryEntries.map(entry => (
                        <div
                          key={entry.id}
                          className={`catalog-card ${expandedEntry === entry.id ? 'expanded' : ''}`}
                          onClick={() => setExpandedEntry(expandedEntry === entry.id ? null : entry.id)}
                        >
                          <div className="card-header">
                            <div
                              className="card-type-badge"
                              style={{ backgroundColor: TYPE_COLORS[entry.type] }}
                            >
                              {TYPE_ICONS[entry.type]}
                            </div>
                            <div className="card-title-section">
                              <h3 className="card-title">{entry.name}</h3>
                              <span className="card-path">{entry.path}</span>
                            </div>
                          </div>

                          <div className="card-meta">
                            <span className="meta-item">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                              </svg>
                              {entry.fileSize}
                            </span>
                            {entry.lastModified && (
                              <span className="meta-item">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="12" cy="12" r="10" />
                                  <polyline points="12 6 12 12 16 14" />
                                </svg>
                                {entry.lastModified}
                              </span>
                            )}
                          </div>

                          <div className="card-tags">
                            {entry.tags.map((tag, i) => (
                              <span
                                key={i}
                                className="card-tag"
                                style={{ backgroundColor: TAG_COLORS[tag] || '#666' }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>

                          {/* Expanded content */}
                          {expandedEntry === entry.id && (
                            <div className="card-expanded" onClick={e => e.stopPropagation()}>
                              <div className="card-actions">
                                <button
                                  className="action-btn"
                                  onClick={() => {
                                    navigator.clipboard.writeText(entry.path);
                                  }}
                                >
                                  Copy Path
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredEntries.length === 0 && (
              <div className="catalog-empty">
                <p>No files match your filters</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
