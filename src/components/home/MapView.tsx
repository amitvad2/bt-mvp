'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { SessionWithVenue } from './SessionMapFinder';
import styles from './SessionMapFinder.module.css';

// Fix Leaflet default icon paths broken by webpack
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom amber pin for BT venues
const btIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
});

// Recenter the map when center/zoom changes
function RecenterHandler({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
    const map = useMap();
    useEffect(() => {
        map.setView([lat, lng], zoom, { animate: true });
    }, [lat, lng, zoom, map]);
    return null;
}

interface MapViewProps {
    centerLat: number | null;
    centerLng: number | null;
    sessions: SessionWithVenue[];
    zoom: number;
}

// Group sessions by venue to avoid overlapping markers
function groupByVenue(sessions: SessionWithVenue[]) {
    const map = new Map<string, SessionWithVenue[]>();
    for (const s of sessions) {
        const key = `${s.venueId || s.venueName}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(s);
    }
    return Array.from(map.values());
}

export default function MapView({ centerLat, centerLng, sessions, zoom }: MapViewProps) {
    const defaultCenter: [number, number] = [52.4, -1.5]; // Centre of England
    const center: [number, number] = centerLat != null && centerLng != null
        ? [centerLat, centerLng]
        : defaultCenter;

    const venueGroups = groupByVenue(sessions);

    return (
        <MapContainer
            center={center}
            zoom={zoom}
            className={styles.leafletMap}
            scrollWheelZoom={false}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {centerLat != null && centerLng != null && (
                <>
                    <RecenterHandler lat={centerLat} lng={centerLng} zoom={zoom} />
                    {/* Search radius circle */}
                    <Circle
                        center={[centerLat, centerLng]}
                        radius={sessions.length > 0 ? Math.max(...sessions.map(s => s.distanceMiles)) * 1609 : 8047}
                        pathOptions={{ color: '#f59e0b', fillColor: '#fef3c7', fillOpacity: 0.15, weight: 2, dashArray: '6 4' }}
                    />
                    {/* User location pin */}
                    <Marker position={[centerLat, centerLng]}>
                        <Popup>
                            <strong>Your location</strong>
                        </Popup>
                    </Marker>
                </>
            )}

            {venueGroups.map((group, i) => {
                const first = group[0];
                return (
                    <Marker key={i} position={[first.venueLat, first.venueLng]} icon={btIcon}>
                        <Popup minWidth={220}>
                            <div className={styles.popupContent}>
                                <strong className={styles.popupVenue}>{first.venueName}</strong>
                                <p className={styles.popupDist}>{first.distanceMiles.toFixed(1)} miles away</p>
                                <ul className={styles.popupSessions}>
                                    {group.map(s => (
                                        <li key={s.id}>
                                            <span>{new Date(s.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                                            <span className={styles.popupSpots}>{s.spotsAvailable} spots</span>
                                        </li>
                                    ))}
                                </ul>
                                <a href={`/book/${group[0].id}/student`} className={styles.popupCta}>Book a Session →</a>
                            </div>
                        </Popup>
                    </Marker>
                );
            })}
        </MapContainer>
    );
}
