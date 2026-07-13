import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MSDS_PATH = join(__dirname, '../../data/msds_rules.json');

export type MsdsRule = {
  material: string;
  aliases: string[];
  hazardClass: string;
  forbidden: string[];
  forbiddenPatterns: string[];
  optimal_agent: string;
  tacticalGuideline: string;
  evacuationRadiusM: number;
};

type MsdsDb = { rules: MsdsRule[] };

let cachedDb: MsdsDb | null = null;

async function loadMsdsDb(): Promise<MsdsDb> {
  if (cachedDb) return cachedDb;
  const raw = await readFile(MSDS_PATH, 'utf-8');
  cachedDb = JSON.parse(raw) as MsdsDb;
  return cachedDb;
}

function resolveRule(material: string, rules: MsdsRule[]): MsdsRule {
  const key = material.trim().toLowerCase();
  const found = rules.find(
    (r) =>
      r.material.toLowerCase() === key ||
      r.aliases.some((a) => key.includes(a.toLowerCase()) || a.toLowerCase().includes(key)),
  );
  return found ?? rules.find((r) => r.material === '일반가연물')!;
}

function isWaterReactive(material: string, rule: MsdsRule): boolean {
  const blob = `${material} ${rule.material} ${rule.aliases.join(' ')} ${rule.hazardClass}`;
  return /나트륨|금수성|물반응|sodium|\bna\b/i.test(blob);
}

/**
 * Hard Block: 금지어·금지 패턴 제거 후, 금수성 물질이면 MSDS 가이드 강제 주입.
 */
export function applyMsdsGuardrail(rawText: string, rule: MsdsRule, material: string): string {
  let text = rawText;

  for (const word of rule.forbidden) {
    text = text.replace(new RegExp(word, 'gi'), '');
  }
  for (const pattern of rule.forbiddenPatterns) {
    text = text.replace(new RegExp(pattern, 'gi'), '');
  }
  text = text.replace(/\s{2,}/g, ' ').trim();

  if (isWaterReactive(material, rule)) {
    return rule.tacticalGuideline;
  }

  const stillForbidden = rule.forbidden.some((w) => new RegExp(w, 'i').test(text));
  if (stillForbidden) {
    return rule.tacticalGuideline;
  }

  return text || rule.tacticalGuideline;
}

/**
 * 출동 대원용 '1초 레시피' — Markdown 3줄 요약만 반환.
 * 나트륨/금수성 물질이면 '용수·물·살수' 출력을 물리적으로 차단한다.
 */
export async function generateTacticalRecipe(
  factoryName: string,
  material: string,
  zone: string,
): Promise<string> {
  const db = await loadMsdsDb();
  const rule = resolveRule(material, db.rules);

  // 의도적으로 위험 표현이 섞인 LLM 초안 → 가드레일이 걸러냄
  const llmDraft = `${factoryName} 화재. 초기 대응으로 용수 살수 검토. 구역: ${zone}.`;
  const guardedTactic = applyMsdsGuardrail(llmDraft, rule, material);

  const line1 = `**[위험물]** ${factoryName}(${zone}) — ${rule.material} / ${rule.hazardClass}`;
  const line2 = `**[전술]** ${guardedTactic}`;
  const line3 = `**[배치]** 최적 약제: ${rule.optimal_agent} · 대피 반경 ${rule.evacuationRadiusM}m · 후면 진입로 전면 배치`;

  return [line1, line2, line3].join('\n');
}
