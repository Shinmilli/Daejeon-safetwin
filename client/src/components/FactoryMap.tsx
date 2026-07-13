import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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

/**
 * 관제실 전용 다크 GIS — Carto Dark Matter + 커스텀 상태 마커 + 독성가스 열지도.
 * 카카오 기본 파란 핀은 사용하지 않음.
 */
export function FactoryMap({ factories, onSelect, selectedId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const heatRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const crisis = useMemo(
    () => factories.find((f) => f.status === 'fire' || f.incidentActive),
    [factories],
  );
  const crisisId = crisis?.id ?? null;

  // Init once
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      zoomControl: false,
      attributionControl: false,
      minZoom: 11,
      maxZoom: 16,
    }).setView([36.4, 127.36], 12);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    heatRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // 레이아웃 안정화 후 타일 보정
    const t = window.setTimeout(() => {
      map.invalidateSize();
    }, 80);

    return () => {
      window.clearTimeout(t);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      heatRef.current = null;
    };
  }, []);

  // Markers + heatmap
  useEffect(() => {
    const map = mapRef.current;
    const markers = layerRef.current;
    const heat = heatRef.current;
    if (!map || !markers || !heat) return;

    markers.clearLayers();
    heat.clearLayers();

    if (crisis) {
      const radii = [
        { r: 900, color: 'rgba(239,68,68,0.10)' },
        { r: 550, color: 'rgba(249,115,22,0.20)' },
        { r: 320, color: 'rgba(239,68,68,0.35)' },
        { r: 140, color: 'rgba(220,38,38,0.55)' },
      ];
      radii.forEach(({ r, color }) => {
        L.circle([crisis.lat, crisis.lng], {
          radius: r,
          color: 'transparent',
          fillColor: color,
          fillOpacity: 1,
          interactive: false,
        }).addTo(heat);
      });

      L.circle([crisis.lat, crisis.lng], {
        radius: 350,
        color: '#f87171',
        weight: 2,
        dashArray: '6 8',
        fillOpacity: 0,
        interactive: false,
      }).addTo(heat);

      const wind = L.divIcon({
        className: '',
        html: `<div class="st-wind">↗ 풍향 남서풍 · 독성가스 확산 열지도</div>`,
        iconSize: [240, 24],
        iconAnchor: [0, 0],
      });
      L.marker([crisis.lat + 0.006, crisis.lng - 0.004], {
        icon: wind,
        interactive: false,
      }).addTo(heat);

      // setView is safer than flyTo during React StrictMode / HMR
      map.setView([crisis.lat, crisis.lng], 13, { animate: true });
    } else if (factories.length) {
      const bounds = L.latLngBounds(factories.map((f) => [f.lat, f.lng] as [number, number]));
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.4));
      }
    }

    factories.forEach((f) => {
      const danger = isCrisis(f);
      const selected = f.id === selectedId;
      const fire = f.status === 'fire' || f.incidentActive;

      const icon = L.divIcon({
        className: 'safetwin-marker',
        iconSize: fire ? [210, 78] : [160, 52],
        iconAnchor: fire ? [105, 40] : [80, 26],
        html: buildMarkerHtml(f, { danger, fire, selected }),
      });

      const marker = L.marker([f.lat, f.lng], {
        icon,
        zIndexOffset: fire ? 1000 : danger ? 500 : 0,
      });
      marker.on('click', () => onSelectRef.current?.(f));
      marker.addTo(markers);
    });
  }, [factories, crisis, crisisId, selectedId]);

  return (
    <div className="relative h-full min-h-[320px] w-full overflow-hidden rounded-xl border border-slate-700/80 shadow-[inset_0_0_60px_rgba(0,0,0,0.45)]">
      <div ref={containerRef} className="h-full w-full bg-slate-950" />

      <div className="pointer-events-none absolute left-3 top-3 z-[500] space-y-2">
        <div className="rounded-md border border-cyan-500/30 bg-slate-950/90 px-3 py-2 backdrop-blur">
          <p className="text-[10px] font-semibold tracking-[0.18em] text-cyan-400">
            DAEJEON SAFE-TWIN · GIS COMMAND
          </p>
          <p className="text-xs text-slate-300">
            {crisis
              ? `진원 고정 · ${shortLabel(crisis.name)} · ${crisis.zone}`
              : '대덕·유성 산단 실시간 예찰 모드'}
          </p>
        </div>
        {crisis && (
          <div className="animate-pulse rounded-md border border-red-500/70 bg-red-950/95 px-3 py-2 shadow-[0_0_24px_rgba(239,68,68,0.45)]">
            <p className="text-[10px] font-bold tracking-widest text-red-300">FIRE EPICENTER</p>
            <p className="text-sm font-bold text-white">{crisis.name}</p>
            <p className="text-[11px] text-red-200">
              {crisis.zone} · D_M {crisis.mahalanobisDistance} · 대피반경 350m
            </p>
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex gap-3 rounded-md border border-slate-600/60 bg-slate-950/90 px-3 py-2 text-[10px] text-slate-300 backdrop-blur">
        <LegendDot color="#34d399" label="정상" />
        <LegendDot color="#fbbf24" label="주의" />
        <LegendDot color="#f87171" label="화재 진원" pulse />
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
      <span className="relative flex h-2.5 w-2.5">
        {pulse && (
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
            style={{ background: color }}
          />
        )}
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: color }} />
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
