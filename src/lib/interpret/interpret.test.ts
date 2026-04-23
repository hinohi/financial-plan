import { describe, expect, test } from "bun:test";
import type { Plan } from "@/lib/dsl/types";
import {
  computeLiabilitySchedule,
  computeSegmentAmount,
  interpret,
  loanMonthlyPayment,
  monthlyCompoundRate,
} from "./index";

function basePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    schemaVersion: 1,
    settings: {
      yearStartMonth: 1,
      planStartMonth: "2026-01",
      planEndMonth: "2026-12",
    },
    accounts: [{ id: "a1", label: "cash", kind: "cash" }],
    snapshots: [],
    incomes: [],
    expenses: [],
    events: [],
    transfers: [],
    categories: [],
    ...overrides,
  };
}

describe("interpret", () => {
  test("空のプランは空のエントリを返す", () => {
    const plan = basePlan();
    expect(interpret(plan)).toEqual([]);
  });

  test("計画期間内の snapshot は sourceKind=snapshot として出力される", () => {
    const plan = basePlan({
      snapshots: [{ id: "s1", accountId: "a1", month: "2026-03", balance: 1000 }],
    });
    expect(interpret(plan)).toEqual([
      { month: "2026-03", accountId: "a1", sourceId: "s1", sourceKind: "snapshot", amount: 1000 },
    ]);
  });

  test("計画期間外の snapshot は出力されない", () => {
    const plan = basePlan({
      snapshots: [
        { id: "s-before", accountId: "a1", month: "2025-12", balance: 500 },
        { id: "s-after", accountId: "a1", month: "2027-01", balance: 500 },
      ],
    });
    expect(interpret(plan)).toEqual([]);
  });

  test("income segment を月ごとに展開する", () => {
    const plan = basePlan({
      incomes: [
        {
          id: "i1",
          label: "給与",
          accountId: "a1",
          segments: [{ startMonth: "2026-01", endMonth: "2026-03", amount: 300 }],
        },
      ],
    });
    const entries = interpret(plan);
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(entries.every((e) => e.sourceKind === "income" && e.amount === 300)).toBe(true);
  });

  test("endMonth 省略時は計画終了月まで展開される", () => {
    const plan = basePlan({
      incomes: [
        {
          id: "i1",
          label: "給与",
          accountId: "a1",
          segments: [{ startMonth: "2026-10", amount: 100 }],
        },
      ],
    });
    const months = interpret(plan).map((e) => e.month);
    expect(months).toEqual(["2026-10", "2026-11", "2026-12"]);
  });

  test("segment が計画期間前から開始していても計画開始月でクリップされる", () => {
    const plan = basePlan({
      incomes: [
        {
          id: "i1",
          label: "給与",
          accountId: "a1",
          segments: [{ startMonth: "2025-06", endMonth: "2026-02", amount: 100 }],
        },
      ],
    });
    const months = interpret(plan).map((e) => e.month);
    expect(months).toEqual(["2026-01", "2026-02"]);
  });

  test("segment が計画期間外にまったく入らないなら展開されない", () => {
    const plan = basePlan({
      incomes: [
        {
          id: "i1",
          label: "x",
          accountId: "a1",
          segments: [{ startMonth: "2027-01", endMonth: "2027-12", amount: 100 }],
        },
      ],
    });
    expect(interpret(plan)).toEqual([]);
  });

  test("expense は負の amount として出力される", () => {
    const plan = basePlan({
      expenses: [
        {
          id: "e1",
          label: "家賃",
          accountId: "a1",
          segments: [{ startMonth: "2026-01", endMonth: "2026-02", amount: 200 }],
        },
      ],
    });
    const entries = interpret(plan);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.sourceKind === "expense" && e.amount === -200)).toBe(true);
  });

  test("複数 segment を結合して展開する", () => {
    const plan = basePlan({
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-06" },
      incomes: [
        {
          id: "i1",
          label: "給与",
          accountId: "a1",
          segments: [
            { startMonth: "2026-01", endMonth: "2026-03", amount: 100 },
            { startMonth: "2026-04", endMonth: "2026-06", amount: 200 },
          ],
        },
      ],
    });
    const amounts = interpret(plan)
      .filter((e) => e.sourceKind === "income")
      .map((e) => [e.month, e.amount]);
    expect(amounts).toEqual([
      ["2026-01", 100],
      ["2026-02", 100],
      ["2026-03", 100],
      ["2026-04", 200],
      ["2026-05", 200],
      ["2026-06", 200],
    ]);
  });

  test("raise=fixed は everyMonths ごとに value を加算する", () => {
    const plan = basePlan({
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2028-12" },
      incomes: [
        {
          id: "i1",
          label: "給与",
          accountId: "a1",
          segments: [
            {
              startMonth: "2026-01",
              amount: 1000,
              raise: { kind: "fixed", value: 100, everyMonths: 12 },
            },
          ],
        },
      ],
    });
    const sample = (month: string) =>
      interpret(plan).find((e) => e.month === month && e.sourceKind === "income")?.amount;
    expect(sample("2026-01")).toBe(1000);
    expect(sample("2026-12")).toBe(1000);
    expect(sample("2027-01")).toBe(1100);
    expect(sample("2028-01")).toBe(1200);
    expect(sample("2028-12")).toBe(1200);
  });

  test("raise=rate は everyMonths ごとに (1+value) を掛ける", () => {
    const plan = basePlan({
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2028-12" },
      incomes: [
        {
          id: "i1",
          label: "給与",
          accountId: "a1",
          segments: [
            {
              startMonth: "2026-01",
              amount: 1000,
              raise: { kind: "rate", value: 0.1, everyMonths: 12 },
            },
          ],
        },
      ],
    });
    const sample = (month: string) =>
      interpret(plan).find((e) => e.month === month && e.sourceKind === "income")?.amount;
    expect(sample("2026-01")).toBe(1000);
    expect(sample("2027-01")).toBeCloseTo(1100);
    expect(sample("2028-01")).toBeCloseTo(1210);
  });

  test("intervalMonths=12 なら 1 年に 1 回だけ発生する", () => {
    const plan = basePlan({
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2028-12" },
      incomes: [
        {
          id: "i1",
          label: "ボーナス",
          accountId: "a1",
          segments: [{ startMonth: "2026-06", amount: 500, intervalMonths: 12 }],
        },
      ],
    });
    const months = interpret(plan)
      .filter((e) => e.sourceKind === "income")
      .map((e) => e.month);
    expect(months).toEqual(["2026-06", "2027-06", "2028-06"]);
  });

  test("intervalMonths=6 なら半年ごとに発生する", () => {
    const plan = basePlan({
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2027-12" },
      expenses: [
        {
          id: "e1",
          label: "保険料",
          accountId: "a1",
          segments: [{ startMonth: "2026-02", amount: 100, intervalMonths: 6 }],
        },
      ],
    });
    const months = interpret(plan)
      .filter((e) => e.sourceKind === "expense")
      .map((e) => e.month);
    expect(months).toEqual(["2026-02", "2026-08", "2027-02", "2027-08"]);
  });

  test("intervalMonths=1 または未指定なら毎月発生 (デフォルト互換)", () => {
    const plan = basePlan({
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-03" },
      incomes: [
        {
          id: "i1",
          label: "給与",
          accountId: "a1",
          segments: [{ startMonth: "2026-01", amount: 100 }],
        },
        {
          id: "i2",
          label: "給与2",
          accountId: "a1",
          segments: [{ startMonth: "2026-01", amount: 50, intervalMonths: 1 }],
        },
      ],
    });
    const counts = interpret(plan).filter((e) => e.sourceKind === "income").length;
    expect(counts).toBe(6);
  });

  test("intervalMonths と raise は独立に機能する (12 ヶ月ごと + 12 ヶ月ごと昇給)", () => {
    const plan = basePlan({
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2028-12" },
      incomes: [
        {
          id: "i1",
          label: "ボーナス",
          accountId: "a1",
          segments: [
            {
              startMonth: "2026-06",
              amount: 1000,
              intervalMonths: 12,
              raise: { kind: "fixed", value: 100, everyMonths: 12 },
            },
          ],
        },
      ],
    });
    const entries = interpret(plan).filter((e) => e.sourceKind === "income");
    expect(entries.map((e) => [e.month, e.amount])).toEqual([
      ["2026-06", 1000],
      ["2027-06", 1100],
      ["2028-06", 1200],
    ]);
  });

  test("everyMonths が 0 以下なら raise は適用されない (防御)", () => {
    expect(
      computeSegmentAmount(
        { startMonth: "2026-01", amount: 1000, raise: { kind: "fixed", value: 100, everyMonths: 0 } },
        "2030-01",
      ),
    ).toBe(1000);
  });

  test("OneShotEvent は計画期間内なら event として出力される", () => {
    const plan = basePlan({
      events: [{ id: "ev1", label: "結婚式", accountId: "a1", month: "2026-06", amount: -3000 }],
    });
    const entries = interpret(plan);
    expect(entries).toEqual([
      { month: "2026-06", accountId: "a1", sourceId: "ev1", sourceKind: "event", amount: -3000 },
    ]);
  });

  test("OneShotEvent は計画期間外なら出力されない", () => {
    const plan = basePlan({
      events: [{ id: "ev1", label: "x", accountId: "a1", month: "2027-01", amount: 100 }],
    });
    expect(interpret(plan)).toEqual([]);
  });

  test("Transfer は from/to の両口座へ対称な entry を生む", () => {
    const plan = basePlan({
      accounts: [
        { id: "a1", label: "cash", kind: "cash" },
        { id: "a2", label: "invest", kind: "investment" },
      ],
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-02" },
      transfers: [
        {
          id: "t1",
          label: "積立",
          fromAccountId: "a1",
          toAccountId: "a2",
          segments: [{ startMonth: "2026-01", endMonth: "2026-02", amount: 500 }],
        },
      ],
    });
    const entries = interpret(plan);
    expect(entries).toHaveLength(4);
    expect(entries).toContainEqual({
      month: "2026-01",
      accountId: "a1",
      sourceId: "t1",
      sourceKind: "transfer",
      amount: -500,
    });
    expect(entries).toContainEqual({
      month: "2026-01",
      accountId: "a2",
      sourceId: "t1",
      sourceKind: "transfer",
      amount: 500,
    });
    expect(entries).toContainEqual({
      month: "2026-02",
      accountId: "a1",
      sourceId: "t1",
      sourceKind: "transfer",
      amount: -500,
    });
  });

  test("Transfer も intervalMonths に従って発生月が間引かれる", () => {
    const plan = basePlan({
      accounts: [
        { id: "a1", label: "cash", kind: "cash" },
        { id: "a2", label: "invest", kind: "investment" },
      ],
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2027-12" },
      transfers: [
        {
          id: "t1",
          label: "NISA",
          fromAccountId: "a1",
          toAccountId: "a2",
          segments: [{ startMonth: "2026-03", amount: 100_000, intervalMonths: 12 }],
        },
      ],
    });
    const months = [
      ...new Set(
        interpret(plan)
          .filter((e) => e.sourceKind === "transfer")
          .map((e) => e.month),
      ),
    ];
    expect(months).toEqual(["2026-03", "2027-03"]);
  });

  test("Transfer の minFromBalance は出金元の月初残高が上限を割らないよう部分的に移動する", () => {
    const plan = basePlan({
      accounts: [
        { id: "a1", label: "cash", kind: "cash" },
        { id: "a2", label: "invest", kind: "investment" },
      ],
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-04" },
      snapshots: [{ id: "s1", accountId: "a1", month: "2026-01", balance: 1_050_000 }],
      transfers: [
        {
          id: "t1",
          label: "余剰積立",
          fromAccountId: "a1",
          toAccountId: "a2",
          segments: [{ startMonth: "2026-02", endMonth: "2026-04", amount: 100_000 }],
          minFromBalance: 1_000_000,
        },
      ],
    });
    const entries = interpret(plan).filter((e) => e.sourceKind === "transfer");
    // 2026-02 月初 1,050,000 → 移動可能 50,000 のみ (希望 100,000)
    // 2026-03 月初 1,000,000 → 移動可能 0
    // 2026-04 月初 1,000,000 → 移動可能 0
    const a1Entries = entries.filter((e) => e.accountId === "a1");
    const a2Entries = entries.filter((e) => e.accountId === "a2");
    expect(a1Entries).toHaveLength(1);
    expect(a1Entries[0]?.month).toBe("2026-02");
    expect(a1Entries[0]?.amount).toBe(-50_000);
    expect(a2Entries).toHaveLength(1);
    expect(a2Entries[0]?.amount).toBe(50_000);
  });

  test("Transfer の minFromBalance=0 は「残高がマイナスになりそうなら止める」動作になる", () => {
    const plan = basePlan({
      accounts: [
        { id: "a1", label: "cash", kind: "cash" },
        { id: "a2", label: "invest", kind: "investment" },
      ],
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-03" },
      snapshots: [{ id: "s1", accountId: "a1", month: "2026-01", balance: 150 }],
      transfers: [
        {
          id: "t1",
          label: "積立",
          fromAccountId: "a1",
          toAccountId: "a2",
          segments: [{ startMonth: "2026-01", endMonth: "2026-03", amount: 100 }],
          minFromBalance: 0,
        },
      ],
    });
    const entries = interpret(plan).filter((e) => e.sourceKind === "transfer" && e.accountId === "a1");
    // 移動額の判定は「月初残高」基準 (同月 snapshot は月末に反映) で進む
    expect(entries.map((e) => [e.month, e.amount])).toEqual([
      ["2026-02", -100],
      ["2026-03", -50],
    ]);
  });

  test("Transfer の minFromBalance 未指定なら残高に関わらず希望額を移動 (既存挙動)", () => {
    const plan = basePlan({
      accounts: [
        { id: "a1", label: "cash", kind: "cash" },
        { id: "a2", label: "invest", kind: "investment" },
      ],
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-02" },
      snapshots: [{ id: "s1", accountId: "a1", month: "2026-01", balance: 10 }],
      transfers: [
        {
          id: "t1",
          label: "積立",
          fromAccountId: "a1",
          toAccountId: "a2",
          segments: [{ startMonth: "2026-01", endMonth: "2026-02", amount: 100 }],
        },
      ],
    });
    const entries = interpret(plan).filter((e) => e.sourceKind === "transfer" && e.accountId === "a1");
    expect(entries.every((e) => e.amount === -100)).toBe(true);
  });

  test("Transfer の from===to は無視される", () => {
    const plan = basePlan({
      transfers: [
        {
          id: "t1",
          label: "自己",
          fromAccountId: "a1",
          toAccountId: "a1",
          segments: [{ startMonth: "2026-01", endMonth: "2026-12", amount: 500 }],
        },
      ],
    });
    expect(interpret(plan)).toEqual([]);
  });

  test("複数 segment・口座・snapshot の混在", () => {
    const plan = basePlan({
      accounts: [
        { id: "a1", label: "cash", kind: "cash" },
        { id: "a2", label: "invest", kind: "investment" },
      ],
      snapshots: [{ id: "s1", accountId: "a1", month: "2026-01", balance: 10000 }],
      incomes: [
        {
          id: "i1",
          label: "給与",
          accountId: "a1",
          segments: [{ startMonth: "2026-02", endMonth: "2026-02", amount: 500 }],
        },
      ],
      expenses: [
        {
          id: "e1",
          label: "家賃",
          accountId: "a2",
          segments: [{ startMonth: "2026-02", endMonth: "2026-02", amount: 200 }],
        },
      ],
    });
    const entries = interpret(plan);
    expect(entries).toContainEqual({
      month: "2026-01",
      accountId: "a1",
      sourceId: "s1",
      sourceKind: "snapshot",
      amount: 10000,
    });
    expect(entries).toContainEqual({
      month: "2026-02",
      accountId: "a1",
      sourceId: "i1",
      sourceKind: "income",
      amount: 500,
    });
    expect(entries).toContainEqual({
      month: "2026-02",
      accountId: "a2",
      sourceId: "e1",
      sourceKind: "expense",
      amount: -200,
    });
    expect(entries).toHaveLength(3);
  });
});

describe("investment interest", () => {
  test("annualRate が設定された投資口座は月初残高に対する利息を interest として出力する", () => {
    const plan: Plan = {
      schemaVersion: 1,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-03" },
      accounts: [{ id: "inv", label: "投資", kind: "investment", investment: { annualRate: 0.12 } }],
      snapshots: [{ id: "s1", accountId: "inv", month: "2026-01", balance: 10000 }],
      incomes: [],
      expenses: [],
      events: [],
      transfers: [],
      categories: [],
    };
    const entries = interpret(plan);
    // 2026-01: 月初 0 → 利息なし、snapshot で 10000 に上書き
    // 2026-02: 月初 10000 → 利息 = 10000 * ((1.12)^(1/12) - 1)
    // 2026-03: 月初 10000 + 先月利息 → 利息
    const r = monthlyCompoundRate(0.12);
    const febExpected = Math.trunc(10000 * r);
    const feb = entries.find((e) => e.month === "2026-02" && e.sourceKind === "interest");
    expect(feb?.amount).toBe(febExpected);
    const mar = entries.find((e) => e.month === "2026-03" && e.sourceKind === "interest");
    expect(mar?.amount).toBe(Math.trunc((10000 + febExpected) * r));
  });

  test("annualRate=0 や params 未設定なら利息は出ない", () => {
    const plan: Plan = {
      schemaVersion: 1,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-02" },
      accounts: [
        { id: "a1", label: "投資0", kind: "investment", investment: { annualRate: 0 } },
        { id: "a2", label: "投資未設定", kind: "investment" },
      ],
      snapshots: [
        { id: "s1", accountId: "a1", month: "2026-01", balance: 10000 },
        { id: "s2", accountId: "a2", month: "2026-01", balance: 10000 },
      ],
      incomes: [],
      expenses: [],
      events: [],
      transfers: [],
      categories: [],
    };
    expect(interpret(plan).some((e) => e.sourceKind === "interest")).toBe(false);
  });
});

describe("property depreciation", () => {
  test("annualDepreciationRate が設定された不動産口座は月ごとに減価を depreciation として出力する", () => {
    const plan: Plan = {
      schemaVersion: 1,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-03" },
      accounts: [
        {
          id: "prop",
          label: "家",
          kind: "property",
          property: { annualDepreciationRate: 0.05 },
        },
      ],
      snapshots: [{ id: "s1", accountId: "prop", month: "2026-01", balance: 1000000 }],
      incomes: [],
      expenses: [],
      events: [],
      transfers: [],
      categories: [],
    };
    const entries = interpret(plan);
    const rate = monthlyCompoundRate(-0.05);
    const feb = entries.find((e) => e.month === "2026-02" && e.sourceKind === "depreciation");
    expect(feb?.amount).toBe(Math.trunc(1000000 * rate));
    expect(feb?.amount).toBeLessThan(0);
  });
});

describe("liability schedule", () => {
  test("元利均等: 毎月の支払総額はおよそ一定", () => {
    const schedule = computeLiabilitySchedule({
      annualRate: 0.012,
      scheduleKind: "equal-payment",
      principal: 1_200_000,
      termMonths: 12,
      startMonth: "2026-01",
    });
    const months = [...schedule.values()];
    expect(months).toHaveLength(12);
    const totals = months.map((m) => m.interest + m.principal);
    const first = totals[0];
    for (const t of totals) expect(t).toBeCloseTo(first ?? 0, 3);
    const totalPrincipal = months.reduce((acc, m) => acc + m.principal, 0);
    expect(totalPrincipal).toBeCloseTo(1_200_000, 0);
  });

  test("元金均等: 毎月の元本返済額は固定、利息は逓減", () => {
    const schedule = computeLiabilitySchedule({
      annualRate: 0.012,
      scheduleKind: "equal-principal",
      principal: 1_200_000,
      termMonths: 12,
      startMonth: "2026-01",
    });
    const months = [...schedule.values()];
    for (const m of months) expect(m.principal).toBeCloseTo(100_000, 3);
    for (let i = 1; i < months.length; i++) {
      expect((months[i]?.interest ?? 0) < (months[i - 1]?.interest ?? 0)).toBe(true);
    }
  });

  test("paymentAccountId がある liability は cash と liability の両口座にエントリを生む", () => {
    const plan: Plan = {
      schemaVersion: 1,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-02" },
      accounts: [
        { id: "cash", label: "現金", kind: "cash" },
        {
          id: "loan",
          label: "住宅ローン",
          kind: "liability",
          liability: {
            annualRate: 0.012,
            scheduleKind: "equal-principal",
            principal: 120_000,
            termMonths: 2,
            startMonth: "2026-01",
            paymentAccountId: "cash",
          },
        },
      ],
      snapshots: [],
      incomes: [],
      expenses: [],
      events: [],
      transfers: [],
      categories: [],
    };
    const entries = interpret(plan);
    const jan = entries.filter((e) => e.month === "2026-01");
    const janInterest = jan.find((e) => e.sourceKind === "loan_interest");
    expect(janInterest?.accountId).toBe("cash");
    expect(janInterest?.amount).toBe(-120); // 120_000 * 0.001 = 120
    const janPrincipalCash = jan.find((e) => e.sourceKind === "loan_principal" && e.accountId === "cash");
    expect(janPrincipalCash?.amount).toBe(-60_000);
    const janPrincipalLoan = jan.find((e) => e.sourceKind === "loan_principal" && e.accountId === "loan");
    expect(janPrincipalLoan?.amount).toBe(60_000);
  });

  test("paymentAccountId が無い liability は返済エントリを出さない", () => {
    const plan: Plan = {
      schemaVersion: 1,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-02" },
      accounts: [
        {
          id: "loan",
          label: "借金",
          kind: "liability",
          liability: {
            annualRate: 0.012,
            scheduleKind: "equal-principal",
            principal: 100,
            termMonths: 2,
            startMonth: "2026-01",
          },
        },
      ],
      snapshots: [],
      incomes: [],
      expenses: [],
      events: [],
      transfers: [],
      categories: [],
    };
    expect(interpret(plan).some((e) => e.sourceKind === "loan_interest" || e.sourceKind === "loan_principal")).toBe(
      false,
    );
  });
});

describe("loan expense", () => {
  test("loanMonthlyPayment: 金利 0% は元本を均等に返済する額", () => {
    expect(loanMonthlyPayment(1200, 0, 12)).toBe(100);
  });

  test("loanMonthlyPayment: 元利均等の公式どおり", () => {
    // P=100, r=0.01, n=12
    const payment = loanMonthlyPayment(100, 0.01, 12);
    const expected = (100 * 0.01 * 1.01 ** 12) / (1.01 ** 12 - 1);
    expect(payment).toBeCloseTo(expected, 8);
  });

  test("loan expense は月ごとに元利均等の返済額を expense として出す", () => {
    const plan: Plan = {
      schemaVersion: 1,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-12" },
      accounts: [{ id: "cash", label: "現金", kind: "cash" }],
      snapshots: [],
      incomes: [],
      expenses: [
        {
          id: "e-loan",
          label: "住宅ローン",
          accountId: "cash",
          segments: [],
          loan: {
            principal: 1_200_000,
            rateSegments: [{ startMonth: "2026-01", endMonth: "2026-12", annualRate: 0 }],
          },
        },
      ],
      events: [],
      transfers: [],
      categories: [],
    };
    const entries = interpret(plan).filter((e) => e.sourceId === "e-loan");
    expect(entries).toHaveLength(12);
    expect(entries.every((e) => e.sourceKind === "expense")).toBe(true);
    const total = entries.reduce((acc, e) => acc + e.amount, 0);
    expect(total).toBeCloseTo(-1_200_000, 3);
  });

  test("loan expense はローン終了月以降は何も出さない", () => {
    const plan: Plan = {
      schemaVersion: 1,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2027-12" },
      accounts: [{ id: "cash", label: "現金", kind: "cash" }],
      snapshots: [],
      incomes: [],
      expenses: [
        {
          id: "e-loan",
          label: "車ローン",
          accountId: "cash",
          segments: [],
          loan: {
            principal: 100_000,
            rateSegments: [{ startMonth: "2026-01", endMonth: "2026-06", annualRate: 0 }],
          },
        },
      ],
      events: [],
      transfers: [],
      categories: [],
    };
    const entries = interpret(plan).filter((e) => e.sourceId === "e-loan");
    expect(entries.map((e) => e.month)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]);
  });

  test("loan expense は金利変更時に返済額が再計算される", () => {
    const plan: Plan = {
      schemaVersion: 1,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2027-12" },
      accounts: [{ id: "cash", label: "現金", kind: "cash" }],
      snapshots: [],
      incomes: [],
      expenses: [
        {
          id: "e-loan",
          label: "住宅ローン",
          accountId: "cash",
          segments: [],
          loan: {
            principal: 2_400_000,
            rateSegments: [
              { startMonth: "2026-01", annualRate: 0.012 },
              { startMonth: "2027-01", endMonth: "2027-12", annualRate: 0.024 },
            ],
          },
        },
      ],
      events: [],
      transfers: [],
      categories: [],
    };
    const entries = interpret(plan).filter((e) => e.sourceId === "e-loan");
    expect(entries).toHaveLength(24);
    const jan = entries.find((e) => e.month === "2026-01")?.amount ?? 0;
    const dec = entries.find((e) => e.month === "2026-12")?.amount ?? 0;
    const jan2027 = entries.find((e) => e.month === "2027-01")?.amount ?? 0;
    expect(jan).toBeCloseTo(dec, 6);
    expect(jan2027).not.toBeCloseTo(dec, 2);
    const total = entries.reduce((acc, e) => acc + e.amount, 0);
    // 返済総額は元本より大きい (利息分)
    expect(-total).toBeGreaterThan(2_400_000);
  });

  test("loan を持つ expense は segments より loan 側が優先される", () => {
    const plan: Plan = {
      schemaVersion: 1,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-03" },
      accounts: [{ id: "cash", label: "現金", kind: "cash" }],
      snapshots: [],
      incomes: [],
      expenses: [
        {
          id: "e-loan",
          label: "ローン",
          accountId: "cash",
          segments: [{ startMonth: "2026-01", endMonth: "2026-03", amount: 999 }],
          loan: {
            principal: 300,
            rateSegments: [{ startMonth: "2026-01", endMonth: "2026-03", annualRate: 0 }],
          },
        },
      ],
      events: [],
      transfers: [],
      categories: [],
    };
    const entries = interpret(plan).filter((e) => e.sourceId === "e-loan");
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.amount === -100)).toBe(true);
  });
});
