export type YearMonth = `${number}-${number}`;

export type Ulid = string;

export type AccountKind = "cash" | "investment" | "property" | "liability";

export const ACCOUNT_KINDS: AccountKind[] = ["cash", "investment", "property", "liability"];

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  cash: "現金",
  investment: "投資",
  property: "不動産",
  liability: "負債",
};

export type Account = {
  id: Ulid;
  label: string;
  kind: AccountKind;
};

export type Snapshot = {
  id: Ulid;
  accountId: Ulid;
  month: YearMonth;
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
  startMonth: YearMonth;
  endMonth?: YearMonth;
  amount: number;
  raise?: FlowRaise;
};

export type Income = {
  id: Ulid;
  label: string;
  accountId: Ulid;
  categoryId?: Ulid;
  segments: FlowSegment[];
};

export type Expense = {
  id: Ulid;
  label: string;
  accountId: Ulid;
  categoryId?: Ulid;
  segments: FlowSegment[];
};

export type OneShotEvent = {
  id: Ulid;
  label: string;
  accountId: Ulid;
  categoryId?: Ulid;
  month: YearMonth;
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
};

export type YearStartMonth = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type PlanSettings = {
  yearStartMonth: YearStartMonth;
  planStartMonth: YearMonth;
  planEndMonth: YearMonth;
};

export type Plan = {
  schemaVersion: 1;
  settings: PlanSettings;
  accounts: Account[];
  snapshots: Snapshot[];
  incomes: Income[];
  expenses: Expense[];
  events: OneShotEvent[];
  transfers: Transfer[];
  categories: Category[];
};

export type MonthlyEntrySourceKind = "income" | "expense" | "event" | "transfer" | "snapshot";

export type MonthlyEntry = {
  month: YearMonth;
  accountId: Ulid;
  sourceId: Ulid;
  sourceKind: MonthlyEntrySourceKind;
  categoryId?: Ulid;
  amount: number;
};
