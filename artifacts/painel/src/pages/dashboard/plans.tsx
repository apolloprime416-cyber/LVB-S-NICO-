import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Copy, Check, QrCode, ShoppingCart, Sparkles, Zap, Clock, Calendar, Infinity } from 'lucide-react';

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

const PLAN_META: Record<string, { description: string; icon: React.ElementType; highlight: boolean }> = {
  daily:    { description: 'Acesso completo por 24 horas', icon: Zap, highlight: false },
  weekly:   { description: 'Acesso completo por 7 dias', icon: Clock, highlight: false },
  monthly:  { description: 'Acesso completo por 30 dias', icon: Calendar, highlight: false },
  lifetime: { description: 'Acesso vitalício, pague uma vez', icon: Infinity, highlight: true },
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
      setRemaining(`${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  return <span className="font-mono font-bold">{remaining}</span>;
}

export default function Plans() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [buying, setBuying] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [paid, setPaid] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      const res = await fetch('/api/me/payments', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) });
      const data = await res.json();
      if (!res.ok) { toast({ variant: 'destructive', title: 'Erro', description: data?.error || 'Não foi possível gerar a cobrança.' }); return; }
      setPaid(false); setCopied(false); setPayment(data); startPolling(data.id);
    } catch { toast({ variant: 'destructive', title: 'Erro', description: 'Falha de conexão. Tente novamente.' }); }
    finally { setBuying(null); }
  };

  const [checking, setChecking] = useState(false);
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
        toast({ title: 'Ainda não identificado', description: 'O pagamento ainda não apareceu na PushinPay. Aguarde alguns segundos e tente de novo.' });
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
  const qrSrc = payment?.qrCodeBase64 ? (payment.qrCodeBase64.startsWith('data:') ? payment.qrCodeBase64 : `data:image/png;base64,${payment.qrCodeBase64}`) : null;
  const activePromos = plans.filter((p) => p.promo);
  const allPromoBannerText = activePromos.map((p) => p.promo?.bannerText).filter(Boolean)[0];

  return (
    <div className="space-y-6">
      <div className="text-center max-w-xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight">Planos e Preços</h1>
        <p className="text-muted-foreground text-sm mt-2">Pague via PIX e receba sua key na hora, direto na aba Minhas Keys.</p>
      </div>

      {/* Promo banner — destacado acima dos cards */}
      {activePromos.length > 0 && (
        <div className="relative rounded-2xl overflow-hidden border border-primary/40 shadow-lg shadow-primary/20">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-blue-500/15 to-primary/20 pointer-events-none" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.15),transparent_70%)] pointer-events-none" />
          <div className="relative z-10 px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-primary text-lg">Promoção Ativa</span>
                  <Badge className="bg-primary/15 text-primary border-primary/30 text-xs uppercase tracking-wider">Tempo limitado</Badge>
                </div>
                <p className="text-sm text-foreground/80 mt-0.5">
                  {allPromoBannerText || activePromos.map((p) => `${p.label} por ${formatPrice(p.promo!.priceCents)}`).join(' · ')}
                </p>
              </div>
            </div>
            {activePromos[0]?.promo?.endsAt && (
              <div className="text-center shrink-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Termina em</p>
                <div className="text-xl text-primary tabular-nums">
                  <PromoCountdown endsAt={activePromos[0].promo.endsAt} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map((p) => {
          const meta = PLAN_META[p.plan];
          const highlight = meta?.highlight ?? false;
          const Icon = meta?.icon ?? ShoppingCart;
          return (
            <Card
              key={p.plan}
              className={`relative flex flex-col transition-all duration-200 hover:scale-[1.02]
                ${highlight
                  ? 'border-primary/60 shadow-xl shadow-primary/20 bg-gradient-to-b from-primary/5 to-transparent'
                  : 'border-white/10 bg-card/50'}`}
            >
              {highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-primary to-blue-500 text-white px-3 py-1 rounded-full shadow-md">
                  Melhor oferta
                </span>
              )}
              {p.promo && (
                <span className="absolute -top-3 right-4 text-[10px] font-bold uppercase tracking-wider bg-amber-500 text-black px-2.5 py-1 rounded-full shadow-md">
                  Promo
                </span>
              )}
              <CardHeader className="pb-3 pt-6">
                <div className={`w-9 h-9 rounded-lg mb-2 flex items-center justify-center ${highlight ? 'bg-primary/20 border border-primary/30' : 'bg-white/5 border border-white/10'}`}>
                  <Icon className={`w-4 h-4 ${highlight ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                <CardTitle className="text-base">{p.label}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 gap-4 pt-0">
                <div className="space-y-0.5">
                  {p.promo && p.basePriceCents > p.priceCents && (
                    <p className="text-xs text-muted-foreground line-through">{formatPrice(p.basePriceCents)}</p>
                  )}
                  <p className={`text-3xl font-extrabold tracking-tight ${p.promo ? 'text-primary' : ''}`}>
                    {formatPrice(p.priceCents)}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground flex-1 leading-relaxed">{meta?.description ?? ''}</p>
                <Button
                  className={`w-full font-bold ${highlight ? 'bg-gradient-to-r from-primary to-blue-500 hover:from-primary/90 hover:to-blue-500/90 shadow-lg shadow-primary/30' : ''}`}
                  variant={highlight ? 'default' : 'secondary'}
                  onClick={() => handleBuy(p.plan)}
                  disabled={buying !== null}
                >
                  {buying === p.plan ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShoppingCart className="w-4 h-4 mr-2" />}
                  Comprar
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="text-xs text-muted-foreground border border-white/10 rounded-lg p-4 bg-card/40 max-w-2xl mx-auto text-center">
        Ao comprar qualquer plano você libera o download da extensão e a geração ilimitada de keys de teste grátis (15 min) para divulgar e revender.
      </div>

      <Dialog open={payment !== null} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-primary" />
              Pagamento PIX
            </DialogTitle>
            <DialogDescription>
              Escaneie o QR Code ou copie o código abaixo. A confirmação é automática.
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
              <Button className="w-full font-bold bg-gradient-to-r from-primary to-blue-500 hover:from-primary/90 hover:to-blue-500/90" onClick={handlePaidClick} disabled={checking}>
                {checking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                Já fiz o pagamento
              </Button>
              <div className="flex flex-col items-center gap-1 text-center">
                <div className="flex items-center gap-2 text-sm font-medium text-primary">
                  <Loader2 className="w-4 h-4 animate-spin" /> Aguardando aprovação
                </div>
                <p className="text-xs text-muted-foreground">Assim que o pagamento for confirmado, sua key será entregue automaticamente.</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
