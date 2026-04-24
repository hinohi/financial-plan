// 給与額面からの社会保険料・所得税・住民税の概算を行うユーティリティ。
// MVP としての近似で、料率は協会けんぽ東京 (2024年度相当) を参考にしつつ
// 等級表・都道府県差・年度差は省略している。
// 将来年度ごとに値を差し替えたくなった場合、ここの TAX_CONSTANTS を丸ごと置換する。

export const TAX_CONSTANTS = {
  socialInsuranceRates: {
    /** 健康保険 本人負担分 (協会けんぽ東京 9.98% の折半) */
    health: 0.0499,
    /** 厚生年金 本人負担分 (18.3% の折半) */
    pension: 0.0915,
    /** 雇用保険 本人負担分 (一般事業 0.6%) */
    employment: 0.006,
    /** 介護保険 本人負担分 (40歳以上、1.82% の折半) */
    longTermCare: 0.0091,
  },
  /** 標準報酬月額の上限。年額換算で社保のキャップとして用いる */
  socialInsuranceAnnualCaps: {
    /** 健康保険 月139万 × 12 */
    health: 1_390_000 * 12,
    /** 厚生年金 月65万 × 12 */
    pension: 650_000 * 12,
  },
  longTermCareStartAge: 40,
  incomeTax: {
    /** 基礎控除 */
    basicDeduction: 480_000,
    /** 配偶者控除 */
    spouseDeduction: 380_000,
    /** 扶養控除 1 人あたり (16歳以上一般扶養を想定) */
    dependentDeduction: 380_000,
    /** 復興特別所得税 2.1% を含む乗率 */
    reconstructionSurtaxMultiplier: 1.021,
  },
  residentTax: {
    basicDeduction: 430_000,
    spouseDeduction: 330_000,
    dependentDeduction: 330_000,
    /** 所得割率 (県市合計 10%) */
    incomeRate: 0.1,
    /** 均等割 (県 1,500 + 市 3,500 相当の丸め) */
    perCapita: 5_000,
  },
} as const;

// 既存 export との互換を維持 (外部でも参照されるため)。
export const SOCIAL_INSURANCE_RATES = TAX_CONSTANTS.socialInsuranceRates;
export const SOCIAL_INSURANCE_ANNUAL_CAPS = TAX_CONSTANTS.socialInsuranceAnnualCaps;
export const LONG_TERM_CARE_START_AGE = TAX_CONSTANTS.longTermCareStartAge;

export type SocialInsuranceBreakdown = {
  health: number;
  pension: number;
  employment: number;
  longTermCare: number;
  total: number;
};

export function computeAnnualSocialInsurance(annualGross: number, ageYears: number): SocialInsuranceBreakdown {
  if (annualGross <= 0) {
    return { health: 0, pension: 0, employment: 0, longTermCare: 0, total: 0 };
  }
  const healthBase = Math.min(annualGross, SOCIAL_INSURANCE_ANNUAL_CAPS.health);
  const pensionBase = Math.min(annualGross, SOCIAL_INSURANCE_ANNUAL_CAPS.pension);
  const health = healthBase * SOCIAL_INSURANCE_RATES.health;
  const pension = pensionBase * SOCIAL_INSURANCE_RATES.pension;
  const employment = annualGross * SOCIAL_INSURANCE_RATES.employment;
  const longTermCare = ageYears >= LONG_TERM_CARE_START_AGE ? healthBase * SOCIAL_INSURANCE_RATES.longTermCare : 0;
  const total = health + pension + employment + longTermCare;
  return { health, pension, employment, longTermCare, total };
}

/** 給与所得控除 (2020年改正以降) */
export function computeEmploymentIncomeDeduction(annualGross: number): number {
  if (annualGross <= 0) return 0;
  if (annualGross <= 1_625_000) return 550_000;
  if (annualGross <= 1_800_000) return Math.floor(annualGross * 0.4) - 100_000;
  if (annualGross <= 3_600_000) return Math.floor(annualGross * 0.3) + 80_000;
  if (annualGross <= 6_600_000) return Math.floor(annualGross * 0.2) + 440_000;
  if (annualGross <= 8_500_000) return Math.floor(annualGross * 0.1) + 1_100_000;
  return 1_950_000;
}

/** 所得税の速算表 */
export function computeIncomeTaxBase(taxable: number): number {
  if (taxable <= 0) return 0;
  if (taxable <= 1_950_000) return taxable * 0.05;
  if (taxable <= 3_300_000) return taxable * 0.1 - 97_500;
  if (taxable <= 6_950_000) return taxable * 0.2 - 427_500;
  if (taxable <= 9_000_000) return taxable * 0.23 - 636_000;
  if (taxable <= 18_000_000) return taxable * 0.33 - 1_536_000;
  if (taxable <= 40_000_000) return taxable * 0.4 - 2_796_000;
  return taxable * 0.45 - 4_796_000;
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
export function computeAnnualIncomeTax(input: TaxCommonInput): number {
  const { annualGross, socialInsurance, dependents, hasSpouseDeduction } = input;
  if (annualGross <= 0) return 0;
  const { basicDeduction, spouseDeduction, dependentDeduction, reconstructionSurtaxMultiplier } =
    TAX_CONSTANTS.incomeTax;
  const incomeDeduction = computeEmploymentIncomeDeduction(annualGross);
  const income = annualGross - incomeDeduction;
  const spouse = hasSpouseDeduction ? spouseDeduction : 0;
  const dependentsDed = Math.max(0, dependents) * dependentDeduction;
  const taxable = Math.max(0, income - basicDeduction - spouse - dependentsDed - Math.max(0, socialInsurance));
  const base = computeIncomeTaxBase(taxable);
  return base * reconstructionSurtaxMultiplier;
}

/** 住民税 (所得割 + 均等割) の年額 */
export function computeAnnualResidentTax(input: TaxCommonInput): number {
  const { annualGross, socialInsurance, dependents, hasSpouseDeduction } = input;
  if (annualGross <= 0) return 0;
  const { basicDeduction, spouseDeduction, dependentDeduction, incomeRate, perCapita } = TAX_CONSTANTS.residentTax;
  const incomeDeduction = computeEmploymentIncomeDeduction(annualGross);
  const income = annualGross - incomeDeduction;
  const spouse = hasSpouseDeduction ? spouseDeduction : 0;
  const dependentsDed = Math.max(0, dependents) * dependentDeduction;
  const taxable = Math.max(0, income - basicDeduction - spouse - dependentsDed - Math.max(0, socialInsurance));
  return Math.floor(taxable * incomeRate) + perCapita;
}
