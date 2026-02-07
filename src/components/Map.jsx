import { useState, useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getAllTrailsUrl } from '../config/resources';
import { STATES } from '../config/states';
import ResourcesPanel from './ResourcesPanel';

// You'll need to set this in your .env file as VITE_MAPBOX_TOKEN
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const DEFAULT_CENTER = [-122.35, 37.45];
const DEFAULT_ZOOM = 10;

export default function MapView(props) {
  const { trailsGeoJSON, trailsRaw, observationsGeoJSON, center, zoom, selectedState, showObservations = false, onShowObservationsChange } = props ?? {};
  const mapCenter = center || DEFAULT_CENTER;
  const mapZoom = zoom ?? DEFAULT_ZOOM;
  const showStyledTrails = Boolean(trailsGeoJSON?.features?.length);
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [showResourcesPanel, setShowResourcesPanel] = useState(false);
  const [selectedTrailName, setSelectedTrailName] = useState('');

  // Expose function to window for popup button click
  const handleShowResources = useCallback((trailName) => {
    setSelectedTrailName(trailName);
    setShowResourcesPanel(true);
  }, []);

  useEffect(() => {
    window.showResourcesPanel = handleShowResources;
    return () => {
      delete window.showResourcesPanel;
    };
  }, [handleShowResources]);

  // Initialize map
  useEffect(() => {
    if (map.current || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: mapCenter,
      zoom: mapZoom,
      attributionControl: false,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.current.addControl(new mapboxgl.AttributionControl(), 'bottom-right');

    map.current.on('load', () => {
      setMapLoaded(true);
      // Force system cursor (grab) so Mapbox doesn't show its default grey dot
      const canvas = map.current.getCanvas();
      const container = map.current.getContainer();
      const canvasContainer = container?.querySelector('.mapboxgl-canvas-container');
      const setCursor = (value) => {
        if (canvas) {
          canvas.style.cursor = value;
          canvas.style.setProperty('cursor', value, 'important');
        }
        if (canvasContainer) {
          canvasContainer.style.cursor = value;
          canvasContainer.style.setProperty('cursor', value, 'important');
        }
      };
      setCursor('grab');
      map.current.on('dragstart', () => setCursor('grabbing'));
      map.current.on('dragend', () => setCursor('grab'));
    });

    // Cleanup
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Fly to new center/zoom when state changes
  useEffect(() => {
    if (map.current && mapLoaded) {
      map.current.flyTo({ center: mapCenter, zoom: mapZoom, duration: 1000 });
    }
  }, [mapLoaded, mapCenter, mapZoom]);

  // Raw trails (gray) – show while loading before counts are ready
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const rawSourceId = 'trails-raw-source';
    const rawLayerId = 'trails-raw-layer';

    if (showStyledTrails || !trailsRaw?.features?.length) {
      if (map.current.getLayer(rawLayerId)) map.current.removeLayer(rawLayerId);
      if (map.current.getSource(rawSourceId)) map.current.removeSource(rawSourceId);
      return;
    }

    if (map.current.getLayer(rawLayerId)) map.current.removeLayer(rawLayerId);
    if (map.current.getSource(rawSourceId)) map.current.removeSource(rawSourceId);
    map.current.addSource(rawSourceId, { type: 'geojson', data: trailsRaw });
    map.current.addLayer({
      id: rawLayerId,
      type: 'line',
      source: rawSourceId,
      paint: {
        'line-color': '#94a3b8',
        'line-width': 2,
        'line-opacity': 0.7,
      },
    });
  }, [mapLoaded, trailsRaw, showStyledTrails]);

  // Styled trails (by observation count) – when analysis is ready
  useEffect(() => {
    if (!map.current || !mapLoaded || !trailsGeoJSON) {
      return;
    }

    const sourceId = 'trails-source';
    const layerId = 'trails-layer';
    const rawLayerId = 'trails-raw-layer';
    const rawSourceId = 'trails-raw-source';

    if (map.current.getLayer(rawLayerId)) map.current.removeLayer(rawLayerId);
    if (map.current.getSource(rawSourceId)) map.current.removeSource(rawSourceId);

    if (map.current.getLayer(layerId)) map.current.removeLayer(layerId);
    if (map.current.getSource(sourceId)) map.current.removeSource(sourceId);

    map.current.addSource(sourceId, {
      type: 'geojson',
      data: trailsGeoJSON,
    });

    // Add layer - only shows trails with observations > 0
    map.current.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-opacity': [
          'case',
          ['>', ['get', 'observationCount'], 0],
          0.85,
          0  // Hide trails with 0 observations
        ],
        'line-color': [
          'interpolate',
          ['linear'],
          ['get', 'observationCount'],
          1, '#fef08a',   // 1 obs - light yellow
          3, '#fde047',   // 3 obs - yellow
          5, '#facc15',   // 5 obs - gold
          10, '#f97316',  // 10 obs - orange
          20, '#dc2626',  // 20+ obs - red
        ],
        'line-width': [
          'interpolate',
          ['linear'],
          ['get', 'observationCount'],
          1, 3,
          10, 5,
          20, 7,
        ],
      },
    });

    // Add click handler for trails
    map.current.off('click', layerId); // remove previous handler when deps change
    map.current.on('click', layerId, (e) => {
      if (e.features && e.features.length > 0) {
        const feature = e.features[0];
        const props = feature.properties;
        const escapedName = props.name.replace(/'/g, "\\'");

        // Use AllTrails search URL only (no API lookup). Direct trail URLs from SerpAPI
        // can trigger AllTrails' bot detection and IP blocks even with few opens.
        const allTrailsUrl = getAllTrailsUrl(props.name, STATES[selectedState]?.name);

        new mapboxgl.Popup({ maxWidth: '280px' })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="trail-popup">
              <h3 class="popup-title">${props.name}</h3>
              <p class="popup-obs-count">${props.observationCount} observations nearby</p>
              
              <a href="${allTrailsUrl}" target="_blank" rel="noopener noreferrer" class="popup-alltrails-btn">
                View on AllTrails
              </a>
              
              <button 
                class="popup-resources-btn"
                onclick="window.showResourcesPanel('${escapedName}')"
              >
                Resources & Reports
              </button>
            </div>
          `)
          .addTo(map.current);
      }
    });

    // Change cursor on hover (pointer/hand for clickable trails)
    map.current.on('mouseenter', layerId, () => {
      const canvas = map.current.getCanvas();
      canvas.style.cursor = 'pointer';
      canvas.style.setProperty('cursor', 'pointer', 'important');
    });
    map.current.on('mouseleave', layerId, () => {
      const canvas = map.current.getCanvas();
      canvas.style.cursor = 'grab';
      canvas.style.setProperty('cursor', 'grab', 'important');
    });

  }, [mapLoaded, trailsGeoJSON, selectedState]);

  // Add/update observations layer
  useEffect(() => {
    if (!map.current || !mapLoaded || !observationsGeoJSON) return;

    const sourceId = 'observations-source';
    const layerId = 'observations-layer';

    // Remove existing layer and source if they exist
    if (map.current.getLayer(layerId)) {
      map.current.removeLayer(layerId);
    }
    if (map.current.getSource(sourceId)) {
      map.current.removeSource(sourceId);
    }

    // Add source
    map.current.addSource(sourceId, {
      type: 'geojson',
      data: observationsGeoJSON,
    });

    // Add layer (hidden by default; user can toggle via checkbox)
    map.current.addLayer({
      id: layerId,
      type: 'circle',
      source: sourceId,
      layout: {
        visibility: showObservations ? 'visible' : 'none',
      },
      paint: {
        'circle-radius': 6,
        'circle-color': '#ec4899',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.8,
      },
    });

    // Add click handler for observations
    map.current.on('click', layerId, (e) => {
      if (e.features && e.features.length > 0) {
        const props = e.features[0].properties;
        
        let html = `
          <div class="observation-popup" style="font-family: sans-serif; max-width: 240px; padding: 12px;">
            <strong style="display: block;">${props.species}</strong>
            <p style="margin: 4px 0 0; color: #6b7280; font-size: 0.85em;">${props.observedOn}</p>
        `;
        
        if (props.photoUrl) {
          html += `<img src="${props.photoUrl}" alt="${props.species}" style="max-width: 100%; max-height: 180px; margin-top: 10px; border-radius: 6px; display: block;" />`;
        }
        
        html += '</div>';
        
        new mapboxgl.Popup({ maxWidth: '260px', anchor: 'bottom' })
          .setLngLat(e.lngLat)
          .setHTML(html)
          .addTo(map.current);
      }
    });

    // Change cursor on hover (pointer/hand for clickable observations)
    map.current.on('mouseenter', layerId, () => {
      const canvas = map.current.getCanvas();
      canvas.style.cursor = 'pointer';
      canvas.style.setProperty('cursor', 'pointer', 'important');
    });
    map.current.on('mouseleave', layerId, () => {
      const canvas = map.current.getCanvas();
      canvas.style.cursor = 'grab';
      canvas.style.setProperty('cursor', 'grab', 'important');
    });

  }, [mapLoaded, observationsGeoJSON, showObservations]);

  // Toggle observations visibility
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    
    const layerId = 'observations-layer';
    if (map.current.getLayer(layerId)) {
      map.current.setLayoutProperty(
        layerId,
        'visibility',
        showObservations ? 'visible' : 'none'
      );
    }
  }, [showObservations, mapLoaded]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="map-error">
        <h3>Mapbox Token Required</h3>
        <p>Add your Mapbox access token to <code>.env</code>:</p>
        <pre>VITE_MAPBOX_TOKEN=your_token_here</pre>
        <p>
          Get a free token at{' '}
          <a href="https://account.mapbox.com/access-tokens/" target="_blank" rel="noopener noreferrer">
            mapbox.com
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="map-container">
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      {/* Resources Panel */}
      {showResourcesPanel && (
        <ResourcesPanel
          trailName={selectedTrailName}
          onClose={() => setShowResourcesPanel(false)}
        />
      )}
    </div>
  );
}
