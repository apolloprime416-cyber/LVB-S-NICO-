import { useEffect, useState } from 'react';
import { useGetMyKeys, useActivateKey, useResetMyKeyDevice, useGenerateTrial, useUpdateMyKeyCustomer, getGetMyKeysQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { planLabels, statusLabels, formatTimeLeft } from '@/lib/format';
import { Loader2, Key as KeyIcon, Clock, Power, ShieldAlert, MonitorSmartphone, Plus, Copy, Check, Download, Lock, Package, UserRound, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export default function PainelClient() {
  const { data: keys, isLoading } = useGetMyKeys();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const activateMutation = useActivateKey();
  const resetDeviceMutation = useResetMyKeyDevice();
  const generateTrialMutation = useGenerateTrial();

  const updateCustomerMutation = useUpdateMyKeyCustomer();

  const [activationCode, setActivationCode] = useState('');
  const [isActivateOpen, setIsActivateOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Trial generation dialog (asks for customer name/email)
  const [isTrialOpen, setIsTrialOpen] = useState(false);
  const [trialName, setTrialName] = useState('');
  const [trialEmail, setTrialEmail] = useState('');

  // Customer edit dialog (per key)
  const [editKeyId, setEditKeyId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');

  const openEditCustomer = (key: any) => {
    setEditKeyId(key.id);
    setEditName(key.customerName || '');
    setEditEmail(key.customerEmail || '');
  };

  const handleSaveCustomer = () => {
    if (!editKeyId) return;
    updateCustomerMutation.mutate({ id: editKeyId, data: { customerName: editName || null, customerEmail: editEmail || null } }, {
      onSuccess: () => {
        toast({ title: 'Cliente salvo', description: 'Os dados do cliente foram atualizados nesta key.' });
        setEditKeyId(null);
        queryClient.invalidateQueries({ queryKey: getGetMyKeysQueryKey() });
      },
      onError: (err: any) => {
        toast({ variant: 'destructive', title: 'Erro ao salvar', description: err.data?.error || 'Tente novamente.' });
      }
    });
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedKey(code);
    toast({ title: 'Key copiada', description: code });
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const hasPaidKeys = keys?.some(k => k.plan !== 'trial' && k.status !== 'revoked');

  const [extension, setExtension] = useState<{ available: boolean; unlocked: boolean; filename: string | null } | null>(null);
  useEffect(() => {
    fetch('/api/me/extension', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(setExtension)
      .catch(() => setExtension(null));
  }, [keys]);

  const handleActivate = () => {
    if (!activationCode) return;
    activateMutation.mutate({ data: { code: activationCode } }, {
      onSuccess: () => {
        toast({ title: 'Key ativada', description: 'A contagem do plano começou.' });
        setIsActivateOpen(false);
        setActivationCode('');
        queryClient.invalidateQueries({ queryKey: getGetMyKeysQueryKey() });
      },
      onError: (err: any) => {
        toast({ variant: 'destructive', title: 'Erro na ativação', description: err.data?.error || 'Verifique o código e tente novamente.' });
      }
    });
  };

  const handleResetDevice = (id: string) => {
    resetDeviceMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: 'Dispositivo resetado', description: 'Você pode ativar esta key em um novo navegador/PC.' });
        queryClient.invalidateQueries({ queryKey: getGetMyKeysQueryKey() });
      },
      onError: (err: any) => {
        toast({ variant: 'destructive', title: 'Erro ao resetar', description: err.data?.error || 'Não foi possível resetar o dispositivo.' });
      }
    });
  };

  const handleGenerateTrial = () => {
    generateTrialMutation.mutate({ data: { customerName: trialName || null, customerEmail: trialEmail || null } }, {
      onSuccess: () => {
        toast({ title: 'Teste gerado!', description: 'Sua key de 15 minutos foi gerada.' });
        setIsTrialOpen(false);
        setTrialName('');
        setTrialEmail('');
        queryClient.invalidateQueries({ queryKey: getGetMyKeysQueryKey() });
      },
      onError: (err: any) => {
        toast({ variant: 'destructive', title: 'Ação não permitida', description: err.data?.error || 'Adquira uma key paga primeiro.' });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Painel do Cliente</h1>
          <p className="text-muted-foreground mt-1">Gerencie suas licenças e ativações</p>
        </div>
        <div className="flex items-center gap-3">
          <Dialog open={isActivateOpen} onOpenChange={setIsActivateOpen}>
            <DialogTrigger asChild>
              <Button className="font-semibold shadow-lg shadow-primary/20">
                <Power className="w-4 h-4 mr-2" />
                Ativar Key
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-panel border-white/10 sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Ativar Nova Licença</DialogTitle>
                <DialogDescription>
                  Insira o código recebido na sua compra. A contagem do tempo só começa após a ativação!
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Input
                  placeholder="EX: ABCD-1234-EFGH-5678"
                  className="font-mono text-center bg-black/20 border-white/10 h-12 text-lg focus-visible:ring-primary uppercase"
                  value={activationCode}
                  onChange={(e) => setActivationCode(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsActivateOpen(false)} className="border-white/10">Cancelar</Button>
                <Button onClick={handleActivate} disabled={!activationCode || activateMutation.isPending}>
                  {activateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Confirmar Ativação
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isTrialOpen} onOpenChange={setIsTrialOpen}>
            <DialogTrigger asChild>
              <Button 
                variant="outline" 
                className={`border-white/10 ${!hasPaidKeys ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:border-primary/50'}`}
                disabled={!hasPaidKeys}
                title={!hasPaidKeys ? "Adquira pelo menos uma key paga para liberar o teste grátis" : "Gerar teste de 15 min"}
              >
                <Plus className="w-4 h-4 mr-2" />
                Teste Grátis
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-panel border-white/10 sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Gerar Teste Grátis (15 min)</DialogTitle>
                <DialogDescription>
                  Identifique para quem é este teste. Assim você tem controle dos seus clientes.
                </DialogDescription>
              </DialogHeader>
              <div className="py-2 space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs uppercase text-muted-foreground tracking-wider font-semibold">Nome do cliente</label>
                  <Input
                    placeholder="Ex: João Silva"
                    className="bg-black/20 border-white/10"
                    value={trialName}
                    onChange={(e) => setTrialName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs uppercase text-muted-foreground tracking-wider font-semibold">E-mail do cliente</label>
                  <Input
                    type="email"
                    placeholder="cliente@email.com"
                    className="bg-black/20 border-white/10"
                    value={trialEmail}
                    onChange={(e) => setTrialEmail(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsTrialOpen(false)} className="border-white/10">Cancelar</Button>
                <Button onClick={handleGenerateTrial} disabled={generateTrialMutation.isPending}>
                  {generateTrialMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Gerar Teste
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {!hasPaidKeys && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 flex items-start gap-4">
          <ShieldAlert className="w-5 h-5 text-primary mt-0.5 shrink-0" />
          <div>
            <h4 className="font-medium text-primary">Teste Grátis Bloqueado</h4>
            <p className="text-sm text-primary/80 mt-1">
              Adquira pelo menos uma key paga para liberar o teste grátis. A contagem das suas keys só começa no momento da ativação no dispositivo.
            </p>
          </div>
        </div>
      )}

      {extension?.available && (
        <Card className="glass-panel border-white/10">
          <CardContent className="py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${extension.unlocked ? 'bg-primary/15 text-primary' : 'bg-white/5 text-muted-foreground'}`}>
                {extension.unlocked ? <Package className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-foreground">Extensão LVB Sônico</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {extension.unlocked
                    ? 'Download liberado. Baixe a versão mais recente da extensão.'
                    : 'Bloqueado — adquira uma key para liberar o download da extensão e os testes grátis.'}
                </p>
              </div>
            </div>
            <Button
              className={`shrink-0 ${!extension.unlocked ? 'opacity-50 cursor-not-allowed grayscale' : 'shadow-lg shadow-primary/20'}`}
              disabled={!extension.unlocked}
              onClick={() => { window.location.href = '/api/me/extension/download'; }}
              title={extension.unlocked ? 'Baixar extensão' : 'Adquira uma key para liberar'}
            >
              {extension.unlocked ? <Download className="w-4 h-4 mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
              Baixar Extensão
            </Button>
          </CardContent>
        </Card>
      )}

      {keys && keys.length === 0 ? (
        <Card className="glass-panel border-white/5 bg-black/20 border-dashed border-2 text-center py-16">
          <div className="mx-auto w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
            <KeyIcon className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Nenhuma key encontrada</h3>
          <p className="text-muted-foreground max-w-md mx-auto mb-6">
            Você ainda não possui keys registradas. Clique em "Ativar Key" e insira seu código de licença.
          </p>
          <Button onClick={() => setIsActivateOpen(true)}>Ativar Primeira Key</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {keys?.map((key, index) => (
            <Card 
              key={key.id} 
              className={`glass-panel border-white/10 hover:border-primary/30 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 fill-mode-both ${
                key.status === 'active' ? 'shadow-[0_0_20px_-5px_rgba(14,165,233,0.2)]' : ''
              }`}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <CardHeader className="pb-3 border-b border-white/5">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy(key.code)}
                    title="Clique para copiar a key"
                    className="group flex items-center gap-1.5 min-w-0 rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs tracking-wider text-foreground hover:border-primary/40 hover:bg-primary/10 transition-colors"
                  >
                    <span className="truncate">{key.code}</span>
                    {copiedKey === key.code
                      ? <Check className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                      : <Copy className="w-3.5 h-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />}
                  </button>
                  <Badge 
                    className={
                      key.status === 'active' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                      key.status === 'inactive' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                      key.status === 'expired' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                      'bg-slate-500/20 text-slate-400 border-slate-500/30'
                    }
                  >
                    {statusLabels[key.status]}
                  </Badge>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <CardTitle className="text-lg">
                    {planLabels[key.plan].split('—')[0].trim()}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                    title="Definir cliente desta key"
                    onClick={() => openEditCustomer(key)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardHeader>
              
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center gap-2 min-w-0">
                  <UserRound className="w-3.5 h-3.5 text-primary shrink-0" />
                  {(key as any).customerName || (key as any).customerEmail ? (
                    <span className="text-sm text-foreground/90 truncate" title={`${(key as any).customerName || ''} ${(key as any).customerEmail || ''}`.trim()}>
                      {(key as any).customerName || (key as any).customerEmail}
                      {(key as any).customerName && (key as any).customerEmail ? (
                        <span className="text-muted-foreground"> · {(key as any).customerEmail}</span>
                      ) : null}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-primary transition-colors"
                      onClick={() => openEditCustomer(key)}
                    >
                      Definir cliente
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Tempo
                    </span>
                    <p className="font-mono text-sm font-medium text-foreground">
                      {key.status === 'active' ? formatTimeLeft(key.expiresAt) : '-'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <MonitorSmartphone className="w-3 h-3" /> Dispositivo
                    </span>
                    <p className="font-mono text-sm text-foreground truncate" title={key.deviceFingerprint || 'Não vinculado'}>
                      {key.deviceFingerprint ? 'Vinculado' : 'Livre'}
                    </p>
                  </div>
                </div>
              </CardContent>
              
              <CardFooter className="pt-2 pb-4 border-t border-white/5">
                <Button 
                  variant="secondary" 
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-foreground/80 hover:text-foreground"
                  onClick={() => handleResetDevice(key.id)}
                  disabled={!key.deviceFingerprint || resetDeviceMutation.isPending}
                >
                  {resetDeviceMutation.isPending && <Loader2 className="w-3 h-3 mr-2 animate-spin" />}
                  Resetar Dispositivo (HWID)
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editKeyId !== null} onOpenChange={(o) => { if (!o) setEditKeyId(null); }}>
        <DialogContent className="glass-panel border-white/10 sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Cliente desta key</DialogTitle>
            <DialogDescription>
              Defina o nome e e-mail de quem está usando esta key. Só você vê essa informação.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs uppercase text-muted-foreground tracking-wider font-semibold">Nome do cliente</label>
              <Input
                placeholder="Ex: João Silva"
                className="bg-black/20 border-white/10"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs uppercase text-muted-foreground tracking-wider font-semibold">E-mail do cliente</label>
              <Input
                type="email"
                placeholder="cliente@email.com"
                className="bg-black/20 border-white/10"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditKeyId(null)} className="border-white/10">Cancelar</Button>
            <Button onClick={handleSaveCustomer} disabled={updateCustomerMutation.isPending}>
              {updateCustomerMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
