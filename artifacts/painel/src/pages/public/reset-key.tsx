import { useState } from 'react';
import { usePublicResetKey } from '@workspace/api-client-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, MonitorSmartphone, ShieldAlert, Key, CheckCircle2 } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { Link } from 'wouter';

export default function ResetKey() {
  const [code, setCode] = useState('');
  const [success, setSuccess] = useState(false);
  const { toast } = useToast();
  
  const resetMutation = usePublicResetKey();

  const handleReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.length < 10) {
      toast({ variant: 'destructive', title: 'Código inválido', description: 'Insira a key completa para resetar.' });
      return;
    }

    resetMutation.mutate({ data: { code } }, {
      onSuccess: () => {
        setSuccess(true);
      },
      onError: (err: any) => {
        toast({ variant: 'destructive', title: 'Falha no reset', description: err.data?.error || 'Verifique se a key está correta e ativa.' });
      }
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(14,165,233,0.1),transparent_50%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay" />
      
      <div className="w-full max-w-[450px] z-10">
        <div className="flex flex-col items-center mb-8 animate-in slide-in-from-bottom-4 fade-in duration-700">
          <Logo className="w-16 h-16 rounded-2xl mb-4 shadow-lg shadow-primary/20" iconClassName="w-8 h-8" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">LVB Sônico</h1>
          <p className="text-muted-foreground text-sm mt-2 tracking-wide uppercase">Auto-Atendimento</p>
        </div>

        <Card className="glass-panel border-white/10 shadow-2xl animate-in slide-in-from-bottom-8 fade-in duration-700 delay-150 fill-mode-both">
          {success ? (
            <>
              <CardHeader className="text-center pb-2">
                <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <CardTitle className="text-2xl font-bold text-foreground">Dispositivo Resetado!</CardTitle>
                <CardDescription className="text-muted-foreground mt-2">
                  O vínculo (HWID) da sua key foi removido com sucesso. Você já pode usar esta mesma key em outro navegador ou PC.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <Button className="w-full font-semibold tracking-wide" onClick={() => {
                  setSuccess(false);
                  setCode('');
                }}>
                  Resetar Outra Key
                </Button>
                <div className="mt-6 text-center text-sm text-muted-foreground">
                  <Link href="/login">
                    <span className="text-primary hover:text-primary/80 font-medium cursor-pointer transition-colors">Voltar ao Painel</span>
                  </Link>
                </div>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="space-y-1">
                <CardTitle className="text-xl text-center flex items-center justify-center gap-2">
                  <MonitorSmartphone className="w-5 h-5 text-primary" />
                  Resetar Dispositivo (HWID)
                </CardTitle>
                <CardDescription className="text-center text-xs">
                  Cole sua key abaixo para desvincular do dispositivo atual
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleReset} className="space-y-6">
                  <div className="space-y-2">
                    <div className="relative">
                      <Key className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
                      <Input 
                        placeholder="EX: ABCD-1234-EFGH-5678" 
                        className="pl-11 bg-black/20 border-white/10 font-mono text-center text-lg h-12 uppercase focus-visible:ring-primary"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-center px-4">
                      Atenção: A contagem do tempo da sua assinatura não é pausada ao resetar o dispositivo.
                    </p>
                  </div>
                  
                  <Button type="submit" className="w-full h-12 text-md font-semibold tracking-wide" disabled={resetMutation.isPending || !code}>
                    {resetMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                    Liberar Dispositivo
                  </Button>
                </form>
                
                <div className="mt-8 text-center text-sm text-muted-foreground border-t border-white/10 pt-6">
                  Precisa gerenciar suas assinaturas?{' '}
                  <Link href="/login">
                    <span className="text-primary hover:text-primary/80 font-medium cursor-pointer transition-colors">Acessar Conta</span>
                  </Link>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
