import { useState } from 'react';
import { useGetMyKeys, useActivateKey, useResetMyKeyDevice, useGenerateTrial, getGetMyKeysQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { planLabels, statusLabels, formatTimeLeft } from '@/lib/format';
import { Loader2, Key as KeyIcon, Clock, Power, ShieldAlert, MonitorSmartphone, Plus, Copy, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export default function PainelClient() {
  const { data: keys, isLoading } = useGetMyKeys();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const activateMutation = useActivateKey();
  const resetDeviceMutation = useResetMyKeyDevice();
  const generateTrialMutation = useGenerateTrial();

  const [activationCode, setActivationCode] = useState('');
  const [isActivateOpen, setIsActivateOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedKey(code);
    toast({ title: 'Key copiada', description: code });
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const hasPaidKeys = keys?.some(k => k.plan !== 'trial');

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
    generateTrialMutation.mutate(undefined, {
      onSuccess: () => {
        toast({ title: 'Teste gerado!', description: 'Sua key de 15 minutos foi gerada.' });
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

          <Button 
            variant="outline" 
            className={`border-white/10 ${!hasPaidKeys ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:border-primary/50'}`}
            onClick={handleGenerateTrial}
            disabled={!hasPaidKeys || generateTrialMutation.isPending}
            title={!hasPaidKeys ? "Adquira pelo menos uma key paga para liberar o teste grátis" : "Gerar teste de 15 min"}
          >
            {generateTrialMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Teste Grátis
          </Button>
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
                <CardTitle className="mt-4 text-xl flex items-center gap-2">
                  {planLabels[key.plan].split('—')[0].trim()}
                </CardTitle>
                <CardDescription>Plano selecionado</CardDescription>
              </CardHeader>
              
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Tempo
                    </span>
                    <p className="font-mono font-medium text-foreground">
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
    </div>
  );
}
