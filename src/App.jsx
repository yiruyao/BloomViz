import { useState, useEffect, useMemo, useRef } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { fetchTrails, fetchObservations, fetchTrailCounts, fetchTrailList } from './services/api';
import {
  calculateTrailDensity,
  buildResultsFromCounts,
  getAnalysisSummary,
  getSpeciesBreakdown,
} from './utils/spatialAnalysis';
import { STATES } from './config/states';
import { getAllTrailsUrl, getINaturalistSpeciesUrl } from './config/resources';
import MapView from './components/Map';
import Legend from './components/Legend';
import StateSelector from './components/StateSelector';
import './App.css';

const DEFAULT_STATE = 'ca';

// Per-state cache for full map data (trails + results); list view uses optimized trail-list API
const stateDataCache = new Map();

function App() {
  const [selectedState, setSelectedState] = useState(DEFAULT_STATE);
  const [activeTab, setActiveTab] = useState('map');

  // Optimized list view: top 10 trails + top species from /api/trail-list
  const [trailListData, setTrailListData] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);

  // Full map data (lazy-loaded when user opens map)
  const [trails, setTrails] = useState(null);
  const [observations, setObservations] = useState(null);
  const [results, setResults] = useState(null);
  const [summary, setSummary] = useState(null);
  const [speciesBreakdown, setSpeciesBreakdown] = useState(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapLoadingStatus, setMapLoadingStatus] = useState('');
  const [mapError, setMapError] = useState(null);

  const [showObservations, setShowObservations] = useState(false);
  const mountRef = useRef(true);

  // Load optimized trail-list for list view (top 10 trails + top species)
  useEffect(() => {
    const stateKey = selectedState.toLowerCase();
    mountRef.current = true;
    setListError(null);
    setListLoading(true);

    (async function loadTrailList() {
      try {
        const data = await fetchTrailList(selectedState);
        if (!mountRef.current) return;
        setTrailListData(data);
      } catch (err) {
        if (!mountRef.current) return;
        console.error('Trail list load error:', err);
        const msg = err?.message || String(err);
        const isAbort = err?.name === 'AbortError' || /aborted|signal is aborted/i.test(msg);
        setListError(isAbort ? 'Request timed out. Please try again.' : msg);
        setTrailListData(null);
      } finally {
        if (mountRef.current) setListLoading(false);
      }
    })();

    return () => { mountRef.current = false; };
  }, [selectedState]);

  // When user opens map tab, load full trails + counts (or observations) if not cached
  useEffect(() => {
    if (activeTab !== 'map') return;

    const stateKey = selectedState.toLowerCase();
    const cached = stateDataCache.get(stateKey);
    if (cached) {
      setTrails(cached.trails);
      setObservations(cached.observations);
      setResults(cached.results);
      setSummary(cached.summary);
      setSpeciesBreakdown(cached.speciesBreakdown);
      setMapError(null);
      return;
    }

    let cancelled = false;
    setMapError(null);
    setMapLoading(true);

    (async function loadMapData() {
      try {
        setMapLoadingStatus('Loading trails...');
        const trailsData = await fetchTrails(selectedState);
        if (cancelled) return;
        const trailFeatures = trailsData?.features ?? [];
        if (trailFeatures.length === 0) {
          setMapError('No trail data for this state. Run the fill-trails script and ensure the database is configured.');
          setMapLoading(false);
          return;
        }
        setTrails(trailsData);

        setMapLoadingStatus('Loading counts...');
        const [observationsData, trailCountsData] = await Promise.all([
          fetchObservations(selectedState),
          fetchTrailCounts(selectedState).catch(() => null),
        ]);
        if (cancelled) return;

        setObservations(observationsData);
        let analysisResults;
        if (Array.isArray(trailCountsData) && trailCountsData.length > 0) {
          setMapLoadingStatus('Applying counts...');
          analysisResults = buildResultsFromCounts(trailsData, trailCountsData);
        } else {
          setMapLoadingStatus('Analyzing...');
          analysisResults = calculateTrailDensity(trailsData, observationsData);
        }
        if (cancelled) return;

        const newSummary = getAnalysisSummary(analysisResults);
        const newSpeciesBreakdown = getSpeciesBreakdown(analysisResults);
        setResults(analysisResults);
        setSummary(newSummary);
        setSpeciesBreakdown(newSpeciesBreakdown);
        stateDataCache.set(stateKey, {
          trails: trailsData,
          observations: observationsData,
          results: analysisResults,
          summary: newSummary,
          speciesBreakdown: newSpeciesBreakdown,
        });
      } catch (err) {
        if (!cancelled) {
          console.error('Map data load error:', err);
          const msg = err?.message || String(err);
          const isAbort = err?.name === 'AbortError' || /aborted|signal is aborted/i.test(msg);
          setMapError(isAbort ? 'Request timed out. Please try again.' : msg);
        }
      } finally {
        if (!cancelled) {
          setMapLoading(false);
          setMapLoadingStatus('');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [activeTab, selectedState]);

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

  const headerSummary = trailListData?.summary ?? summary;

  if (listError && !trailListData) {
    return (
      <div className="app">
        <header className="header">
          <h1 className="app-title">Bloom Map</h1>
          <p>Wildflower Trail Finder</p>
        </header>
        <div className="error">
          <h2>Error Loading Trail List</h2>
          <p>{listError}</p>
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
          {listLoading && (
            <span className="header-loading" aria-live="polite">
              Loading list…
            </span>
          )}
          {activeTab === 'map' && mapLoading && (
            <span className="header-loading" aria-live="polite">
              {mapLoadingStatus || 'Loading map…'}
            </span>
          )}
          <StateSelector
            value={selectedState}
            onChange={setSelectedState}
            disabled={listLoading}
          />
          {headerSummary && (
            <div className="header-stats">
              <span><strong>{headerSummary.trailsWithObservations}</strong> blooming trails</span>
              <span><strong>{headerSummary.totalObservations ?? observations?.features?.length ?? 0}</strong> observations</span>
            </div>
          )}
        </div>
      </header>

      {/* Tab Navigation – Radix UI */}
      <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="tabs-root">
        <Tabs.List className="tab-nav">
          <Tabs.Trigger className="tab-btn" value="map">
            Map View
          </Tabs.Trigger>
          <Tabs.Trigger className="tab-btn" value="table">
            Insights
          </Tabs.Trigger>
        </Tabs.List>

        <main className="main-content">
          <Tabs.Content value="map" className="tab-content tab-content-map">
          <div className="map-view">
            {mapError && (
              <div className="map-error-overlay">
                <p>{mapError}</p>
                <button type="button" onClick={() => window.location.reload()}>Retry</button>
              </div>
            )}
            {mapLoading && !stateDataCache.get(selectedState.toLowerCase()) && (
              <div className="map-loading-overlay" aria-hidden>
                <span className="map-loading-text">{mapLoadingStatus || 'Loading map…'}</span>
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
          </Tabs.Content>

          <Tabs.Content value="table" className="tab-content">
          <div className="table-view trail-list-overhaul">
            {listLoading ? (
              <div className="trail-list-loading">
                <span className="trail-list-loading-text">Loading trail list…</span>
              </div>
            ) : (
              <>
                <section className="trail-list-section top-trails">
                  <h2 className="trail-list-heading">Top 10 blooming trails to hike right now</h2>
                  <p className="trail-list-subtitle">
                    Best trails for wildflower sightings in {STATES[selectedState]?.name ?? 'your area'} · Last 7 days
                  </p>
                  {trailListData?.topTrails?.length > 0 ? (
                    <ol className="top-trails-list">
                      {trailListData.topTrails.map((t, index) => (
                        <li key={t.trail_name} className="top-trail-card">
                          <span className="top-trail-rank">{index + 1}</span>
                          <div className="top-trail-body">
                            <div className="top-trail-title-row">
                              <a
                                href={getAllTrailsUrl(t.trail_name, STATES[selectedState]?.name)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="top-trail-name"
                              >
                                {t.trail_name}
                              </a>
                              <span className="top-trail-count">
                                {t.observation_count} {t.observation_count === 1 ? 'sighting' : 'sightings'}
                              </span>
                            </div>
                            {Array.isArray(t.species_breakdown) && t.species_breakdown.length > 0 && (
                              <div className="top-trail-species">
                                {t.species_breakdown.slice(0, 3).map((s, i) => (
                                  <a
                                    key={`${s?.species ?? 'unknown'}-${i}`}
                                    href={getINaturalistSpeciesUrl(s?.taxon_id, s?.species)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="top-trail-species-link"
                                  >
                                    {s?.species ?? 'Unknown'}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="trail-list-empty">No trails with recent bloom data for this state.</p>
                  )}
                </section>

                <section className="trail-list-section top-species">
                  <h2 className="trail-list-heading">Top species in bloom in {STATES[selectedState]?.name ?? 'your area'}</h2>
                  <p className="trail-list-subtitle">
                    Most observed wildflowers near trails · Last 7 days
                  </p>
                  {trailListData?.topSpecies?.length > 0 ? (
                    <ul className="top-species-list">
                      {trailListData.topSpecies.map(({ species, count, taxon_id }, index) => (
                        <li key={species} className="top-species-item">
                          <span className="top-species-rank">{index + 1}</span>
                          <a
                            href={getINaturalistSpeciesUrl(taxon_id, species)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="top-species-name"
                          >
                            {species}
                          </a>
                          <span className="top-species-count">{count} {count === 1 ? 'sighting' : 'sightings'}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="trail-list-empty">No species data yet.</p>
                  )}
                </section>
              </>
            )}
          </div>
          </Tabs.Content>
        </main>
      </Tabs.Root>

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

export default App;
