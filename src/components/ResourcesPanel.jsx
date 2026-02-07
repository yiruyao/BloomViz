/**
 * ResourcesPanel - Floating panel that shows wildflower resource links
 * Appears when user clicks "Resources & Reports" button in trail popup.
 * Receives pre-filtered resources (those linked to this trail via resource_trail_links).
 */
export default function ResourcesPanel({ resources = [], loading = false, onClose }) {
  const displayResources = resources;

  return (
    <div className="resources-panel">
      <div className="resources-panel-header">
        <h3>Resources & Reports</h3>
        <button className="resources-panel-close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="resources-panel-list">
        {loading ? (
          <p className="resources-panel-empty">Loading…</p>
        ) : displayResources.length > 0 ? (
          displayResources.map((resource, idx) => (
            <a
              key={`${resource.id}-${resource.name}-${idx}`}
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="resources-panel-link"
            >
              <span className="resources-panel-link-name">{resource.name}</span>
              <span className="resources-panel-link-desc">{resource.description}</span>
            </a>
          ))
        ) : (
          <p className="resources-panel-empty">No resources linked for this trail.</p>
        )}
      </div>
    </div>
  );
}
