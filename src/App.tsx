import { AccountsCard } from "@/components/accounts-card";
import { BalanceChart } from "@/components/balance-chart";
import { CategoriesCard } from "@/components/categories-card";
import { EventsCard } from "@/components/events-card";
import { FlowChart } from "@/components/flow-chart";
import { FlowsCard } from "@/components/flows-card";
import { PlansCard } from "@/components/plans-card";
import { SettingsCard } from "@/components/settings-card";
import { SnapshotsCard } from "@/components/snapshots-card";
import { TransfersCard } from "@/components/transfers-card";
import { PlanProvider } from "@/state/plan-store";
import "./index.css";

export function App() {
  return (
    <PlanProvider>
      <div className="container mx-auto flex max-w-5xl flex-col gap-6 p-6 md:p-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">FP</h1>
          <p className="text-muted-foreground">ファイナンシャルプランを作成し管理するツール</p>
        </header>
        <PlansCard />
        <SettingsCard />
        <BalanceChart />
        <FlowChart kind="income" />
        <FlowChart kind="expense" />
        <AccountsCard />
        <CategoriesCard />
        <SnapshotsCard />
        <FlowsCard kind="income" />
        <FlowsCard kind="expense" />
        <EventsCard />
        <TransfersCard />
      </div>
    </PlanProvider>
  );
}

export default App;
