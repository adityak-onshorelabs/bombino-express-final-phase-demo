import { OpsShell } from '@/components/ops/OpsShell';

export default function OpsTransactions() {
  return (
    <OpsShell title="Transactions" subtitle="Payment ledger">
      <p className="text-sm text-muted-foreground" data-testid="ops-transactions-stub">
        Ledger coming in this view
      </p>
    </OpsShell>
  );
}
