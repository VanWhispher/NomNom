// Netlify Function: proxy to Google Places API (New) — Nearby Search.
//
// The Places key lives ONLY here, read from the GOOGLE_PLACES_KEY environment
// variable you set in Netlify (Site configuration -> Environment variables).
// It is never sent to the browser and never committed to git, so it cannot be
// lifted from the deployed page's source. The app calls /.netlify/functions/places.

const PRICE = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

exports.handler = async (event) => {
  const json = (code, obj) => ({
    statusCode: code,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj),
  });

  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST.' });

  const key = process.env.GOOGLE_PLACES_KEY;
  if (!key) return json(500, { error: 'Server is missing GOOGLE_PLACES_KEY.' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (_) { return json(400, { error: 'Invalid request body.' }); }

  const lat = Number(body.lat), lng = Number(body.lng);
  if (!isFinite(lat) || !isFinite(lng)) return json(400, { error: 'lat and lng are required.' });

  let radius = Number(body.radius) || 600;
  radius = Math.max(50, Math.min(1500, radius));

  const payload = {
    includedTypes: ['restaurant', 'cafe', 'meal_takeaway', 'bakery'],
    maxResultCount: 20,
    rankPreference: 'DISTANCE',
    locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius } },
  };

  let res, data;
  try {
    res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        // Minimal field mask keeps each call in the cheaper tier.
        'X-Goog-FieldMask': 'places.displayName,places.location,places.primaryType,places.priceLevel,places.businessStatus',
      },
      body: JSON.stringify(payload),
    });
    data = await res.json();
  } catch (e) {
    return json(502, { error: 'Could not reach Google Places.' });
  }

  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || ('Places API error ' + res.status);
    return json(res.status, { error: msg });
  }

  const places = (data.places || [])
    .filter((p) => !p.businessStatus || p.businessStatus === 'OPERATIONAL')
    .map((p) => ({
      name: (p.displayName && p.displayName.text) || 'Unknown place',
      lat: p.location && p.location.latitude,
      lng: p.location && p.location.longitude,
      type: p.primaryType || '',
      priceLevel: PRICE[p.priceLevel] != null ? PRICE[p.priceLevel] : 0,
    }))
    .filter((p) => isFinite(p.lat) && isFinite(p.lng));

  return json(200, { places });
};
