import { z } from 'zod';

export const planLabels: Record<string, string> = {
  trial: 'Teste 15 min',
  daily: 'Diário — R$ 3,90',
  weekly: 'Semanal — R$ 8,90',
  monthly: 'Mensal — R$ 15,90',
  lifetime: 'Vitalício — R$ 22,90',
};

export const statusLabels: Record<string, string> = {
  inactive: 'Inativa — não ativada',
  active: 'Ativa',
  expired: 'Expirada',
  revoked: 'Revogada',
};

export const userStatusLabels: Record<string, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
};

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export function formatTimeLeft(expiresAt: string | null | undefined): string {
  if (!expiresAt) return '-';
  const end = new Date(expiresAt).getTime();
  const now = new Date().getTime();
  const diff = end - now;
  if (diff <= 0) return 'Expirado';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / 1000 / 60) % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

  return parts.join(' ');
}
