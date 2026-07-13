import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { fetchFactories, resetIncidents, triggerIncident } from './api/client';
import { B2GDashboard } from './components/B2GDashboard';
import { B2BDashboard } from './components/B2BDashboard';
import type { FactoryLive } from './types';

type ViewMode = 'b2g' | 'b2b';

function App() {
  const [view, setView] = useState<ViewMode>('b2g');
  const [factories, setFactories] = useState<FactoryLive[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>('hanwha-daejeon');
  const [operationMode, setOperationMode] = useState(false);
  const [demoDrop, setDemoDrop] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchFactories();
      setFactories(data.factories);
      const fire = data.factories.find((f: FactoryLive) => f.status === 'fire' || f.incidentActive);
      if (fire) {
        setOperationMode(true);
        setSelectedId(fire.id);
      }
    } catch {
      /* backend warming up */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const runDemoIncident = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setToast('시연 트리거: 가스·전류 스파이크 → 마할라노비스 임계 초과');
    try {
      // B2B에서 점수 추락 연출 후 B2G 작전모드
      setView('b2b');
      setDemoDrop(true);
      // 한화 대전사업장 — 브랜드 인지 + 나트륨 RAG Hard Block 시연
      const factory = await triggerIncident('hanwha-daejeon');
      setFactories((prev) => prev.map((f) => (f.id === factory.id ? factory : f)));
      setSelectedId(factory.id);

      // 0.1s 페이드인 작전 모드
      window.setTimeout(() => {
        setView('b2g');
        setOperationMode(true);
        setToast('작전 모드 전환 · 1초 레시피 RAG 가드레일 적용 완료');
      }, 100);
    } catch (e) {
      setToast(e instanceof Error ? e.message : '트리거 실패');
    } finally {
      setBusy(false);
      window.setTimeout(() => setToast(null), 4000);
    }
  }, [busy]);

  const handleReset = useCallback(async () => {
    await resetIncidents();
    setOperationMode(false);
    setDemoDrop(false);
    setToast('시뮬레이션 리셋');
    await refresh();
    window.setTimeout(() => setToast(null), 2000);
  }, [refresh]);

  // 전역 핫키: Ctrl+Space 또는 Shift+Enter → 시연 시나리오
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrlSpace = e.ctrlKey && e.code === 'Space';
      const shiftEnter = e.shiftKey && e.key === 'Enter';
      if (ctrlSpace || shiftEnter) {
        e.preventDefault();
        void runDemoIncident();
      }
      // Ctrl+R 대체: Ctrl+Shift+R 은 브라우저 새로고침이므로 Alt+R 로 리셋
      if (e.altKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        void handleReset();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runDemoIncident, handleReset]);

  const primaryFactory =
    factories.find((f) => f.id === selectedId) ??
    factories.find((f) => f.id === 'hanwha-daejeon') ??
    factories[0];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex h-[4.5rem] items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/20 text-sm font-bold text-cyan-300">
            ST
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-white">Daejeon Safe-Twin</h1>
            <p className="text-[11px] text-slate-400">지능형 로컬 방재 플랫폼 · MVP Demo</p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950 p-1">
          <ToggleBtn active={view === 'b2g'} onClick={() => setView('b2g')}>
            소방 관제실 (B2G)
          </ToggleBtn>
          <ToggleBtn active={view === 'b2b'} onClick={() => setView('b2b')}>
            공장 관리자 (B2B)
          </ToggleBtn>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void runDemoIncident()}
            disabled={busy}
            className="rounded-lg border border-red-500/50 bg-red-950/60 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-900/60 disabled:opacity-50"
          >
            시연 트리거
          </button>
          <button
            type="button"
            onClick={() => void handleReset()}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            리셋
          </button>
          <span className="hidden text-[10px] text-slate-500 lg:inline">
            Hotkey: Ctrl+Space / Shift+Enter
          </span>
        </div>
      </header>

      {toast && (
        <div className="fixed left-1/2 top-20 z-50 -translate-x-1/2 animate-fade-in-fast rounded-lg border border-cyan-500/40 bg-slate-900 px-4 py-2 text-sm text-cyan-100 shadow-lg">
          {toast}
        </div>
      )}

      {view === 'b2g' ? (
        <B2GDashboard
          factories={factories}
          selectedId={selectedId}
          onSelect={(f) => setSelectedId(f.id)}
          operationMode={operationMode}
        />
      ) : (
        <B2BDashboard factory={primaryFactory} demoDrop={demoDrop || primaryFactory?.safetyScore < 50} />
      )}
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
        active ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}

export default App;
