import { useEffect } from 'react';
import { Circle, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { CUISINE_EMOJI, type Restaurant } from '../types';
import { JAMSIL_STATION, OFFICE, minutesToMeters } from '../lib/geo';
import { formatWon } from '../lib/links';
import { useTileStatus } from '../hooks/useTileStatus';

interface Props {
  restaurants: Restaurant[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  maxWalk: number;
}

const officeIcon = L.divIcon({
  className: 'pin station',
  html: '<span>🏢</span>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

const stationIcon = L.divIcon({
  className: 'pin station',
  html: '<span>🚇</span>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

function makeIcon(r: Restaurant, selected: boolean) {
  return L.divIcon({
    className: 'pin' + (selected ? ' selected' : ''),
    html: `<span>${CUISINE_EMOJI[r.cuisine]}</span>`,
    iconSize: selected ? [38, 38] : [30, 30],
    iconAnchor: selected ? [19, 38] : [15, 30],
    popupAnchor: [0, selected ? -36 : -28],
  });
}

function FlyTo({ r }: { r: Restaurant | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (!r || r.lat == null || r.lng == null) return;
    const size = map.getSize();
    // 모바일에서 지도 탭이 숨겨져 있으면(크기 0) 애니메이션 없이 중심만 이동
    if (size.x === 0 || size.y === 0) {
      map.setView([r.lat, r.lng], Math.max(map.getZoom(), 16), { animate: false });
      return;
    }
    map.flyTo([r.lat, r.lng], Math.max(map.getZoom(), 16), { duration: 0.5 });
  }, [r, map]);
  return null;
}

/** 숨김 → 표시 전환 시 Leaflet 크기 재계산 */
function AutoResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

const RING_MINUTES = [5, 10, 15, 20];

export function MapView({ restaurants, selectedId, onSelect, maxWalk }: Props) {
  const selected = restaurants.find((r) => r.id === selectedId);
  const tiles = useTileStatus();
  return (
    <div className={'map-shell' + (tiles.blocked ? ' schematic' : '')}>
      {tiles.blocked && (
        <div className="map-notice">
          지도 타일을 불러올 수 없는 환경이라 <strong>거리 약도</strong>로 표시 중입니다. 정식 배포 주소에서는 실제 지도가 보입니다.
        </div>
      )}
    <MapContainer center={[OFFICE.lat, OFFICE.lng]} zoom={15} className="map" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        eventHandlers={tiles.handlers}
      />
      {tiles.blocked &&
        RING_MINUTES.map((m) => (
          <Circle
            key={m}
            center={[OFFICE.lat, OFFICE.lng]}
            radius={minutesToMeters(m)}
            pathOptions={{ color: '#b8b0a6', weight: 1, fill: false, dashArray: '2 6' }}
            interactive={false}
          >
            <Tooltip permanent direction="right" offset={[0, -minutesToMeters(m) / 14]} className="ring-label">
              도보 {m}분
            </Tooltip>
          </Circle>
        ))}
      <Circle
        center={[OFFICE.lat, OFFICE.lng]}
        radius={minutesToMeters(maxWalk)}
        pathOptions={{ color: '#ff6b35', weight: 1, fillOpacity: 0.04, dashArray: '4 4' }}
      />
      <Marker position={[JAMSIL_STATION.lat, JAMSIL_STATION.lng]} icon={stationIcon} zIndexOffset={-100}>
        <Popup>잠실역 (2·8호선)</Popup>
      </Marker>
      <Marker position={[OFFICE.lat, OFFICE.lng]} icon={officeIcon} zIndexOffset={-50}>
        <Popup>출발: 본사 (롯데캐슬골드 · 8번 출구)</Popup>
      </Marker>
      {restaurants
        .filter((r) => r.lat != null && r.lng != null)
        .map((r) => (
          <Marker
            key={r.id}
            position={[r.lat!, r.lng!]}
            icon={makeIcon(r, r.id === selectedId)}
            zIndexOffset={r.id === selectedId ? 1000 : 0}
            eventHandlers={{ click: () => onSelect(r.id) }}
          >
            <Popup>
              <strong>{r.name}</strong>
              <br />
              {r.subcategory} · {formatWon(r.priceRange[0])}~
            </Popup>
          </Marker>
        ))}
      <AutoResize />
      <FlyTo r={selected} />
    </MapContainer>
    </div>
  );
}
