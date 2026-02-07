import { useState, useEffect, useMemo, useRef } from 'react';
import { fetchTrails, fetchObservations, fetchTrailCounts } from './services/api';
import {
  calculateTrailDensity,
  buildResultsFromCounts,
  getAnalysisSummary,
  getSpeciesBreakdown,
} from './utils/spatialAnalysis';
import { STATES } from './config/states';
import MapView from './components/Map';
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
  const [showObservations, setShowObservations] = useState(false);
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

        setLoadingStatus('Loading trails...');
        const trailsData = await fetchTrails(selectedState);
        if (!mountRef.current) return;

        const trailFeatures = trailsData?.features ?? [];
        if (trailFeatures.length === 0) {
          setError('No trail data for this state. Run the fill-trails script and ensure the database is configured.');
          setLoading(false);
          return;
        }
        setTrails(trailsData);
        console.log('Trails loaded:', trailFeatures.length);

        setLoadingStatus('Loading observations...');
        const [observationsData, trailCountsData] = await Promise.all([
          fetchObservations(selectedState),
          fetchTrailCounts(selectedState).catch(() => null),
        ]);
        if (!mountRef.current) return;

        setObservations(observationsData);
        const obsCount = observationsData?.features?.length ?? 0;
        console.log('Observations loaded:', obsCount);

        let analysisResults;
        if (Array.isArray(trailCountsData) && trailCountsData.length > 0) {
          setLoadingStatus('Applying counts...');
          analysisResults = buildResultsFromCounts(trailsData, trailCountsData);
          console.log('Using precomputed trail counts');
        } else {
          setLoadingStatus('Analyzing...');
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
        const msg = err?.message || String(err);
        const isAbort = err?.name === 'AbortError' || /aborted|signal is aborted/i.test(msg);
        setError(isAbort ? 'Request timed out while loading trails. Please try again.' : msg || 'Failed to load data');
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

  if (error) {
    return (
      <div className="app">
        <header className="header">
          <h1 className="app-title">Bloom Map</h1>
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
          <h1 className="app-title">Bloom Map</h1>
          <p>Wildflower Trail Finder</p>
        </div>
        <div className="header-actions">
          {loading && (
            <span className="header-loading" aria-live="polite">
              {loadingStatus || 'Loading…'}
            </span>
          )}
          <StateSelector
            value={selectedState}
            onChange={setSelectedState}
            disabled={loading}
          />
          {summary && (
            <div className="header-stats">
              <span><strong>{summary.trailsWithObservations}</strong> blooming trails</span>
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
          Insights
        </button>
      </div>

      <main className="main-content">
        {/* Map View */}
        {activeTab === 'map' && (
          <div className="map-view">
            {loading && (
              <div className="map-loading-overlay" aria-hidden>
                <span className="map-loading-text">{loadingStatus || 'Loading trails…'}</span>
              </div>
            )}
            <MapView
              trailsGeoJSON={trailsWithCounts}
              trailsRaw={trails}
              observationsGeoJSON={observations}
              center={STATES[selectedState]?.center}
              zoom={STATES[selectedState]?.zoom}
              selectedState={selectedState}
              showObservations={showObservations}
              onShowObservationsChange={setShowObservations}
            />
            <Legend
              showObservations={showObservations}
              onShowObservationsChange={setShowObservations}
            />
          </div>
        )}

        {/* Insights View */}
        {activeTab === 'table' && (
          <div className="table-view trail-list-overhaul">
            {loading ? (
              <div className="trail-list-loading">
                <span className="trail-list-loading-text">{loadingStatus || 'Loading…'}</span>
              </div>
            ) : (
              <>
                {/* Top 10 Blooming Trails */}
                <section className="trail-list-section top-trails">
                  <h2 className="trail-list-heading">Top 10 blooming trails to hike right now</h2>
                  <p className="trail-list-subtitle">
                    Best trails for wildflower sightings in {STATES[selectedState]?.name ?? 'your area'} · Last 7 days
                  </p>
                  {results && results.length > 0 ? (
                    <ol className="top-trails-list">
                      {results.slice(0, 10).map((result, index) => (
                        <li key={result.name} className="top-trail-card">
                          <span className="top-trail-rank">{index + 1}</span>
                          <div className="top-trail-body">
                            <span className="top-trail-name">{result.name}</span>
                            <div className="top-trail-meta">
                              <span className={`top-trail-count count-${getCountClass(result.observationCount)}`}>
                                {result.observationCount} {result.observationCount === 1 ? 'sighting' : 'sightings'}
                              </span>
                              {(result.speciesBreakdown?.length || result.observationsNearby?.length) > 0 && (
                                <span className="top-trail-species">
                                  {result.speciesBreakdown?.length
                                    ? result.speciesBreakdown.slice(0, 3).map(s => s.species).join(', ')
                                    : [...new Set(result.observationsNearby.map(o => o.species))].slice(0, 3).join(', ')}
                                </span>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="trail-list-empty">No trails with recent bloom data for this state.</p>
                  )}
                </section>

                {/* Top species in bloom */}
                <section className="trail-list-section top-species">
                  <h2 className="trail-list-heading">Top species in bloom in {STATES[selectedState]?.name ?? 'your area'}</h2>
                  <p className="trail-list-subtitle">
                    Most observed wildflowers near trails · Last 7 days
                  </p>
                  {speciesBreakdown && speciesBreakdown.length > 0 ? (
                    <ul className="top-species-list">
                      {speciesBreakdown.slice(0, 10).map(({ species, count }, index) => (
                        <li key={species} className="top-species-item">
                          <span className="top-species-rank">{index + 1}</span>
                          <span className="top-species-name">{species}</span>
                          <span className="top-species-count">{count} {count === 1 ? 'sighting' : 'sightings'}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="trail-list-empty">No species data yet. Observations may still be loading.</p>
                  )}
                </section>
              </>
            )}
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
