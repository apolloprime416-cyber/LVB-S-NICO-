import { useState } from 'react';
import { Link } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRegister } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShieldCheck, Mail, Lock, User, ShieldAlert } from 'lucide-react';
import { Logo } from '@/components/ui/logo';

const registerSchema = z.object({
  name: z.string().min(2, { message: 'Nome deve ter pelo menos 2 caracteres.' }),
  email: z.string().email({ message: 'E-mail inválido.' }),
  password: z.string().min(6, { message: 'A senha deve ter pelo menos 6 caracteres.' }),
});

export default function Register() {
  const { toast } = useToast();
  const [success, setSuccess] = useState(false);
  
  const registerMutation = useRegister();

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const onSubmit = (data: z.infer<typeof registerSchema>) => {
    registerMutation.mutate({ data }, {
      onSuccess: () => {
        setSuccess(true);
      },
      onError: (err: any) => {
        toast({ variant: 'destructive', title: 'Erro', description: err.data?.error || 'Falha no cadastro.' });
      }
    });
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(30,58,138,0.15),transparent_70%)] pointer-events-none" />
        <Card className="w-full max-w-md glass-panel relative z-10 border-primary/20 shadow-2xl shadow-primary/10 animate-in fade-in zoom-in-95 duration-500">
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-primary/20">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold text-foreground">Cadastro enviado!</CardTitle>
            <CardDescription className="text-muted-foreground mt-2">
              Seu cadastro foi recebido com sucesso. Aguarde a aprovação do administrador para acessar o painel.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <Link href="/login">
              <Button className="w-full font-semibold tracking-wide">
                Voltar ao Login
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(14,165,233,0.1),transparent_50%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay" />
      
      <div className="w-full max-w-[400px] z-10">
        <div className="flex flex-col items-center mb-8 animate-in slide-in-from-bottom-4 fade-in duration-700">
          <Logo className="w-16 h-16 rounded-2xl mb-4 shadow-lg shadow-primary/20" iconClassName="w-8 h-8" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">LVB Sônico</h1>
          <p className="text-muted-foreground text-sm mt-2 tracking-wide uppercase">Novo Operador</p>
        </div>

        <Card className="glass-panel border-white/10 shadow-2xl animate-in slide-in-from-bottom-8 fade-in duration-700 delay-150 fill-mode-both">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl text-center">Solicitar Acesso</CardTitle>
            <CardDescription className="text-center text-xs">
              Preencha os dados para criar sua conta
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase text-muted-foreground tracking-wider">Nome Completo</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input placeholder="Seu nome" className="pl-9 bg-black/20 border-white/10 focus-visible:ring-primary" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase text-muted-foreground tracking-wider">E-mail</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input placeholder="voce@email.com" className="pl-9 bg-black/20 border-white/10 focus-visible:ring-primary" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
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
                <Button type="submit" className="w-full mt-2 font-semibold tracking-wide" disabled={registerMutation.isPending}>
                  {registerMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Cadastrar
                </Button>
              </form>
            </Form>
            
            <div className="mt-6 text-center text-sm text-muted-foreground border-t border-white/10 pt-6">
              Já tem uma conta?{' '}
              <Link href="/login">
                <span className="text-primary hover:text-primary/80 font-medium cursor-pointer transition-colors">Fazer login</span>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
