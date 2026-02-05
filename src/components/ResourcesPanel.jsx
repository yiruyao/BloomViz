import { WILDFLOWER_RESOURCES } from '../config/resources';

/**
 * ResourcesPanel - Floating panel that shows wildflower resource links
 * Appears when user clicks "Resources & Reports" button in trail popup
 */
export default function ResourcesPanel({ trailName, onClose }) {
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
        {WILDFLOWER_RESOURCES.map((resource, index) => (
          <a
            key={index}
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className="resources-panel-link"
          >
            <span className="resources-panel-link-name">{resource.name}</span>
            <span className="resources-panel-link-desc">{resource.description}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
