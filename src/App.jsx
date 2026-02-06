import { useState, useEffect, useMemo, useRef } from 'react';
import { fetchTrails, fetchObservations, fetchTrailCounts } from './services/api';
import {
  calculateTrailDensity,
  buildResultsFromCounts,
  getAnalysisSummary,
  getSpeciesBreakdown,
} from './utils/spatialAnalysis';
import { STATES } from './config/states';
import Map from './components/Map';
import Legend from './components/Legend';
import StateSelector from './components/StateSelector';
import './App.css';

const DEFAULT_STATE = 'ca';

// Per-state cache: once a state is loaded, switching back is instant (no refetch, no re-analysis)
const stateDataCache = new Map();

function App() {
  const [selectedState, setSelectedState] = useState(DEFAULT_STATE);
  const [trails, setTrails] = useState(null);
  const [observations, setObservations] = useState(null);
  const [results, setResults] = useState(null);
  const [summary, setSummary] = useState(null);
  const [speciesBreakdown, setSpeciesBreakdown] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [activeTab, setActiveTab] = useState('map');
  const mountRef = useRef(true);

  useEffect(() => {
    const stateKey = selectedState.toLowerCase();
    if (typeof console !== 'undefined') {
      console.log('[BloomScout] Loading data for state:', stateKey);
    }

    // Restore from cache when switching back to a previously loaded state
    const cached = stateDataCache.get(stateKey);
    if (cached) {
      setTrails(cached.trails);
      setObservations(cached.observations);
      setResults(cached.results);
      setSummary(cached.summary);
      setSpeciesBreakdown(cached.speciesBreakdown);
      setLoading(false);
      setError(null);
      setLoadingStatus('');
      return;
    }

    mountRef.current = true;
    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        setLoadingStatus(`Loading ${STATES[selectedState]?.name || selectedState}...`);
        const [trailsData, observationsData, trailCountsData] = await Promise.all([
          fetchTrails(selectedState),
          fetchObservations(selectedState),
          fetchTrailCounts(selectedState).catch(() => null),
        ]);

        if (!mountRef.current) return;

        const trailFeatures = trailsData?.features ?? [];
        if (trailFeatures.length === 0) {
          setError('No trail data for this state. Run the fill-trails script and ensure the database is configured.');
          setLoading(false);
          return;
        }

        setTrails(trailsData);
        setObservations(observationsData);

        const trailCount = trailsData?.features?.length ?? 0;
        const obsCount = observationsData?.features?.length ?? 0;
        console.log('Trails loaded:', trailCount, 'Observations loaded:', obsCount);

        let analysisResults;
        if (Array.isArray(trailCountsData) && trailCountsData.length > 0) {
          analysisResults = buildResultsFromCounts(trailsData, trailCountsData);
          console.log('Using precomputed trail counts');
        } else {
          setLoadingStatus('Performing spatial analysis...');
          analysisResults = calculateTrailDensity(trailsData, observationsData);
        }
        setResults(analysisResults);

        const newSummary = getAnalysisSummary(analysisResults);
        const newSpeciesBreakdown = getSpeciesBreakdown(analysisResults);
        setSummary(newSummary);
        setSpeciesBreakdown(newSpeciesBreakdown);

        // Cache this state so switching back is instant
        stateDataCache.set(stateKey, {
          trails: trailsData,
          observations: observationsData,
          results: analysisResults,
          summary: newSummary,
          speciesBreakdown: newSpeciesBreakdown,
        });

        setLoadingStatus('');
        setLoading(false);
      } catch (err) {
        if (!mountRef.current) return;
        console.error('Error loading data:', err);
        setError(err?.message || String(err) || 'Failed to load data');
        setLoading(false);
      }
    }

    loadData();
    return () => {
      mountRef.current = false;
    };
  }, [selectedState]);

  // Create GeoJSON with observation counts for the map
  const trailsWithCounts = useMemo(() => {
    if (!results) return null;
    
    return {
      type: 'FeatureCollection',
      features: results.map(r => ({
        ...r.trail,
        properties: {
          ...r.trail.properties,
          observationCount: r.observationCount,
        },
      })),
    };
  }, [results]);

  if (loading) {
    return (
      <div className="app">
        <header className="header">
          <h1>BloomScout</h1>
          <p>Wildflower Trail Finder</p>
        </header>
        <div className="loading">
          <div className="spinner"></div>
          <p>{loadingStatus || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app">
        <header className="header">
          <h1>BloomScout</h1>
          <p>Wildflower Trail Finder</p>
        </header>
        <div className="error">
          <h2>Error Loading Data</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app app-with-map">
      <header className="header compact">
        <div className="header-content">
          <h1>BloomScout</h1>
          <p>Wildflower Trail Finder – {STATES[selectedState]?.name ?? selectedState}</p>
        </div>
        <div className="header-actions">
          <StateSelector
            value={selectedState}
            onChange={setSelectedState}
            disabled={loading}
          />
          {summary && (
            <div className="header-stats">
              <span><strong>{summary.trailsWithObservations}</strong> active trails</span>
              <span><strong>{observations?.features?.length || 0}</strong> observations</span>
            </div>
          )}
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="tab-nav">
        <button 
          className={`tab-btn ${activeTab === 'map' ? 'active' : ''}`}
          onClick={() => setActiveTab('map')}
        >
          Map View
        </button>
        <button 
          className={`tab-btn ${activeTab === 'table' ? 'active' : ''}`}
          onClick={() => setActiveTab('table')}
        >
          Trail List
        </button>
      </div>

      <main className="main-content">
        {/* Map View */}
        {activeTab === 'map' && (
          <div className="map-view">
            <Map 
              trailsGeoJSON={trailsWithCounts} 
              observationsGeoJSON={observations}
              center={STATES[selectedState]?.center}
              zoom={STATES[selectedState]?.zoom}
              selectedState={selectedState}
            />
            <Legend />
          </div>
        )}

        {/* Table View */}
        {activeTab === 'table' && (
          <div className="table-view">
            {/* Summary Stats */}
            {summary && (
              <section className="summary">
                <h2>Analysis Summary</h2>
                <div className="stats-grid">
                  <div className="stat">
                    <span className="stat-value">{summary.totalTrails}</span>
                    <span className="stat-label">Named Trails</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">{summary.trailsWithObservations}</span>
                    <span className="stat-label">Trails with Flowers</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">{summary.totalObservationsNearTrails}</span>
                    <span className="stat-label">Observations Near Trails</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">{observations?.features?.length || 0}</span>
                    <span className="stat-label">Total Observations</span>
                  </div>
                </div>
                <p className="buffer-note">
                  Buffer: {summary.bufferDistance}m around trails | Data: Last 7 days
                </p>
              </section>
            )}

            {/* Species Breakdown */}
            {speciesBreakdown && speciesBreakdown.length > 0 && (
              <section className="species-section">
                <h2>Species Near Trails</h2>
                <div className="species-tags">
                  {speciesBreakdown.map(({ species, count }) => (
                    <span key={species} className="species-tag">
                      {species}: {count}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Results Table */}
            <section className="results-section">
              <h2>Trail Rankings by Wildflower Activity</h2>
              {results && results.length > 0 ? (
                <table className="results-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Trail Name</th>
                      <th>Observations</th>
                      <th>Species Spotted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result, index) => (
                      <tr 
                        key={result.name} 
                        className={result.observationCount > 0 ? 'has-flowers' : ''}
                      >
                        <td className="rank">{index + 1}</td>
                        <td className="trail-name">{result.name}</td>
                        <td className="count">
                          <span className={`count-badge count-${getCountClass(result.observationCount)}`}>
                            {result.observationCount}
                          </span>
                        </td>
                        <td className="species">
                          {result.speciesBreakdown?.length
                            ? result.speciesBreakdown.map(s => s.species).join(', ')
                            : result.observationsNearby?.length
                              ? [...new Set(result.observationsNearby.map(o => o.species))].join(', ')
                              : '-'
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="no-results">No trails found for this state.</p>
              )}
            </section>
          </div>
        )}
      </main>

      <footer className="footer">
        <p>
          Data: <a href="https://www.openstreetmap.org" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> | 
          <a href="https://www.inaturalist.org" target="_blank" rel="noopener noreferrer">iNaturalist</a> |
          Map: <a href="https://www.mapbox.com" target="_blank" rel="noopener noreferrer">Mapbox</a>
        </p>
      </footer>
    </div>
  );
}

/**
 * Get CSS class based on observation count for color coding
 */
function getCountClass(count) {
  if (count === 0) return 'zero';
  if (count <= 2) return 'low';
  if (count <= 5) return 'medium';
  if (count <= 10) return 'high';
  return 'very-high';
}

export default App;
