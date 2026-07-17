const DEPOT = { lat: 41.7658, lng: -72.6734 };

export function pseudoGeocode(address = '') {
  let hash = 2166136261;
  for (const c of address.toLowerCase()) { hash ^= c.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  const a = ((hash >>> 0) % 10000) / 10000;
  const b = (((hash >>> 8) >>> 0) % 10000) / 10000;
  return { lat: 41.55 + a * 0.48, lng: -73.05 + b * 0.72 };
}

export function serviceMinutes(boxes = 0, value = 0) {
  return Math.max(6, Math.round(5 + boxes * 0.85 + (value > 1000 ? 5 : value > 500 ? 2 : 0)));
}

function miles(a, b) {
  const dx = (a.lng - b.lng) * 52.5;
  const dy = (a.lat - b.lat) * 69;
  return Math.sqrt(dx * dx + dy * dy);
}

export function routeMetrics(stops) {
  let cursor = DEPOT, distanceMiles = 0, service = 0;
  for (const stop of stops) {
    const point = { lat: stop.customer.latitude, lng: stop.customer.longitude };
    distanceMiles += miles(cursor, point); cursor = point;
    service += stop.estimatedServiceMinutes || serviceMinutes(stop.boxCount, stop.invoiceValue);
  }
  if (stops.length) distanceMiles += miles(cursor, DEPOT);
  const drivingMinutes = Math.round(distanceMiles / 28 * 60);
  return { distanceMiles: Math.round(distanceMiles * 10) / 10, drivingMinutes, serviceMinutes: service, totalMinutes: drivingMinutes + service, boxes: stops.reduce((n,s)=>n+s.boxCount,0), invoiceValue: stops.reduce((n,s)=>n+s.invoiceValue,0), stops: stops.length };
}

export function optimizeOrder(stops) {
  const remaining = [...stops], result = []; let cursor = DEPOT;
  while (remaining.length) {
    remaining.sort((a,b)=>miles(cursor,{lat:a.customer.latitude,lng:a.customer.longitude})-miles(cursor,{lat:b.customer.latitude,lng:b.customer.longitude}));
    const next = remaining.shift(); result.push(next); cursor = {lat:next.customer.latitude,lng:next.customer.longitude};
  }
  return result;
}

export function balanceStops(stops, drivers) {
  const buckets = new Map(drivers.filter(d=>d.active).map(d=>[d.id, []]));
  const sorted = [...stops].sort((a,b)=>(b.estimatedServiceMinutes+b.boxCount)-(a.estimatedServiceMinutes+a.boxCount));
  for (const stop of sorted) {
    let best = null;
    for (const driver of drivers.filter(d=>d.active)) {
      const candidate = optimizeOrder([...buckets.get(driver.id), stop]);
      const m = routeMetrics(candidate);
      const over = Math.max(0, m.totalMinutes - driver.targetMinutes);
      const capacityOver = Math.max(0, m.boxes - driver.maxBoxes);
      const score = Math.abs(driver.targetMinutes - m.totalMinutes) + over * 3 + capacityOver * 20;
      if (!best || score < best.score) best = { driver, candidate, score };
    }
    if (best) buckets.set(best.driver.id, best.candidate);
  }
  return buckets;
}
