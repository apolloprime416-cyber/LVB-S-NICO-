import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { useGetSession, useLogout, getGetSessionQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  LogOut, 
  LayoutDashboard, 
  Users, 
  Key, 
  Menu,
  ShieldAlert,
  Download,
  ShoppingCart
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Logo } from '@/components/ui/logo';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: session } = useGetSession();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);

  const isAdmin = session?.role === 'admin';

  const handleDownloadExtension = async () => {
    setOpen(false);
    setDownloading(true);
    try {
      const infoUrl = isAdmin ? '/api/admin/extension' : '/api/me/extension';
      const res = await fetch(infoUrl, { credentials: 'include' });
      const info = res.ok ? await res.json() : null;
      if (!info?.available) {
        toast({ variant: 'destructive', title: 'Indisponível', description: 'Nenhum arquivo de extensão foi publicado ainda.' });
      } else if (!isAdmin && !info.unlocked) {
        toast({ variant: 'destructive', title: 'Download bloqueado', description: 'Adquira e ative uma key para liberar o download da extensão.' });
      } else {
        window.location.href = isAdmin ? '/api/admin/extension/download' : '/api/me/extension/download';
      }
    } catch {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível verificar o arquivo. Tente novamente.' });
    } finally {
      setDownloading(false);
    }
  };

  const navItems = isAdmin ? [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/usuarios', label: 'Usuários', icon: Users },
    { href: '/admin/keys', label: 'Keys', icon: Key },
  ] : [
    { href: '/painel', label: 'Minhas Keys', icon: Key },
    { href: '/planos', label: 'Planos e Preços', icon: ShoppingCart },
  ];

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.setQueryData(getGetSessionQueryKey(), null);
        window.location.href = import.meta.env.BASE_URL + 'login';
      }
    });
  };

  const NavLinks = () => (
    <>
      <div className="flex flex-col gap-2 p-4">
        {navItems.map((item) => {
          const active = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <div 
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-200 cursor-pointer
                ${active 
                  ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}
                onClick={() => setOpen(false)}
              >
                <item.icon className="w-4 h-4" />
                <span className="font-medium text-sm">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
      <div className="px-4 pb-4">
          <Button
            className="w-full h-11 font-bold tracking-wide uppercase text-xs bg-gradient-to-r from-primary to-blue-500 hover:from-primary/90 hover:to-blue-500/90 shadow-lg shadow-primary/30 animate-in fade-in"
            onClick={handleDownloadExtension}
            disabled={downloading}
          >
            <Download className="w-4 h-4 mr-2" />
            Baixar Extensão
          </Button>
        </div>
    </>
  );

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-white/10 bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <Logo className="w-8 h-8 rounded-md" iconClassName="w-4 h-4" />
          <span className="font-bold tracking-tight">LVB Sônico</span>
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-foreground">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 bg-background border-r border-white/10">
            <div className="p-6 border-b border-white/10 flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-primary/20 flex items-center justify-center border border-primary/30">
                <ShieldAlert className="w-4 h-4 text-primary" />
              </div>
              <span className="font-bold tracking-tight text-lg">LVB Sônico</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavLinks />
            </div>
            <div className="p-4 mt-auto border-t border-white/10">
              <div className="flex items-center gap-3 px-3 py-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                  <span className="text-xs font-bold">{session?.name?.[0]?.toUpperCase()}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium leading-none">{session?.name}</span>
                  <span className="text-xs text-muted-foreground mt-1">{session?.role === 'admin' ? 'Administrador' : 'Cliente'}</span>
                </div>
              </div>
              <Button variant="outline" className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-500/10 border-white/5" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                Sair
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-white/10 bg-card/30 backdrop-blur-xl shrink-0 sticky top-0 h-screen">
        <div className="p-6 border-b border-white/10 flex items-center gap-3">
          <Logo className="w-8 h-8 rounded-md" iconClassName="w-4 h-4" />
          <span className="font-bold tracking-tight text-lg">LVB Sônico</span>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4">
          <NavLinks />
        </div>

        <div className="p-4 mt-auto border-t border-white/10 bg-card/50">
          <div className="flex items-center gap-3 px-2 mb-4">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center border border-white/10">
              <span className="text-sm font-bold text-foreground">{session?.name?.[0]?.toUpperCase()}</span>
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-medium truncate text-foreground">{session?.name}</span>
              <span className="text-xs text-muted-foreground truncate">{session?.email}</span>
            </div>
          </div>
          <Button variant="outline" className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-500/10 border-white/5 transition-all" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Sair
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-4 md:p-8 animate-in fade-in zoom-in-95 duration-300">
          <img
            src={`${import.meta.env.BASE_URL}brand/banner.png`}
            alt="Sejam bem-vindos — LVB Sônico"
            className="w-full h-auto rounded-xl border border-white/10 shadow-lg shadow-primary/10 mb-6"
          />
          {children}
        </div>
      </main>
    </div>
  );
}
