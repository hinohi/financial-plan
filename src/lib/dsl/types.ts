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

export type FlowSegment = {
  startMonth: YearMonth;
  endMonth?: YearMonth;
  amount: number;
};

export type Income = {
  id: Ulid;
  label: string;
  accountId: Ulid;
  segments: FlowSegment[];
};

export type Expense = {
  id: Ulid;
  label: string;
  accountId: Ulid;
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
};

export type MonthlyEntrySourceKind = "income" | "expense" | "snapshot";

export type MonthlyEntry = {
  month: YearMonth;
  accountId: Ulid;
  sourceId: Ulid;
  sourceKind: MonthlyEntrySourceKind;
  amount: number;
};
