import { useState, useMemo, useRef } from 'react';
import { 
  useGetUsers, 
  useApproveUser, 
  useRejectUser, 
  useSetUserPassword, 
  useDeleteUser,
  useGetSession,
  useGetManagers,
  useCreateManager,
  useDeleteManager,
  getGetManagersQueryKey,
  getGetUsersQueryKey,
  getGetAdminStatsQueryKey
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, MoreVertical, ShieldCheck, ShieldAlert, Key, Search, Trash2, Edit3, UserCheck, UserX, Users } from 'lucide-react';
import { formatDate, userStatusLabels } from '@/lib/format';

export default function AdminUsers() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  
  const { data: users, isLoading } = useGetUsers(statusFilter !== 'all' ? { status: statusFilter as any } : undefined);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const approveMutation = useApproveUser();
  const rejectMutation = useRejectUser();
  const deleteMutation = useDeleteUser();
  const passwordMutation = useSetUserPassword();

  const [passwordDialogId, setPasswordDialogId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const { data: session } = useGetSession();
  const isAdmin = session?.role === 'admin';
  const { data: managers } = useGetManagers({ query: { enabled: isAdmin } as any });
  const createManagerMutation = useCreateManager();
  const deleteManagerMutation = useDeleteManager();
  const [mgrName, setMgrName] = useState('');
  const [mgrEmail, setMgrEmail] = useState('');
  const [mgrPassword, setMgrPassword] = useState('');

  const handleCreateManager = () => {
    createManagerMutation.mutate({ data: { name: mgrName.trim(), email: mgrEmail.trim(), password: mgrPassword } }, {
      onSuccess: () => {
        toast({ title: 'Gerente criado com sucesso' });
        setMgrName(''); setMgrEmail(''); setMgrPassword('');
        queryClient.invalidateQueries({ queryKey: getGetManagersQueryKey() });
      },
      onError: (err: any) => toast({ variant: 'destructive', title: 'Erro ao criar gerente', description: err?.response?.data?.error ?? err?.data?.error ?? 'Verifique os dados e tente novamente.' })
    });
  };

  const handleDeleteManager = (id: string) => {
    if (!confirm('Remover este gerente? Ele perderá o acesso ao painel.')) return;
    deleteManagerMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: 'Gerente removido' });
        queryClient.invalidateQueries({ queryKey: getGetManagersQueryKey() });
      },
      onError: () => toast({ variant: 'destructive', title: 'Erro ao remover gerente' })
    });
  };

  const refreshCache = () => {
    queryClient.invalidateQueries({ queryKey: getGetUsersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
  };

  const handleApprove = (id: string) => {
    approveMutation.mutate({ id }, {
      onSuccess: () => { toast({ title: 'Usuário aprovado' }); refreshCache(); },
      onError: () => toast({ variant: 'destructive', title: 'Erro ao aprovar' })
    });
  };

  const handleReject = (id: string) => {
    rejectMutation.mutate({ id }, {
      onSuccess: () => { toast({ title: 'Usuário rejeitado' }); refreshCache(); },
      onError: () => toast({ variant: 'destructive', title: 'Erro ao rejeitar' })
    });
  };

  const handleDelete = (id: string) => {
    if(!confirm('Certeza que deseja deletar este usuário? Esta ação não pode ser desfeita.')) return;
    deleteMutation.mutate({ id }, {
      onSuccess: () => { toast({ title: 'Usuário deletado' }); refreshCache(); },
      onError: () => toast({ variant: 'destructive', title: 'Erro ao deletar' })
    });
  };

  const handleChangePassword = () => {
    if (!passwordDialogId || newPassword.length < 6) {
      toast({ variant: 'destructive', title: 'Senha muito curta', description: 'Mínimo 6 caracteres.' });
      return;
    }
    passwordMutation.mutate({ id: passwordDialogId, data: { password: newPassword } }, {
      onSuccess: () => {
        toast({ title: 'Senha atualizada com sucesso' });
        setPasswordDialogId(null);
        setNewPassword('');
      },
      onError: () => toast({ variant: 'destructive', title: 'Erro ao alterar senha' })
    });
  };

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    return users.filter(u => 
      u.name.toLowerCase().includes(search.toLowerCase()) || 
      u.email.toLowerCase().includes(search.toLowerCase())
    );
  }, [users, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Gestão de Usuários</h1>
          <p className="text-muted-foreground mt-1">Aprove novos clientes e gerencie contas</p>
        </div>
      </div>

      <Card className="glass-panel border-white/10">
        <CardHeader className="border-b border-white/5 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por nome ou e-mail..." 
              className="pl-9 bg-black/20 border-white/10 focus-visible:ring-primary"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px] bg-black/20 border-white/10">
                <SelectValue placeholder="Filtrar por Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="approved">Aprovados</SelectItem>
                <SelectItem value="rejected">Rejeitados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Users className="w-12 h-12 mb-4 opacity-20" />
              <p>Nenhum usuário encontrado.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-white/[0.02]">
                  <TableRow className="border-white/5 hover:bg-transparent">
                    <TableHead className="font-semibold">Usuário</TableHead>
                    <TableHead className="font-semibold">Role</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold text-center">Keys</TableHead>
                    <TableHead className="font-semibold">Criado em</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id} className={`border-white/5 ${user.status === 'pending' ? 'bg-amber-500/[0.02] hover:bg-amber-500/[0.05]' : 'hover:bg-white/[0.02]'}`}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{user.name}</span>
                          <span className="text-xs text-muted-foreground">{user.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] tracking-wider uppercase bg-transparent ${user.role === 'admin' ? 'border-primary text-primary' : 'border-white/10 text-muted-foreground'}`}>
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          className={
                            user.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                            user.status === 'pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                            'bg-red-500/10 text-red-400 border-red-500/20'
                          }
                        >
                          {user.status === 'approved' && <ShieldCheck className="w-3 h-3 mr-1" />}
                          {user.status === 'pending' && <ShieldAlert className="w-3 h-3 mr-1" />}
                          {userStatusLabels[user.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        {user.keyCount}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(user.createdAt)}
                      </TableCell>
                      <TableCell>
                        {user.role !== 'admin' && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="glass-panel border-white/10 min-w-[160px]">
                              {user.status === 'pending' && (
                                <>
                                  <DropdownMenuItem onClick={() => handleApprove(user.id)} className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 cursor-pointer">
                                    <UserCheck className="mr-2 h-4 w-4" /> Aprovar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleReject(user.id)} className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 cursor-pointer">
                                    <UserX className="mr-2 h-4 w-4" /> Rejeitar
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator className="bg-white/10" />
                                </>
                              )}
                              {user.status === 'approved' && (
                                <>
                                  <DropdownMenuItem onClick={() => handleReject(user.id)} className="text-amber-400 hover:bg-white/5 cursor-pointer">
                                    <UserX className="mr-2 h-4 w-4" /> Suspender Acesso
                                  </DropdownMenuItem>
                                </>
                              )}
                              <DropdownMenuItem onClick={() => setPasswordDialogId(user.id)} className="hover:bg-white/5 cursor-pointer">
                                <Edit3 className="mr-2 h-4 w-4" /> Alterar Senha
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-white/10" />
                              <DropdownMenuItem onClick={() => handleDelete(user.id)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer">
                                <Trash2 className="mr-2 h-4 w-4" /> Deletar Conta
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <Card className="glass-panel border-white/10">
          <CardHeader className="border-b border-white/5 pb-4">
            <CardTitle className="text-lg">Gerentes</CardTitle>
            <p className="text-sm text-muted-foreground">Gerentes têm acesso ao painel administrativo: aprovam cadastros, gerenciam usuários e keys. Somente você pode criar gerentes e acessar Promoções.</p>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <Input placeholder="Nome" className="bg-black/20 border-white/10" value={mgrName} onChange={(e) => setMgrName(e.target.value)} />
              <Input placeholder="E-mail" type="email" className="bg-black/20 border-white/10" value={mgrEmail} onChange={(e) => setMgrEmail(e.target.value)} />
              <Input placeholder="Senha (mín. 6)" type="password" className="bg-black/20 border-white/10" value={mgrPassword} onChange={(e) => setMgrPassword(e.target.value)} />
              <Button onClick={handleCreateManager} disabled={createManagerMutation.isPending || mgrName.trim().length < 2 || !mgrEmail.includes('@') || mgrPassword.length < 6}>
                {createManagerMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Criar
              </Button>
            </div>
            {managers && managers.length > 0 ? (
              <div className="space-y-2">
                {managers.map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{m.name}</span>
                      <span className="text-xs text-muted-foreground">{m.email}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => handleDeleteManager(m.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum gerente criado ainda.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!passwordDialogId} onOpenChange={(open) => !open && setPasswordDialogId(null)}>
        <DialogContent className="glass-panel border-white/10 sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Alterar Senha do Usuário</DialogTitle>
            <DialogDescription>
              Defina uma nova senha para este cliente. A senha deve ter no mínimo 6 caracteres.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              type="password"
              placeholder="Nova senha"
              className="bg-black/20 border-white/10 h-10 focus-visible:ring-primary"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialogId(null)} className="border-white/10">Cancelar</Button>
            <Button onClick={handleChangePassword} disabled={passwordMutation.isPending || newPassword.length < 6}>
              {passwordMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar Nova Senha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
