import { describe, expect, test } from "bun:test";
import type { Plan } from "@/lib/dsl/types";
import { computeSegmentAmount, interpret, loanMonthlyPayment, monthlyCompoundRate } from "./index";

function basePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    schemaVersion: 3,
    settings: {
      yearStartMonth: 1,
      planStartMonth: "2026-01",
      planEndMonth: "2026-12",
    },
    persons: [],
    accounts: [{ id: "a1", label: "cash", kind: "cash" }],
    incomes: [],
    expenses: [],
    events: [],
    transfers: [],
    categories: [],
    grossSalaries: [],
    taxRuleSets: [],
    ...overrides,
  };
}

describe("interpret", () => {
  test("空のプランは空のエントリを返す", () => {
    const plan = basePlan();
    expect(interpret(plan)).toEqual([]);
  });

  test("account.initialBalance はエントリには現れない (口座の初期残高として内部状態に反映される)", () => {
    const plan = basePlan({
      accounts: [{ id: "a1", label: "cash", kind: "cash", initialBalance: 1000 }],
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
        { id: "a1", label: "cash", kind: "cash", initialBalance: 1_050_000 },
        { id: "a2", label: "invest", kind: "investment" },
      ],
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-04" },
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
        { id: "a1", label: "cash", kind: "cash", initialBalance: 150 },
        { id: "a2", label: "invest", kind: "investment" },
      ],
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-03" },
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
    // 移動額の判定は「月初残高」基準で進む。
    // 2026-01 月初: 150 → 100 移動可能、2026-02 月初: 50 → 50 のみ、2026-03 月初: 0 → 0
    expect(entries.map((e) => [e.month, e.amount])).toEqual([
      ["2026-01", -100],
      ["2026-02", -50],
    ]);
  });

  test("Transfer の minFromBalance 未指定なら残高に関わらず希望額を移動 (既存挙動)", () => {
    const plan = basePlan({
      accounts: [
        { id: "a1", label: "cash", kind: "cash", initialBalance: 10 },
        { id: "a2", label: "invest", kind: "investment" },
      ],
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-02" },
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

  test("Transfer の minToBalance は入金先の月初残高が下限を下回る分だけ補充する", () => {
    const plan = basePlan({
      accounts: [
        { id: "from", label: "invest", kind: "cash", initialBalance: 10_000_000 },
        { id: "to", label: "cash", kind: "cash", initialBalance: 50_000 },
      ],
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-04" },
      transfers: [
        {
          id: "t1",
          label: "補充",
          fromAccountId: "from",
          toAccountId: "to",
          segments: [{ startMonth: "2026-02", endMonth: "2026-04", amount: 1_000_000 }],
          minToBalance: 100_000,
        },
      ],
    });
    const entries = interpret(plan).filter((e) => e.sourceKind === "transfer");
    // 2026-02 月初 to=50,000 → 50,000 補充 → 月末 to=100,000
    // 2026-03 月初 to=100,000 → shortage=0 → スキップ
    // 2026-04 月初 to=100,000 → shortage=0 → スキップ
    const toEntries = entries.filter((e) => e.accountId === "to");
    const fromEntries = entries.filter((e) => e.accountId === "from");
    expect(toEntries).toHaveLength(1);
    expect(toEntries[0]?.month).toBe("2026-02");
    expect(toEntries[0]?.amount).toBe(50_000);
    expect(fromEntries).toHaveLength(1);
    expect(fromEntries[0]?.amount).toBe(-50_000);
  });

  test("Transfer の minToBalance 指定時、segment.amount は 1 回あたりの補充上限として機能する", () => {
    const plan = basePlan({
      accounts: [
        { id: "from", label: "invest", kind: "cash", initialBalance: 10_000_000 },
        { id: "to", label: "cash", kind: "cash", initialBalance: 50_000 },
      ],
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-03" },
      transfers: [
        {
          id: "t1",
          label: "補充 (上限付き)",
          fromAccountId: "from",
          toAccountId: "to",
          segments: [{ startMonth: "2026-02", endMonth: "2026-03", amount: 20_000 }],
          minToBalance: 100_000,
        },
      ],
    });
    const entries = interpret(plan).filter((e) => e.sourceKind === "transfer" && e.accountId === "to");
    // 2026-02 月初 to=50,000, shortage=50,000, 上限=20,000 → 20,000 補充、月末 to=70,000
    // 2026-03 月初 to=70,000, shortage=30,000, 上限=20,000 → 20,000 補充、月末 to=90,000
    expect(entries.map((e) => [e.month, e.amount])).toEqual([
      ["2026-02", 20_000],
      ["2026-03", 20_000],
    ]);
  });

  test("Transfer の minToBalance 指定時、入金先が下限以上の月は振替しない", () => {
    const plan = basePlan({
      accounts: [
        { id: "from", label: "invest", kind: "cash", initialBalance: 10_000_000 },
        { id: "to", label: "cash", kind: "cash", initialBalance: 200_000 },
      ],
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-02" },
      transfers: [
        {
          id: "t1",
          label: "補充",
          fromAccountId: "from",
          toAccountId: "to",
          segments: [{ startMonth: "2026-02", endMonth: "2026-02", amount: 1_000_000 }],
          minToBalance: 100_000,
        },
      ],
    });
    const entries = interpret(plan).filter((e) => e.sourceKind === "transfer");
    expect(entries).toEqual([]);
  });

  test("Transfer の minFromBalance と minToBalance を併用すると両方の制約を満たす分だけ移動する", () => {
    const plan = basePlan({
      accounts: [
        { id: "from", label: "invest", kind: "cash", initialBalance: 1_030_000 },
        { id: "to", label: "cash", kind: "cash" },
      ],
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-02" },
      transfers: [
        {
          id: "t1",
          label: "補充 (出金制約あり)",
          fromAccountId: "from",
          toAccountId: "to",
          segments: [{ startMonth: "2026-02", endMonth: "2026-02", amount: 1_000_000 }],
          minFromBalance: 1_000_000,
          minToBalance: 100_000,
        },
      ],
    });
    // 2026-02 月初: from=1,030,000, to=0
    // shortage (to)     = 100,000 - 0 = 100,000
    // available (from)  = 1,030,000 - 1,000,000 = 30,000
    // cap = min(desired=1,000,000, shortage=100,000, available=30,000) = 30,000
    const entries = interpret(plan).filter((e) => e.sourceKind === "transfer" && e.accountId === "to");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.amount).toBe(30_000);
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

  test("複数 segment・口座・初期残高の混在 (初期残高はエントリ列に現れない)", () => {
    const plan = basePlan({
      accounts: [
        { id: "a1", label: "cash", kind: "cash", initialBalance: 10000 },
        { id: "a2", label: "invest", kind: "investment" },
      ],
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
    expect(entries).toHaveLength(2);
  });
});

describe("investment interest", () => {
  test("annualRate が設定された投資口座は月初残高に対する利息を interest として出力する", () => {
    const plan: Plan = {
      schemaVersion: 3,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-03" },
      accounts: [
        { id: "inv", label: "投資", kind: "investment", investment: { annualRate: 0.12 }, initialBalance: 10000 },
      ],
      incomes: [],
      expenses: [],
      events: [],
      transfers: [],
      categories: [],
      persons: [],
      grossSalaries: [],
    };
    const entries = interpret(plan);
    // 2026-01 月初: initialBalance=10000 → 利息 = 10000 * r
    // 2026-02 月初: 10000 + 1月分利息 → 利息
    // 2026-03 月初: ↑ + 2月分利息 → 利息
    const r = monthlyCompoundRate(0.12);
    const janExpected = Math.trunc(10000 * r);
    const jan = entries.find((e) => e.month === "2026-01" && e.sourceKind === "interest");
    expect(jan?.amount).toBe(janExpected);
    const feb = entries.find((e) => e.month === "2026-02" && e.sourceKind === "interest");
    expect(feb?.amount).toBe(Math.trunc((10000 + janExpected) * r));
  });

  test("annualRate=0 や params 未設定なら利息は出ない", () => {
    const plan: Plan = {
      schemaVersion: 3,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-02" },
      accounts: [
        { id: "a1", label: "投資0", kind: "investment", investment: { annualRate: 0 }, initialBalance: 10000 },
        { id: "a2", label: "投資未設定", kind: "investment", initialBalance: 10000 },
      ],
      incomes: [],
      expenses: [],
      events: [],
      transfers: [],
      categories: [],
      persons: [],
      grossSalaries: [],
    };
    expect(interpret(plan).some((e) => e.sourceKind === "interest")).toBe(false);
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
      schemaVersion: 3,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-12" },
      accounts: [{ id: "cash", label: "現金", kind: "cash" }],
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
      persons: [],
      grossSalaries: [],
    };
    const entries = interpret(plan).filter((e) => e.sourceId === "e-loan");
    expect(entries).toHaveLength(12);
    expect(entries.every((e) => e.sourceKind === "expense")).toBe(true);
    const total = entries.reduce((acc, e) => acc + e.amount, 0);
    expect(total).toBeCloseTo(-1_200_000, 3);
  });

  test("loan expense はローン終了月以降は何も出さない", () => {
    const plan: Plan = {
      schemaVersion: 3,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2027-12" },
      accounts: [{ id: "cash", label: "現金", kind: "cash" }],
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
      persons: [],
      grossSalaries: [],
    };
    const entries = interpret(plan).filter((e) => e.sourceId === "e-loan");
    expect(entries.map((e) => e.month)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]);
  });

  test("loan expense は金利変更時に返済額が再計算される", () => {
    const plan: Plan = {
      schemaVersion: 3,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2027-12" },
      accounts: [{ id: "cash", label: "現金", kind: "cash" }],
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
      persons: [],
      grossSalaries: [],
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

  test("人物参照を含む segment は resolve されて計算される", () => {
    const plan: Plan = {
      schemaVersion: 3,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2030-12" },
      persons: [{ id: "p1", label: "子", birthMonth: "2020-04" }],
      accounts: [{ id: "a1", label: "cash", kind: "cash" }],
      incomes: [],
      expenses: [
        {
          id: "e-kid",
          label: "教育費",
          accountId: "a1",
          // age 8 の 4月 (yearStart=1 なので 2028-04) から age 10 の 3月 (2030-03) まで
          segments: [
            {
              startMonth: { kind: "person-age", personId: "p1", age: 8, month: 4 },
              endMonth: { kind: "person-age", personId: "p1", age: 10, month: 3 },
              amount: 100,
            },
          ],
        },
      ],
      events: [],
      transfers: [],
      categories: [],
      grossSalaries: [],
    };
    const entries = interpret(plan).filter((e) => e.sourceId === "e-kid");
    const months = entries.map((e) => e.month);
    expect(months[0]).toBe("2028-04");
    expect(months[months.length - 1]).toBe("2030-03");
  });

  test("gross salary は毎月 salary_gross/social_insurance/income_tax エントリを発行する", () => {
    const plan = basePlan({
      persons: [{ id: "p1", label: "自分", birthMonth: "1990-01" }],
      grossSalaries: [
        {
          id: "g1",
          label: "本業",
          accountId: "a1",
          personId: "p1",
          annualAmount: 6_000_000,
          startMonth: "2026-01",
        },
      ],
    });
    const entries = interpret(plan);
    const kinds = new Set(entries.map((e) => e.sourceKind));
    expect(kinds.has("salary_gross")).toBe(true);
    expect(kinds.has("social_insurance")).toBe(true);
    expect(kinds.has("income_tax")).toBe(true);
    // 計画開始前年の所得がないので初年度の住民税はゼロ
    expect(kinds.has("resident_tax")).toBe(false);
    // 各月 1件の salary_gross (年額 / 12)
    const grossEntries = entries.filter((e) => e.sourceKind === "salary_gross");
    expect(grossEntries).toHaveLength(12);
    expect(grossEntries.every((e) => e.amount === 500_000)).toBe(true);
  });

  test("年額が 12 で割り切れない場合も各月同額で出力される (端数は切り捨て)", () => {
    const plan = basePlan({
      persons: [{ id: "p1", label: "自分", birthMonth: "1990-01" }],
      grossSalaries: [
        {
          id: "g1",
          label: "本業",
          accountId: "a1",
          personId: "p1",
          annualAmount: 5_000_000,
          startMonth: "2026-01",
        },
      ],
    });
    const entries = interpret(plan).filter((e) => e.sourceKind === "salary_gross");
    // 5,000,000 / 12 = 416,666.666... → 416,666
    expect(entries.every((e) => e.amount === 416_666)).toBe(true);
  });

  test("previousYearIncome を指定すると初年度から住民税が発生する", () => {
    const plan = basePlan({
      persons: [
        {
          id: "p1",
          label: "自分",
          birthMonth: "1990-01",
          previousYearIncome: 5_000_000,
        },
      ],
      grossSalaries: [
        {
          id: "g1",
          label: "本業",
          accountId: "a1",
          personId: "p1",
          annualAmount: 4_800_000,
          startMonth: "2026-01",
        },
      ],
    });
    const entries = interpret(plan);
    const residentEntries = entries.filter((e) => e.sourceKind === "resident_tax");
    expect(residentEntries.length).toBe(12);
    expect(residentEntries.every((e) => e.amount < 0)).toBe(true);
  });

  test("gross salary は終了月を過ぎると停止する", () => {
    const plan = basePlan({
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-12" },
      persons: [{ id: "p1", label: "自分", birthMonth: "1990-01" }],
      grossSalaries: [
        {
          id: "g1",
          label: "本業",
          accountId: "a1",
          personId: "p1",
          annualAmount: 4_800_000,
          startMonth: "2026-01",
          endMonth: "2026-06",
        },
      ],
    });
    const entries = interpret(plan).filter((e) => e.sourceKind === "salary_gross");
    expect(entries.length).toBe(6);
    expect(entries[entries.length - 1]?.month).toBe("2026-06");
  });

  test("loan を持つ expense は segments より loan 側が優先される", () => {
    const plan: Plan = {
      schemaVersion: 3,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-03" },
      accounts: [{ id: "cash", label: "現金", kind: "cash" }],
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
      persons: [],
      grossSalaries: [],
    };
    const entries = interpret(plan).filter((e) => e.sourceId === "e-loan");
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.amount === -100)).toBe(true);
  });

  test("loan 期間全体が plan 開始より前なら返済は何も出ない", () => {
    const plan: Plan = {
      schemaVersion: 3,
      settings: { yearStartMonth: 1, planStartMonth: "2030-01", planEndMonth: "2030-12" },
      accounts: [{ id: "cash", label: "現金", kind: "cash" }],
      incomes: [],
      expenses: [
        {
          id: "e-loan",
          label: "完済済みローン",
          accountId: "cash",
          segments: [],
          loan: {
            principal: 120_000,
            rateSegments: [{ startMonth: "2020-01", endMonth: "2021-12", annualRate: 0 }],
          },
        },
      ],
      events: [],
      transfers: [],
      categories: [],
      persons: [],
      grossSalaries: [],
    };
    const entries = interpret(plan).filter((e) => e.sourceId === "e-loan");
    expect(entries).toHaveLength(0);
  });

  test("loan 開始が plan 開始より前でも balance が引き継がれ、plan 範囲のみ出力される", () => {
    // 2025-01 から 2026-12 までの 2年ローン (金利 0%, 月額 100)
    // plan は 2026-01 開始なので、2025 年分の 12 ヶ月は balance だけ減らして表に出ず、
    // 2026-01..2026-12 の 12 ヶ月分のみ -100 として出力される。
    const plan: Plan = {
      schemaVersion: 3,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-12" },
      accounts: [{ id: "cash", label: "現金", kind: "cash" }],
      incomes: [],
      expenses: [
        {
          id: "e-loan",
          label: "住宅",
          accountId: "cash",
          segments: [],
          loan: {
            principal: 2_400,
            rateSegments: [{ startMonth: "2025-01", endMonth: "2026-12", annualRate: 0 }],
          },
        },
      ],
      events: [],
      transfers: [],
      categories: [],
      persons: [],
      grossSalaries: [],
    };
    const entries = interpret(plan).filter((e) => e.sourceId === "e-loan");
    expect(entries).toHaveLength(12);
    expect(entries.map((e) => e.month)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
    ]);
    expect(entries.every((e) => e.amount === -100)).toBe(true);
  });

  test("投資口座の annualRate が負でも interest が NaN を出さない", () => {
    const plan: Plan = {
      schemaVersion: 3,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-03" },
      accounts: [
        { id: "inv", label: "投資", kind: "investment", investment: { annualRate: -0.1 }, initialBalance: 10_000 },
      ],
      incomes: [],
      expenses: [],
      events: [],
      transfers: [],
      categories: [],
      persons: [],
      grossSalaries: [],
    };
    const interests = interpret(plan).filter((e) => e.sourceKind === "interest");
    expect(interests.every((e) => Number.isFinite(e.amount))).toBe(true);
    // -10% 年利の 1 ヶ月分は負の amount
    expect(interests[0]?.amount).toBeLessThan(0);
  });
});

describe("taxRuleSets による期間切替", () => {
  test("年で異なる税制ルールが適用され、社保が年ごとに変わる", () => {
    // 2026年: ビルトイン相当の料率
    // 2027年: 健康保険のみ料率を 2 倍にしたルール
    const plan = basePlan({
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2027-12" },
      persons: [{ id: "p1", label: "自分", birthMonth: "1990-01" }],
      grossSalaries: [
        {
          id: "g1",
          label: "本業",
          accountId: "a1",
          personId: "p1",
          annualAmount: 6_000_000,
          startMonth: "2026-01",
        },
      ],
      taxRuleSets: [
        {
          id: "rs-2026",
          label: "2026",
          effectiveFromYear: 2026,
          socialInsurance: {
            rates: { health: 0.0499, pension: 0.0915, employment: 0.006, longTermCare: 0.0091 },
            annualCaps: { health: 1_390_000 * 12, pension: 650_000 * 12 },
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
        },
        {
          id: "rs-2027",
          label: "2027 (健保 2 倍)",
          effectiveFromYear: 2027,
          socialInsurance: {
            rates: { health: 0.0998, pension: 0.0915, employment: 0.006, longTermCare: 0.0091 },
            annualCaps: { health: 1_390_000 * 12, pension: 650_000 * 12 },
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
        },
      ],
    });
    const entries = interpret(plan).filter((e) => e.sourceKind === "social_insurance");
    const si2026 = entries.find((e) => e.month === "2026-01")?.amount ?? 0;
    const si2027 = entries.find((e) => e.month === "2027-01")?.amount ?? 0;
    // 健保料率が 2 倍になる年は社保額が増える (= -符号で絶対値が増える)
    expect(si2027).toBeLessThan(si2026);
  });
});

describe("raise 昇給・複利", () => {
  test("computeSegmentAmount: everyMonths=0 は base を返す (防御)", () => {
    const amount = computeSegmentAmount(
      { startMonth: "2026-01", amount: 100, raise: { kind: "fixed", value: 10, everyMonths: 0 } },
      "2026-12",
    );
    expect(amount).toBe(100);
  });

  test("monthlyCompoundRate: 非有限値は 0 に丸められる", () => {
    expect(monthlyCompoundRate(Number.POSITIVE_INFINITY)).toBe(0);
    expect(monthlyCompoundRate(Number.NaN)).toBe(0);
  });
});
