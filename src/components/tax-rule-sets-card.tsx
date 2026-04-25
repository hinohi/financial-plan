import { memo, type ReactNode, useCallback, useMemo, useState } from "react";
import { CollapseToggle } from "@/components/collapse-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CommittedInput } from "@/components/ui/committed-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumericCommittedInput } from "@/components/ui/numeric-committed-input";
import { PercentCommittedInput } from "@/components/ui/percent-committed-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCollapse } from "@/hooks/use-collapse";
import { newId } from "@/lib/dsl/id";
import type { EmploymentIncomeDeductionBracket, IncomeTaxBracket, TaxRuleSet } from "@/lib/dsl/types";
import { BUILT_IN_TAX_RULE_SET } from "@/lib/tax";
import { type PlanAction, usePlan } from "@/state/plan-store";

function cloneRuleSet(source: TaxRuleSet, overrides: Partial<TaxRuleSet>): TaxRuleSet {
  return {
    ...source,
    ...overrides,
    socialInsurance: {
      ...source.socialInsurance,
      rates: { ...source.socialInsurance.rates },
      annualCaps: { ...source.socialInsurance.annualCaps },
    },
    employmentIncomeDeduction: source.employmentIncomeDeduction.map((b) => ({ ...b })),
    incomeTax: {
      ...source.incomeTax,
      brackets: source.incomeTax.brackets.map((b) => ({ ...b })),
    },
    residentTax: { ...source.residentTax },
  };
}

export function TaxRuleSetsCard() {
  const { plan, dispatch } = usePlan();
  const [collapsed, toggleCollapsed] = useCollapse("tax-rule-sets");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const ruleSets = plan.taxRuleSets ?? [];
  const sorted = useMemo(() => [...ruleSets].sort((a, b) => a.effectiveFromYear - b.effectiveFromYear), [ruleSets]);

  const latest = sorted[sorted.length - 1];

  const handleAddFromBuiltIn = () => {
    const ruleSet = cloneRuleSet(BUILT_IN_TAX_RULE_SET, {
      id: newId(),
      label: "新しい税制ルール",
      effectiveFromYear: new Date().getFullYear(),
    });
    dispatch({ type: "tax-rule-set/add", ruleSet });
    setExpandedId(ruleSet.id);
  };

  const handleAddFromLatest = () => {
    if (!latest) return;
    const ruleSet = cloneRuleSet(latest, {
      id: newId(),
      label: `${latest.label} のコピー`,
      effectiveFromYear: latest.effectiveFromYear + 1,
    });
    dispatch({ type: "tax-rule-set/add", ruleSet });
    setExpandedId(ruleSet.id);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>税制ルール</CardTitle>
            <CardDescription>
              社会保険料や所得税・住民税の計算に使う「ある時期から適用される税制」を期間ごとに登録できる。
              空のままならビルトイン (協会けんぽ東京 2024 年度相当) が常に使われる。
              各ルールは「適用開始年」を持ち、計算時はその年以降で最も新しいものが選ばれる。
            </CardDescription>
          </div>
          <CollapseToggle collapsed={collapsed} onToggle={toggleCollapsed} label="税制ルール" />
        </div>
      </CardHeader>
      {collapsed ? null : (
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleAddFromBuiltIn}>
              ビルトインから追加
            </Button>
            <Button variant="outline" size="sm" onClick={handleAddFromLatest} disabled={!latest}>
              前期間をコピーして追加
            </Button>
            {!latest ? (
              <span className="text-xs text-muted-foreground">既存ルールが無いのでコピーは使えません。</span>
            ) : null}
          </div>
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              ルール未登録。ビルトインの値が常に使われます。年度ごとに値を変えたい場合は上のボタンから追加してください。
            </p>
          ) : (
            <ul className="grid gap-2">
              {sorted.map((ruleSet) => {
                const isExpanded = expandedId === ruleSet.id;
                return (
                  <li key={ruleSet.id} className="rounded-md border">
                    <div className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="grid text-sm">
                        <span className="font-medium">
                          {ruleSet.label}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {ruleSet.effectiveFromYear} 年〜適用
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          健保 {(ruleSet.socialInsurance.rates.health * 100).toFixed(2)}% / 厚年{" "}
                          {(ruleSet.socialInsurance.rates.pension * 100).toFixed(2)}% / 住民税所得割{" "}
                          {(ruleSet.residentTax.incomeRate * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setExpandedId(isExpanded ? null : ruleSet.id)}
                        >
                          {isExpanded ? "閉じる" : "編集"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            dispatch({ type: "tax-rule-set/remove", id: ruleSet.id });
                            if (expandedId === ruleSet.id) setExpandedId(null);
                          }}
                        >
                          削除
                        </Button>
                      </div>
                    </div>
                    {isExpanded ? <TaxRuleSetEditor ruleSet={ruleSet} dispatch={dispatch} /> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      )}
    </Card>
  );
}

type EditorProps = {
  ruleSet: TaxRuleSet;
  dispatch: (action: PlanAction) => void;
};

const TaxRuleSetEditor = memo(function TaxRuleSetEditor({ ruleSet, dispatch }: EditorProps) {
  const update = useCallback(
    (patch: Partial<Omit<TaxRuleSet, "id">>) => {
      dispatch({ type: "tax-rule-set/update", id: ruleSet.id, patch });
    },
    [dispatch, ruleSet.id],
  );

  const updateSocialInsurance = (patch: Partial<TaxRuleSet["socialInsurance"]>) => {
    update({ socialInsurance: { ...ruleSet.socialInsurance, ...patch } });
  };

  const updateIncomeTax = (patch: Partial<TaxRuleSet["incomeTax"]>) => {
    update({ incomeTax: { ...ruleSet.incomeTax, ...patch } });
  };

  const updateResidentTax = (patch: Partial<TaxRuleSet["residentTax"]>) => {
    update({ residentTax: { ...ruleSet.residentTax, ...patch } });
  };

  const setEmploymentIncomeDeduction = (next: EmploymentIncomeDeductionBracket[]) => {
    update({ employmentIncomeDeduction: next });
  };

  const setIncomeTaxBrackets = (next: IncomeTaxBracket[]) => {
    updateIncomeTax({ brackets: next });
  };

  const fieldId = (suffix: string) => `tax-rule-${ruleSet.id}-${suffix}`;

  return (
    <div className="grid gap-5 border-t bg-muted/10 px-4 py-4">
      <Section title="基本">
        <div className="grid gap-3 md:grid-cols-[1fr_160px]">
          <Field label="ラベル" htmlFor={fieldId("label")}>
            <CommittedInput id={fieldId("label")} value={ruleSet.label} onCommit={(v) => update({ label: v })} />
          </Field>
          <Field label="適用開始年 (この年以降)" htmlFor={fieldId("year")}>
            <CommittedInput
              id={fieldId("year")}
              type="number"
              inputMode="numeric"
              value={ruleSet.effectiveFromYear}
              onCommit={(v) => {
                const n = Number(v);
                if (Number.isInteger(n)) update({ effectiveFromYear: n });
              }}
            />
          </Field>
        </div>
      </Section>

      <Section title="社会保険料 (本人負担分)">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Field label="健康保険" htmlFor={fieldId("si-health")}>
            <PercentCommittedInput
              id={fieldId("si-health")}
              step={0.01}
              value={ruleSet.socialInsurance.rates.health}
              onCommit={(r) => updateSocialInsurance({ rates: { ...ruleSet.socialInsurance.rates, health: r } })}
            />
          </Field>
          <Field label="厚生年金" htmlFor={fieldId("si-pension")}>
            <PercentCommittedInput
              id={fieldId("si-pension")}
              step={0.01}
              value={ruleSet.socialInsurance.rates.pension}
              onCommit={(r) => updateSocialInsurance({ rates: { ...ruleSet.socialInsurance.rates, pension: r } })}
            />
          </Field>
          <Field label="雇用保険" htmlFor={fieldId("si-employment")}>
            <PercentCommittedInput
              id={fieldId("si-employment")}
              step={0.01}
              value={ruleSet.socialInsurance.rates.employment}
              onCommit={(r) => updateSocialInsurance({ rates: { ...ruleSet.socialInsurance.rates, employment: r } })}
            />
          </Field>
          <Field label="介護保険" htmlFor={fieldId("si-ltc")}>
            <PercentCommittedInput
              id={fieldId("si-ltc")}
              step={0.01}
              value={ruleSet.socialInsurance.rates.longTermCare}
              onCommit={(r) => updateSocialInsurance({ rates: { ...ruleSet.socialInsurance.rates, longTermCare: r } })}
            />
          </Field>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="健保 年額上限 (円)" htmlFor={fieldId("si-cap-health")}>
            <NumericCommittedInput
              id={fieldId("si-cap-health")}
              value={ruleSet.socialInsurance.annualCaps.health}
              onCommit={(v) => {
                const n = Number(v);
                if (Number.isFinite(n) && n >= 0) {
                  updateSocialInsurance({
                    annualCaps: { ...ruleSet.socialInsurance.annualCaps, health: n },
                  });
                }
              }}
            />
          </Field>
          <Field label="厚年 年額上限 (円)" htmlFor={fieldId("si-cap-pension")}>
            <NumericCommittedInput
              id={fieldId("si-cap-pension")}
              value={ruleSet.socialInsurance.annualCaps.pension}
              onCommit={(v) => {
                const n = Number(v);
                if (Number.isFinite(n) && n >= 0) {
                  updateSocialInsurance({
                    annualCaps: { ...ruleSet.socialInsurance.annualCaps, pension: n },
                  });
                }
              }}
            />
          </Field>
          <Field label="介護開始年齢" htmlFor={fieldId("si-ltc-age")}>
            <CommittedInput
              id={fieldId("si-ltc-age")}
              type="number"
              inputMode="numeric"
              value={ruleSet.socialInsurance.longTermCareStartAge}
              onCommit={(v) => {
                const n = Number(v);
                if (Number.isInteger(n) && n >= 0) updateSocialInsurance({ longTermCareStartAge: n });
              }}
            />
          </Field>
        </div>
      </Section>

      <Section
        title="給与所得控除"
        description="額面年収を上限値で区切ったブラケット。flat は固定額、formula は floor(年収 × 率) + 加算額。"
      >
        <EmploymentIncomeDeductionTable
          brackets={ruleSet.employmentIncomeDeduction}
          onChange={setEmploymentIncomeDeduction}
          fieldId={(s) => fieldId(`eid-${s}`)}
        />
      </Section>

      <Section
        title="所得税"
        description="速算表のブラケット。最終行 (上限なし) は upTo を空欄に。税率は %、控除額は円。"
      >
        <IncomeTaxBracketsTable
          brackets={ruleSet.incomeTax.brackets}
          onChange={setIncomeTaxBrackets}
          fieldId={(s) => fieldId(`it-bracket-${s}`)}
        />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Field label="基礎控除 (円)" htmlFor={fieldId("it-basic")}>
            <NumericCommittedInput
              id={fieldId("it-basic")}
              value={ruleSet.incomeTax.basicDeduction}
              onCommit={(v) => {
                const n = Number(v);
                if (Number.isFinite(n)) updateIncomeTax({ basicDeduction: n });
              }}
            />
          </Field>
          <Field label="配偶者控除 (円)" htmlFor={fieldId("it-spouse")}>
            <NumericCommittedInput
              id={fieldId("it-spouse")}
              value={ruleSet.incomeTax.spouseDeduction}
              onCommit={(v) => {
                const n = Number(v);
                if (Number.isFinite(n)) updateIncomeTax({ spouseDeduction: n });
              }}
            />
          </Field>
          <Field label="扶養控除 (1人 円)" htmlFor={fieldId("it-dep")}>
            <NumericCommittedInput
              id={fieldId("it-dep")}
              value={ruleSet.incomeTax.dependentDeduction}
              onCommit={(v) => {
                const n = Number(v);
                if (Number.isFinite(n)) updateIncomeTax({ dependentDeduction: n });
              }}
            />
          </Field>
          <Field label="復興特別所得税込 倍率" htmlFor={fieldId("it-recon")}>
            <CommittedInput
              id={fieldId("it-recon")}
              type="number"
              inputMode="decimal"
              step={0.001}
              value={ruleSet.incomeTax.reconstructionSurtaxMultiplier}
              onCommit={(v) => {
                const n = Number(v);
                if (Number.isFinite(n)) updateIncomeTax({ reconstructionSurtaxMultiplier: n });
              }}
            />
          </Field>
        </div>
      </Section>

      <Section title="住民税">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Field label="基礎控除 (円)" htmlFor={fieldId("rt-basic")}>
            <NumericCommittedInput
              id={fieldId("rt-basic")}
              value={ruleSet.residentTax.basicDeduction}
              onCommit={(v) => {
                const n = Number(v);
                if (Number.isFinite(n)) updateResidentTax({ basicDeduction: n });
              }}
            />
          </Field>
          <Field label="配偶者控除 (円)" htmlFor={fieldId("rt-spouse")}>
            <NumericCommittedInput
              id={fieldId("rt-spouse")}
              value={ruleSet.residentTax.spouseDeduction}
              onCommit={(v) => {
                const n = Number(v);
                if (Number.isFinite(n)) updateResidentTax({ spouseDeduction: n });
              }}
            />
          </Field>
          <Field label="扶養控除 (1人 円)" htmlFor={fieldId("rt-dep")}>
            <NumericCommittedInput
              id={fieldId("rt-dep")}
              value={ruleSet.residentTax.dependentDeduction}
              onCommit={(v) => {
                const n = Number(v);
                if (Number.isFinite(n)) updateResidentTax({ dependentDeduction: n });
              }}
            />
          </Field>
          <Field label="所得割率" htmlFor={fieldId("rt-rate")}>
            <PercentCommittedInput
              id={fieldId("rt-rate")}
              step={0.1}
              value={ruleSet.residentTax.incomeRate}
              onCommit={(r) => updateResidentTax({ incomeRate: r })}
            />
          </Field>
          <Field label="均等割 (円)" htmlFor={fieldId("rt-percapita")}>
            <NumericCommittedInput
              id={fieldId("rt-percapita")}
              value={ruleSet.residentTax.perCapita}
              onCommit={(v) => {
                const n = Number(v);
                if (Number.isFinite(n)) updateResidentTax({ perCapita: n });
              }}
            />
          </Field>
        </div>
      </Section>
    </div>
  );
});

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <div>
        <h4 className="text-sm font-semibold">{title}</h4>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

type EmploymentIncomeDeductionTableProps = {
  brackets: EmploymentIncomeDeductionBracket[];
  onChange: (next: EmploymentIncomeDeductionBracket[]) => void;
  fieldId: (suffix: string) => string;
};

function EmploymentIncomeDeductionTable({ brackets, onChange, fieldId }: EmploymentIncomeDeductionTableProps) {
  const setRow = (index: number, next: EmploymentIncomeDeductionBracket) => {
    onChange(brackets.map((b, i) => (i === index ? next : b)));
  };
  const removeRow = (index: number) => onChange(brackets.filter((_, i) => i !== index));
  const addRow = () => onChange([...brackets, { upTo: 0, kind: "flat", amount: 0 }]);

  return (
    <div className="grid gap-2">
      <div className="hidden grid-cols-[160px_120px_1fr_1fr_60px] gap-2 px-1 text-xs text-muted-foreground md:grid">
        <span>年収上限 (空=∞)</span>
        <span>種別</span>
        <span>金額/率</span>
        <span>加算額</span>
        <span />
      </div>
      {brackets.map((b, i) => {
        const upToId = fieldId(`upto-${i}`);
        const kindId = fieldId(`kind-${i}`);
        const valueId = fieldId(`value-${i}`);
        const addId = fieldId(`add-${i}`);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: ブラケットの順序が key の意味なので index で十分
          <div key={i} className="grid gap-2 md:grid-cols-[160px_120px_1fr_1fr_60px] md:items-center">
            <Input
              id={upToId}
              aria-label="年収上限"
              type="number"
              inputMode="numeric"
              placeholder="∞"
              value={b.upTo === null ? "" : b.upTo}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  setRow(i, { ...b, upTo: null });
                  return;
                }
                const n = Number(raw);
                if (Number.isFinite(n)) setRow(i, { ...b, upTo: n });
              }}
            />
            <Select
              value={b.kind}
              onValueChange={(v) => {
                if (v === "flat") setRow(i, { upTo: b.upTo, kind: "flat", amount: 0 });
                else setRow(i, { upTo: b.upTo, kind: "formula", rate: 0, add: 0 });
              }}
            >
              <SelectTrigger id={kindId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="flat">固定額</SelectItem>
                <SelectItem value="formula">式 (率×年収+加算額)</SelectItem>
              </SelectContent>
            </Select>
            {b.kind === "flat" ? (
              <>
                <NumericCommittedInput
                  id={valueId}
                  aria-label="固定額 (円)"
                  value={b.amount}
                  onCommit={(v) => {
                    const n = Number(v);
                    if (Number.isFinite(n)) setRow(i, { ...b, amount: n });
                  }}
                />
                <span className="text-xs text-muted-foreground">—</span>
              </>
            ) : (
              <>
                <PercentCommittedInput
                  id={valueId}
                  aria-label="率"
                  step={0.1}
                  value={b.rate}
                  onCommit={(r) => setRow(i, { ...b, rate: r })}
                />
                <NumericCommittedInput
                  id={addId}
                  aria-label="加算額 (円・負も可)"
                  value={b.add}
                  onCommit={(v) => {
                    const n = Number(v);
                    if (Number.isFinite(n)) setRow(i, { ...b, add: n });
                  }}
                />
              </>
            )}
            <Button variant="ghost" size="sm" onClick={() => removeRow(i)} aria-label="行を削除">
              削除
            </Button>
          </div>
        );
      })}
      <div>
        <Button variant="outline" size="sm" onClick={addRow}>
          行を追加
        </Button>
      </div>
    </div>
  );
}

type IncomeTaxBracketsTableProps = {
  brackets: IncomeTaxBracket[];
  onChange: (next: IncomeTaxBracket[]) => void;
  fieldId: (suffix: string) => string;
};

function IncomeTaxBracketsTable({ brackets, onChange, fieldId }: IncomeTaxBracketsTableProps) {
  const setRow = (index: number, next: IncomeTaxBracket) => {
    onChange(brackets.map((b, i) => (i === index ? next : b)));
  };
  const removeRow = (index: number) => onChange(brackets.filter((_, i) => i !== index));
  const addRow = () => onChange([...brackets, { upTo: 0, rate: 0, subtract: 0 }]);

  return (
    <div className="grid gap-2">
      <div className="hidden grid-cols-[1fr_120px_1fr_60px] gap-2 px-1 text-xs text-muted-foreground md:grid">
        <span>課税所得 上限 (空=∞)</span>
        <span>税率</span>
        <span>速算控除額</span>
        <span />
      </div>
      {brackets.map((b, i) => {
        const upToId = fieldId(`upto-${i}`);
        const rateId = fieldId(`rate-${i}`);
        const subId = fieldId(`sub-${i}`);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: ブラケットの順序が key の意味なので index で十分
          <div key={i} className="grid gap-2 md:grid-cols-[1fr_120px_1fr_60px] md:items-center">
            <Input
              id={upToId}
              aria-label="課税所得 上限"
              type="number"
              inputMode="numeric"
              placeholder="∞"
              value={b.upTo === null ? "" : b.upTo}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  setRow(i, { ...b, upTo: null });
                  return;
                }
                const n = Number(raw);
                if (Number.isFinite(n)) setRow(i, { ...b, upTo: n });
              }}
            />
            <PercentCommittedInput
              id={rateId}
              step={0.1}
              value={b.rate}
              onCommit={(r) => setRow(i, { ...b, rate: r })}
            />
            <NumericCommittedInput
              id={subId}
              value={b.subtract}
              onCommit={(v) => {
                const n = Number(v);
                if (Number.isFinite(n)) setRow(i, { ...b, subtract: n });
              }}
            />
            <Button variant="ghost" size="sm" onClick={() => removeRow(i)} aria-label="行を削除">
              削除
            </Button>
          </div>
        );
      })}
      <div>
        <Button variant="outline" size="sm" onClick={addRow}>
          行を追加
        </Button>
      </div>
    </div>
  );
}
