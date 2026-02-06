/**
 * State config for API/cron (duplicated so serverless doesn't depend on src/)
 */
export const STATES = {
  ca: {
    name: 'California',
    iNaturalistPlaceId: 14,
  },
  or: {
    name: 'Oregon',
    iNaturalistPlaceId: 11,
  },
  wa: {
    name: 'Washington',
    iNaturalistPlaceId: 46,
  },
};
