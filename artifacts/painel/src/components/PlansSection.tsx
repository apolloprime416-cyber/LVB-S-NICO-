/**
 * PlansSection — seção de planos e preços embutida no Dashboard.
 * Renderizada na página inicial de clientes e gerentes.
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, Copy, Check, QrCode, ShoppingCart,
  Sparkles, Zap, Clock, Calendar, Infinity, ChevronDown,
} from 'lucide-react';

interface PlanInfo {
  plan: string;
  label: string;
  priceCents: number;
  basePriceCents: number;
  promo: { priceCents: number; endsAt: string; bannerText: string | null } | null;
}

interface PaymentInfo {
  id: string;
  plan: string;
  status: string;
  qrCode: string | null;
  qrCodeBase64: string | null;
  priceCents: number;
}

const PLAN_META: Record<string, { description: string; icon: React.ElementType; color: string; highlight: boolean }> = {
  daily:    { description: 'Acesso completo por 24 horas. Ideal para experimentar.', icon: Zap,      color: 'text-sky-400',    highlight: false },
  weekly:   { description: 'Acesso completo por 7 dias. Ótimo para usar na semana.', icon: Clock,    color: 'text-violet-400', highlight: false },
  monthly:  { description: 'Acesso completo por 30 dias. O mais escolhido.', icon: Calendar, color: 'text-blue-400',   highlight: false },
  lifetime: { description: 'Acesso vitalício, pague uma única vez e nunca mais.', icon: Infinity,  color: 'text-primary',    highlight: true  },
};

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function PromoCountdown({ endsAt }: { endsAt: string }) {
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    const tick = () => {
      const diff = new Date(endsAt).getTime() - Date.now();
      if (diff <= 0) { setRemaining('Encerrada'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  return <span className="font-mono font-bold tabular-nums">{remaining}</span>;
}

export default function PlansSection() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [buying, setBuying] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [paid, setPaid] = useState(false);
  const [checking, setChecking] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const plansRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/public/plans', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then(setPlans)
      .catch(() => setPlans([]));
    fetch('/api/me/payments', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: (PaymentInfo & { createdAt: string })[]) => {
        const pending = Array.isArray(list)
          ? list.find((p) => p.status === 'pending' && Date.now() - new Date(p.createdAt).getTime() < 60 * 60 * 1000)
          : null;
        if (pending) { setPayment(pending); startPolling(pending.id); }
      })
      .catch(() => {});
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const startPolling = (paymentId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/me/payments/${paymentId}`, { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'paid') {
          if (pollRef.current) clearInterval(pollRef.current);
          setPaid(true);
          toast({ title: 'Pagamento confirmado', description: data.key ? `Sua key ${data.key.code} foi gerada. Redirecionando...` : 'Sua key foi gerada. Redirecionando...' });
          setTimeout(() => navigate('/painel'), 2000);
        } else if (data.status === 'canceled' || data.status === 'expired') {
          if (pollRef.current) clearInterval(pollRef.current);
          toast({ variant: 'destructive', title: 'Pagamento não concluído', description: 'A cobrança foi cancelada ou expirou. Gere uma nova.' });
          setPayment(null);
        }
      } catch { /* network hiccup */ }
    }, 5000);
  };

  const handleBuy = async (plan: string) => {
    setBuying(plan);
    try {
      const res = await fetch('/api/me/payments', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ variant: 'destructive', title: 'Erro', description: data?.error || 'Não foi possível gerar a cobrança.' }); return; }
      setPaid(false); setCopied(false); setPayment(data); startPolling(data.id);
    } catch { toast({ variant: 'destructive', title: 'Erro', description: 'Falha de conexão. Tente novamente.' }); }
    finally { setBuying(null); }
  };

  const handlePaidClick = async () => {
    if (!payment) return;
    setChecking(true);
    try {
      const res = await fetch(`/api/me/payments/${payment.id}/check`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) { toast({ variant: 'destructive', title: 'Erro', description: data?.error || 'Não foi possível verificar agora.' }); return; }
      if (data.status === 'paid') {
        if (pollRef.current) clearInterval(pollRef.current);
        setPaid(true);
        toast({ title: 'Pagamento confirmado', description: data.key ? `Sua key ${data.key.code} foi gerada. Redirecionando...` : 'Sua key foi gerada. Redirecionando...' });
        setTimeout(() => navigate('/painel'), 2000);
      } else if (data.status === 'canceled' || data.status === 'expired') {
        if (pollRef.current) clearInterval(pollRef.current);
        toast({ variant: 'destructive', title: 'Pagamento não concluído', description: 'A cobrança foi cancelada ou expirou. Gere uma nova.' });
        setPayment(null);
      } else {
        toast({ title: 'Ainda não identificado', description: 'O pagamento ainda não apareceu. Aguarde alguns segundos e tente de novo.' });
      }
    } catch { toast({ variant: 'destructive', title: 'Erro', description: 'Falha de conexão. Tente novamente.' }); }
    finally { setChecking(false); }
  };

  const handleCopy = async () => {
    if (!payment?.qrCode) return;
    try { await navigator.clipboard.writeText(payment.qrCode); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível copiar o código.' }); }
  };

  const closeDialog = () => { if (pollRef.current) clearInterval(pollRef.current); setPayment(null); };
  const qrSrc = payment?.qrCodeBase64
    ? (payment.qrCodeBase64.startsWith('data:') ? payment.qrCodeBase64 : `data:image/png;base64,${payment.qrCodeBase64}`)
    : null;
  const activePromos = plans.filter((p) => p.promo);
  const promoBannerText = activePromos.map((p) => p.promo?.bannerText).filter(Boolean)[0]
    || activePromos.map((p) => `${p.label} por ${formatPrice(p.promo!.priceCents)}`).join(' · ');

  const scrollToPlans = () => plansRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="space-y-8 pt-4">

      {/* ── Divider ── */}
      <div className="flex items-center gap-4">
        <div className="flex-1 h-px bg-white/8" />
        <span className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Planos e Preços</span>
        <div className="flex-1 h-px bg-white/8" />
      </div>

      {/* ── Promo Banner ── */}
      {activePromos.length > 0 && (
        <div className="relative rounded-2xl overflow-hidden border border-primary/40 shadow-xl shadow-primary/10">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/25 via-blue-600/10 to-transparent pointer-events-none" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_50%,rgba(59,130,246,0.18),transparent_65%)] pointer-events-none" />
          <div className="relative z-10 px-6 py-6 flex flex-col sm:flex-row items-center gap-5">
            <div className="w-12 h-12 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 text-center sm:text-left space-y-0.5">
              <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                <span className="font-bold text-primary text-xl">Promoção Ativa</span>
                <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px] uppercase tracking-widest">
                  Tempo limitado
                </Badge>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">{promoBannerText}</p>
            </div>
            <div className="flex flex-col items-center gap-2 shrink-0">
              {activePromos[0]?.promo?.endsAt && (
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Termina em</p>
                  <div className="text-2xl text-primary">
                    <PromoCountdown endsAt={activePromos[0].promo.endsAt} />
                  </div>
                </div>
              )}
              <Button size="sm" variant="outline"
                className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary gap-1.5 text-xs font-semibold"
                onClick={scrollToPlans}
              >
                Ver plano <ChevronDown className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Plan Cards ── */}
      <div ref={plansRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 scroll-mt-8">
        {plans.length === 0 ? (
          <div className="col-span-4 flex items-center justify-center h-40 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando planos...
          </div>
        ) : plans.map((p) => {
          const meta = PLAN_META[p.plan];
          const Icon = meta?.icon ?? ShoppingCart;
          const highlight = meta?.highlight ?? false;
          const hasPromo = !!p.promo && p.basePriceCents > p.priceCents;
          return (
            <Card key={p.plan} className={`
              relative flex flex-col transition-all duration-200 hover:scale-[1.025] hover:shadow-xl
              ${highlight
                ? 'border-primary/60 shadow-lg shadow-primary/20 bg-gradient-to-b from-primary/8 to-card/60'
                : 'border-white/10 bg-card/50 hover:border-white/20'}
            `}>
              {highlight && !hasPromo && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-widest bg-gradient-to-r from-primary to-blue-500 text-white px-3 py-1 rounded-full shadow">
                  Melhor oferta
                </span>
              )}
              {hasPromo && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-widest bg-amber-500 text-black px-3 py-1 rounded-full shadow">
                  Em promoção
                </span>
              )}
              <CardContent className="flex flex-col flex-1 gap-5 px-5 pt-8 pb-5">
                <div className="flex flex-col items-center text-center gap-2">
                  <div className={`
                    w-11 h-11 rounded-xl flex items-center justify-center
                    ${highlight ? 'bg-primary/20 border border-primary/30' : 'bg-white/5 border border-white/10'}
                  `}>
                    <Icon className={`w-5 h-5 ${meta?.color ?? 'text-muted-foreground'}`} />
                  </div>
                  <span className={`text-base font-bold tracking-tight ${highlight ? 'text-primary' : 'text-foreground'}`}>
                    {p.label}
                  </span>
                </div>
                <div className="text-center">
                  {hasPromo && (
                    <p className="text-xs text-muted-foreground line-through mb-0.5">{formatPrice(p.basePriceCents)}</p>
                  )}
                  <p className={`text-4xl font-extrabold tracking-tight leading-none ${hasPromo ? 'text-primary' : ''}`}>
                    {formatPrice(p.priceCents)}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground text-center leading-relaxed flex-1">
                  {meta?.description ?? ''}
                </p>
                <Button
                  className={`
                    w-full font-bold tracking-wide
                    ${highlight ? 'bg-gradient-to-r from-primary to-blue-500 hover:from-primary/90 hover:to-blue-500/90 shadow-lg shadow-primary/30' : ''}
                  `}
                  variant={highlight ? 'default' : 'secondary'}
                  onClick={() => handleBuy(p.plan)}
                  disabled={buying !== null}
                >
                  {buying === p.plan ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShoppingCart className="w-4 h-4 mr-2" />}
                  Comprar agora
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Footer note ── */}
      <p className="text-xs text-muted-foreground text-center leading-relaxed max-w-lg mx-auto border border-white/8 rounded-xl px-5 py-3 bg-card/30">
        Ao adquirir qualquer plano você libera o download da extensão e a geração ilimitada de keys de teste (15 min) para divulgar e revender.
      </p>

      {/* ── Payment Dialog ── */}
      <Dialog open={payment !== null} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="glass-panel border-white/10 max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-primary" />
              Pagamento PIX
            </DialogTitle>
            <DialogDescription>
              Escaneie o QR Code ou copie o código. A confirmação é automática.
            </DialogDescription>
          </DialogHeader>
          {paid ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
                <Check className="w-7 h-7 text-green-400" />
              </div>
              <p className="font-semibold">Pagamento confirmado</p>
              <p className="text-sm text-muted-foreground text-center">Sua key foi gerada. Indo para Minhas Keys...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              {qrSrc ? (
                <img src={qrSrc} alt="QR Code PIX" className="w-52 h-52 rounded-md bg-white p-2" />
              ) : (
                <div className="w-52 h-52 flex items-center justify-center border border-white/10 rounded-md">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              )}
              <Button variant="secondary" className="w-full" onClick={handleCopy} disabled={!payment?.qrCode}>
                {copied ? <Check className="w-4 h-4 mr-2 text-green-400" /> : <Copy className="w-4 h-4 mr-2" />}
                {copied ? 'Copiado' : 'Copiar código PIX'}
              </Button>
              <Button
                className="w-full font-bold bg-gradient-to-r from-primary to-blue-500 hover:from-primary/90 hover:to-blue-500/90"
                onClick={handlePaidClick}
                disabled={checking}
              >
                {checking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                Já fiz o pagamento
              </Button>
              <div className="flex flex-col items-center gap-1 text-center">
                <div className="flex items-center gap-2 text-sm font-medium text-primary">
                  <Loader2 className="w-4 h-4 animate-spin" /> Aguardando confirmação
                </div>
                <p className="text-xs text-muted-foreground">Sua key será entregue automaticamente após o pagamento.</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
