import { addMonths, currentYearMonth, toYearMonth } from "./month";
import type { Plan } from "./types";

export function emptyPlan(now: Date = new Date()): Plan {
  const start = toYearMonth(now.getFullYear(), now.getMonth() + 1);
  const end = addMonths(currentYearMonth(now), 12 * 50);
  return {
    schemaVersion: 2,
    settings: {
      yearStartMonth: 1,
      planStartMonth: start,
      planEndMonth: end,
    },
    persons: [],
    accounts: [],
    snapshots: [],
    incomes: [],
    expenses: [],
    events: [],
    transfers: [],
    categories: [],
    grossSalaries: [],
    taxRuleSets: [],
  };
}
