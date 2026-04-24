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
  investment?: InvestmentParams;
};

export type Snapshot = {
  id: Ulid;
  accountId: Ulid;
  month: MonthExpr;
  balance: number;
  note?: string;
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
  minFromBalance?: number;
};

export type YearStartMonth = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type PlanSettings = {
  yearStartMonth: YearStartMonth;
  planStartMonth: MonthExpr;
  planEndMonth: MonthExpr;
};

export type Plan = {
  schemaVersion: 1;
  settings: PlanSettings;
  persons: Person[];
  accounts: Account[];
  snapshots: Snapshot[];
  incomes: Income[];
  expenses: Expense[];
  events: OneShotEvent[];
  transfers: Transfer[];
  categories: Category[];
  grossSalaries: GrossSalary[];
};

export type MonthlyEntrySourceKind =
  | "income"
  | "expense"
  | "event"
  | "transfer"
  | "snapshot"
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
