import type { FactoryLive } from '../types';
import { FactoryMap } from './FactoryMap';
import { TacticalRecipePopup } from './TacticalRecipePopup';

type Props = {
  factories: FactoryLive[];
  selectedId: string | null;
  onSelect: (f: FactoryLive) => void;
  operationMode: boolean;
};

export function B2GDashboard({ factories, selectedId, onSelect, operationMode }: Props) {
  const incident = factories.find((f) => f.status === 'fire' || f.incidentActive);
  const selected = factories.find((f) => f.id === selectedId) ?? incident ?? factories[0];

  return (
    <div className="relative flex h-[calc(100vh-4.5rem)] gap-4 p-4">
      <div className={`flex min-w-0 flex-1 flex-col gap-3 ${operationMode ? 'pr-0 md:pr-[28rem]' : ''}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">B2G · 소방 관제실</h2>
            <p className="text-xs text-slate-400">
              GIS 격자 가스확산 열지도 · 기상청 풍향 기반 주민 우회 대피 경로
            </p>
          </div>
          {operationMode && (
            <span className="animate-pulse rounded-full border border-red-500 bg-red-950 px-3 py-1 text-xs font-bold tracking-widest text-red-300">
              FIRE-IN · 작전 모드
            </span>
          )}
        </div>

        <div className="min-h-0 flex-1">
          <FactoryMap
            factories={factories}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {factories.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onSelect(f)}
              className={`rounded-lg border p-3 text-left transition ${
                selected?.id === f.id
                  ? 'border-cyan-500/60 bg-slate-900'
                  : 'border-slate-700 bg-slate-950 hover:border-slate-500'
              } ${f.isAnomaly || f.status === 'fire' ? 'ring-1 ring-red-500/60' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-100">{f.shortName || f.name}</p>
                <StatusBadge status={f.status} />
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                {f.zone} · {f.material}
              </p>
              <p className="truncate text-[10px] text-slate-500">{f.address}</p>
              {(f.status === 'fire' || f.incidentActive) && (
                <p className="mt-1 text-[11px] font-semibold text-red-400">
                  ↪ 지도 빨간 펄스 + 열지도 = 이 공장 진원
                </p>
              )}
              <div className="mt-2 grid grid-cols-3 gap-1 text-[11px] text-slate-400">
                <span>가스 {f.sensors.gas_ppm}</span>
                <span>전류 {f.sensors.current_amp}A</span>
                <span>{f.sensors.temperature_c}°C</span>
              </div>
              <p className="mt-2 text-xs text-slate-300">
                D_M ={' '}
                <span className={f.isAnomaly ? 'font-bold text-red-400' : 'text-emerald-400'}>
                  {f.mahalanobisDistance}
                </span>
                <span className="text-slate-500"> (임계 3.0)</span>
              </p>
            </button>
          ))}
        </div>
      </div>

      {operationMode && incident && (
        <TacticalRecipePopup factory={incident} />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: FactoryLive['status'] }) {
  const map = {
    normal: 'bg-emerald-950 text-emerald-300 border-emerald-700',
    warning: 'bg-amber-950 text-amber-300 border-amber-700',
    critical: 'bg-orange-950 text-orange-300 border-orange-700',
    fire: 'bg-red-950 text-red-300 border-red-600 animate-pulse',
  };
  const label = { normal: '정상', warning: '주의', critical: '위험', fire: '화재' };
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${map[status]}`}>
      {label[status]}
    </span>
  );
}
