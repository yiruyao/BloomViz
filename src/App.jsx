import { useState, useEffect, useMemo } from 'react';
import { fetchSanMateoTrails } from './services/overpassApi';
import { fetchFloweringObservations } from './services/iNaturalistApi';
import { calculateTrailDensity, getAnalysisSummary, getSpeciesBreakdown } from './utils/spatialAnalysis';
import Map from './components/Map';
import Legend from './components/Legend';
import './App.css';

function App() {
  const [trails, setTrails] = useState(null);
  const [observations, setObservations] = useState(null);
  const [results, setResults] = useState(null);
  const [summary, setSummary] = useState(null);
  const [speciesBreakdown, setSpeciesBreakdown] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [activeTab, setActiveTab] = useState('map'); // 'map' or 'table'

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        // Fetch trails and observations in parallel
        setLoadingStatus('Fetching trails from OpenStreetMap...');
        const trailsPromise = fetchSanMateoTrails();
        
        setLoadingStatus('Fetching flowering observations from iNaturalist...');
        const observationsPromise = fetchFloweringObservations();

        const [trailsData, observationsData] = await Promise.all([
          trailsPromise,
          observationsPromise,
        ]);

        setTrails(trailsData);
        setObservations(observationsData);

        console.log('Trails loaded:', trailsData.features.length);
        console.log('Observations loaded:', observationsData.features.length);

        // Perform spatial analysis
        setLoadingStatus('Performing spatial analysis...');
        const analysisResults = calculateTrailDensity(trailsData, observationsData);
        setResults(analysisResults);

        // Calculate summary stats
        const summaryStats = getAnalysisSummary(analysisResults);
        setSummary(summaryStats);

        // Get species breakdown
        const species = getSpeciesBreakdown(analysisResults);
        setSpeciesBreakdown(species);

        setLoadingStatus('');
        setLoading(false);
      } catch (err) {
        console.error('Error loading data:', err);
        setError(err.message);
        setLoading(false);
      }
    }

    loadData();
  }, []);

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
          <p>Wildflower Trail Finder - San Mateo County</p>
        </header>
        <div className="loading">
          <div className="spinner"></div>
          <p>{loadingStatus || 'Loading...'}</p>
          <p className="hint">This may take 10-30 seconds (Overpass API can be slow)</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app">
        <header className="header">
          <h1>BloomScout</h1>
          <p>Wildflower Trail Finder - San Mateo County</p>
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
          <p>Wildflower Trail Finder - San Mateo County</p>
        </div>
        {summary && (
          <div className="header-stats">
            <span><strong>{summary.trailsWithObservations}</strong> active trails</span>
            <span><strong>{observations?.features?.length || 0}</strong> observations</span>
          </div>
        )}
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
                  Buffer: {summary.bufferDistance}m around trails | Data: Last 2 weeks
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
                          {result.observationsNearby.length > 0 
                            ? [...new Set(result.observationsNearby.map(o => o.species))].join(', ')
                            : '-'
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="no-results">No trails found in San Mateo County.</p>
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
