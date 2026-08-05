import { useRef, useState, useEffect } from 'react';
import { useGetAdminStats } from '@workspace/api-client-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, Key, Clock, AlertTriangle, ShieldCheck, Activity, UserPlus, Fingerprint, Package, Upload } from 'lucide-react';
import { format } from 'date-fns';

interface ExtensionInfo {
  available: boolean;
  filename: string | null;
  size: number | null;
  updatedAt: string | null;
}

function formatBytes(size: number | null): string {
  if (!size) return '-';
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function ExtensionFileCard() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<ExtensionInfo | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadInfo = () => {
    fetch('/api/admin/extension', { credentials: 'include' })
      .then(r => r.json())
      .then(setInfo)
      .catch(() => setInfo(null));
  };
  useEffect(loadInfo, []);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const res = await fetch('/api/admin/extension', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/zip', 'X-Filename': file.name },
        body: file,
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setInfo(data);
      toast({ title: 'Arquivo atualizado', description: 'Os clientes com key paga já podem baixar esta versão.' });
    } catch {
      toast({ variant: 'destructive', title: 'Erro no envio', description: 'Não foi possível enviar o arquivo. Tente novamente.' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Card className="glass-panel border-white/10">
      <CardHeader className="border-b border-white/5 pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          Arquivo da Extensão
        </CardTitle>
        <CardDescription className="text-xs">
          Este é o arquivo que os clientes baixam no painel. O download só é liberado para quem possui uma key paga.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6 space-y-4">
        {info?.available ? (
          <div className="flex items-center justify-between rounded-md border border-white/10 bg-black/30 px-4 py-3">
            <div className="min-w-0">
              <p className="font-mono text-sm text-foreground truncate">{info.filename}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatBytes(info.size)}{info.updatedAt ? ` • atualizado em ${format(new Date(info.updatedAt), 'dd/MM/yyyy HH:mm')}` : ''}
              </p>
            </div>
            <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1 shrink-0 ml-3">Disponível</span>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-white/10 bg-black/20 px-4 py-6 text-center text-sm text-muted-foreground">
            Nenhum arquivo enviado ainda. Envie o zip da extensão para liberar o download aos clientes.
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
          }}
        />
        <Button className="w-full" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
          {info?.available ? 'Substituir arquivo (.zip)' : 'Enviar arquivo (.zip)'}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const { data: stats, isLoading } = useGetAdminStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Command Center</h1>
        <p className="text-muted-foreground mt-1">Visão geral do sistema em tempo real</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI Cards */}
        <Card className="glass-panel border-white/10 shadow-lg relative overflow-hidden group">
          <div className="absolute right-0 top-0 w-24 h-24 bg-primary/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 relative z-10">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Usuários Totais</CardTitle>
            <Users className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-bold font-mono">{stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              {stats.approvedUsers} aprovados
            </p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-white/10 shadow-lg relative overflow-hidden group">
          <div className="absolute right-0 top-0 w-24 h-24 bg-amber-500/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 relative z-10">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Cadastros Pendentes</CardTitle>
            <UserPlus className="w-4 h-4 text-amber-400" />
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-bold font-mono text-amber-400">{stats.pendingUsers}</div>
            <p className="text-xs text-muted-foreground mt-1">Aguardando aprovação</p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-white/10 shadow-lg relative overflow-hidden group">
          <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-500/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 relative z-10">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Keys Ativas</CardTitle>
            <Activity className="w-4 h-4 text-emerald-400" />
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-bold font-mono text-emerald-400">{stats.activeKeys}</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Key className="w-3 h-3" />
              De {stats.totalKeys} keys totais
            </p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-white/10 shadow-lg relative overflow-hidden group">
          <div className="absolute right-0 top-0 w-24 h-24 bg-red-500/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 relative z-10">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Inativas/Expiradas</CardTitle>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-bold font-mono text-red-400">
              {stats.inactiveKeys + stats.expiredKeys + stats.revokedKeys}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.inactiveKeys} Inat. • {stats.expiredKeys} Exp. • {stats.revokedKeys} Rev.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <Card className="glass-panel border-white/10">
          <CardHeader className="border-b border-white/5 pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Fingerprint className="w-5 h-5 text-primary" />
              Distribuição por Plano
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            {Object.entries(stats.planCounts).map(([plan, count]) => {
              const total = stats.totalKeys || 1; // prevent div by 0
              const percentage = Math.round((count / total) * 100);
              const labels: Record<string, string> = {
                trial: 'Teste 15 min',
                daily: 'Diário',
                weekly: 'Semanal',
                monthly: 'Mensal',
                lifetime: 'Vitalício'
              };
              return (
                <div key={plan} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-foreground">{labels[plan]}</span>
                    <span className="font-mono text-muted-foreground">{count} ({percentage}%)</span>
                  </div>
                  <div className="h-2 bg-black/40 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-1000 ease-out"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
        
        <Card className="glass-panel border-white/10 flex flex-col items-center justify-center py-12 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(14,165,233,0.1),transparent_70%)] pointer-events-none" />
          <Clock className="w-12 h-12 text-primary/40 mb-4" />
          <h3 className="text-2xl font-bold font-mono tracking-widest text-foreground/80">
            {format(new Date(), 'HH:mm:ss')}
          </h3>
          <p className="text-sm text-muted-foreground mt-2 uppercase tracking-widest">
            {format(new Date(), 'dd MMM yyyy')}
          </p>
          <div className="mt-8 flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium uppercase tracking-wider">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Sistemas Operacionais
          </div>
        </Card>
      </div>

      <ExtensionFileCard />
    </div>
  );
}
