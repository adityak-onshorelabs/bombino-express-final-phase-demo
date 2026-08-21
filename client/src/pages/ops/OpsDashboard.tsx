import { OpsShell } from '@/components/ops/OpsShell';

export default function OpsDashboard() {
  return (
    <OpsShell title="Dashboard" subtitle="Overview">
      <p className="text-sm text-muted-foreground" data-testid="ops-dashboard-stub">
        Overview coming in this view
      </p>
    </OpsShell>
  );
}
