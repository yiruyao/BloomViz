/**
 * Legend component for the trail color scale
 */
export default function Legend() {
  const gradientStops = [
    { color: '#fef08a', label: '1' },
    { color: '#fde047', label: '3' },
    { color: '#facc15', label: '5' },
    { color: '#f97316', label: '10' },
    { color: '#dc2626', label: '20+' },
  ];

  return (
    <div className="legend">
      <h4>Trail Activity</h4>
      <p className="legend-subtitle">Flowering observations (last 7 days)</p>
      
      <div className="legend-scale">
        <div 
          className="legend-gradient"
          style={{
            background: `linear-gradient(to right, ${gradientStops.map(s => s.color).join(', ')})`,
          }}
        />
        <div className="legend-labels">
          {gradientStops.map((stop, i) => (
            <span key={i}>{stop.label}</span>
          ))}
        </div>
      </div>

      <div className="legend-items">
        <div className="legend-item">
          <span 
            className="legend-dot" 
            style={{ background: '#ec4899', border: '2px solid white' }}
          />
          <span>Observation point</span>
        </div>
        <div className="legend-item">
          <span 
            className="legend-line" 
            style={{ background: '#9ca3af' }}
          />
          <span>Trail (no recent flowers)</span>
        </div>
      </div>
    </div>
  );
}
