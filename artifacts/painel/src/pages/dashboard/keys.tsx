import { useState, useMemo } from 'react';
import { 
  useGetKeys, 
  useGenerateKeys, 
  useRevokeKey, 
  useResetKeyDevice, 
  useDeleteKey,
  useGetUsers,
  useGetManagers,
  useGetSession,
  getGetKeysQueryKey,
  getGetAdminStatsQueryKey
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, MoreHorizontal, Copy, ShieldAlert, MonitorSmartphone, PowerOff, Trash2, Key, Search, Plus, Check, ArrowRightLeft, UserCheck, UserX } from 'lucide-react';
import { formatDate, planLabels, statusLabels, formatTimeLeft } from '@/lib/format';

const PAID_PLANS = ['daily', 'weekly', 'monthly', 'lifetime'] as const;

const planColor: Record<string, string> = {
  trial:    'bg-slate-500/15 text-slate-400 border-slate-500/25',
  daily:    'bg-sky-500/15 text-sky-400 border-sky-500/25',
  weekly:   'bg-violet-500/15 text-violet-400 border-violet-500/25',
  monthly:  'bg-blue-500/15 text-blue-400 border-blue-500/25',
  lifetime: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
};

const statusColor: Record<string, string> = {
  active:   'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  inactive: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  expired:  'bg-red-500/15 text-red-400 border-red-500/25',
  revoked:  'bg-slate-500/15 text-slate-400 border-slate-500/25',
};

export default function AdminKeys() {
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  
  const { data: session } = useGetSession();
  const isAdmin = session?.role === 'admin';
  const isManager = session?.role === 'manager';
  const canCreatePaidKeys = isAdmin || (isManager && !!(session as any)?.canCreateKeys);

  const queryParams: any = {};
  if (planFilter !== 'all') queryParams.plan = planFilter;
  if (statusFilter !== 'all') queryParams.status = statusFilter;

  const { data: keys, isLoading } = useGetKeys(queryParams);
  const { data: users } = useGetUsers({ status: 'approved' });
  const { data: managers } = useGetManagers();

  const assignableUsers = useMemo(() => {
    const clients = (users ?? []).map((u: any) => ({ ...u, role: 'client' }));
    const mgrs = (managers ?? []).map((u: any) => ({ ...u, role: 'manager' }));
    return [...clients, ...mgrs];
  }, [users, managers]);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const generateMutation = useGenerateKeys();
  const revokeMutation = useRevokeKey();
  const resetMutation = useResetKeyDevice();
  const deleteMutation = useDeleteKey();

  const [transferKeyId, setTransferKeyId] = useState<string | null>(null);
  const [transferEmail, setTransferEmail] = useState('');
  const [transferring, setTransferring] = useState(false);

  const transferTarget = useMemo(() => {
    const q = transferEmail.toLowerCase().trim();
    if (!q || !users) return null;
    return users.find((u: any) => u.email.toLowerCase() === q) ?? null;
  }, [transferEmail, users]);

  const [genPlan, setGenPlan] = useState<string>('monthly');
  const [genQty, setGenQty] = useState<string>('1');
  const [genUser, setGenUser] = useState<string>('none');
  const [generatedKeysResult, setGeneratedKeysResult] = useState<{code: string}[] | null>(null);

  const refreshCache = () => {
    queryClient.invalidateQueries({ queryKey: getGetKeysQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    toast({ title: 'Key copiada!' });
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleGenerate = () => {
    const qty = parseInt(genQty, 10);
    if (isNaN(qty) || qty < 1 || qty > 500) {
      toast({ variant: 'destructive', title: 'Quantidade inválida', description: 'Gere entre 1 e 500 keys.' });
      return;
    }
    const effectivePlan = canCreatePaidKeys ? genPlan : 'trial';
    generateMutation.mutate({
      data: { plan: effectivePlan as any, quantity: qty, userEmail: genUser !== 'none' ? genUser : null }
    }, {
      onSuccess: (data) => { toast({ title: `${data.length} keys geradas!` }); setGeneratedKeysResult(data); refreshCache(); },
      onError: (err: any) => toast({ variant: 'destructive', title: 'Erro ao gerar keys', description: err.data?.error }),
    });
  };

  const handleTransfer = async () => {
    if (!transferKeyId || !transferTarget) return;
    setTransferring(true);
    try {
      const res = await fetch(`/api/admin/keys/${transferKeyId}/transfer`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: transferTarget.email }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ variant: 'destructive', title: 'Erro', description: data.error }); return; }
      toast({ title: 'Key transferida', description: `Agora pertence a ${transferTarget.name}.` });
      setTransferKeyId(null); setTransferEmail(''); refreshCache();
    } catch {
      toast({ variant: 'destructive', title: 'Erro de conexão. Tente novamente.' });
    } finally { setTransferring(false); }
  };

  const handleAction = (id: string, action: 'revoke' | 'reset' | 'delete') => {
    const mutations = { revoke: revokeMutation, reset: resetMutation, delete: deleteMutation };
    if (action === 'delete' && !confirm('Deletar permanentemente esta key?')) return;
    mutations[action].mutate({ id }, {
      onSuccess: () => { toast({ title: `Ação (${action}) concluída.` }); refreshCache(); },
      onError: (err: any) => toast({ variant: 'destructive', title: 'Erro', description: err.data?.error }),
    });
  };

  const filteredKeys = useMemo(() => {
    if (!keys) return [];
    const q = search.toLowerCase();
    return keys.filter((k: any) =>
      k.code.toLowerCase().includes(q) ||
      (k.userEmail && k.userEmail.toLowerCase().includes(q)) ||
      (k.customerName && k.customerName.toLowerCase().includes(q)) ||
      (k.customerEmail && k.customerEmail.toLowerCase().includes(q))
    );
  }, [keys, search]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Licenças</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {keys ? `${keys.length} licença${keys.length !== 1 ? 's' : ''} no sistema` : 'Carregando...'}
          </p>
        </div>

        <Dialog open={isGenerateOpen} onOpenChange={(open) => { setIsGenerateOpen(open); if (!open) setGeneratedKeysResult(null); }}>
          <DialogTrigger asChild>
            <Button className="font-semibold bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20">
              <Plus className="w-4 h-4 mr-2" /> Gerar Keys
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-panel border-white/10 sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Gerador de Licenças</DialogTitle>
              <DialogDescription>Crie keys soltas ou atribua diretamente a um cliente.</DialogDescription>
            </DialogHeader>

            {generatedKeysResult ? (
              <div className="py-4 space-y-3">
                <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 p-3 text-center">
                  <p className="font-semibold text-emerald-400">{generatedKeysResult.length} keys geradas com sucesso!</p>
                </div>
                <div className="max-h-52 overflow-y-auto space-y-1.5 p-2 rounded-md bg-black/40 border border-white/5">
                  {generatedKeysResult.map((k, i) => (
                    <div key={i} className="flex items-center justify-between bg-white/5 px-3 py-2 rounded border border-white/5">
                      <span className="font-mono text-sm tracking-wider">{k.code}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-white/10" onClick={() => copyToClipboard(k.code)}>
                        {copiedKey === k.code ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-4 space-y-4">
                {isManager && !canCreatePaidKeys && (
                  <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-sm text-amber-400">
                    <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>Você só pode gerar keys de <strong>Teste</strong>. Solicite ao administrador a permissão para keys pagas.</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase text-muted-foreground tracking-wider font-semibold">Plano</label>
                    <Select value={canCreatePaidKeys ? genPlan : 'trial'} onValueChange={(v) => { if (canCreatePaidKeys) setGenPlan(v); }} disabled={!canCreatePaidKeys}>
                      <SelectTrigger className="bg-black/20 border-white/10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {canCreatePaidKeys
                          ? Object.entries(planLabels).map(([val, label]) => <SelectItem key={val} value={val}>{label}</SelectItem>)
                          : <SelectItem value="trial">{planLabels['trial']}</SelectItem>}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase text-muted-foreground tracking-wider font-semibold">Quantidade</label>
                    <Input type="number" min="1" max="500" value={genQty} onChange={e => setGenQty(e.target.value)} className="bg-black/20 border-white/10" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs uppercase text-muted-foreground tracking-wider font-semibold">Atribuir ao Cliente (Opcional)</label>
                  <Select value={genUser} onValueChange={setGenUser}>
                    <SelectTrigger className="bg-black/20 border-white/10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não atribuir (key solta)</SelectItem>
                      {assignableUsers.map(u => (
                        <SelectItem key={u.email} value={u.email}>
                          {u.name} ({u.email}){u.role === 'manager' ? ' — Gerente' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsGenerateOpen(false)} className="border-white/10">{generatedKeysResult ? 'Fechar' : 'Cancelar'}</Button>
              {!generatedKeysResult && (
                <Button onClick={handleGenerate} disabled={generateMutation.isPending}>
                  {generateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Gerar
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar key, e-mail, cliente..."
            className="pl-9 bg-black/20 border-white/10 focus-visible:ring-primary font-mono text-sm h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="w-[150px] bg-black/20 border-white/10 h-9"><SelectValue placeholder="Plano" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os planos</SelectItem>
            <SelectItem value="trial">Teste</SelectItem>
            <SelectItem value="daily">Diário</SelectItem>
            <SelectItem value="weekly">Semanal</SelectItem>
            <SelectItem value="monthly">Mensal</SelectItem>
            <SelectItem value="lifetime">Vitalício</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] bg-black/20 border-white/10 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="inactive">Inativas</SelectItem>
            <SelectItem value="active">Ativas</SelectItem>
            <SelectItem value="expired">Expiradas</SelectItem>
            <SelectItem value="revoked">Revogadas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Keys list */}
      <Card className="glass-panel border-white/10 overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-7 h-7 text-primary animate-spin" />
            </div>
          ) : filteredKeys.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Key className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm">Nenhuma licença encontrada.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {filteredKeys.map((key: any) => {
                const effectiveStatus = key.status;
                return (
                  <div key={key.id} className="flex items-center gap-4 px-4 py-3 hover:bg-white/[0.02] transition-colors group">
                    {/* Key code + copy */}
                    <div className="flex items-center gap-2 min-w-0 w-52 shrink-0">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(key.code)}
                        title="Copiar key completa"
                        className="flex items-center gap-1.5 font-mono text-xs tracking-wider text-foreground/80 bg-black/30 border border-white/5 rounded px-2 py-1.5 hover:border-primary/40 hover:text-primary transition-colors truncate max-w-full"
                      >
                        <span className="truncate">{key.code.substring(0, 16)}…</span>
                        {copiedKey === key.code
                          ? <Check className="w-3 h-3 shrink-0 text-emerald-400" />
                          : <Copy className="w-3 h-3 shrink-0 opacity-40 group-hover:opacity-100" />}
                      </button>
                    </div>

                    {/* Plan badge */}
                    <Badge className={`shrink-0 text-[11px] font-medium border ${planColor[key.plan] ?? planColor.trial}`}>
                      {(planLabels[key.plan] ?? key.plan).split('—')[0].trim()}
                    </Badge>

                    {/* Status badge */}
                    <Badge className={`shrink-0 text-[11px] font-medium border ${statusColor[effectiveStatus] ?? 'bg-slate-500/15 text-slate-400 border-slate-500/25'}`}>
                      {statusLabels[effectiveStatus] ?? effectiveStatus}
                    </Badge>

                    {/* Owner */}
                    <div className="flex-1 min-w-0">
                      {key.userEmail ? (
                        <div className="flex flex-col">
                          <span className="text-sm text-foreground/80 truncate">{key.userEmail}</span>
                          {(key.customerName || key.customerEmail) && (
                            <span className="text-xs text-muted-foreground truncate">
                              {key.customerName}{key.customerName && key.customerEmail ? ' · ' : ''}{key.customerEmail}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Não atribuída</span>
                      )}
                    </div>

                    {/* HWID */}
                    <div className="hidden lg:flex items-center gap-1.5 w-24 shrink-0">
                      {key.deviceFingerprint ? (
                        <>
                          <MonitorSmartphone className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span className="font-mono text-xs text-foreground/60 truncate">{key.deviceFingerprint.substring(0, 8)}</span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">Livre</span>
                      )}
                    </div>

                    {/* Expiry */}
                    <div className="hidden md:block w-28 shrink-0 text-right">
                      <span className="font-mono text-xs text-muted-foreground">
                        {effectiveStatus === 'active' ? formatTimeLeft(key.expiresAt) : '—'}
                      </span>
                    </div>

                    {/* Actions */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="glass-panel border-white/10 min-w-[180px]">
                        {isAdmin && (
                          <DropdownMenuItem onClick={() => { setTransferKeyId(key.id); setTransferEmail(''); }} className="text-primary hover:text-primary hover:bg-primary/10 cursor-pointer">
                            <ArrowRightLeft className="mr-2 h-4 w-4" /> Transferir
                          </DropdownMenuItem>
                        )}
                        {effectiveStatus !== 'revoked' && (
                          <DropdownMenuItem onClick={() => handleAction(key.id, 'revoke')} className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 cursor-pointer">
                            <PowerOff className="mr-2 h-4 w-4" /> Revogar
                          </DropdownMenuItem>
                        )}
                        {key.deviceFingerprint && (
                          <DropdownMenuItem onClick={() => handleAction(key.id, 'reset')} className="hover:bg-white/5 cursor-pointer">
                            <MonitorSmartphone className="mr-2 h-4 w-4" /> Resetar HWID
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator className="bg-white/10" />
                        <DropdownMenuItem onClick={() => handleAction(key.id, 'delete')} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer">
                          <Trash2 className="mr-2 h-4 w-4" /> Deletar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
        {filteredKeys.length > 0 && (
          <CardHeader className="border-t border-white/5 py-2 px-4">
            <p className="text-xs text-muted-foreground">{filteredKeys.length} resultado{filteredKeys.length !== 1 ? 's' : ''}</p>
          </CardHeader>
        )}
      </Card>

      {/* Transfer dialog (admin only) */}
      <Dialog open={transferKeyId !== null} onOpenChange={(o) => { if (!o) { setTransferKeyId(null); setTransferEmail(''); } }}>
        <DialogContent className="glass-panel border-white/10 sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ArrowRightLeft className="w-4 h-4 text-primary" /> Transferir Key</DialogTitle>
            <DialogDescription>Atribua esta licença a outro usuário ou gerente cadastrado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="E-mail do destinatário" className="pl-9 bg-black/20 border-white/10 focus-visible:ring-primary" value={transferEmail} onChange={(e) => setTransferEmail(e.target.value)} autoComplete="off" />
            </div>
            {transferEmail.trim().length > 3 && (
              transferTarget ? (
                <div className={`rounded-lg border px-3 py-2.5 ${transferTarget.status === 'approved' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
                  <div className="flex items-center gap-2">
                    {transferTarget.status === 'approved' ? <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" /> : <UserX className="w-4 h-4 text-amber-400 shrink-0" />}
                    <span className="font-medium text-sm">{transferTarget.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{(transferTarget as any).role === 'manager' ? 'Gerente' : 'Cliente'}</span>
                  </div>
                  <p className="text-xs text-muted-foreground pl-6 mt-0.5">{transferTarget.email}</p>
                  {transferTarget.status !== 'approved' && <p className="text-xs text-amber-400 pl-6 mt-1">Cadastro não aprovado.</p>}
                </div>
              ) : (
                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 flex items-center gap-2 text-muted-foreground text-sm">
                  <UserX className="w-4 h-4" /> E-mail não encontrado
                </div>
              )
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-white/10" onClick={() => { setTransferKeyId(null); setTransferEmail(''); }}>Cancelar</Button>
            <Button disabled={!transferTarget || transferTarget.status !== 'approved' || transferring} onClick={handleTransfer}>
              {transferring ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Transferindo...</> : <><ArrowRightLeft className="w-4 h-4 mr-2" /> Confirmar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
