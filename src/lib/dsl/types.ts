export type YearMonth = `${number}-${number}`;

export type Ulid = string;

export type Person = {
  id: Ulid;
  label: string;
  birthMonth: YearMonth;
  /** 計画開始前年の額面年収。住民税の初年度計算に用いる */
  previousYearIncome?: number;
};

export type PersonAgeMonth = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type PersonAgeRef = {
  kind: "person-age";
  personId: Ulid;
  age: number;
  month: PersonAgeMonth;
};

export type MonthExpr = YearMonth | PersonAgeRef;

export type AccountKind = "cash" | "investment";

export const ACCOUNT_KINDS: AccountKind[] = ["cash", "investment"];

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  cash: "現金",
  investment: "投資",
};

export type InvestmentParams = {
  annualRate: number;
};

export type Account = {
  id: Ulid;
  label: string;
  kind: AccountKind;
  /** 計画開始月時点の残高。省略時は 0。 */
  initialBalance?: number;
  /** 初期残高に関するメモ (出典・根拠など) */
  initialBalanceNote?: string;
  investment?: InvestmentParams;
};

export type FlowRaiseKind = "fixed" | "rate";

export const FLOW_RAISE_KIND_LABEL: Record<FlowRaiseKind, string> = {
  fixed: "固定額",
  rate: "固定率",
};

export type FlowRaise = {
  kind: FlowRaiseKind;
  value: number;
  everyMonths: number;
};

export type FlowSegment = {
  startMonth: MonthExpr;
  endMonth?: MonthExpr;
  amount: number;
  intervalMonths?: number;
  raise?: FlowRaise;
  note?: string;
};

export type Income = {
  id: Ulid;
  label: string;
  accountId: Ulid;
  categoryId?: Ulid;
  segments: FlowSegment[];
};

export type GrossSalary = {
  id: Ulid;
  label: string;
  accountId: Ulid;
  personId: Ulid;
  /** 額面年収 (源泉徴収票の支払金額相当) */
  annualAmount: number;
  startMonth: MonthExpr;
  endMonth?: MonthExpr;
  /** annualAmount に対する昇給 */
  raise?: FlowRaise;
  /** 税法上の扶養親族数 (配偶者を除く) */
  dependents?: number;
  /** 配偶者控除を適用するか */
  hasSpouseDeduction?: boolean;
  note?: string;
};

export type LoanRateSegment = {
  startMonth: MonthExpr;
  endMonth?: MonthExpr;
  annualRate: number;
};

export type LoanSpec = {
  principal: number;
  rateSegments: LoanRateSegment[];
};

export type Expense = {
  id: Ulid;
  label: string;
  accountId: Ulid;
  categoryId?: Ulid;
  segments: FlowSegment[];
  loan?: LoanSpec;
};

export type OneShotEvent = {
  id: Ulid;
  label: string;
  accountId: Ulid;
  categoryId?: Ulid;
  month: MonthExpr;
  amount: number;
  note?: string;
};

export type CategoryKind = "income" | "expense";

export const CATEGORY_KINDS: CategoryKind[] = ["income", "expense"];

export const CATEGORY_KIND_LABEL: Record<CategoryKind, string> = {
  income: "収入",
  expense: "支出",
};

export type Category = {
  id: Ulid;
  label: string;
  kind: CategoryKind;
  parentId?: Ulid;
};

export type Transfer = {
  id: Ulid;
  label: string;
  fromAccountId: Ulid;
  toAccountId: Ulid;
  segments: FlowSegment[];
  /** 指定時、出金元の月初残高がこの額を下回らない範囲で部分的に振替する */
  minFromBalance?: number;
  /** 指定時、入金先の月初残高がこの額を下回っていれば、差分を上限として補充する */
  minToBalance?: number;
};

export type YearStartMonth = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type PlanSettings = {
  yearStartMonth: YearStartMonth;
  planStartMonth: MonthExpr;
  planEndMonth: MonthExpr;
};

/** 所得税の累進ブラケット 1 区分。`upTo` は当該課税所得以下で適用 (null は最終区分) */
export type IncomeTaxBracket = {
  upTo: number | null;
  /** 税率 (0.05 = 5%) */
  rate: number;
  /** 速算表の控除額 (`taxable * rate - subtract`) */
  subtract: number;
};

/** 給与所得控除の階段 1 区分 */
export type EmploymentIncomeDeductionBracket =
  | { upTo: number | null; kind: "flat"; amount: number }
  | { upTo: number | null; kind: "formula"; rate: number; add: number };

export type SocialInsuranceRules = {
  /** 本人負担分の料率 */
  rates: {
    health: number;
    pension: number;
    employment: number;
    longTermCare: number;
  };
  /** 標準報酬月額の上限を年額換算したキャップ */
  annualCaps: {
    health: number;
    pension: number;
  };
  /** 介護保険料が発生し始める年齢 */
  longTermCareStartAge: number;
};

export type IncomeTaxRules = {
  brackets: IncomeTaxBracket[];
  basicDeduction: number;
  /** 配偶者控除 */
  spouseDeduction: number;
  /** 扶養控除 (1 人あたり) */
  dependentDeduction: number;
  /** 復興特別所得税を含む乗率 */
  reconstructionSurtaxMultiplier: number;
};

export type ResidentTaxRules = {
  basicDeduction: number;
  spouseDeduction: number;
  dependentDeduction: number;
  /** 所得割率 (県市合算) */
  incomeRate: number;
  /** 均等割 */
  perCapita: number;
};

export type TaxRuleSet = {
  id: Ulid;
  label: string;
  /** この税制が適用される最初の暦年 (この年以降に適用) */
  effectiveFromYear: number;
  socialInsurance: SocialInsuranceRules;
  /** 給与所得控除 (年収階段) */
  employmentIncomeDeduction: EmploymentIncomeDeductionBracket[];
  incomeTax: IncomeTaxRules;
  residentTax: ResidentTaxRules;
  note?: string;
};

export type Plan = {
  schemaVersion: 3;
  settings: PlanSettings;
  persons: Person[];
  accounts: Account[];
  incomes: Income[];
  expenses: Expense[];
  events: OneShotEvent[];
  transfers: Transfer[];
  categories: Category[];
  grossSalaries: GrossSalary[];
  /** 期間ごとの税制ルール。未指定 (または空) ならビルトイン (協会けんぽ東京 2024年度相当) を使う */
  taxRuleSets?: TaxRuleSet[];
};

export type MonthlyEntrySourceKind =
  | "income"
  | "expense"
  | "event"
  | "transfer"
  | "interest"
  | "salary_gross"
  | "social_insurance"
  | "income_tax"
  | "resident_tax";

export type MonthlyEntry = {
  month: YearMonth;
  accountId: Ulid;
  sourceId: Ulid;
  sourceKind: MonthlyEntrySourceKind;
  categoryId?: Ulid;
  amount: number;
};
