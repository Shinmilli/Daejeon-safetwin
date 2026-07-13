import { inv, matrix, multiply, transpose, sqrt, Matrix } from 'mathjs';

const DEFAULT_THRESHOLD = 3.0;

export type AnomalyResult = {
  isAnomaly: boolean;
  distance: number;
  fallbackUsed?: boolean;
  reason?: string;
};

/**
 * 마할라노비스 거리 기반 다변량 이상 탐지
 * D_M = √( (x − μ)ᵀ · Σ⁻¹ · (x − μ) )
 *
 * 센서 노후화/단일 센서 고장으로 인한 False Alarm을 필터링하기 위해
 * 가스·전류·온도의 상관관계를 반영한 공간 거리를 사용한다.
 */
export function checkAnomaly(
  currentData: number[],
  meanVector: number[],
  covarianceMatrix: number[][],
  threshold: number = DEFAULT_THRESHOLD,
): AnomalyResult {
  if (
    currentData.length !== meanVector.length ||
    covarianceMatrix.length !== meanVector.length ||
    covarianceMatrix.some((row) => row.length !== meanVector.length)
  ) {
    throw new Error(
      `Dimension mismatch: x=${currentData.length}, μ=${meanVector.length}, Σ=${covarianceMatrix.length}x${covarianceMatrix[0]?.length}`,
    );
  }

  const delta = currentData.map((v, i) => v - meanVector[i]);

  try {
    const cov = matrix(covarianceMatrix);
    const covInv = inv(cov) as Matrix;
    const deltaCol = matrix(delta.map((v) => [v]));
    const deltaRow = transpose(deltaCol);
    // (x-μ)ᵀ · Σ⁻¹ · (x-μ)  → 1x1 scalar
    const mid = multiply(covInv, deltaCol) as Matrix;
    const quadratic = multiply(deltaRow, mid) as Matrix;
    const raw = Number(quadratic.get([0, 0]));

    if (!Number.isFinite(raw) || raw < 0) {
      return fallbackEuclidean(delta, threshold, 'Non-positive quadratic form');
    }

    const distance = Number(sqrt(raw));
    return {
      isAnomaly: distance > threshold,
      distance: round4(distance),
    };
  } catch (err) {
    // Singular Matrix (역행렬 미존재) 또는 수치 불안정 → 유클리드 정규화 Fallback
    const message = err instanceof Error ? err.message : 'Singular matrix';
    return fallbackEuclidean(delta, threshold, message);
  }
}

/** Σ가 특이행렬일 때 대각 표준편차 기반 정규화 유클리드 거리로 대체 */
function fallbackEuclidean(
  delta: number[],
  threshold: number,
  reason: string,
): AnomalyResult {
  // 대략적 스케일: 각 축을 단위 분산으로 가정한 정규화 거리
  const euclid = Math.sqrt(delta.reduce((sum, d) => sum + d * d, 0) / delta.length);
  return {
    isAnomaly: euclid > threshold,
    distance: round4(euclid),
    fallbackUsed: true,
    reason: `Singular/unstable Σ — Euclidean fallback (${reason})`,
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export { DEFAULT_THRESHOLD };
