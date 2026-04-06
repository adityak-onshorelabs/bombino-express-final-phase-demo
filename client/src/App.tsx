import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Splash from "@/pages/Splash";
import Onboarding from "@/pages/Onboarding";
import Home from "@/pages/Home";
import Track from "@/pages/Track";
import Receive from "@/pages/Receive";
import ShipmentDetails from "@/pages/ShipmentDetails";
import Rates from "@/pages/Rates";
import CreateShipment from "@/pages/CreateShipment";
import Orders from "@/pages/Orders";
import Notifications from "@/pages/Notifications";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Profile from "@/pages/Profile";
import Support from "@/pages/Support";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Splash} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/home" component={Home} />
      <Route path="/track" component={Track} />
      <Route path="/receive" component={Receive} />
      <Route path="/shipment/:awb" component={ShipmentDetails} />
      <Route path="/rates" component={Rates} />
      <Route path="/create" component={CreateShipment} />
      <Route path="/orders" component={Orders} />
      <Route path="/notifications" component={Notifications} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/profile" component={Profile} />
      <Route path="/help" component={Support} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;