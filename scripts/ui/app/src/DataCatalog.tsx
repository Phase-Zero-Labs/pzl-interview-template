import { useState, useEffect, useMemo } from 'react';
import './DataCatalog.css';

interface CatalogEntry {
  id: string;
  name: string;
  type: 'parquet' | 'csv' | 'images' | 'mixed';
  path: string;
  fileCount: number;
  totalSize: string;
  lastModified: string;
  description?: string;
  tags: string[];
  columns?: string[];
  rowCount?: number;
  sampleImages?: string[];
}

interface DataCatalogProps {
  onClose: () => void;
}

const TYPE_ICONS: Record<string, string> = {
  parquet: 'P',
  csv: 'C',
  images: 'I',
  mixed: 'M',
};

const TYPE_COLORS: Record<string, string> = {
  parquet: '#22c55e',
  csv: '#f59e0b',
  images: '#ec4899',
  mixed: '#8b5cf6',
};

const TAG_COLORS: Record<string, string> = {
  'PNG': '#ec4899',
  'SVG': '#f97316',
  'Parquet': '#22c55e',
  'CSV': '#f59e0b',
  'QC': '#3b82f6',
  'Dose-Response': '#8b5cf6',
  'ML': '#ef4444',
  'Analysis': '#06b6d4',
  '3D': '#a855f7',
  'Drug': '#14b8a6',
  'Oxygen': '#6366f1',
  'Data': '#64748b',
};

export default function DataCatalog({ onClose }: DataCatalogProps) {
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

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

  // Get all unique tags
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const entry of entries) {
      for (const tag of entry.tags) {
        tags.add(tag);
      }
    }
    return Array.from(tags).sort();
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
        const matchesColumns = entry.columns?.some(c => c.toLowerCase().includes(query));
        if (!matchesName && !matchesPath && !matchesTags && !matchesColumns) {
          return false;
        }
      }

      // Tag filter
      if (selectedTags.size > 0) {
        const hasSelectedTag = entry.tags.some(t => selectedTags.has(t));
        if (!hasSelectedTag) return false;
      }

      // Type filter
      if (selectedType && entry.type !== selectedType) {
        return false;
      }

      return true;
    });
  }, [entries, searchQuery, selectedTags, selectedType]);

  // Toggle tag selection
  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  };

  // Stats
  const stats = useMemo(() => {
    const totalFiles = entries.reduce((sum, e) => sum + e.fileCount, 0);
    const totalRows = entries.reduce((sum, e) => sum + (e.rowCount || 0), 0);
    return { totalFiles, totalRows };
  }, [entries]);

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
            <span>{entries.length} datasets</span>
            <span>{stats.totalFiles.toLocaleString()} files</span>
            {stats.totalRows > 0 && <span>{stats.totalRows.toLocaleString()} rows</span>}
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
                  placeholder="Search datasets, columns, tags..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  autoFocus
                />
                {searchQuery && (
                  <button className="clear-search" onClick={() => setSearchQuery('')}>&times;</button>
                )}
              </div>

              <div className="type-filters">
                {['parquet', 'images', 'csv', 'mixed'].map(type => (
                  <button
                    key={type}
                    className={`type-btn ${selectedType === type ? 'active' : ''}`}
                    style={{ '--type-color': TYPE_COLORS[type] } as React.CSSProperties}
                    onClick={() => setSelectedType(selectedType === type ? null : type)}
                  >
                    <span className="type-icon">{TYPE_ICONS[type]}</span>
                    {type}
                  </button>
                ))}
              </div>

              <div className="tag-filters">
                {allTags.slice(0, 12).map(tag => (
                  <button
                    key={tag}
                    className={`tag-btn ${selectedTags.has(tag) ? 'active' : ''}`}
                    style={{ '--tag-color': TAG_COLORS[tag] || '#666' } as React.CSSProperties}
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Results count */}
            <div className="catalog-results-count">
              Showing {filteredEntries.length} of {entries.length} datasets
              {(searchQuery || selectedTags.size > 0 || selectedType) && (
                <button
                  className="clear-filters"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedTags(new Set());
                    setSelectedType(null);
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>

            {/* Entries grid */}
            <div className="catalog-grid">
              {filteredEntries.map(entry => (
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
                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      {entry.fileCount} files
                    </span>
                    <span className="meta-item">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      </svg>
                      {entry.totalSize}
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
                    {entry.rowCount !== undefined && entry.rowCount > 0 && (
                      <span className="meta-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <line x1="3" y1="9" x2="21" y2="9" />
                          <line x1="9" y1="21" x2="9" y2="9" />
                        </svg>
                        {entry.rowCount.toLocaleString()} rows
                      </span>
                    )}
                  </div>

                  <div className="card-tags">
                    {entry.tags.slice(0, 5).map((tag, i) => (
                      <span
                        key={i}
                        className="card-tag"
                        style={{ backgroundColor: TAG_COLORS[tag] || '#666' }}
                        onClick={e => {
                          e.stopPropagation();
                          toggleTag(tag);
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Expanded content */}
                  {expandedEntry === entry.id && (
                    <div className="card-expanded" onClick={e => e.stopPropagation()}>
                      {/* Sample images */}
                      {entry.sampleImages && entry.sampleImages.length > 0 && (
                        <div className="sample-images">
                          <h4>Sample Images</h4>
                          <div className="sample-grid">
                            {entry.sampleImages.map((img, i) => (
                              <img
                                key={i}
                                src={`/static${img}`}
                                alt={`Sample ${i + 1}`}
                                onClick={() => setExpandedImage(img)}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Columns */}
                      {entry.columns && entry.columns.length > 0 && (
                        <div className="columns-section">
                          <h4>Columns ({entry.columns.length})</h4>
                          <div className="columns-list">
                            {entry.columns.map((col, i) => (
                              <code key={i} className="column-name">{col}</code>
                            ))}
                          </div>
                        </div>
                      )}

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

            {filteredEntries.length === 0 && (
              <div className="catalog-empty">
                <p>No datasets match your filters</p>
              </div>
            )}
          </>
        )}

        {/* Expanded Image Modal */}
        {expandedImage && (
          <div className="image-lightbox" onClick={() => setExpandedImage(null)}>
            <img src={`/static${expandedImage}`} alt="Expanded" />
            <p className="image-path">{expandedImage}</p>
          </div>
        )}
      </div>
    </div>
  );
}
