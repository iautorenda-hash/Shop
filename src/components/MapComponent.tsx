import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';

// Fix for default marker icon in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const customCarIcon = L.divIcon({
  className: 'custom-car-icon',
  html: `<div class="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(255,255,255,0.5)] border-2 border-blue-500">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>
         </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const customPickupIcon = L.divIcon({
  className: 'custom-pickup-icon',
  html: `<div class="w-4 h-4 bg-green-500 rounded-full shadow-md border-2 border-white"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const customDropoffIcon = L.divIcon({
  className: 'custom-dropoff-icon',
  html: `<div class="w-4 h-4 bg-red-500 rounded-full shadow-md border-2 border-white"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function MapUpdater({ center, zoom, navigationMode }: { center: [number, number]; zoom: number; navigationMode?: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (navigationMode) {
      map.flyTo(center, 18, { animate: true, duration: 1.0 });
    } else {
      map.flyTo(center, zoom, { animate: true, duration: 1.5 });
    }
  }, [center, zoom, map, navigationMode]);
  return null;
}

interface MapComponentProps {
  driverLocation: [number, number];
  pickupLocation?: [number, number] | null;
  dropoffLocation?: [number, number] | null;
  route?: [number, number][] | null;
  navigationMode?: boolean;
}

export default function MapComponent({ driverLocation, pickupLocation, dropoffLocation, route, navigationMode }: MapComponentProps) {
  return (
    <MapContainer
      center={driverLocation}
      zoom={15}
      zoomControl={false}
      style={{ height: '100%', width: '100%', zIndex: 0 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <MapUpdater center={driverLocation} zoom={16} navigationMode={navigationMode} />
      
      {route && route.length > 0 && (
        <Polyline positions={route} color="#3b82f6" weight={5} opacity={0.8} />
      )}

      {pickupLocation && (
        <Marker position={pickupLocation} icon={customPickupIcon} />
      )}
      
      {dropoffLocation && (
        <Marker position={dropoffLocation} icon={customDropoffIcon} />
      )}

      <Marker position={driverLocation} icon={customCarIcon} />
    </MapContainer>
  );
}
