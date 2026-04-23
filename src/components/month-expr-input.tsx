import { useEffect, useMemo, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  currentYearMonth,
  isPersonAgeRef,
  isValidYearMonth,
  personAgeMonthFromNumber,
  resolveMonthExpr,
} from "@/lib/dsl/month";
import type { MonthExpr, PersonAgeMonth, Ulid, YearMonth, YearStartMonth } from "@/lib/dsl/types";
import { usePlan } from "@/state/plan-store";

const MODE_LITERAL = "literal";
const MODE_PERSON = "person";

type Mode = typeof MODE_LITERAL | typeof MODE_PERSON;

type Props = {
  id?: string;
  value: MonthExpr | undefined;
  onChange: (next: MonthExpr | undefined) => void;
  /** true の場合は未指定 (undefined) を許容する (既存の endMonth 等の用途) */
  allowEmpty?: boolean;
  className?: string;
};

const MONTHS: PersonAgeMonth[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export function MonthExprInput({ id, value, onChange, allowEmpty, className }: Props) {
  const { plan } = usePlan();
  const persons = plan.persons;
  const yearStart = plan.settings.yearStartMonth;

  const mode: Mode = value !== undefined && isPersonAgeRef(value) ? MODE_PERSON : MODE_LITERAL;
  const hasPersons = persons.length > 0;

  const literal = typeof value === "string" ? value : "";
  const ref = value && isPersonAgeRef(value) ? value : null;

  // 最後に保持していた有効な literal。mode 切替で戻した際にここから復元する。
  const lastLiteralRef = useRef<YearMonth | null>(
    typeof value === "string" && isValidYearMonth(value) ? value : null,
  );
  useEffect(() => {
    if (typeof value === "string" && isValidYearMonth(value)) {
      lastLiteralRef.current = value;
    }
  }, [value]);

  const resolvedPreview = useMemo(() => {
    if (!ref) return null;
    return resolveMonthExpr(ref, persons, yearStart);
  }, [ref, persons, yearStart]);

  const handleModeChange = (next: Mode) => {
    if (next === MODE_LITERAL) {
      // 既に literal なら何もしない
      if (typeof value === "string") return;
      const last = lastLiteralRef.current;
      if (last && isValidYearMonth(last)) {
        onChange(last);
      } else if (allowEmpty) {
        onChange(undefined);
      } else {
        onChange(currentYearMonth());
      }
      return;
    }
    // MODE_PERSON
    if (isPersonAgeRef(value)) return;
    const firstPerson = persons[0];
    if (!firstPerson) return;
    onChange({ kind: "person-age", personId: firstPerson.id, age: 0, month: 1 });
  };

  const handleLiteralChange = (v: string) => {
    if (v === "") {
      if (allowEmpty) onChange(undefined);
      return;
    }
    if (isValidYearMonth(v)) onChange(v);
  };

  const updateRef = (patch: Partial<NonNullable<typeof ref>>) => {
    if (!ref) return;
    onChange({ ...ref, ...patch });
  };

  const handlePersonChange = (personId: Ulid) => updateRef({ personId });
  const handleAgeChange = (v: string) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) return;
    updateRef({ age: n });
  };
  const handleMonthChange = (v: string) => {
    const n = personAgeMonthFromNumber(Number(v));
    if (!n) return;
    updateRef({ month: n });
  };

  return (
    <div className={className}>
      <div className="grid gap-1.5">
        {hasPersons ? (
          <div className="flex items-center gap-2 text-xs">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                className="size-3"
                checked={mode === MODE_LITERAL}
                onChange={() => handleModeChange(MODE_LITERAL)}
              />
              年月
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                className="size-3"
                checked={mode === MODE_PERSON}
                onChange={() => handleModeChange(MODE_PERSON)}
              />
              人物年齢
            </label>
          </div>
        ) : null}
        {mode === MODE_LITERAL ? (
          <Input id={id} type="month" value={literal} onChange={(e) => handleLiteralChange(e.target.value)} />
        ) : ref ? (
          <PersonRefRow
            id={id}
            personId={ref.personId}
            age={ref.age}
            month={ref.month}
            yearStart={yearStart}
            persons={persons}
            resolvedPreview={resolvedPreview}
            onPersonChange={handlePersonChange}
            onAgeChange={handleAgeChange}
            onMonthChange={handleMonthChange}
          />
        ) : null}
      </div>
    </div>
  );
}

type PersonRefRowProps = {
  id?: string;
  personId: Ulid;
  age: number;
  month: PersonAgeMonth;
  yearStart: YearStartMonth;
  persons: { id: Ulid; label: string }[];
  resolvedPreview: string | null;
  onPersonChange: (id: Ulid) => void;
  onAgeChange: (value: string) => void;
  onMonthChange: (value: string) => void;
};

function PersonRefRow({
  id,
  personId,
  age,
  month,
  persons,
  resolvedPreview,
  onPersonChange,
  onAgeChange,
  onMonthChange,
}: PersonRefRowProps) {
  return (
    <div className="grid gap-1">
      <div className="grid grid-cols-[1fr_70px_70px] gap-1">
        <Select value={personId} onValueChange={onPersonChange}>
          <SelectTrigger id={id} className="h-9 w-full">
            <SelectValue placeholder="人物" />
          </SelectTrigger>
          <SelectContent>
            {persons.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          value={age}
          onChange={(e) => onAgeChange(e.target.value)}
          aria-label="年齢"
          title="歳"
        />
        <Select value={String(month)} onValueChange={onMonthChange}>
          <SelectTrigger className="h-9 w-full" aria-label="月">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((m) => (
              <SelectItem key={m} value={String(m)}>
                {m}月
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <span className="text-[10px] text-muted-foreground">= {resolvedPreview ?? "解決不能"}</span>
    </div>
  );
}
