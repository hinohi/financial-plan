import { describe, expect, it } from "bun:test";
import {
  computeAnnualIncomeTax,
  computeAnnualResidentTax,
  computeAnnualSocialInsurance,
  computeEmploymentIncomeDeduction,
  computeIncomeTaxBase,
} from "./index";

describe("computeAnnualSocialInsurance", () => {
  it("40歳未満は介護保険がゼロ", () => {
    const r = computeAnnualSocialInsurance(5_000_000, 30);
    expect(r.longTermCare).toBe(0);
    // 健康保険 = 500万 * 0.0499 = 249,500
    expect(r.health).toBeCloseTo(249_500, 0);
    expect(r.pension).toBeCloseTo(457_500, 0);
    expect(r.employment).toBeCloseTo(30_000, 0);
    expect(r.total).toBeCloseTo(737_000, 0);
  });

  it("40歳以上は介護保険が上乗せされる", () => {
    const r = computeAnnualSocialInsurance(5_000_000, 45);
    expect(r.longTermCare).toBeCloseTo(45_500, 0);
  });

  it("健保/厚年に年額キャップが適用される", () => {
    const r = computeAnnualSocialInsurance(30_000_000, 30);
    // 健保は 139万*12 = 16,680,000 が base
    expect(r.health).toBeCloseTo(16_680_000 * 0.0499, 0);
    // 厚年は 65万*12 = 7,800,000 が base
    expect(r.pension).toBeCloseTo(7_800_000 * 0.0915, 0);
    // 雇用は上限なし
    expect(r.employment).toBeCloseTo(30_000_000 * 0.006, 0);
  });

  it("年収ゼロならすべてゼロ", () => {
    const r = computeAnnualSocialInsurance(0, 50);
    expect(r.total).toBe(0);
  });
});

describe("computeEmploymentIncomeDeduction", () => {
  it("各階段の境界で破綻しない", () => {
    expect(computeEmploymentIncomeDeduction(0)).toBe(0);
    expect(computeEmploymentIncomeDeduction(1_000_000)).toBe(550_000);
    expect(computeEmploymentIncomeDeduction(1_625_000)).toBe(550_000);
    expect(computeEmploymentIncomeDeduction(3_600_000)).toBe(1_160_000);
    expect(computeEmploymentIncomeDeduction(6_600_000)).toBe(1_760_000);
    expect(computeEmploymentIncomeDeduction(8_500_000)).toBe(1_950_000);
    expect(computeEmploymentIncomeDeduction(20_000_000)).toBe(1_950_000);
  });
});

describe("computeIncomeTaxBase", () => {
  it("速算表の各区分で正しい値を返す", () => {
    expect(computeIncomeTaxBase(0)).toBe(0);
    expect(computeIncomeTaxBase(1_000_000)).toBe(50_000);
    expect(computeIncomeTaxBase(3_000_000)).toBe(202_500);
    expect(computeIncomeTaxBase(5_000_000)).toBe(572_500);
  });
});

describe("computeAnnualIncomeTax", () => {
  it("年収500万、扶養なし、社保約74万 → 所得税は約10万円台", () => {
    const si = computeAnnualSocialInsurance(5_000_000, 30).total;
    const tax = computeAnnualIncomeTax({
      annualGross: 5_000_000,
      socialInsurance: si,
      dependents: 0,
      hasSpouseDeduction: false,
    });
    // 給与所得控除 = 5,000,000 * 0.2 + 440,000 = 1,440,000
    // 所得 = 3,560,000
    // 控除 = 480,000 (基礎) + 737,000 (社保) = 1,217,000
    // 課税 = 2,343,000
    // 税 = 2,343,000 * 0.1 - 97,500 = 136,800
    // 復興 = 136,800 * 1.021 = 139,672
    expect(tax).toBeGreaterThan(130_000);
    expect(tax).toBeLessThan(150_000);
  });

  it("扶養/配偶者控除で税額が下がる", () => {
    const si = computeAnnualSocialInsurance(8_000_000, 30).total;
    const base = computeAnnualIncomeTax({
      annualGross: 8_000_000,
      socialInsurance: si,
      dependents: 0,
      hasSpouseDeduction: false,
    });
    const withDeps = computeAnnualIncomeTax({
      annualGross: 8_000_000,
      socialInsurance: si,
      dependents: 2,
      hasSpouseDeduction: true,
    });
    expect(withDeps).toBeLessThan(base);
  });

  it("年収ゼロなら税額ゼロ", () => {
    expect(
      computeAnnualIncomeTax({ annualGross: 0, socialInsurance: 0, dependents: 0, hasSpouseDeduction: false }),
    ).toBe(0);
  });
});

describe("computeAnnualResidentTax", () => {
  it("前年収入がゼロなら住民税もゼロ", () => {
    const rt = computeAnnualResidentTax({
      annualGross: 0,
      socialInsurance: 0,
      dependents: 0,
      hasSpouseDeduction: false,
    });
    expect(rt).toBe(0);
  });

  it("年収500万 → 均等割 + 所得割約22万台", () => {
    const si = computeAnnualSocialInsurance(5_000_000, 30).total;
    const rt = computeAnnualResidentTax({
      annualGross: 5_000_000,
      socialInsurance: si,
      dependents: 0,
      hasSpouseDeduction: false,
    });
    expect(rt).toBeGreaterThan(200_000);
    expect(rt).toBeLessThan(260_000);
  });
});
