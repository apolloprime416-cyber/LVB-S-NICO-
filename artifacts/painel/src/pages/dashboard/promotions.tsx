import { useEffect, useState } from 'react';
import {
  useGetPromotions,
  useCreatePromotion,
  useDeletePromotion,
  useSetPlanPrice,
  getGetPromotionsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Tag, Trash2, Save } from 'lucide-react';

const PLANS: { plan: string; label: string }[] = [
  { plan: 'daily', label: 'Diário' },
  { plan: 'weekly', label: 'Semanal' },
  { plan: 'monthly', label: 'Mensal' },
  { plan: 'lifetime', label: 'Vitalício' },
];

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** "15,90" | "15.90" | "15" -> cents; null when invalid. */
function parsePriceToCents(raw: string): number | null {
  const v = raw.trim().replace(/[R$\s]/g, '').replace(',', '.');
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export default function AdminPromotions() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: promotions, isLoading } = useGetPromotions();
  const createMutation = useCreatePromotion();
  const deleteMutation = useDeletePromotion();
  const setPriceMutation = useSetPlanPrice();

  // Base prices (loaded from the public plans endpoint)
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [currentPlans, setCurrentPlans] = useState<any[]>([]);
  const loadPlans = () => {
    fetch('/api/public/plans', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        setCurrentPlans(Array.isArray(list) ? list : []);
        const map: Record<string, string> = {};
        for (const p of list) map[p.plan] = (p.basePriceCents / 100).toFixed(2).replace('.', ',');
        setPrices(map);
      })
      .catch(() => {});
  };
  useEffect(loadPlans, []);

  const handleSavePrice = (plan: string) => {
    const cents = parsePriceToCents(prices[plan] ?? '');
    if (cents === null || cents < 50) {
      toast({ variant: 'destructive', title: 'Preço inválido', description: 'Informe um valor a partir de R$ 0,50.' });
      return;
    }
    setPriceMutation.mutate({ plan: plan as any, data: { priceCents: cents } }, {
      onSuccess: () => { toast({ title: 'Preço atualizado' }); loadPlans(); },
      onError: () => toast({ variant: 'destructive', title: 'Erro ao salvar preço' }),
    });
  };

  // New promotion form
  const [promoPlan, setPromoPlan] = useState('monthly');
  const [promoPrice, setPromoPrice] = useState('');
  const [promoDuration, setPromoDuration] = useState('24');
  const [promoBanner, setPromoBanner] = useState('');

  const handleCreatePromo = () => {
    const cents = parsePriceToCents(promoPrice);
    const hours = parseInt(promoDuration, 10);
    if (cents === null || cents < 50) {
      toast({ variant: 'destructive', title: 'Valor promocional inválido', description: 'Informe um valor a partir de R$ 0,50.' });
      return;
    }
    if (isNaN(hours) || hours < 1 || hours > 8760) {
      toast({ variant: 'destructive', title: 'Duração inválida', description: 'Entre 1 hora e 365 dias (8760 horas).' });
      return;
    }
    createMutation.mutate({
      data: {
        plan: promoPlan as any,
        priceCents: cents,
        durationHours: hours,
        bannerText: promoBanner.trim() || null,
      },
    }, {
      onSuccess: () => {
        toast({ title: 'Promoção criada', description: 'Ela já está visível para todos os usuários.' });
        setPromoPrice(''); setPromoBanner('');
        queryClient.invalidateQueries({ queryKey: getGetPromotionsQueryKey() });
        loadPlans();
      },
      onError: (err: any) => toast({ variant: 'destructive', title: 'Erro ao criar promoção', description: err?.data?.error }),
    });
  };

  const handleDeletePromo = (id: string) => {
    if (!confirm('Encerrar esta promoção? Os preços voltam ao normal na hora.')) return;
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: 'Promoção encerrada' });
        queryClient.invalidateQueries({ queryKey: getGetPromotionsQueryKey() });
        loadPlans();
      },
      onError: () => toast({ variant: 'destructive', title: 'Erro ao encerrar promoção' }),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Promoções</h1>
        <p className="text-muted-foreground mt-1">Ajuste os preços dos planos e crie promoções com banner para todos os usuários</p>
      </div>

      <Card className="glass-panel border-white/10">
        <CardHeader className="border-b border-white/5 pb-4">
          <CardTitle className="text-lg">Preços dos planos</CardTitle>
          <p className="text-sm text-muted-foreground">Este é o preço normal cobrado em cada plano. Alterações valem imediatamente para novas compras.</p>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLANS.map(({ plan, label }) => {
              const current = currentPlans.find((p) => p.plan === plan);
              return (
                <div key={plan} className="rounded-md border border-white/10 bg-black/20 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">{label}</span>
                    {current?.promo && (
                      <Badge className="bg-primary/15 text-primary border-primary/30">Em promoção: {formatPrice(current.promo.priceCents)}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">R$</span>
                    <Input
                      className="bg-black/30 border-white/10"
                      value={prices[plan] ?? ''}
                      onChange={(e) => setPrices((old) => ({ ...old, [plan]: e.target.value }))}
                    />
                  </div>
                  <Button
                    variant="secondary"
                    className="w-full bg-white/5 hover:bg-white/10 border border-white/10"
                    onClick={() => handleSavePrice(plan)}
                    disabled={setPriceMutation.isPending}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Salvar preço
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel border-white/10">
        <CardHeader className="border-b border-white/5 pb-4">
          <CardTitle className="text-lg">Criar promoção</CardTitle>
          <p className="text-sm text-muted-foreground">Escolha o plano, o valor promocional e por quanto tempo. Um banner aparece na página de planos para todos os usuários enquanto a promoção durar.</p>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-xs uppercase text-muted-foreground tracking-wider font-semibold">Tipo de licença</label>
              <Select value={promoPlan} onValueChange={setPromoPlan}>
                <SelectTrigger className="bg-black/20 border-white/10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLANS.map(({ plan, label }) => (
                    <SelectItem key={plan} value={plan}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase text-muted-foreground tracking-wider font-semibold">Valor promocional (R$)</label>
              <Input placeholder="Ex: 9,90" className="bg-black/20 border-white/10" value={promoPrice} onChange={(e) => setPromoPrice(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase text-muted-foreground tracking-wider font-semibold">Duração (horas)</label>
              <Input type="number" min="1" max="8760" className="bg-black/20 border-white/10" value={promoDuration} onChange={(e) => setPromoDuration(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase text-muted-foreground tracking-wider font-semibold">Texto do banner (opcional)</label>
            <Input placeholder="Ex: Semana do cliente: Mensal com desconto!" className="bg-black/20 border-white/10" value={promoBanner} onChange={(e) => setPromoBanner(e.target.value)} />
          </div>
          <Button onClick={handleCreatePromo} disabled={createMutation.isPending} className="font-semibold shadow-lg shadow-primary/20">
            {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Tag className="w-4 h-4 mr-2" />}
            Criar promoção
          </Button>
        </CardContent>
      </Card>

      <Card className="glass-panel border-white/10">
        <CardHeader className="border-b border-white/5 pb-4">
          <CardTitle className="text-lg">Promoções criadas</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-24"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
          ) : !promotions || promotions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma promoção criada ainda.</p>
          ) : (
            <div className="space-y-2">
              {promotions.map((p) => (
                <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border border-white/10 bg-black/20 px-4 py-3">
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{PLANS.find((x) => x.plan === p.plan)?.label ?? p.plan}</span>
                      <span className="font-mono text-primary">{formatPrice(p.priceCents)}</span>
                      {p.active ? (
                        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Ativa</Badge>
                      ) : (
                        <Badge className="bg-slate-500/10 text-slate-400 border-slate-500/20">Encerrada</Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground mt-1">
                      Termina em {new Date(p.endsAt).toLocaleString('pt-BR')}
                      {p.bannerText ? ` · "${p.bannerText}"` : ''}
                    </span>
                  </div>
                  {p.active && (
                    <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 hover:bg-red-500/10 shrink-0" onClick={() => handleDeletePromo(p.id)}>
                      <Trash2 className="w-4 h-4 mr-2" /> Encerrar
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
