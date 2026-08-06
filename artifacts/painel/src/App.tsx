import { Route, Switch, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Shell } from '@/components/layout/Shell';

import Login from '@/pages/login';
import Register from '@/pages/register';
import Painel from '@/pages/dashboard/client';
import AdminDashboard from '@/pages/dashboard/admin';
import AdminUsers from '@/pages/dashboard/users';
import AdminKeys from '@/pages/dashboard/keys';
import AdminPromotions from '@/pages/dashboard/promotions';
import ResetKey from '@/pages/public/reset-key';
import Plans from '@/pages/dashboard/plans';
import { useGetSession, getGetSessionQueryKey } from '@workspace/api-client-react';
import { Loader2 } from 'lucide-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component, roleRequired, ...rest }: any) {
  const { data: session, isLoading, error } = useGetSession({ query: { retry: false, queryKey: getGetSessionQueryKey() } });

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (error || !session) {
    return <Redirect to="/login" />;
  }

  if (session.status === 'pending') {
    return <Redirect to="/login" />;
  }

  const allowed: string[] = Array.isArray(roleRequired) ? roleRequired : roleRequired ? [roleRequired] : [];
  if (allowed.length > 0 && !allowed.includes(session.role)) {
    return <Redirect to={session.role === 'admin' || session.role === 'manager' ? '/admin' : '/painel'} />;
  }

  return (
    <Shell>
      <Component {...rest} />
    </Shell>
  );
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/login" />
      </Route>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/resetar-key" component={ResetKey} />
      <Route path="/resetar-device" component={ResetKey} />

      <Route path="/painel">
        <ProtectedRoute component={Painel} roleRequired="client" />
      </Route>
      <Route path="/planos">
        <ProtectedRoute component={Plans} roleRequired={['client', 'manager']} />
      </Route>
      <Route path="/admin">
        <ProtectedRoute component={AdminDashboard} roleRequired={['admin', 'manager']} />
      </Route>
      <Route path="/admin/usuarios">
        <ProtectedRoute component={AdminUsers} roleRequired={['admin', 'manager']} />
      </Route>
      <Route path="/admin/keys">
        <ProtectedRoute component={AdminKeys} roleRequired={['admin', 'manager']} />
      </Route>
      <Route path="/admin/promocoes">
        <ProtectedRoute component={AdminPromotions} roleRequired="admin" />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AppRouter />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
