import { useEffect } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { verifySession } from "./lib/session";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from '@/components/AppLayout';
import { SurfaceGuard } from '@/components/SurfaceGuard';
import { AgentRoutes } from './routes.agent';
import { surfaceForPath } from '@/lib/surface';

import Splash from "@/pages/Splash";
import Onboarding from "@/pages/Onboarding";
import Home from "@/pages/Home";
import Track from "@/pages/Track";
import Receive from "@/pages/Receive";
import ShipmentDetails from "@/pages/ShipmentDetails";
import OrderDetails from "@/pages/OrderDetails";
import Rates from "@/pages/Rates";
import CreateShipment from "@/pages/CreateShipment";
import Orders from "@/pages/Orders";
import Notifications from "@/pages/Notifications";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Privacy from "@/pages/Privacy";
import Profile from "@/pages/Profile";
import Support from "@/pages/Support";
import NotFound from "@/pages/not-found";

function CustomerRouter() {
  return (
    <Switch>
      <Route path="/" component={Splash} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/home" component={Home} />
      <Route path="/track" component={Track} />
      <Route path="/receive" component={Receive} />
      <Route path="/shipment/:awb" component={ShipmentDetails} />
      {/* Pre-docket orders. A shipment has an AWB and lives at /shipment;
          an order has only BOM-xxxxxx until ops generates one. */}
      <Route path="/order/:orderNo" component={OrderDetails} />
      <Route path="/rates" component={Rates} />
      <Route path="/create" component={CreateShipment} />
      <Route path="/orders" component={Orders} />
      <Route path="/notifications" component={Notifications} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/profile" component={Profile} />
      <Route path="/help" component={Support} />
      <Route component={NotFound} />
    </Switch>
  );
}

/**
 * A1 — surface selection.
 *
 * The agent app is not the customer app with different screens: it gets no
 * desktop sidebar, no top bar and no support FAB, so it renders outside
 * `AppLayout` entirely rather than trying to opt out of its parts.
 *
 * `SurfaceGuard` sits above both and bounces anyone onto their own surface.
 * It is cosmetic — the real enforcement is `requireRole` on the server.
 */
function Surfaces() {
  const [location] = useLocation();

  if (surfaceForPath(location) === 'agent') {
    return <AgentRoutes />;
  }

  return (
    <AppLayout>
      <CustomerRouter />
    </AppLayout>
  );
}

/**
 * Confirms the persisted session is still real, on load and whenever the tab
 * comes back to the foreground.
 *
 * The 401 interceptor in queryClient only fires once something is requested,
 * and a screen assembled entirely from localStorage requests nothing — which
 * is exactly how a dead session used to keep showing a name, a job list and a
 * cash total. Foreground is the right second trigger: a phone that has been in
 * a pocket for an hour is the common way a session lapses.
 */
function SessionWatch() {
  useEffect(() => {
    void verifySession();

    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void verifySession();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <SessionWatch />
        <SurfaceGuard>
          <Surfaces />
        </SurfaceGuard>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;