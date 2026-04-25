// 給与額面からの社会保険料・所得税・住民税の概算を行うユーティリティ。
// MVP としての近似で、料率は協会けんぽ東京 (2024年度相当) を参考にしつつ
// 等級表・都道府県差は省略している。年度差は Plan.taxRuleSets で
// 「ある暦年から適用される税制」として持たせ、ここではそれを引数で受け取る。
//
// ruleSet を省略するとビルトインのデフォルト (BUILT_IN_TAX_RULE_SET) を使う。

import type { EmploymentIncomeDeductionBracket, IncomeTaxBracket, TaxRuleSet } from "@/lib/dsl/types";

export const BUILT_IN_TAX_RULE_SET: TaxRuleSet = {
  id: "builtin-default",
  label: "ビルトイン (協会けんぽ東京 2024年度相当)",
  effectiveFromYear: 0,
  socialInsurance: {
    rates: {
      /** 健康保険 本人負担分 (協会けんぽ東京 9.98% の折半) */
      health: 0.0499,
      /** 厚生年金 本人負担分 (18.3% の折半) */
      pension: 0.0915,
      /** 雇用保険 本人負担分 (一般事業 0.6%) */
      employment: 0.006,
      /** 介護保険 本人負担分 (40歳以上、1.82% の折半) */
      longTermCare: 0.0091,
    },
    annualCaps: {
      /** 健康保険 月139万 × 12 */
      health: 1_390_000 * 12,
      /** 厚生年金 月65万 × 12 */
      pension: 650_000 * 12,
    },
    longTermCareStartAge: 40,
  },
  employmentIncomeDeduction: [
    { upTo: 1_625_000, kind: "flat", amount: 550_000 },
    { upTo: 1_800_000, kind: "formula", rate: 0.4, add: -100_000 },
    { upTo: 3_600_000, kind: "formula", rate: 0.3, add: 80_000 },
    { upTo: 6_600_000, kind: "formula", rate: 0.2, add: 440_000 },
    { upTo: 8_500_000, kind: "formula", rate: 0.1, add: 1_100_000 },
    { upTo: null, kind: "flat", amount: 1_950_000 },
  ],
  incomeTax: {
    brackets: [
      { upTo: 1_950_000, rate: 0.05, subtract: 0 },
      { upTo: 3_300_000, rate: 0.1, subtract: 97_500 },
      { upTo: 6_950_000, rate: 0.2, subtract: 427_500 },
      { upTo: 9_000_000, rate: 0.23, subtract: 636_000 },
      { upTo: 18_000_000, rate: 0.33, subtract: 1_536_000 },
      { upTo: 40_000_000, rate: 0.4, subtract: 2_796_000 },
      { upTo: null, rate: 0.45, subtract: 4_796_000 },
    ],
    basicDeduction: 480_000,
    spouseDeduction: 380_000,
    dependentDeduction: 380_000,
    reconstructionSurtaxMultiplier: 1.021,
  },
  residentTax: {
    basicDeduction: 430_000,
    spouseDeduction: 330_000,
    dependentDeduction: 330_000,
    incomeRate: 0.1,
    perCapita: 5_000,
  },
};

export type SocialInsuranceBreakdown = {
  health: number;
  pension: number;
  employment: number;
  longTermCare: number;
  total: number;
};

function findBracket<T extends { upTo: number | null }>(amount: number, brackets: readonly T[]): T | undefined {
  for (const b of brackets) {
    if (b.upTo === null || amount <= b.upTo) return b;
  }
  return undefined;
}

export function computeAnnualSocialInsurance(
  annualGross: number,
  ageYears: number,
  ruleSet: TaxRuleSet = BUILT_IN_TAX_RULE_SET,
): SocialInsuranceBreakdown {
  if (annualGross <= 0) {
    return { health: 0, pension: 0, employment: 0, longTermCare: 0, total: 0 };
  }
  const { rates, annualCaps, longTermCareStartAge } = ruleSet.socialInsurance;
  const healthBase = Math.min(annualGross, annualCaps.health);
  const pensionBase = Math.min(annualGross, annualCaps.pension);
  const health = healthBase * rates.health;
  const pension = pensionBase * rates.pension;
  const employment = annualGross * rates.employment;
  const longTermCare = ageYears >= longTermCareStartAge ? healthBase * rates.longTermCare : 0;
  const total = health + pension + employment + longTermCare;
  return { health, pension, employment, longTermCare, total };
}

/** 給与所得控除 */
export function computeEmploymentIncomeDeduction(
  annualGross: number,
  ruleSet: TaxRuleSet = BUILT_IN_TAX_RULE_SET,
): number {
  if (annualGross <= 0) return 0;
  const b: EmploymentIncomeDeductionBracket | undefined = findBracket(annualGross, ruleSet.employmentIncomeDeduction);
  if (!b) return 0;
  if (b.kind === "flat") return b.amount;
  return Math.floor(annualGross * b.rate) + b.add;
}

/** 所得税の速算表 */
export function computeIncomeTaxBase(taxable: number, ruleSet: TaxRuleSet = BUILT_IN_TAX_RULE_SET): number {
  if (taxable <= 0) return 0;
  const b: IncomeTaxBracket | undefined = findBracket(taxable, ruleSet.incomeTax.brackets);
  if (!b) return 0;
  return taxable * b.rate - b.subtract;
}

export type TaxCommonInput = {
  /** 額面年収 */
  annualGross: number;
  /** 社会保険料控除額 (年額) */
  socialInsurance: number;
  /** 扶養親族数 (配偶者を除く、16歳以上一般扶養を想定) */
  dependents: number;
  /** 配偶者控除を適用するか */
  hasSpouseDeduction: boolean;
};

/** 所得税 (復興特別所得税込み) の年額 */
export function computeAnnualIncomeTax(input: TaxCommonInput, ruleSet: TaxRuleSet = BUILT_IN_TAX_RULE_SET): number {
  const { annualGross, socialInsurance, dependents, hasSpouseDeduction } = input;
  if (annualGross <= 0) return 0;
  const { basicDeduction, spouseDeduction, dependentDeduction, reconstructionSurtaxMultiplier } = ruleSet.incomeTax;
  const incomeDeduction = computeEmploymentIncomeDeduction(annualGross, ruleSet);
  const income = annualGross - incomeDeduction;
  const spouse = hasSpouseDeduction ? spouseDeduction : 0;
  const dependentsDed = Math.max(0, dependents) * dependentDeduction;
  const taxable = Math.max(0, income - basicDeduction - spouse - dependentsDed - Math.max(0, socialInsurance));
  const base = computeIncomeTaxBase(taxable, ruleSet);
  return base * reconstructionSurtaxMultiplier;
}

/** 住民税 (所得割 + 均等割) の年額 */
export function computeAnnualResidentTax(input: TaxCommonInput, ruleSet: TaxRuleSet = BUILT_IN_TAX_RULE_SET): number {
  const { annualGross, socialInsurance, dependents, hasSpouseDeduction } = input;
  if (annualGross <= 0) return 0;
  const { basicDeduction, spouseDeduction, dependentDeduction, incomeRate, perCapita } = ruleSet.residentTax;
  const incomeDeduction = computeEmploymentIncomeDeduction(annualGross, ruleSet);
  const income = annualGross - incomeDeduction;
  const spouse = hasSpouseDeduction ? spouseDeduction : 0;
  const dependentsDed = Math.max(0, dependents) * dependentDeduction;
  const taxable = Math.max(0, income - basicDeduction - spouse - dependentsDed - Math.max(0, socialInsurance));
  return Math.floor(taxable * incomeRate) + perCapita;
}

/**
 * Plan に格納された taxRuleSets と対象年から、その年に適用される税制ルールを決定する。
 *
 * - 配列が空ならビルトインのデフォルトを返す。
 * - そうでなければ `effectiveFromYear <= year` を満たす中で最も大きい `effectiveFromYear` の 1 件。
 * - 該当が無い (= 最古ルールより前の年) 場合は最古ルールを返す (前向き拡張)。
 */
export function resolveTaxRuleSet(ruleSets: readonly TaxRuleSet[], year: number): TaxRuleSet {
  let best: TaxRuleSet | undefined;
  let oldest: TaxRuleSet | undefined;
  for (const r of ruleSets) {
    if (r.effectiveFromYear <= year && (!best || r.effectiveFromYear > best.effectiveFromYear)) best = r;
    if (!oldest || r.effectiveFromYear < oldest.effectiveFromYear) oldest = r;
  }
  return best ?? oldest ?? BUILT_IN_TAX_RULE_SET;
}
