import { AboutCard } from "@/components/about-card";
import { AccountsCard } from "@/components/accounts-card";
import { BalanceChart } from "@/components/balance-chart";
import { CategoriesCard } from "@/components/categories-card";
import { EventsCard } from "@/components/events-card";
import { FlowChart } from "@/components/flow-chart";
import { FlowsCard } from "@/components/flows-card";
import { HistoryControls } from "@/components/history-controls";
import { PersonsCard } from "@/components/persons-card";
import { PlansCard } from "@/components/plans-card";
import { SalariesCard } from "@/components/salaries-card";
import { SettingsCard } from "@/components/settings-card";
import { SnapshotsCard } from "@/components/snapshots-card";
import { TaxRuleSetsCard } from "@/components/tax-rule-sets-card";
import { TransfersCard } from "@/components/transfers-card";
import "./index.css";

export function App() {
  return (
    <div className="container mx-auto flex max-w-7xl flex-col gap-6 p-6 md:p-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">FP</h1>
          <p className="text-muted-foreground">ファイナンシャルプランを作成し管理するツール</p>
        </div>
        <HistoryControls />
      </header>
      <AboutCard />
      <PlansCard />
      <SettingsCard />
      <PersonsCard />
      <BalanceChart />
      <FlowChart kind="income" />
      <FlowChart kind="expense" />
      <AccountsCard />
      <CategoriesCard />
      <SnapshotsCard />
      <SalariesCard />
      <TaxRuleSetsCard />
      <FlowsCard kind="income" />
      <FlowsCard kind="expense" />
      <EventsCard />
      <TransfersCard />
    </div>
  );
}

export default App;
