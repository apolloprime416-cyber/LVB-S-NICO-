import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Copy, Check, QrCode, ShoppingCart, Sparkles } from 'lucide-react';

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

const PLAN_DESCRIPTIONS: Record<string, string> = {
  daily: 'Acesso completo por 24 horas',
  weekly: 'Acesso completo por 7 dias',
  monthly: 'Acesso completo por 30 dias',
  lifetime: 'Acesso completo para sempre',
};

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
    // Resume a pending PIX (e.g. user closed the dialog or reloaded the page)
    fetch('/api/me/payments', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: (PaymentInfo & { createdAt: string })[]) => {
        const pending = Array.isArray(list)
          ? list.find(
              (p) =>
                p.status === 'pending' &&
                Date.now() - new Date(p.createdAt).getTime() < 60 * 60 * 1000,
            )
          : null;
        if (pending) {
          setPayment(pending);
          startPolling(pending.id);
        }
      })
      .catch(() => {});
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
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
          toast({
            title: 'Pagamento confirmado',
            description: data.key
              ? `Sua key ${data.key.code} foi gerada. Redirecionando...`
              : 'Sua key foi gerada. Redirecionando...',
          });
          setTimeout(() => navigate('/painel'), 2000);
        } else if (data.status === 'canceled' || data.status === 'expired') {
          if (pollRef.current) clearInterval(pollRef.current);
          toast({ variant: 'destructive', title: 'Pagamento não concluído', description: 'A cobrança foi cancelada ou expirou. Gere uma nova.' });
          setPayment(null);
        }
      } catch {
        // network hiccup — keep polling
      }
    }, 5000);
  };

  const handleBuy = async (plan: string) => {
    setBuying(plan);
    try {
      const res = await fetch('/api/me/payments', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: 'destructive', title: 'Erro', description: data?.error || 'Não foi possível gerar a cobrança.' });
        return;
      }
      setPaid(false);
      setCopied(false);
      setPayment(data);
      startPolling(data.id);
    } catch {
      toast({ variant: 'destructive', title: 'Erro', description: 'Falha de conexão. Tente novamente.' });
    } finally {
      setBuying(null);
    }
  };

  const [checking, setChecking] = useState(false);

  const handlePaidClick = async () => {
    if (!payment) return;
    setChecking(true);
    try {
      const res = await fetch(`/api/me/payments/${payment.id}/check`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: 'destructive', title: 'Erro', description: data?.error || 'Não foi possível verificar agora.' });
        return;
      }
      if (data.status === 'paid') {
        if (pollRef.current) clearInterval(pollRef.current);
        setPaid(true);
        toast({
          title: 'Pagamento confirmado',
          description: data.key
            ? `Sua key ${data.key.code} foi gerada. Redirecionando...`
            : 'Sua key foi gerada. Redirecionando...',
        });
        setTimeout(() => navigate('/painel'), 2000);
      } else if (data.status === 'canceled' || data.status === 'expired') {
        if (pollRef.current) clearInterval(pollRef.current);
        toast({ variant: 'destructive', title: 'Pagamento não concluído', description: 'A cobrança foi cancelada ou expirou. Gere uma nova.' });
        setPayment(null);
      } else {
        toast({
          title: 'Ainda não identificado',
          description: 'O pagamento ainda não apareceu na PushinPay. Aguarde alguns segundos e tente de novo.',
        });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Erro', description: 'Falha de conexão. Tente novamente.' });
    } finally {
      setChecking(false);
    }
  };

  const handleCopy = async () => {
    if (!payment?.qrCode) return;
    try {
      await navigator.clipboard.writeText(payment.qrCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível copiar o código.' });
    }
  };

  const closeDialog = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setPayment(null);
  };

  const qrSrc = payment?.qrCodeBase64
    ? payment.qrCodeBase64.startsWith('data:')
      ? payment.qrCodeBase64
      : `data:image/png;base64,${payment.qrCodeBase64}`
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Planos e Preços</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Pague via PIX e receba sua key na hora, direto na página Minhas Keys.
        </p>
      </div>

      {plans.some((p) => p.promo) && (
        <div className="rounded-lg border border-primary/40 bg-primary/10 p-4 flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-primary mt-0.5 shrink-0" />
          <div>
            <h4 className="font-semibold text-primary">Promoção ativa</h4>
            <p className="text-sm text-primary/90 mt-0.5">
              {plans.find((p) => p.promo)?.promo?.bannerText ||
                `Aproveite: ${plans.filter((p) => p.promo).map((p) => `${p.label} por ${formatPrice(p.promo!.priceCents)}`).join(', ')} por tempo limitado.`}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map((p) => {
          const highlight = p.plan === 'lifetime';
          return (
            <Card
              key={p.plan}
              className={`relative flex flex-col border-white/10 ${highlight ? 'border-primary/60 shadow-lg shadow-primary/20' : ''}`}
            >
              {highlight && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wider bg-primary text-primary-foreground px-2.5 py-0.5 rounded-full">
                  Melhor oferta
                </span>
              )}
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{p.label}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 gap-4">
                <div className="flex items-baseline gap-2 flex-wrap">
                  {p.promo && p.basePriceCents > p.priceCents && (
                    <span className="text-sm text-muted-foreground line-through">{formatPrice(p.basePriceCents)}</span>
                  )}
                  <span className={`text-3xl font-extrabold tracking-tight ${p.promo ? 'text-primary' : ''}`}>{formatPrice(p.priceCents)}</span>
                  {p.promo && (
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/15 text-primary border border-primary/30 px-1.5 py-0.5 rounded">Promoção</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground flex-1">{PLAN_DESCRIPTIONS[p.plan] ?? ''}</p>
                <Button
                  className={highlight ? 'w-full bg-gradient-to-r from-primary to-blue-500 hover:from-primary/90 hover:to-blue-500/90 font-bold' : 'w-full font-bold'}
                  variant={highlight ? 'default' : 'secondary'}
                  onClick={() => handleBuy(p.plan)}
                  disabled={buying !== null}
                >
                  {buying === p.plan ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <ShoppingCart className="w-4 h-4 mr-2" />
                  )}
                  Comprar
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="text-xs text-muted-foreground border border-white/10 rounded-md p-3 bg-card/40">
        <p>
          Ao comprar qualquer plano você libera: download da extensão e geração ilimitada de keys de
          teste grátis (15 minutos) para divulgar e revender.
        </p>
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
              <p className="text-sm text-muted-foreground text-center">
                Sua key foi gerada. Indo para Minhas Keys...
              </p>
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
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Aguardando aprovação
                </div>
                <p className="text-xs text-muted-foreground">
                  Assim que o pagamento for confirmado, sua key será entregue automaticamente.
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
