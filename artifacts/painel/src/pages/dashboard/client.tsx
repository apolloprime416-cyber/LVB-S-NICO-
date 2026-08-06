import { useState } from 'react';
import { useGetMyKeys, useResetMyKeyDevice, useGenerateTrial, useUpdateMyKeyCustomer, getGetMyKeysQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import PlansSection from '@/components/PlansSection';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { planLabels, statusLabels, formatTimeLeft } from '@/lib/format';
import { Loader2, Key as KeyIcon, Clock, ShieldAlert, MonitorSmartphone, Plus, Copy, Check, UserRound, Pencil, Search as SearchIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const statusColor: Record<string, string> = {
  active:   'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  inactive: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  expired:  'bg-red-500/20 text-red-400 border-red-500/30',
  revoked:  'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

export default function PainelClient() {
  const { data: keys, isLoading } = useGetMyKeys();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const resetDeviceMutation = useResetMyKeyDevice();
  const generateTrialMutation = useGenerateTrial();
  const updateCustomerMutation = useUpdateMyKeyCustomer();

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Trial generation dialog
  const [isTrialOpen, setIsTrialOpen] = useState(false);
  const [trialName, setTrialName] = useState('');
  const [trialEmail, setTrialEmail] = useState('');
  const [trialPhone, setTrialPhone] = useState('');

  // Customer edit dialog
  const [editKeyId, setEditKeyId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');

  const openEditCustomer = (key: any) => {
    setEditKeyId(key.id);
    setEditName(key.customerName || '');
    setEditEmail(key.customerEmail || '');
    setEditPhone(key.customerPhone || '');
  };

  const handleSaveCustomer = () => {
    if (!editKeyId) return;
    updateCustomerMutation.mutate({ id: editKeyId, data: { customerName: editName || null, customerEmail: editEmail || null, customerPhone: editPhone || null } }, {
      onSuccess: () => {
        toast({ title: 'Cliente salvo' });
        setEditKeyId(null);
        queryClient.invalidateQueries({ queryKey: getGetMyKeysQueryKey() });
      },
      onError: (err: any) => toast({ variant: 'destructive', title: 'Erro ao salvar', description: err.data?.error }),
    });
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedKey(code);
    toast({ title: 'Key copiada!', description: 'Cole o código na extensão para usar.' });
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleResetDevice = (id: string) => {
    resetDeviceMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: 'Dispositivo resetado', description: 'Você pode usar esta key em outro navegador/PC.' });
        queryClient.invalidateQueries({ queryKey: getGetMyKeysQueryKey() });
      },
      onError: (err: any) => toast({ variant: 'destructive', title: 'Erro ao resetar', description: err.data?.error }),
    });
  };

  const handleGenerateTrial = () => {
    generateTrialMutation.mutate({ data: { customerName: trialName || null, customerEmail: trialEmail || null, customerPhone: trialPhone || null } }, {
      onSuccess: () => {
        toast({ title: 'Teste gerado!', description: 'Key de 15 minutos pronta para usar.' });
        setIsTrialOpen(false);
        setTrialName(''); setTrialEmail(''); setTrialPhone('');
        queryClient.invalidateQueries({ queryKey: getGetMyKeysQueryKey() });
      },
      onError: (err: any) => toast({ variant: 'destructive', title: 'Ação não permitida', description: err.data?.error }),
    });
  };

  const hasPaidKeys = keys?.some(k => k.plan !== 'trial' && k.status !== 'revoked');

  const q = search.trim().toLowerCase();
  const filteredKeys = !q
    ? keys
    : keys?.filter((k: any) =>
        (k.customerName || '').toLowerCase().includes(q) ||
        (k.customerEmail || '').toLowerCase().includes(q) ||
        (k.customerPhone || '').toLowerCase().includes(q) ||
        k.code.toLowerCase().includes(q)
      );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Painel do Cliente</h1>
          <p className="text-muted-foreground mt-1">Copie sua key e cole na extensão para começar</p>
        </div>
        <Dialog open={isTrialOpen} onOpenChange={setIsTrialOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              className={`border-white/10 ${!hasPaidKeys ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:border-primary/50'}`}
              disabled={!hasPaidKeys}
              title={!hasPaidKeys ? 'Adquira pelo menos uma key paga para liberar o teste grátis' : 'Gerar teste de 15 min'}
            >
              <Plus className="w-4 h-4 mr-2" />
              Teste Grátis (15 min)
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-panel border-white/10 sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Gerar Teste Grátis (15 min)</DialogTitle>
              <DialogDescription>Identifique para quem é este teste.</DialogDescription>
            </DialogHeader>
            <div className="py-2 space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs uppercase text-muted-foreground tracking-wider font-semibold">Nome do cliente</label>
                <Input placeholder="Ex: João Silva" className="bg-black/20 border-white/10" value={trialName} onChange={(e) => setTrialName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs uppercase text-muted-foreground tracking-wider font-semibold">E-mail do cliente</label>
                <Input type="email" placeholder="cliente@email.com" className="bg-black/20 border-white/10" value={trialEmail} onChange={(e) => setTrialEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs uppercase text-muted-foreground tracking-wider font-semibold">Telefone do cliente</label>
                <Input type="tel" placeholder="(61) 99999-9999" className="bg-black/20 border-white/10" value={trialPhone} onChange={(e) => setTrialPhone(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsTrialOpen(false)} className="border-white/10">Cancelar</Button>
              <Button onClick={handleGenerateTrial} disabled={generateTrialMutation.isPending}>
                {generateTrialMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Gerar Teste
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Plans */}
      <PlansSection />

      {/* My Keys section */}
      <div className="flex items-center gap-4">
        <div className="flex-1 h-px bg-white/8" />
        <span className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Minhas Licenças</span>
        <div className="flex-1 h-px bg-white/8" />
      </div>

      {!hasPaidKeys && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 flex items-start gap-4">
          <ShieldAlert className="w-5 h-5 text-primary mt-0.5 shrink-0" />
          <div>
            <h4 className="font-medium text-primary">Teste Grátis Bloqueado</h4>
            <p className="text-sm text-primary/80 mt-1">
              Adquira pelo menos uma key paga para liberar o teste grátis de 15 minutos.
            </p>
          </div>
        </div>
      )}

      {keys && keys.length > 0 && (
        <div className="relative w-full sm:w-80">
          <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente..."
            className="pl-9 bg-black/20 border-white/10 focus-visible:ring-primary"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {keys && keys.length === 0 ? (
        <Card className="glass-panel border-white/5 bg-black/20 border-dashed border-2 text-center py-16">
          <div className="mx-auto w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
            <KeyIcon className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Nenhuma key ainda</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Escolha um plano acima e adquira sua licença. Após a confirmação do pagamento, sua key aparece aqui automaticamente.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredKeys?.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-full">Nenhuma key encontrada para esta busca.</p>
          )}
          {filteredKeys?.map((key, index) => (
            <Card
              key={key.id}
              className={`glass-panel border-white/10 hover:border-primary/30 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 fill-mode-both ${
                key.status === 'active' ? 'shadow-[0_0_20px_-5px_rgba(14,165,233,0.2)]' : ''
              }`}
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <CardHeader className="pb-3 border-b border-white/5">
                {/* Key code — big copy button */}
                <button
                  type="button"
                  onClick={() => handleCopy(key.code)}
                  title="Clique para copiar a key"
                  className="group flex items-center gap-2 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm tracking-wider text-foreground hover:border-primary/50 hover:bg-primary/10 transition-colors"
                >
                  <KeyIcon className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="truncate flex-1 text-left">{key.code}</span>
                  {copiedKey === key.code
                    ? <Check className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                    : <Copy className="w-3.5 h-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />}
                </button>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    {(planLabels[key.plan] ?? key.plan ?? '-').split('—')[0].trim()}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge className={`text-xs border ${statusColor[key.status] ?? statusColor.inactive}`}>
                      {statusLabels[key.status] ?? key.status}
                    </Badge>
                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-primary hover:bg-primary/10"
                      title="Editar cliente"
                      onClick={() => openEditCustomer(key)}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-4 space-y-3">
                {/* Customer */}
                <div className="flex items-center gap-2 min-w-0">
                  <UserRound className="w-3.5 h-3.5 text-primary shrink-0" />
                  {(key as any).customerName || (key as any).customerEmail ? (
                    <span className="text-sm text-foreground/80 truncate">
                      {(key as any).customerName || (key as any).customerEmail}
                      {(key as any).customerName && (key as any).customerEmail
                        ? <span className="text-muted-foreground"> · {(key as any).customerEmail}</span>
                        : null}
                    </span>
                  ) : (
                    <button type="button" className="text-xs text-muted-foreground hover:text-primary transition-colors" onClick={() => openEditCustomer(key)}>
                      Definir cliente
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Tempo restante
                    </span>
                    <p className="font-mono text-sm font-medium">
                      {key.status === 'active' ? formatTimeLeft(key.expiresAt) : '—'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <MonitorSmartphone className="w-3 h-3" /> Dispositivo
                    </span>
                    <p className="text-sm font-medium">
                      {key.deviceFingerprint ? (
                        <span className="text-emerald-400">Vinculado</span>
                      ) : (
                        <span className="text-muted-foreground">Livre</span>
                      )}
                    </p>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="pt-2 pb-4 border-t border-white/5">
                <Button
                  variant="secondary"
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-foreground/70 hover:text-foreground"
                  onClick={() => handleResetDevice(key.id)}
                  disabled={!key.deviceFingerprint || resetDeviceMutation.isPending}
                >
                  {resetDeviceMutation.isPending && <Loader2 className="w-3 h-3 mr-2 animate-spin" />}
                  <MonitorSmartphone className="w-3 h-3 mr-2" />
                  Resetar Dispositivo
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Customer edit dialog */}
      <Dialog open={editKeyId !== null} onOpenChange={(o) => { if (!o) setEditKeyId(null); }}>
        <DialogContent className="glass-panel border-white/10 sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Cliente desta key</DialogTitle>
            <DialogDescription>Defina o nome e e-mail de quem está usando esta key.</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs uppercase text-muted-foreground tracking-wider font-semibold">Nome</label>
              <Input placeholder="Ex: João Silva" className="bg-black/20 border-white/10" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs uppercase text-muted-foreground tracking-wider font-semibold">E-mail</label>
              <Input type="email" placeholder="cliente@email.com" className="bg-black/20 border-white/10" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs uppercase text-muted-foreground tracking-wider font-semibold">Telefone</label>
              <Input type="tel" placeholder="(61) 99999-9999" className="bg-black/20 border-white/10" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditKeyId(null)} className="border-white/10">Cancelar</Button>
            <Button onClick={handleSaveCustomer} disabled={updateCustomerMutation.isPending}>
              {updateCustomerMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
