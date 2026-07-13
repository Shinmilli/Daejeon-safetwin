import type { FactoryLive } from '../types';

type Props = {
  factory: FactoryLive;
  onClose?: () => void;
};

/** 출동 대원용 1초 레시피 — 관제실 레드 모드 패널 */
export function TacticalRecipePopup({ factory, onClose }: Props) {
  const lines = (factory.recipeMarkdown ?? '').split('\n').filter(Boolean);

  return (
    <aside className="animate-fade-in-fast absolute inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-red-500/50 bg-slate-950 shadow-2xl shadow-red-900/50">
      <div className="flex items-center justify-between border-b border-red-500/40 bg-gradient-to-r from-red-950 to-slate-950 px-5 py-4">
        <div>
          <p className="text-[10px] font-bold tracking-[0.2em] text-red-300">OPERATION MODE · RAG GUARDRAIL</p>
          <h2 className="text-lg font-bold text-white">출동 대원용 1초 레시피</h2>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            닫기
          </button>
        )}
      </div>

      <div className="space-y-4 overflow-y-auto p-5">
        <div className="rounded-lg border border-red-500 bg-red-600/20 p-4 shadow-[0_0_30px_rgba(220,38,38,0.25)]">
          <p className="text-[10px] font-bold tracking-widest text-red-300">[위험] 화재 진원 확정</p>
          <p className="mt-1 text-xl font-extrabold text-red-400">{factory.name}</p>
          <p className="text-sm text-slate-200">
            {factory.zone} · {factory.material}
          </p>
          <p className="mt-2 text-xs text-red-200/90">
            지도 상 빨간 펄스 마커 = 본 공장 (대피 반경 350m 원 표시)
          </p>
        </div>

        <div className="rounded-lg border border-amber-500/50 bg-amber-950/40 p-3">
          <p className="text-xs text-amber-200">조기 붕괴 임계 시간</p>
          <p className="text-2xl font-bold tabular-nums text-amber-300">14분 남음</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full w-[82%] rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500" />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-500">
            <span>safe</span>
            <span>주의</span>
            <span className="text-red-400">Risk</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <ScoreCard label="독성 가스 확산 반경" value="350m" accent="cyan" />
          <ScoreCard label="마할라노비스 D_M" value={String(factory.mahalanobisDistance)} accent="red" />
          <ScoreCard label="안전 스코어" value={`${factory.safetyScore} / ${factory.safetyGrade}`} accent="red" />
          <ScoreCard label="센서 가스 ppm" value={String(factory.sensors.gas_ppm)} accent="amber" />
        </div>

        <div className="rounded-lg border-2 border-red-500 bg-red-950/70 p-4">
          <p className="mb-3 text-xs font-bold tracking-wider text-yellow-300">
            AI 추천 진화 가이드 · Hard Block Applied
          </p>
          <div className="space-y-3">
            {lines.length > 0 ? (
              lines.map((line, i) => (
                <p key={i} className="text-sm leading-relaxed text-white">
                  {i === 1 && <span className="mr-1 text-yellow-300">➡</span>}
                  {renderMarkdownBold(line)}
                </p>
              ))
            ) : (
              <p className="text-sm text-slate-400">레시피 생성 중…</p>
            )}
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-slate-500">
          MSDS Hard Block: 나트륨/금수성 물질 감지 시 용수·살수 출력 차단 → 마른 모래·팽창 질석 강제 바인딩
        </p>
      </div>
    </aside>
  );
}

function ScoreCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: 'red' | 'amber' | 'cyan';
}) {
  const color =
    accent === 'red'
      ? 'border-red-500/40 text-red-300'
      : accent === 'amber'
        ? 'border-amber-500/40 text-amber-300'
        : 'border-cyan-500/40 text-cyan-300';
  return (
    <div className={`rounded-lg border bg-slate-900/80 p-3 ${color}`}>
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className="mt-1 text-base font-semibold">{value}</p>
    </div>
  );
}

function renderMarkdownBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="text-yellow-300">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
