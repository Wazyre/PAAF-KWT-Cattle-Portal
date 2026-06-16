"use client";
// OpenStreetMap link for a coordinate pair; stops row-click propagation so it doesn't trigger row navigation.

// Inline OpenStreetMap link; stopPropagation prevents the parent row's onClick from also firing.
export default function MapLink({ lat, lng }: { lat: number; lng: number }) {
  return (
    <a
      href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`}
      target="_blank"
      rel="noreferrer"
      className="text-xs font-semibold text-gov hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {lat.toFixed(4)}, {lng.toFixed(4)} ↗
    </a>
  );
}
