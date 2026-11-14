// Shared, reproducible geographic settings for the data pipeline.
// Bounding box covers the main BYU–Idaho campus (OSM relation 8311245),
// the Rexburg Idaho Temple, and a modest ring of surrounding streets.
// South edge extended (playtest 2) to include the south-campus intramural "upper fields".
export const BBOX = { south: 43.8068, west: -111.7905, north: 43.8235, east: -111.7755 };
// Local tangent-plane origin (approx. campus centre). Game units are metres.
// x = east, y = up, z = south (so north is -z, the Three.js "forward").
export const ORIGIN = { lat: 43.8170, lon: -111.7830 };
export const ELEV_STEP_M = 40; // elevation sample spacing
