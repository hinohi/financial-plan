import {
  addMonths,
  compareYearMonth,
  iterateMonths,
  maxYearMonth,
  minYearMonth,
  monthDiff,
  parseYearMonth,
} from "@/lib/dsl/month";
import {
  type ResolvedExpense,
  type ResolvedFlowSegment,
  type ResolvedGrossSalary,
  type ResolvedLoanSpec,
  type ResolvedPlan,
  type ResolvedSnapshot,
  resolvePlan,
} from "@/lib/dsl/resolve";
import type { Account, FlowRaise, MonthlyEntry, Person, Plan, Ulid, YearMonth } from "@/lib/dsl/types";
import {
  computeAnnualIncomeTax,
  computeAnnualResidentTax,
  computeAnnualSocialInsurance,
  resolveTaxRuleSet,
} from "@/lib/tax";

function withinPlan(month: YearMonth, start: YearMonth, end: YearMonth): boolean {
  return compareYearMonth(month, start) >= 0 && compareYearMonth(month, end) <= 0;
}

/**
 * base に対して raise を適用した値を返す。
 * raise が無い、everyMonths<=0、startMonth より前の月、まだ 1 step も経過していない
 * のいずれかの場合は base をそのまま返す。
 */
function applyRaise(base: number, raise: FlowRaise | undefined, startMonth: YearMonth, month: YearMonth): number {
  if (!raise || raise.everyMonths <= 0) return base;
  const delta = monthDiff(startMonth, month);
  if (delta <= 0) return base;
  const steps = Math.floor(delta / raise.everyMonths);
  if (steps <= 0) return base;
  if (raise.kind === "fixed") return base + steps * raise.value;
  return base * (1 + raise.value) ** steps;
}

export function computeSegmentAmount(segment: ResolvedFlowSegment, month: YearMonth): number {
  return applyRaise(segment.amount, segment.raise, segment.startMonth, month);
}

function emitSegment(
  accountId: Ulid,
  sourceId: Ulid,
  sourceKind: "income" | "expense",
  segment: ResolvedFlowSegment,
  planStart: YearMonth,
  planEnd: YearMonth,
  sign: 1 | -1,
  categoryId: Ulid | undefined,
  out: MonthlyEntry[],
): void {
  const start = maxYearMonth(segment.startMonth, planStart);
  const end = minYearMonth(segment.endMonth ?? planEnd, planEnd);
  if (compareYearMonth(start, end) > 0) return;
  const interval = segment.intervalMonths && segment.intervalMonths > 0 ? segment.intervalMonths : 1;
  for (const month of iterateMonths(start, end)) {
    if (interval > 1) {
      const delta = monthDiff(segment.startMonth, month);
      if (delta < 0 || delta % interval !== 0) continue;
    }
    out.push({
      month,
      accountId,
      sourceId,
      sourceKind,
      categoryId,
      amount: Math.trunc(computeSegmentAmount(segment, month) * sign),
    });
  }
}

function emitTransferSegment(
  fromAccountId: Ulid,
  toAccountId: Ulid,
  sourceId: Ulid,
  segment: ResolvedFlowSegment,
  planStart: YearMonth,
  planEnd: YearMonth,
  out: MonthlyEntry[],
): void {
  const start = maxYearMonth(segment.startMonth, planStart);
  const end = minYearMonth(segment.endMonth ?? planEnd, planEnd);
  if (compareYearMonth(start, end) > 0) return;
  const interval = segment.intervalMonths && segment.intervalMonths > 0 ? segment.intervalMonths : 1;
  for (const month of iterateMonths(start, end)) {
    if (interval > 1) {
      const delta = monthDiff(segment.startMonth, month);
      if (delta < 0 || delta % interval !== 0) continue;
    }
    const amount = Math.trunc(computeSegmentAmount(segment, month));
    if (amount === 0) continue;
    out.push({ month, accountId: fromAccountId, sourceId, sourceKind: "transfer", amount: -amount });
    out.push({ month, accountId: toAccountId, sourceId, sourceKind: "transfer", amount });
  }
}

export function monthlyCompoundRate(annualRate: number): number {
  if (!Number.isFinite(annualRate)) return 0;
  return (1 + annualRate) ** (1 / 12) - 1;
}

export function loanMonthlyPayment(balance: number, monthlyRate: number, remainingMonths: number): number {
  if (remainingMonths <= 0 || balance <= 0) return 0;
  if (monthlyRate === 0) return balance / remainingMonths;
  const pow = (1 + monthlyRate) ** remainingMonths;
  return (balance * monthlyRate * pow) / (pow - 1);
}

function emitLoanExpense(
  expense: ResolvedExpense,
  planStart: YearMonth,
  planEnd: YearMonth,
  out: MonthlyEntry[],
): void {
  const loan = expense.loan;
  if (!loan || loan.rateSegments.length === 0 || loan.principal <= 0) return;
  const sorted = [...loan.rateSegments].sort((a, b) => compareYearMonth(a.startMonth, b.startMonth));
  const firstStart = sorted[0]?.startMonth;
  const lastSeg = sorted[sorted.length - 1];
  const lastEnd = lastSeg?.endMonth;
  if (!firstStart || !lastSeg) return;
  const loanEnd = lastEnd ?? planEnd;
  if (compareYearMonth(firstStart, loanEnd) > 0) return;

  let balance = loan.principal;
  for (let i = 0; i < sorted.length; i++) {
    const segStart = sorted[i]?.startMonth;
    if (!segStart) continue;
    const nextSeg = sorted[i + 1];
    const annualRate = sorted[i]?.annualRate ?? 0;
    const segEnd = nextSeg ? addMonths(nextSeg.startMonth, -1) : (sorted[i]?.endMonth ?? loanEnd);
    if (compareYearMonth(segStart, segEnd) > 0) continue;
    if (balance <= 0) break;
    const monthlyRate = annualRate / 12;
    const remainingToLoanEnd = monthDiff(segStart, loanEnd) + 1;
    if (remainingToLoanEnd <= 0) break;
    const payment = loanMonthlyPayment(balance, monthlyRate, remainingToLoanEnd);

    for (const month of iterateMonths(segStart, segEnd)) {
      if (compareYearMonth(month, planEnd) > 0) return;
      if (balance <= 0) break;
      const interest = balance * monthlyRate;
      const principalAmt = Math.min(balance, payment - interest);
      const total = interest + principalAmt;
      balance -= principalAmt;
      if (compareYearMonth(month, planStart) < 0) continue;
      const amount = Math.trunc(-total);
      if (amount === 0) continue;
      out.push({
        month,
        accountId: expense.accountId,
        sourceId: expense.id,
        sourceKind: "expense",
        categoryId: expense.categoryId,
        amount,
      });
    }
  }
}

function isLoanExpense(expense: ResolvedExpense): boolean {
  return !!expense.loan && expense.loan.rateSegments.length > 0 && expense.loan.principal > 0;
}

export function loanTotalMonths(loan: ResolvedLoanSpec): number {
  if (loan.rateSegments.length === 0) return 0;
  const sorted = [...loan.rateSegments].sort((a, b) => compareYearMonth(a.startMonth, b.startMonth));
  const start = sorted[0]?.startMonth;
  const end = sorted[sorted.length - 1]?.endMonth;
  if (!start || !end) return 0;
  return monthDiff(start, end) + 1;
}

export function computeSalaryAnnualAmount(salary: ResolvedGrossSalary, month: YearMonth): number {
  return applyRaise(salary.annualAmount, salary.raise, salary.startMonth, month);
}

/** その月の額面支給 (月割り)。年額を 12 等分する簡易モデル */
export function computeSalaryMonthGross(salary: ResolvedGrossSalary, month: YearMonth): number {
  return computeSalaryAnnualAmount(salary, month) / 12;
}

function ageYearsAt(person: Person, month: YearMonth): number {
  const birth = parseYearMonth(person.birthMonth);
  const cur = parseYearMonth(month);
  let age = cur.year - birth.year;
  if (cur.month < birth.month) age -= 1;
  return age;
}

function salaryActiveOnMonth(salary: ResolvedGrossSalary, month: YearMonth): boolean {
  if (compareYearMonth(month, salary.startMonth) < 0) return false;
  if (salary.endMonth && compareYearMonth(month, salary.endMonth) > 0) return false;
  return true;
}

type SalaryYearKey = `${Ulid}:${number}`;

function salaryYearKey(salaryId: Ulid, year: number): SalaryYearKey {
  return `${salaryId}:${year}`;
}

function computeAnnualGrossBySalaryYear(
  salaries: ResolvedGrossSalary[],
  planStart: YearMonth,
  planEnd: YearMonth,
): Map<SalaryYearKey, number> {
  const out = new Map<SalaryYearKey, number>();
  for (const salary of salaries) {
    const start = maxYearMonth(salary.startMonth, planStart);
    const end = minYearMonth(salary.endMonth ?? planEnd, planEnd);
    if (compareYearMonth(start, end) > 0) continue;
    for (const m of iterateMonths(start, end)) {
      const gross = computeSalaryMonthGross(salary, m);
      if (gross === 0) continue;
      const { year } = parseYearMonth(m);
      const key = salaryYearKey(salary.id, year);
      out.set(key, (out.get(key) ?? 0) + gross);
    }
  }
  return out;
}

function emitGrossSalaryEntries(
  plan: ResolvedPlan,
  planStart: YearMonth,
  planEnd: YearMonth,
  out: MonthlyEntry[],
): void {
  const salaries = plan.grossSalaries;
  if (salaries.length === 0) return;
  const personById = new Map<Ulid, Person>();
  for (const p of plan.persons) personById.set(p.id, p);

  const annualGrossByKey = computeAnnualGrossBySalaryYear(salaries, planStart, planEnd);
  const planStartYear = parseYearMonth(planStart).year;

  // 年ごとの所得税/社保額をキャッシュ (毎月の計算を避ける)
  const annualTaxCache = new Map<SalaryYearKey, { socialInsurance: number; incomeTax: number }>();
  const annualResidentCache = new Map<SalaryYearKey, number>();

  for (const salary of salaries) {
    const person = personById.get(salary.personId);
    if (!person) continue;
    const start = maxYearMonth(salary.startMonth, planStart);
    const end = minYearMonth(salary.endMonth ?? planEnd, planEnd);
    if (compareYearMonth(start, end) > 0) continue;
    const dependents = Math.max(0, salary.dependents ?? 0);
    const hasSpouseDeduction = !!salary.hasSpouseDeduction;

    for (const month of iterateMonths(start, end)) {
      if (!salaryActiveOnMonth(salary, month)) continue;
      const { year } = parseYearMonth(month);

      const gross = Math.trunc(computeSalaryMonthGross(salary, month));
      if (gross !== 0) {
        out.push({
          month,
          accountId: salary.accountId,
          sourceId: salary.id,
          sourceKind: "salary_gross",
          amount: gross,
        });
      }

      const annualGross = annualGrossByKey.get(salaryYearKey(salary.id, year)) ?? 0;
      if (annualGross <= 0) continue;

      const cacheKey = salaryYearKey(salary.id, year);
      let yearTax = annualTaxCache.get(cacheKey);
      if (!yearTax) {
        const ruleSet = resolveTaxRuleSet(plan.taxRuleSets ?? [], year);
        const siAge = ageYearsAt(person, `${year}-01` as YearMonth);
        const si = computeAnnualSocialInsurance(annualGross, siAge, ruleSet).total;
        const it = computeAnnualIncomeTax(
          { annualGross, socialInsurance: si, dependents, hasSpouseDeduction },
          ruleSet,
        );
        yearTax = { socialInsurance: si, incomeTax: it };
        annualTaxCache.set(cacheKey, yearTax);
      }

      // 住民税は前年所得ベース。前年が計画範囲内なら実所得、計画開始年なら person.previousYearIncome、
      // さらに古ければ 0。
      // 税制は支払年 (= 課税年) のルールで統一する。前年所得を用いる給与所得控除や社保も
      // 同じルールで計算しており、年度切替直後はわずかに簡略化されている。
      let annualResident = annualResidentCache.get(cacheKey);
      if (annualResident === undefined) {
        const prevYear = year - 1;
        let prevGross = 0;
        if (prevYear >= planStartYear) {
          prevGross = annualGrossByKey.get(salaryYearKey(salary.id, prevYear)) ?? 0;
        } else if (prevYear === planStartYear - 1) {
          prevGross = person.previousYearIncome ?? 0;
        }
        if (prevGross <= 0) {
          annualResident = 0;
        } else {
          const ruleSet = resolveTaxRuleSet(plan.taxRuleSets ?? [], year);
          const prevAge = ageYearsAt(person, `${prevYear}-01` as YearMonth);
          const prevSi = computeAnnualSocialInsurance(prevGross, prevAge, ruleSet).total;
          annualResident = computeAnnualResidentTax(
            { annualGross: prevGross, socialInsurance: prevSi, dependents, hasSpouseDeduction },
            ruleSet,
          );
        }
        annualResidentCache.set(cacheKey, annualResident);
      }

      const siMonthly = Math.trunc(yearTax.socialInsurance / 12);
      if (siMonthly > 0) {
        out.push({
          month,
          accountId: salary.accountId,
          sourceId: salary.id,
          sourceKind: "social_insurance",
          amount: -siMonthly,
        });
      }
      const itMonthly = Math.trunc(yearTax.incomeTax / 12);
      if (itMonthly > 0) {
        out.push({
          month,
          accountId: salary.accountId,
          sourceId: salary.id,
          sourceKind: "income_tax",
          amount: -itMonthly,
        });
      }
      const rtMonthly = Math.trunc(annualResident / 12);
      if (rtMonthly > 0) {
        out.push({
          month,
          accountId: salary.accountId,
          sourceId: salary.id,
          sourceKind: "resident_tax",
          amount: -rtMonthly,
        });
      }
    }
  }
}

function buildStaticEntriesByMonth(plan: ResolvedPlan): Map<YearMonth, MonthlyEntry[]> {
  const { planStartMonth: start, planEndMonth: end } = plan.settings;
  const tmp: MonthlyEntry[] = [];

  // plan 開始より前の snapshot は「開始時点の初期残高」として planStart に平行移動する。
  // 口座ごとに最新のもののみ採用。plan 範囲内に同月の snapshot があれば後続の push で上書きされる。
  const preStartLatest = new Map<Ulid, ResolvedSnapshot>();
  for (const snapshot of plan.snapshots) {
    if (compareYearMonth(snapshot.month, start) >= 0) continue;
    const cur = preStartLatest.get(snapshot.accountId);
    if (!cur || compareYearMonth(snapshot.month, cur.month) > 0) {
      preStartLatest.set(snapshot.accountId, snapshot);
    }
  }
  for (const snapshot of preStartLatest.values()) {
    tmp.push({
      month: start,
      accountId: snapshot.accountId,
      sourceId: snapshot.id,
      sourceKind: "snapshot",
      amount: Math.trunc(snapshot.balance),
    });
  }

  for (const snapshot of plan.snapshots) {
    if (!withinPlan(snapshot.month, start, end)) continue;
    tmp.push({
      month: snapshot.month,
      accountId: snapshot.accountId,
      sourceId: snapshot.id,
      sourceKind: "snapshot",
      amount: Math.trunc(snapshot.balance),
    });
  }
  for (const income of plan.incomes) {
    for (const segment of income.segments) {
      emitSegment(income.accountId, income.id, "income", segment, start, end, 1, income.categoryId, tmp);
    }
  }
  for (const expense of plan.expenses) {
    if (isLoanExpense(expense)) {
      emitLoanExpense(expense, start, end, tmp);
      continue;
    }
    for (const segment of expense.segments) {
      emitSegment(expense.accountId, expense.id, "expense", segment, start, end, -1, expense.categoryId, tmp);
    }
  }
  for (const event of plan.events) {
    if (!withinPlan(event.month, start, end)) continue;
    tmp.push({
      month: event.month,
      accountId: event.accountId,
      sourceId: event.id,
      sourceKind: "event",
      categoryId: event.categoryId,
      amount: Math.trunc(event.amount),
    });
  }
  for (const transfer of plan.transfers) {
    if (transfer.fromAccountId === transfer.toAccountId) continue;
    if (transfer.minFromBalance !== undefined || transfer.minToBalance !== undefined) continue;
    for (const segment of transfer.segments) {
      emitTransferSegment(transfer.fromAccountId, transfer.toAccountId, transfer.id, segment, start, end, tmp);
    }
  }
  emitGrossSalaryEntries(plan, start, end, tmp);

  const byMonth = new Map<YearMonth, MonthlyEntry[]>();
  for (const entry of tmp) {
    let arr = byMonth.get(entry.month);
    if (!arr) {
      arr = [];
      byMonth.set(entry.month, arr);
    }
    arr.push(entry);
  }
  return byMonth;
}

function computeDynamicEntriesForMonth(
  month: YearMonth,
  plan: ResolvedPlan,
  balances: Record<Ulid, number>,
): MonthlyEntry[] {
  const { planStartMonth: start, planEndMonth: end } = plan.settings;
  const out: MonthlyEntry[] = [];

  for (const account of plan.accounts) {
    if (account.kind === "investment" && account.investment && account.investment.annualRate !== 0) {
      const base = balances[account.id] ?? 0;
      const rate = monthlyCompoundRate(account.investment.annualRate);
      const amount = Math.trunc(base * rate);
      if (Number.isFinite(amount) && amount !== 0) {
        out.push({
          month,
          accountId: account.id,
          sourceId: account.id,
          sourceKind: "interest",
          amount,
        });
      }
    }
  }

  for (const transfer of plan.transfers) {
    const hasFromLimit = transfer.minFromBalance !== undefined;
    const hasToLimit = transfer.minToBalance !== undefined;
    if (!hasFromLimit && !hasToLimit) continue;
    if (transfer.fromAccountId === transfer.toAccountId) continue;
    for (const segment of transfer.segments) {
      if (!segmentActiveOnMonth(segment, month, start, end)) continue;
      const desired = computeSegmentAmount(segment, month);
      if (desired <= 0) continue;
      let cap = desired;
      if (hasToLimit) {
        const toBalance = balances[transfer.toAccountId] ?? 0;
        const shortage = (transfer.minToBalance as number) - toBalance;
        if (shortage <= 0) continue;
        cap = Math.min(cap, shortage);
      }
      if (hasFromLimit) {
        const fromBalance = balances[transfer.fromAccountId] ?? 0;
        const available = fromBalance - (transfer.minFromBalance as number);
        cap = Math.min(cap, available);
      }
      const amount = Math.trunc(Math.max(0, cap));
      if (amount <= 0) continue;
      out.push({
        month,
        accountId: transfer.fromAccountId,
        sourceId: transfer.id,
        sourceKind: "transfer",
        amount: -amount,
      });
      out.push({
        month,
        accountId: transfer.toAccountId,
        sourceId: transfer.id,
        sourceKind: "transfer",
        amount,
      });
    }
  }

  return out;
}

function segmentActiveOnMonth(
  segment: ResolvedFlowSegment,
  month: YearMonth,
  planStart: YearMonth,
  planEnd: YearMonth,
): boolean {
  const start = maxYearMonth(segment.startMonth, planStart);
  const end = minYearMonth(segment.endMonth ?? planEnd, planEnd);
  if (compareYearMonth(start, end) > 0) return false;
  if (compareYearMonth(month, start) < 0 || compareYearMonth(month, end) > 0) return false;
  const interval = segment.intervalMonths && segment.intervalMonths > 0 ? segment.intervalMonths : 1;
  if (interval > 1) {
    const delta = monthDiff(segment.startMonth, month);
    if (delta < 0 || delta % interval !== 0) return false;
  }
  return true;
}

function applyMonthEntries(balances: Record<Ulid, number>, entries: MonthlyEntry[]): void {
  for (const e of entries) {
    if (e.sourceKind === "snapshot") {
      balances[e.accountId] = e.amount;
    } else {
      balances[e.accountId] = (balances[e.accountId] ?? 0) + e.amount;
    }
  }
}

export function interpret(plan: Plan): MonthlyEntry[] {
  const resolved = resolvePlan(plan);
  const { planStartMonth: start, planEndMonth: end } = resolved.settings;
  const staticByMonth = buildStaticEntriesByMonth(resolved);

  const balances: Record<Ulid, number> = {};
  for (const account of resolved.accounts) balances[account.id] = 0;

  const entries: MonthlyEntry[] = [];
  for (const month of iterateMonths(start, end)) {
    const dynamic = computeDynamicEntriesForMonth(month, resolved, balances);
    const staticEntries = staticByMonth.get(month) ?? [];
    const monthEntries = [...staticEntries, ...dynamic];
    for (const e of monthEntries) entries.push(e);
    applyMonthEntries(balances, monthEntries);
  }
  return entries;
}

// Re-exported type used by tests / UI
export type { Account };
