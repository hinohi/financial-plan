export type YearMonth = `${number}-${number}`;

export type Ulid = string;

export type Person = {
  id: Ulid;
  label: string;
  birthMonth: YearMonth;
};

export type PersonAgeMonth = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type PersonAgeRef = {
  kind: "person-age";
  personId: Ulid;
  age: number;
  month: PersonAgeMonth;
};

export type MonthExpr = YearMonth | PersonAgeRef;

export type AccountKind = "cash" | "investment" | "property" | "liability";

export const ACCOUNT_KINDS: AccountKind[] = ["cash", "investment", "property", "liability"];

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  cash: "現金",
  investment: "投資",
  property: "不動産",
  liability: "負債",
};

export type InvestmentParams = {
  annualRate: number;
};

export type LiabilityScheduleKind = "equal-payment" | "equal-principal";

export const LIABILITY_SCHEDULE_KIND_LABEL: Record<LiabilityScheduleKind, string> = {
  "equal-payment": "元利均等",
  "equal-principal": "元金均等",
};

export type LiabilityParams = {
  annualRate: number;
  scheduleKind: LiabilityScheduleKind;
  principal: number;
  termMonths: number;
  startMonth: MonthExpr;
  paymentAccountId?: Ulid;
};

export type PropertyParams = {
  annualDepreciationRate: number;
};

export type Account = {
  id: Ulid;
  label: string;
  kind: AccountKind;
  investment?: InvestmentParams;
  liability?: LiabilityParams;
  property?: PropertyParams;
};

export type Snapshot = {
  id: Ulid;
  accountId: Ulid;
  month: MonthExpr;
  balance: number;
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
};

export type Income = {
  id: Ulid;
  label: string;
  accountId: Ulid;
  categoryId?: Ulid;
  segments: FlowSegment[];
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
};

export type CategoryKind = "income" | "expense" | "event";

export const CATEGORY_KINDS: CategoryKind[] = ["income", "expense", "event"];

export const CATEGORY_KIND_LABEL: Record<CategoryKind, string> = {
  income: "収入",
  expense: "支出",
  event: "イベント",
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
};

export type MonthlyEntrySourceKind =
  | "income"
  | "expense"
  | "event"
  | "transfer"
  | "snapshot"
  | "interest"
  | "depreciation"
  | "loan_interest"
  | "loan_principal";

export type MonthlyEntry = {
  month: YearMonth;
  accountId: Ulid;
  sourceId: Ulid;
  sourceKind: MonthlyEntrySourceKind;
  categoryId?: Ulid;
  amount: number;
};
