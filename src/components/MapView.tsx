"use client";
// Leaflet map preview for a single coordinate (dynamic-imported with ssr:false because Leaflet needs window).

import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Leaflet's default marker assets don't resolve under bundlers; point at CDN.
const icon = L.icon({
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

// Leaflet map preview centred on the given coordinate with a single marker; client-only because Leaflet needs window.
export default function MapView({
  lat,
  lng,
  height = 240
}: {
  lat: number;
  lng: number;
  height?: number;
}) {
  return (
    <div
      style={{ height }}
      className="overflow-hidden rounded-lg border border-gray-300"
    >
      <MapContainer
        center={[lat, lng]}
        zoom={16}
        scrollWheelZoom={false}
        key={`${lat},${lng}`}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[lat, lng]} icon={icon} />
      </MapContainer>
    </div>
  );
}
