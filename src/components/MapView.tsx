/// <reference types="leaflet.markercluster" />
import { useEffect, useMemo, useRef } from 'react';
import { Circle, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { CUISINE_EMOJI, type Restaurant } from '../types';
import { minutesToMeters } from '../lib/geo';
import { useSite } from '../lib/sites';
import { formatWon } from '../lib/links';
import { useTileStatus } from '../hooks/useTileStatus';

interface Props {
  restaurants: Restaurant[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  maxWalk: number;
  walkById: Map<string, number | null>;
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

/** 말풍선에 넣을 대표 메뉴와 금액 */
function mainItem(r: Restaurant): string {
  if (r.menu.length > 0) return `${r.menu[0].name} ${formatWon(r.menu[0].price)}`;
  if (r.priceRange) return `${r.signature[0] ?? r.subcategory} ${formatWon(r.priceRange[0])}~`;
  return `${r.subcategory} · 가격 미확인`;
}

/** 묶음 핀: 개수가 많을수록 조금 크게 */
function clusterIcon(cluster: L.MarkerCluster) {
  const n = cluster.getChildCount();
  const size = n < 10 ? 34 : n < 50 ? 40 : 46;
  return L.divIcon({ className: 'cluster-pin', html: `<span>${n}</span>`, iconSize: [size, size] });
}

/** 선택한 식당 핀 — 묶음 밖에 따로 그려서 항상 보이고, 말풍선이 자동으로 열린다 */
function SelectedMarker({ r, walk }: { r: Restaurant; walk: number | null }) {
  const ref = useRef<L.Marker>(null);
  useEffect(() => {
    // 지도가 이동을 마친 뒤 열어야 말풍선이 화면 밖으로 밀리지 않는다
    const t = setTimeout(() => ref.current?.openPopup(), 350);
    return () => clearTimeout(t);
  }, [r.id]);
  return (
    <Marker ref={ref} position={[r.lat!, r.lng!]} icon={makeIcon(r, true)} zIndexOffset={1000}>
      <Popup className="pin-popup" closeButton={false} autoPan={false}>
        <strong>
          {r.name}
          {r.branch && <span className="small"> {r.branch}</span>}
        </strong>
        <br />
        {mainItem(r)}
        {walk != null && <span className="small"> · 도보 {walk}분</span>}
      </Popup>
    </Marker>
  );
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

export function MapView({ restaurants, selectedId, onSelect, maxWalk, walkById }: Props) {
  const selected = restaurants.find((r) => r.id === selectedId);
  // 묶음 핀은 선택이 바뀔 때마다 다시 만들지 않도록 따로 계산
  const markers = useMemo(
    () =>
      restaurants
        .filter((r) => r.lat != null && r.lng != null)
        .map((r) => (
          <Marker key={r.id} position={[r.lat!, r.lng!]} icon={makeIcon(r, false)} eventHandlers={{ click: () => onSelect(r.id) }} />
        )),
    [restaurants, onSelect],
  );
  const tiles = useTileStatus();
  const site = useSite();
  const OFFICE = site.office;
  return (
    <div className={'map-shell' + (tiles.blocked ? ' schematic' : '')}>
      {tiles.blocked && (
        <div className="map-notice">
          지도 타일을 불러올 수 없는 환경이라 <strong>거리 약도</strong>로 표시 중입니다. 정식 배포 주소에서는 실제 지도가 보입니다.
        </div>
      )}
    <MapContainer key={site.id} center={[OFFICE.lat, OFFICE.lng]} zoom={15} className="map" scrollWheelZoom>
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
        pathOptions={{ color: site.color, weight: 1, fillOpacity: 0.04, dashArray: '4 4' }}
      />
      <Marker position={[site.station.lat, site.station.lng]} icon={stationIcon} zIndexOffset={-100}>
        <Popup>{site.station.popup}</Popup>
      </Marker>
      <Marker position={[OFFICE.lat, OFFICE.lng]} icon={officeIcon} zIndexOffset={-50}>
        <Popup>{site.office.popup}</Popup>
      </Marker>
      <MarkerClusterGroup
        chunkedLoading
        maxClusterRadius={48}
        showCoverageOnHover={false}
        spiderfyOnMaxZoom
        disableClusteringAtZoom={18}
        iconCreateFunction={clusterIcon}
      >
        {markers}
      </MarkerClusterGroup>
      {selected && selected.lat != null && selected.lng != null && (
        <SelectedMarker r={selected} walk={walkById.get(selected.id) ?? null} />
      )}
      <AutoResize />
      <FlyTo r={selected} />
    </MapContainer>
    </div>
  );
}
