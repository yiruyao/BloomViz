import { filterResourcesForTrail } from '../config/resources';

/**
 * ResourcesPanel - Floating panel that shows wildflower resource links
 * Appears when user clicks "Resources & Reports" button in trail popup.
 * Shows only resources linked to this trail via resource_trail_links (osm_type, osm_id).
 */
export default function ResourcesPanel({ trailName, trailProps, resources = [], onClose }) {
  const displayResources = trailProps
    ? filterResourcesForTrail(resources, trailProps)
    : resources;

  return (
    <div className="resources-panel">
      <div className="resources-panel-header">
        <h3>Resources & Reports</h3>
        <button className="resources-panel-close" onClick={onClose}>
          ×
        </button>
      </div>

      {trailName && (
        <p className="resources-panel-trail">For: {trailName}</p>
      )}

      <div className="resources-panel-list">
        {displayResources.length > 0 ? (
          displayResources.map((resource) => (
            <a
              key={resource.id}
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
