import polyline from '@mapbox/polyline';

export interface RouteStep {
  instruction: string;
  distance: number;
  modifier?: string;
  type?: string;
}

export interface RouteData {
  coordinates: [number, number][];
  distance: number;
  duration: number;
  steps: RouteStep[];
}

export async function getOSRMRoute(start: [number, number], end: [number, number]): Promise<RouteData | null> {
  try {
    // OSRM expects coordinates in longitude,latitude format
    const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?steps=true&geometries=polyline&overview=full&language=pt`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      throw new Error('OSRM API returned error or no routes');
    }

    const route = data.routes[0];
    const decodedCoords = polyline.decode(route.geometry); // Returns [lat, lon]

    const steps: RouteStep[] = [];
    if (route.legs && route.legs[0] && route.legs[0].steps) {
      route.legs[0].steps.forEach((step: any) => {
        let instruction = step.maneuver.instruction || '';
        
        // Translate some common OSRM instructions to Portuguese if language=pt fails or is incomplete
        if (!instruction) {
          const type = step.maneuver.type;
          const modifier = step.maneuver.modifier;
          const name = step.name ? ` na ${step.name}` : '';
          
          if (type === 'turn') {
            if (modifier === 'right' || modifier === 'slight right' || modifier === 'sharp right') {
              instruction = `Vire à direita${name}`;
            } else if (modifier === 'left' || modifier === 'slight left' || modifier === 'sharp left') {
              instruction = `Vire à esquerda${name}`;
            } else {
              instruction = `Siga em frente${name}`;
            }
          } else if (type === 'arrive') {
            instruction = 'Você chegou ao seu destino';
          } else {
            instruction = `Siga em frente${name}`;
          }
        }

        steps.push({
          instruction,
          distance: step.distance,
          modifier: step.maneuver.modifier,
          type: step.maneuver.type
        });
      });
    }

    return {
      coordinates: decodedCoords,
      distance: route.distance,
      duration: route.duration,
      steps
    };
  } catch (error) {
    // Silently use fallback route if OSRM fails
    const coords = generateSimpleRoute(start, end);
    const dist = calculateDistance(start[0], start[1], end[0], end[1]);
    return {
      coordinates: coords,
      distance: dist * 1000, // convert to meters
      duration: (dist / 40) * 3600, // assume 40km/h
      steps: [
        { instruction: 'Siga em direção ao destino', distance: dist * 1000, type: 'straight' },
        { instruction: 'Você chegou ao seu destino', distance: 0, type: 'arrive' }
      ]
    };
  }
}

export function generateSimpleRoute(start: [number, number], end: [number, number], steps: number = 20): [number, number][] {
  const route: [number, number][] = [];
  const latDiff = end[0] - start[0];
  const lngDiff = end[1] - start[1];
  
  for (let i = 0; i <= steps; i++) {
    const progress = i / steps;
    const curve = Math.sin(progress * Math.PI) * 0.002;
    route.push([
      start[0] + latDiff * progress + curve,
      start[1] + lngDiff * progress - curve
    ]);
  }
  return route;
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}
