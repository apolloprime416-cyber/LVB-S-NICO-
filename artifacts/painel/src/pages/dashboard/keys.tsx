import { useState, useMemo } from 'react';
import { 
  useGetKeys, 
  useGenerateKeys, 
  useRevokeKey, 
  useResetKeyDevice, 
  useDeleteKey,
  useGetUsers,
  useGetSession,
  getGetKeysQueryKey,
  getGetAdminStatsQueryKey
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, MoreVertical, Copy, ShieldAlert, MonitorSmartphone, PowerOff, Trash2, Key, Search, Plus, Check } from 'lucide-react';
import { formatDate, planLabels, statusLabels, formatTimeLeft } from '@/lib/format';

// Plans that require the "canCreateKeys" permission for managers
const PAID_PLANS = ['daily', 'weekly', 'monthly', 'lifetime'] as const;

export default function AdminKeys() {
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  
  // Session: determines which plans are available in the generator
  const { data: session } = useGetSession();
  const isAdmin = session?.role === 'admin';
  const isManager = session?.role === 'manager';
  const canCreatePaidKeys = isAdmin || (isManager && !!(session as any)?.canCreateKeys);

  // Filters for the query
  const queryParams: any = {};
  if (planFilter !== 'all') queryParams.plan = planFilter;
  if (statusFilter !== 'all') queryParams.status = statusFilter;

  const { data: keys, isLoading } = useGetKeys(queryParams);
  const { data: users } = useGetUsers({ status: 'approved' }); // For assigning keys
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const generateMutation = useGenerateKeys();
  const revokeMutation = useRevokeKey();
  const resetMutation = useResetKeyDevice();
  const deleteMutation = useDeleteKey();

  // Default plan: if manager without permission, start with trial; otherwise monthly
  const [genPlan, setGenPlan] = useState<string>(() => 'monthly');
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
    toast({ title: 'Copiado para a área de transferência' });
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleGenerate = () => {
    const qty = parseInt(genQty, 10);
    if (isNaN(qty) || qty < 1 || qty > 500) {
      toast({ variant: 'destructive', title: 'Quantidade inválida', description: 'Gere entre 1 e 500 keys.' });
      return;
    }
    // Ensure managers without paid-key permission always send 'trial'
    const effectivePlan = canCreatePaidKeys ? genPlan : 'trial';
    
    generateMutation.mutate({
      data: {
        plan: effectivePlan as any,
        quantity: qty,
        userEmail: genUser !== 'none' ? genUser : null
      }
    }, {
      onSuccess: (data) => {
        toast({ title: `${data.length} keys geradas com sucesso!` });
        setGeneratedKeysResult(data);
        refreshCache();
      },
      onError: (err: any) => {
        toast({ variant: 'destructive', title: 'Erro ao gerar keys', description: err.data?.error });
      }
    });
  };

  const handleAction = (id: string, action: 'revoke' | 'reset' | 'delete') => {
    const mutations = {
      revoke: revokeMutation,
      reset: resetMutation,
      delete: deleteMutation
    };
    
    if (action === 'delete' && !confirm('Deletar permanentemente esta key?')) return;
    
    mutations[action].mutate({ id }, {
      onSuccess: () => {
        toast({ title: `Ação (${action}) concluída com sucesso.` });
        refreshCache();
      },
      onError: (err: any) => {
        toast({ variant: 'destructive', title: 'Erro na ação', description: err.data?.error });
      }
    });
  };

  const filteredKeys = useMemo(() => {
    if (!keys) return [];
    const q = search.toLowerCase();
    return keys.filter((k: any) =>
      k.code.toLowerCase().includes(q) ||
      (k.userEmail && k.userEmail.toLowerCase().includes(q)) ||
      (k.customerName && k.customerName.toLowerCase().includes(q)) ||
      (k.customerEmail && k.customerEmail.toLowerCase().includes(q)) ||
      (k.customerPhone && k.customerPhone.toLowerCase().includes(q))
    );
  }, [keys, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Gestão de Licenças</h1>
          <p className="text-muted-foreground mt-1">Gere, revogue e monitore keys do sistema</p>
        </div>
        
        <Dialog open={isGenerateOpen} onOpenChange={(open) => {
          setIsGenerateOpen(open);
          if(!open) setGeneratedKeysResult(null);
        }}>
          <DialogTrigger asChild>
            <Button className="font-semibold shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus className="w-4 h-4 mr-2" />
              Gerar Keys
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-panel border-white/10 sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Gerador de Licenças</DialogTitle>
              <DialogDescription>
                Crie novas keys soltas ou atribua diretamente a um cliente.
              </DialogDescription>
            </DialogHeader>
            
            {generatedKeysResult ? (
              <div className="py-4 space-y-4">
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-md text-center">
                  <ShieldAlert className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  <h4 className="font-bold text-emerald-400">Keys Geradas com Sucesso</h4>
                </div>
                <div className="max-h-60 overflow-y-auto space-y-2 p-2 bg-black/40 rounded-md border border-white/5">
                  {generatedKeysResult.map((k, i) => (
                    <div key={i} className="flex items-center justify-between bg-white/5 p-2 rounded border border-white/5">
                      <span className="font-mono text-sm tracking-wider text-primary-foreground">{k.code}</span>
                      <Button variant="ghost" size="sm" className="h-7 hover:bg-white/10" onClick={() => copyToClipboard(k.code)}>
                        {copiedKey === k.code ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-4 space-y-4">
                {/* Notice for managers without paid-key permission */}
                {isManager && !canCreatePaidKeys && (
                  <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-sm text-amber-400">
                    <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>Você só pode gerar keys de <strong>Teste</strong>. Peça ao administrador para ativar a permissão de gerar keys pagas.</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs uppercase text-muted-foreground tracking-wider font-semibold">Plano</label>
                    <Select
                      value={canCreatePaidKeys ? genPlan : 'trial'}
                      onValueChange={(v) => { if (canCreatePaidKeys) setGenPlan(v); }}
                      disabled={!canCreatePaidKeys}
                    >
                      <SelectTrigger className="bg-black/20 border-white/10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Managers without permission: only trial */}
                        {canCreatePaidKeys ? (
                          Object.entries(planLabels).map(([val, label]) => (
                            <SelectItem key={val} value={val}>{label}</SelectItem>
                          ))
                        ) : (
                          <SelectItem value="trial">{planLabels['trial']}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs uppercase text-muted-foreground tracking-wider font-semibold">Quantidade</label>
                    <Input 
                      type="number" 
                      min="1" max="500" 
                      value={genQty} 
                      onChange={e => setGenQty(e.target.value)} 
                      className="bg-black/20 border-white/10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase text-muted-foreground tracking-wider font-semibold">Atribuir ao Cliente (Opcional)</label>
                  <Select value={genUser} onValueChange={setGenUser}>
                    <SelectTrigger className="bg-black/20 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não atribuir (Key solta)</SelectItem>
                      {users?.filter(u => u.role === 'client' || u.role === 'manager').map(u => (
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
              <Button variant="outline" onClick={() => setIsGenerateOpen(false)} className="border-white/10">
                {generatedKeysResult ? 'Fechar' : 'Cancelar'}
              </Button>
              {!generatedKeysResult && (
                <Button onClick={handleGenerate} disabled={generateMutation.isPending}>
                  {generateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Gerar Keys
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="glass-panel border-white/10">
        <CardHeader className="border-b border-white/5 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por key, revendedor, nome, e-mail ou telefone..." 
              className="pl-9 bg-black/20 border-white/10 focus-visible:ring-primary font-mono text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-[180px] bg-black/20 border-white/10">
                <SelectValue placeholder="Plano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Planos</SelectItem>
                <SelectItem value="trial">Teste 15 min</SelectItem>
                <SelectItem value="daily">Diário</SelectItem>
                <SelectItem value="weekly">Semanal</SelectItem>
                <SelectItem value="monthly">Mensal</SelectItem>
                <SelectItem value="lifetime">Vitalício</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px] bg-black/20 border-white/10">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="inactive">Inativas</SelectItem>
                <SelectItem value="active">Ativas</SelectItem>
                <SelectItem value="expired">Expiradas</SelectItem>
                <SelectItem value="revoked">Revogadas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : filteredKeys.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Key className="w-12 h-12 mb-4 opacity-20" />
              <p>Nenhuma licença encontrada.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-white/[0.02]">
                  <TableRow className="border-white/5 hover:bg-transparent">
                    <TableHead className="font-semibold">Key / Licença</TableHead>
                    <TableHead className="font-semibold">Plano</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Conta (revendedor)</TableHead>
                    <TableHead className="font-semibold">Cliente final</TableHead>
                    <TableHead className="font-semibold">Dispositivo HWID</TableHead>
                    <TableHead className="font-semibold">Expira em</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredKeys.map((key) => (
                    <TableRow key={key.id} className="border-white/5 hover:bg-white/[0.02] transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-2 group">
                          <span className="font-mono text-sm text-primary-foreground tracking-wider bg-black/40 px-2 py-1 rounded border border-white/5">
                            {key.code.substring(0, 14)}...
                          </span>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 hover:bg-white/10"
                            onClick={() => copyToClipboard(key.code)}
                            title="Copiar Key Completa"
                          >
                            {copiedKey === key.code ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">{(planLabels[key.plan] ?? key.plan ?? '-').split('—')[0].trim()}</span>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          className={
                            key.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                            key.status === 'inactive' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                            key.status === 'expired' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                            'bg-slate-500/10 text-slate-400 border-slate-500/20'
                          }
                        >
                          {statusLabels[key.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {key.userEmail ? (
                          <span className="text-sm text-foreground/80 truncate max-w-[150px] inline-block" title={key.userEmail}>
                            {key.userEmail}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic tracking-wider uppercase">Não atribuída</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {(key as any).customerName || (key as any).customerEmail || (key as any).customerPhone ? (
                          <div className="flex flex-col max-w-[180px]">
                            {(key as any).customerName && <span className="text-sm text-foreground/90 truncate" title={(key as any).customerName}>{(key as any).customerName}</span>}
                            {(key as any).customerEmail && <span className="text-xs text-muted-foreground truncate" title={(key as any).customerEmail}>{(key as any).customerEmail}</span>}
                            {(key as any).customerPhone && <span className="text-xs text-muted-foreground truncate" title={(key as any).customerPhone}>{(key as any).customerPhone}</span>}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {key.deviceFingerprint ? (
                          <div className="flex items-center gap-1.5 text-sm text-foreground/80 font-mono" title={key.deviceFingerprint}>
                            <MonitorSmartphone className="w-3.5 h-3.5 text-primary" />
                            {key.deviceFingerprint.substring(0, 8)}...
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {key.status === 'active' ? formatTimeLeft(key.expiresAt) : '-'}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="glass-panel border-white/10 min-w-[180px]">
                            {key.status !== 'revoked' && (
                              <DropdownMenuItem onClick={() => handleAction(key.id, 'revoke')} className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 cursor-pointer">
                                <PowerOff className="mr-2 h-4 w-4" /> Revogar Licença
                              </DropdownMenuItem>
                            )}
                            {key.deviceFingerprint && (
                              <DropdownMenuItem onClick={() => handleAction(key.id, 'reset')} className="hover:bg-white/5 cursor-pointer">
                                <MonitorSmartphone className="mr-2 h-4 w-4" /> Resetar HWID
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator className="bg-white/10" />
                            <DropdownMenuItem onClick={() => handleAction(key.id, 'delete')} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer">
                              <Trash2 className="mr-2 h-4 w-4" /> Deletar Definitivo
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
