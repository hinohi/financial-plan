import { isPersonAgeRef } from "./month";
import type { FlowSegment, GrossSalary, LoanRateSegment, LoanSpec, MonthExpr, Ulid } from "./types";

/** expr が PersonAgeRef で、指定した personId を参照しているか */
export function exprRefsPerson(expr: MonthExpr | undefined, personId: Ulid): boolean {
  return !!expr && isPersonAgeRef(expr) && expr.personId === personId;
}

export function segmentRefsPerson(segment: FlowSegment, personId: Ulid): boolean {
  return exprRefsPerson(segment.startMonth, personId) || exprRefsPerson(segment.endMonth, personId);
}

export function grossSalaryRefsPerson(salary: GrossSalary, personId: Ulid): boolean {
  if (salary.personId === personId) return true;
  return exprRefsPerson(salary.startMonth, personId) || exprRefsPerson(salary.endMonth, personId);
}

export function loanRateSegmentRefsPerson(rs: LoanRateSegment, personId: Ulid): boolean {
  return exprRefsPerson(rs.startMonth, personId) || exprRefsPerson(rs.endMonth, personId);
}

export function loanRefsPerson(loan: LoanSpec | undefined, personId: Ulid): boolean {
  if (!loan) return false;
  return loan.rateSegments.some((rs) => loanRateSegmentRefsPerson(rs, personId));
}
