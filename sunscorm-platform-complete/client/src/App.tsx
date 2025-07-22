import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import Courses from "@/pages/courses";
import Dispatches from "@/pages/dispatches";
import Analytics from "@/pages/analytics";
import Users from "@/pages/users";
import Companies from "@/pages/tenants";
import CompanyProfile from "@/pages/company-profile";
import CoursePreview from "@/pages/course-preview";
import Settings from "@/pages/settings";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Switch>
      {isLoading || !isAuthenticated ? (
        <Route path="/" component={Landing} />
      ) : (
        <>
          <Route path="/" component={Dashboard} />
          <Route path="/courses" component={Courses} />
          <Route path="/course/:id/preview" component={CoursePreview} />
          <Route path="/dispatches" component={Dispatches} />
          <Route path="/analytics" component={Analytics} />
          <Route path="/users" component={Users} />
          <Route path="/companies" component={Companies} />
          <Route path="/companies/:id" component={CompanyProfile} />
          <Route path="/settings" component={Settings} />
        </>
      )}
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