import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { FactoryLive } from '../types';

type Props = {
  factory: FactoryLive | undefined;
  demoDrop?: boolean;
};

type Point = { t: number; gas: number; current: number };

const GAS_THRESHOLD = 90;
const CURRENT_THRESHOLD = 250;
const HISTORY_LEN = 24;

function seedBaseline(factory: FactoryLive): Point[] {
  const now = Date.now();
  // 정상 가동 근처 값을 시드로 (트리거 직후에도 "평소 → 폭등"이 보이게)
  const baseGas = Math.min(factory.sensors.gas_ppm, 55);
  const baseCurrent = Math.min(factory.sensors.current_amp, 160);
  const points: Point[] = [];
  for (let i = 0; i < HISTORY_LEN - 1; i++) {
    const wobble = Math.sin(i / 2.2) * 3;
    points.push({
      t: now - (HISTORY_LEN - i) * 1500,
      gas: Math.max(8, baseGas * 0.55 + wobble + ((i * 7) % 5) - 2),
      current: Math.max(40, baseCurrent * 0.7 + wobble * 2 + ((i * 3) % 7) - 3),
    });
  }
  return points;
}

function buildSpikeTail(prev: Point[], gas: number, current: number): Point[] {
  const now = Date.now();
  const last = prev[prev.length - 1] ?? { t: now - 3000, gas: gas * 0.2, current: current * 0.3 };
  // 중간점 2개로 수직 상승처럼 보이게
  return [
    ...prev,
    {
      t: now - 2000,
      gas: last.gas + (gas - last.gas) * 0.35,
      current: last.current + (current - last.current) * 0.35,
    },
    {
      t: now - 800,
      gas: last.gas + (gas - last.gas) * 0.75,
      current: last.current + (current - last.current) * 0.75,
    },
    { t: now, gas, current },
  ].slice(-HISTORY_LEN);
}

export function B2BDashboard({ factory, demoDrop }: Props) {
  const [history, setHistory] = useState<Point[]>([]);
  const seededForId = useRef<string | null>(null);
  const spikedForUpdate = useRef<string | null>(null);

  useEffect(() => {
    if (!factory) return;

    // 공장 바뀌면 정상 시드 다시
    if (seededForId.current !== factory.id) {
      seededForId.current = factory.id;
      spikedForUpdate.current = null;
      setHistory(seedBaseline(factory));
    }

    const isSpike =
      demoDrop ||
      factory.incidentActive ||
      factory.status === 'fire' ||
      factory.sensors.gas_ppm > GAS_THRESHOLD ||
      factory.sensors.current_amp > CURRENT_THRESHOLD;

    if (isSpike) {
      // 같은 사고에 대해 한 번만 스파이크 궤적 생성
      const key = `${factory.id}:${factory.updatedAt}:spike`;
      if (spikedForUpdate.current !== key) {
        spikedForUpdate.current = key;
        setHistory((prev) => {
          const base = prev.length >= 8 ? prev : seedBaseline(factory);
          return buildSpikeTail(base, factory.sensors.gas_ppm, factory.sensors.current_amp);
        });
      }
      return;
    }

    // 정상 스트리밍
    setHistory((prev) => {
      const base = prev.length ? prev : seedBaseline(factory);
      return [
        ...base,
        {
          t: Date.now(),
          gas: factory.sensors.gas_ppm,
          current: factory.sensors.current_amp,
        },
      ].slice(-HISTORY_LEN);
    });
  }, [
    factory?.id,
    factory?.updatedAt,
    factory?.sensors.gas_ppm,
    factory?.sensors.current_amp,
    factory?.incidentActive,
    factory?.status,
    demoDrop,
    factory,
  ]);

  const score = factory?.safetyScore ?? 95;
  const grade = factory?.safetyGrade ?? 'A';
  const dropping = demoDrop || score < 50;

  const chartData = useMemo(
    () =>
      history.map((p, i) => ({
        i,
        gas: Number(p.gas.toFixed(1)),
        current: Number(p.current.toFixed(1)),
      })),
    [history],
  );

  const gasMax = Math.max(GAS_THRESHOLD * 1.2, ...chartData.map((d) => d.gas), 100);
  const currentMax = Math.max(CURRENT_THRESHOLD * 1.15, ...chartData.map((d) => d.current), 200);

  return (
    <div className="h-[calc(100vh-4.5rem)] space-y-4 overflow-y-auto p-4">
      <div>
        <h2 className="text-lg font-semibold text-white">B2B · 안심 사업장 대시보드</h2>
        <p className="text-xs text-slate-400">
          {factory?.name ?? '공장 선택 대기'} · 실시간 안전 스코어 &amp; 인슈어테크 리워드
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-6 xl:col-span-3">
          <p className="text-xs font-semibold tracking-wider text-slate-400">종합 리스크 스코어</p>
          <div className={`mt-6 flex flex-col items-center ${dropping ? 'animate-score-drop' : ''}`}>
            <SafetyGauge score={score} grade={grade} danger={dropping} />
            <p className={`mt-4 text-3xl font-bold ${dropping ? 'text-red-400' : 'text-emerald-300'}`}>
              {score}점 / {grade}등급
            </p>
            <p className="mt-1 text-xs text-slate-500">경사하강법 튜닝 · 실시간 갱신</p>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-5 xl:col-span-5">
          <p className="text-xs font-semibold tracking-wider text-slate-400">실시간 가동 로그</p>
          <div className="h-44">
            <p className="mb-1 text-[11px] text-slate-500">가스 농도 (ppm) · 빨간 점선 = 안전 임계 마진</p>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="i" hide />
                <YAxis domain={[0, Math.ceil(gasMax)]} stroke="#64748b" fontSize={10} width={36} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 12 }}
                />
                <ReferenceLine y={GAS_THRESHOLD} stroke="#ef4444" strokeDasharray="4 4" />
                <Line
                  type="monotone"
                  dataKey="gas"
                  stroke="#22d3ee"
                  dot={false}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="h-44">
            <p className="mb-1 text-[11px] text-slate-500">전기 부하량 (A) · 빨간 점선 = 안전 임계 마진</p>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="i" hide />
                <YAxis domain={[0, Math.ceil(currentMax)]} stroke="#64748b" fontSize={10} width={36} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 12 }}
                />
                <ReferenceLine y={CURRENT_THRESHOLD} stroke="#ef4444" strokeDasharray="4 4" />
                <Line
                  type="monotone"
                  dataKey="current"
                  stroke="#a78bfa"
                  dot={false}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-4 xl:col-span-4">
          <div className="rounded-xl border border-cyan-500/30 bg-gradient-to-br from-slate-900 to-cyan-950/40 p-6">
            <p className="text-xs font-semibold tracking-wider text-cyan-400">인슈어테크 리워드</p>
            <div className="mt-5 space-y-4">
              <div className="rounded-lg border border-slate-600 bg-slate-950/60 p-4">
                <p className="text-[11px] text-slate-400">AI 안심 인증 유지</p>
                <p className={`mt-1 text-3xl font-bold ${dropping ? 'text-red-400' : 'text-white'}`}>
                  {dropping ? '0일 (중단)' : '112일'}
                </p>
              </div>
              <div className="rounded-lg border border-emerald-500/40 bg-slate-950/60 p-4">
                <p className="text-[11px] text-slate-400">당월 예상 화재 보험료 절감액</p>
                <p
                  className={`mt-1 text-3xl font-bold ${dropping ? 'text-red-400 line-through' : 'text-emerald-300'}`}
                >
                  {dropping ? '0원' : '240,000원'}
                </p>
                {!dropping && (
                  <p className="mt-2 text-xs text-slate-400">
                    구독료 약 10만원 &lt; 절감액 약 24만원 — 도입 장벽 Zero
                  </p>
                )}
                {dropping && (
                  <p className="mt-2 text-xs text-red-300">
                    이상 징후 발생 — 안심 인증 일시 중단 · 보험 할인 보류
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-xs text-slate-400">
            <p className="font-semibold text-slate-300">센서 스냅샷</p>
            <ul className="mt-2 space-y-1">
              <li>가스: {factory?.sensors.gas_ppm ?? '—'} ppm</li>
              <li>전류: {factory?.sensors.current_amp ?? '—'} A</li>
              <li>온도: {factory?.sensors.temperature_c ?? '—'} °C</li>
              <li>
                D_M: {factory?.mahalanobisDistance ?? '—'}{' '}
                {factory?.isAnomaly ? '(임계 초과)' : '(정상)'}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function SafetyGauge({
  score,
  grade,
  danger,
}: {
  score: number;
  grade: string;
  danger: boolean;
}) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const offset = c * (1 - pct);
  const stroke = danger ? '#f87171' : grade === 'A' ? '#34d399' : '#fbbf24';

  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx="70" cy="70" r={r} fill="none" stroke="#1e293b" strokeWidth="12" />
      <circle
        cx="70"
        cy="70"
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 70 70)"
        className="transition-all duration-500"
      />
      <text
        x="70"
        y="74"
        textAnchor="middle"
        className="fill-white text-2xl font-bold"
        fontSize="28"
        fontFamily="inherit"
      >
        {score}
      </text>
    </svg>
  );
}
