import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useLogin, useVerifyCode, getGetSessionQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShieldCheck, Mail, Lock, ShieldAlert } from 'lucide-react';
import { Logo } from '@/components/ui/logo';

const loginSchema = z.object({
  email: z.string().email({ message: 'E-mail inválido.' }),
  password: z.string().min(6, { message: 'A senha deve ter pelo menos 6 caracteres.' }),
});

const codeSchema = z.object({
  code: z.string().min(1, { message: 'Insira o código de acesso.' }),
});

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [step, setStep] = useState<'login' | 'code' | 'pending'>('login');
  
  const loginMutation = useLogin();
  const verifyCodeMutation = useVerifyCode();

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const codeForm = useForm<z.infer<typeof codeSchema>>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: '' },
  });

  const onLoginSubmit = (data: z.infer<typeof loginSchema>) => {
    loginMutation.mutate({ data }, {
      onSuccess: (res) => {
        if (res.status === 'authenticated') {
          queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() });
          setLocation(res.user?.role === 'admin' ? '/admin' : '/painel');
        } else if (res.status === 'code_required') {
          setStep('code');
        } else if (res.status === 'pending') {
          setStep('pending');
        } else {
          toast({ variant: 'destructive', title: 'Acesso negado', description: 'Conta rejeitada ou inativa.' });
        }
      },
      onError: (err: any) => {
        toast({ variant: 'destructive', title: 'Erro', description: err.data?.error || 'Falha no login.' });
      }
    });
  };

  const onCodeSubmit = (data: z.infer<typeof codeSchema>) => {
    verifyCodeMutation.mutate({ data }, {
      onSuccess: (res) => {
        if (res.status === 'authenticated') {
          queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() });
          setLocation(res.user?.role === 'admin' ? '/admin' : '/painel');
        }
      },
      onError: (err: any) => {
        toast({ variant: 'destructive', title: 'Código inválido', description: err.data?.error || 'Tente novamente.' });
      }
    });
  };

  if (step === 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(30,58,138,0.15),transparent_70%)] pointer-events-none" />
        <Card className="w-full max-w-md glass-panel relative z-10 border-primary/20 shadow-2xl shadow-primary/10 animate-in fade-in zoom-in-95 duration-500">
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-primary/20">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold text-foreground">Aguarde a aprovação</CardTitle>
            <CardDescription className="text-muted-foreground mt-2">
              Seu cadastro foi recebido e está em análise pelo administrador. 
              Você receberá acesso assim que for aprovado.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <Button variant="outline" className="w-full border-white/10" onClick={() => setStep('login')}>
              Voltar ao Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background relative overflow-hidden">
      {/* Premium background styling */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(14,165,233,0.1),transparent_50%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay" />
      
      <div className="w-full max-w-[400px] z-10">
        <div className="flex flex-col items-center mb-8 animate-in slide-in-from-bottom-4 fade-in duration-700">
          <Logo className="w-16 h-16 rounded-2xl mb-4 shadow-lg shadow-primary/20" iconClassName="w-8 h-8" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">LVB Sônico</h1>
          <p className="text-muted-foreground text-sm mt-2 tracking-wide uppercase">Command Center</p>
        </div>

        <Card className="glass-panel border-white/10 shadow-2xl animate-in slide-in-from-bottom-8 fade-in duration-700 delay-150 fill-mode-both">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl text-center">
              {step === 'login' ? 'Acesso Restrito' : 'Verificação de Segurança'}
            </CardTitle>
            <CardDescription className="text-center text-xs">
              {step === 'login' 
                ? 'Insira suas credenciais para continuar' 
                : 'Insira o código de acesso do administrador'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === 'login' ? (
              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                  <FormField
                    control={loginForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs uppercase text-muted-foreground tracking-wider">E-mail</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="admin@lvb.com" className="pl-9 bg-black/20 border-white/10 focus-visible:ring-primary" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs uppercase text-muted-foreground tracking-wider">Senha</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input type="password" placeholder="••••••••" className="pl-9 bg-black/20 border-white/10 focus-visible:ring-primary" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full mt-2 font-semibold tracking-wide" disabled={loginMutation.isPending}>
                    {loginMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Entrar
                  </Button>
                </form>
              </Form>
            ) : (
              <Form {...codeForm}>
                <form onSubmit={codeForm.handleSubmit(onCodeSubmit)} className="space-y-4">
                  <FormField
                    control={codeForm.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs uppercase text-muted-foreground tracking-wider">Código de Autenticação</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="········" 
                            className="bg-black/20 border-white/10 text-center text-2xl tracking-[0.3em] font-mono h-14 focus-visible:ring-primary" 
                            {...field} 
                            maxLength={16}
                          />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full mt-2" disabled={verifyCodeMutation.isPending}>
                    {verifyCodeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Verificar
                  </Button>
                  <Button variant="ghost" className="w-full text-xs text-muted-foreground" onClick={() => setStep('login')} type="button">
                    Voltar
                  </Button>
                </form>
              </Form>
            )}
            
            {step === 'login' && (
              <div className="mt-6 text-center text-sm text-muted-foreground border-t border-white/10 pt-6">
                Não tem uma conta?{' '}
                <Link href="/register">
                  <span className="text-primary hover:text-primary/80 font-medium cursor-pointer transition-colors">Solicitar acesso</span>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
