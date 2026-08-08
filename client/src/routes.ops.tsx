import { Route, Switch } from 'wouter';
import OpsBoard from '@/pages/ops/OpsBoard';
import OpsOrderDetail from '@/pages/ops/OpsOrderDetail';
import NotFound from '@/pages/not-found';

/**
 * Ops surface router — mirror of routes.agent.tsx.
 * Mounted from App.tsx when surfaceForPath === 'ops', still under SurfaceGuard.
 */
export function OpsRoutes() {
  return (
    <Switch>
      <Route path="/ops" component={OpsBoard} />
      <Route path="/ops/orders/:id" component={OpsOrderDetail} />
      <Route component={NotFound} />
    </Switch>
  );
}
