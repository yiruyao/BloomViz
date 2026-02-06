/**
 * State configuration for CA, OR, WA
 * iNaturalist place_id and map defaults
 */
export const STATES = {
  ca: {
    name: 'California',
    iNaturalistPlaceId: 14,
    bounds: [[-124.48, 32.53], [-114.13, 42.01]],
    center: [-119.4179, 36.7783],
    zoom: 5.5,
  },
  or: {
    name: 'Oregon',
    iNaturalistPlaceId: 11,
    bounds: [[-124.57, 41.99], [-116.46, 46.29]],
    center: [-120.5542, 43.8041],
    zoom: 6,
  },
  wa: {
    name: 'Washington',
    iNaturalistPlaceId: 46,
    bounds: [[-124.85, 45.54], [-116.92, 49.0]],
    center: [-120.7401, 47.7511],
    zoom: 6,
  },
};

export const STATE_OPTIONS = [
  { value: 'ca', label: 'California' },
  { value: 'or', label: 'Oregon' },
  { value: 'wa', label: 'Washington' },
];
