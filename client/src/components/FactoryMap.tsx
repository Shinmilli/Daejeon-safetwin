import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchGisOverlay, type GisOverlayPayload } from '../api/client';
import type { FactoryLive } from '../types';

type Props = {
  factories: FactoryLive[];
  onSelect?: (f: FactoryLive) => void;
  selectedId?: string | null;
};

function isCrisis(f: FactoryLive) {
  return f.status === 'fire' || f.status === 'critical' || f.incidentActive || f.isAnomaly;
}

function shortLabel(name: string) {
  return name
    .replace('한화에어로스페이스 ', '한화 ')
    .replace('사업장', '')
    .replace('자동차부품공장', '부품공장')
    .trim();
}

function intensityColor(i: number): string {
  if (i > 0.75) return 'rgba(220,38,38,0.55)';
  if (i > 0.5) return 'rgba(249,115,22,0.45)';
  if (i > 0.25) return 'rgba(234,179,8,0.35)';
  return 'rgba(34,197,94,0.18)';
}

/**
 * 관제실 GIS — 기상청 풍향 기반 격자 가스확산 열지도 + 주민 우회 대피 경로
 */
export function FactoryMap({ factories, onSelect, selectedId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const heatRef = useRef<L.LayerGroup | null>(null);
  const routeRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  const lastCrisisIdRef = useRef<string | null>(null);
  const didFitRef = useRef(false);
  onSelectRef.current = onSelect;

  const [overlay, setOverlay] = useState<GisOverlayPayload | null>(null);

  const crisis = useMemo(
    () => factories.find((f) => f.status === 'fire' || f.incidentActive),
    [factories],
  );
  const crisisId = crisis?.id ?? null;

  // Init map once
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      zoomControl: false,
      attributionControl: false,
      minZoom: 10,
      maxZoom: 17,
    }).setView([36.4, 127.36], 12);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    heatRef.current = L.layerGroup().addTo(map);
    routeRef.current = L.layerGroup().addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const t = window.setTimeout(() => map.invalidateSize(), 80);
    return () => {
      window.clearTimeout(t);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      heatRef.current = null;
      routeRef.current = null;
      lastCrisisIdRef.current = null;
      didFitRef.current = false;
    };
  }, []);

  // Fetch GIS overlay when crisis starts (기상 반영)
  useEffect(() => {
    if (!crisisId) {
      setOverlay(null);
      return;
    }
    let alive = true;
    void fetchGisOverlay(crisisId).then((data) => {
      if (alive) setOverlay(data);
    });
    return () => {
      alive = false;
    };
  }, [crisisId]);

  // Camera: only on crisis start / initial fit
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (crisis && crisisId !== lastCrisisIdRef.current) {
      lastCrisisIdRef.current = crisisId;
      map.setView([crisis.lat, crisis.lng], 14, { animate: true });
      return;
    }
    if (!crisis) {
      lastCrisisIdRef.current = null;
      if (!didFitRef.current && factories.length) {
        const bounds = L.latLngBounds(factories.map((f) => [f.lat, f.lng] as [number, number]));
        if (bounds.isValid()) {
          map.fitBounds(bounds.pad(0.4));
          didFitRef.current = true;
        }
      }
    }
  }, [crisis, crisisId, factories]);

  // Draw heatmap + routes + markers
  useEffect(() => {
    const markers = layerRef.current;
    const heat = heatRef.current;
    const routes = routeRef.current;
    if (!markers || !heat || !routes) return;

    markers.clearLayers();
    heat.clearLayers();
    routes.clearLayers();

    if (crisis && overlay?.overlay) {
      const o = overlay.overlay;

      // GIS grid cells
      o.gridCells.forEach((cell) => {
        L.circle([cell.lat, cell.lng], {
          radius: cell.sizeM / 2,
          color: 'transparent',
          fillColor: intensityColor(cell.intensity),
          fillOpacity: 1,
          interactive: false,
        }).addTo(heat);
      });

      // Plume outline
      if (o.plumePolygon.length > 2) {
        L.polygon(o.plumePolygon, {
          color: '#f97316',
          weight: 1.5,
          dashArray: '4 6',
          fillColor: '#ef4444',
          fillOpacity: 0.08,
          interactive: false,
        }).addTo(heat);
      }

      // Evacuation radius
      L.circle([crisis.lat, crisis.lng], {
        radius: o.evacuationRadiusM,
        color: '#f87171',
        weight: 1.5,
        dashArray: '6 8',
        fillOpacity: 0,
        interactive: false,
      }).addTo(heat);

      // Evacuation detour routes
      o.evacuationRoutes.forEach((route, idx) => {
        L.polyline(route.path, {
          color: idx === 0 ? '#facc15' : '#38bdf8',
          weight: 3,
          opacity: 0.95,
        }).addTo(routes);

        const end = route.path[route.path.length - 1];
        const icon = L.divIcon({
          className: 'safetwin-marker',
          iconSize: [110, 28],
          iconAnchor: [55, 14],
          html: `<div class="st-evac-chip">${idx === 0 ? '★' : '☆'} ${escapeHtml(route.label)}</div>`,
        });
        L.marker(end, { icon, interactive: false }).addTo(routes);
      });
    }

    factories.forEach((f) => {
      const danger = isCrisis(f);
      const selected = f.id === selectedId;
      const fire = f.status === 'fire' || f.incidentActive;

      const icon = L.divIcon({
        className: 'safetwin-marker',
        iconSize: fire ? [200, 72] : [150, 48],
        iconAnchor: fire ? [100, 36] : [75, 24],
        html: buildMarkerHtml(f, { danger, fire, selected }),
      });

      const marker = L.marker([f.lat, f.lng], {
        icon,
        zIndexOffset: fire ? 1000 : 0,
      });
      marker.on('click', () => onSelectRef.current?.(f));
      marker.addTo(markers);
    });
  }, [factories, crisis, overlay, selectedId]);

  return (
    <div className="relative h-full min-h-[320px] w-full overflow-hidden rounded-xl border border-slate-700/80 shadow-[inset_0_0_60px_rgba(0,0,0,0.45)]">
      <div ref={containerRef} className="absolute inset-0 z-0 bg-slate-950" />

      <div className="pointer-events-none absolute left-2 top-2 z-[400] max-w-[min(420px,70%)] space-y-1.5">
        <div className="rounded border border-cyan-500/30 bg-slate-950/90 px-2.5 py-1.5 backdrop-blur-sm">
          <p className="text-[9px] font-semibold tracking-[0.14em] text-cyan-400">
            GIS COMMAND · 가스확산·대피
          </p>
          <p className="text-[11px] leading-snug text-slate-200">
            {overlay?.overlay.caption ??
              (crisis
                ? '기상 기반 확산 오버레이 로딩…'
                : '예찰 모드 — 사고 시 격자 열지도·우회 대피 경로 활성화')}
          </p>
        </div>
        {crisis && overlay && (
          <div className="rounded border border-red-500/50 bg-red-950/90 px-2.5 py-1.5">
            <p className="text-[10px] font-bold text-red-300">
              풍향 {overlay.overlay.windLabel} · {overlay.overlay.windSpeedMs}m/s ·{' '}
              {overlay.overlay.weatherSource === 'kma-live' ? '기상청 LIVE' : '기상 MOCK'}
            </p>
            <p className="text-[11px] text-white">
              {shortLabel(crisis.name)} · 대피 {overlay.overlay.evacuationRadiusM}m · 우회경로{' '}
              {overlay.overlay.evacuationRoutes.length}개
            </p>
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute bottom-2 left-2 z-[400] flex flex-wrap gap-2 rounded border border-slate-600/50 bg-slate-950/85 px-2.5 py-1.5 text-[10px] text-slate-300">
        <LegendDot color="#34d399" label="정상" />
        <LegendDot color="#f87171" label="화재 진원" pulse />
        <LegendDot color="#f97316" label="확산격자" />
        <LegendDot color="#facc15" label="우회대피" />
      </div>
    </div>
  );
}

function LegendDot({
  color,
  label,
  pulse,
}: {
  color: string;
  label: string;
  pulse?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        {pulse && (
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
            style={{ background: color }}
          />
        )}
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: color }} />
      </span>
      {label}
    </span>
  );
}

function buildMarkerHtml(
  f: FactoryLive,
  opts: { danger: boolean; fire: boolean; selected: boolean },
) {
  const { danger, fire, selected } = opts;
  const label = shortLabel(f.name);

  if (fire) {
    return `
      <div class="st-fire-wrap">
        <div class="st-fire-dot">
          <span class="st-fire-ping"></span>
          <span class="st-fire-core"></span>
        </div>
        <div class="st-fire-card">
          <div class="st-fire-badge">⚠ 화재 진원 FIRE-IN</div>
          <div class="st-fire-name">${escapeHtml(label)}</div>
          <div class="st-fire-meta">${escapeHtml(f.zone)} · ${escapeHtml(f.material)}</div>
        </div>
      </div>
    `;
  }

  const color =
    f.status === 'warning' ? '#fbbf24' : danger ? '#f97316' : '#34d399';
  const border = selected ? '#22d3ee' : 'rgba(255,255,255,0.7)';

  return `
    <div class="st-safe-wrap">
      <div class="st-safe-dot" style="background:${color};border-color:${border};box-shadow:0 0 10px ${color}"></div>
      <div class="st-safe-label">${escapeHtml(label)}</div>
    </div>
  `;
}

function escapeHtml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
