import { Fragment, useEffect, useMemo, useRef, useState, type ElementType } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  History,
  Image as ImageIcon,
  Key,
  Layers,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  Trash2,
  Upload,
  User as UserIcon,
  UserCheck,
  Users,
  Wifi,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { AcessosAbertos } from "@/components/domain/settings/AcessosAbertos";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as authApi from "@/services/auth";
import type { RoleAuditEntry } from "@/services/auth";
import { listQueues } from "@/services/queues";
import { useAuth } from "@/stores/auth";
import { ensureSessionsWired, useSessions } from "@/stores/sessions";
import type { AuthUser } from "@/types/auth";
import type { Queue } from "@/types/queue";
import { PERMISSIONS, DEFAULT_PERMISSIONS, type Permission } from "@/lib/permissions";
import { ensureQuota } from "@/lib/quota";
import { toastError } from "@/lib/error-toast";
import { useTranslation } from "react-i18next";

type FormState = {
  email: string;
  name: string;
  password: string;
  companyName: string;
  cpf: string;
  role: "admin" | "user";
  queueIds: string[];
  sessionIds: string[];
  permissions: Permission[];
};

const emptyForm: FormState = {
  email: "",
  name: "",
  password: "",
  companyName: "",
  cpf: "",
  role: "admin",
  queueIds: [],
  sessionIds: [],
  permissions: [...DEFAULT_PERMISSIONS],
};

const UserAvatar = ({
  name,
  email,
  avatarUrl,
  size = "md",
}: {
  name?: string;
  email: string;
  avatarUrl?: string;
  size?: "sm" | "md" | "lg";
}) => {
  const [imgError, setImgError] = useState(false);
  const sizeClasses = {
    sm: "h-7 w-7 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-16 w-16 text-xl",
  }[size];

  const initials = useMemo(() => {
    const raw = (name?.trim() || email.split("@")[0] || "?").toUpperCase();
    const parts = raw.split(" ").filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`;
    return raw.slice(0, 2);
  }, [name, email]);

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name || email}
        onError={() => setImgError(true)}
        className={`${sizeClasses} rounded-full object-cover border border-border/50 shadow-xs shrink-0`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses} rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center border border-primary/20 shrink-0 select-none shadow-xs`}
    >
      {initials}
    </div>
  );
};

export const AdminUsersPage = ({ embedded = false }: { embedded?: boolean } = {}) => {
  const { t } = useTranslation();
  const me = useAuth((s) => s.user);
  const canManage = !!me?.roles.includes("admin");
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const sessions = useSessions((s) => s.sessions);
  useEffect(() => {
    ensureSessionsWired();
  }, []);

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [toDelete, setToDelete] = useState<AuthUser | null>(null);
  const [editing, setEditing] = useState<AuthUser | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Avatar upload inside modal
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);

  // Role change states
  const [roleChange, setRoleChange] = useState<{ user: AuthUser; nextRole: "admin" | "user" } | null>(null);
  const [roleSaving, setRoleSaving] = useState(false);

  // Role Audit log
  const [audit, setAudit] = useState<RoleAuditEntry[]>([]);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);

  const adminCount = useMemo(() => users.filter((u) => u.roles.includes("admin")).length, [users]);
  const agentCount = useMemo(() => users.length - adminCount, [users, adminCount]);

  const loadAudit = async () => {
    setAuditLoading(true);
    try {
      setAudit(await authApi.listRoleAudit(100));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    if (auditOpen && canManage) void loadAudit();
  }, [auditOpen, canManage]);

  const queueById = useMemo(() => {
    const m = new Map<string, Queue>();
    queues.forEach((q) => m.set(q.id, q));
    return m;
  }, [queues]);

  const sessionById = useMemo(() => {
    const m = new Map<string, (typeof sessions)[0]>();
    sessions.forEach((s) => m.set(s.id, s));
    return m;
  }, [sessions]);

  const reload = async () => {
    setLoading(true);
    try {
      const [u, q] = await Promise.all([authApi.listUsers(), listQueues()]);
      setUsers(u);
      setQueues(q);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const openCreate = () => {
    setForm({ ...emptyForm, permissions: [...DEFAULT_PERMISSIONS] });
    setAvatarFile(null);
    setAvatarPreview(null);
    setAvatarRemoved(false);
    setCreating(true);
  };

  const openEdit = async (u: AuthUser) => {
    setAvatarFile(null);
    setAvatarPreview(u.avatarUrl || null);
    setAvatarRemoved(false);
    setForm({
      email: u.email,
      name: u.name ?? "",
      password: "",
      companyName: u.companyName ?? "",
      cpf: u.cpf ?? "",
      role: u.roles.includes("admin") ? "admin" : "user",
      queueIds: u.queueIds ?? [],
      sessionIds: u.sessionIds ?? [],
      permissions: (u.permissions as Permission[]) ?? [],
    });
    setEditing(u);
    try {
      const [ids, perms, sids] = await Promise.all([
        authApi.getUserQueues(u.id),
        authApi.getUserPermissions(u.id),
        authApi.getUserSessions(u.id),
      ]);
      setForm((f) => ({ ...f, queueIds: ids, permissions: perms as Permission[], sessionIds: sids }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error("A foto deve ter no máximo 4MB.");
      return;
    }
    setAvatarFile(file);
    setAvatarRemoved(false);
    const reader = new FileReader();
    reader.onload = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    setAvatarRemoved(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const toggleQueueInForm = (id: string) =>
    setForm((f) => ({
      ...f,
      queueIds: f.queueIds.includes(id) ? f.queueIds.filter((x) => x !== id) : [...f.queueIds, id],
    }));

  const toggleSessionInForm = (id: string) =>
    setForm((f) => ({
      ...f,
      sessionIds: f.sessionIds.includes(id) ? f.sessionIds.filter((x) => x !== id) : [...f.sessionIds, id],
    }));

  const togglePermissionInForm = (key: Permission) =>
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter((x) => x !== key)
        : [...f.permissions, key],
    }));

  const setAllPermissions = (on: boolean) =>
    setForm((f) => ({ ...f, permissions: on ? PERMISSIONS.map((p) => p.key) : [] }));

  const submitCreate = async () => {
    if (!ensureQuota("usuarios", users.length)) return;
    setSaving(true);
    try {
      const created = await authApi.createUser({
        email: form.email.trim(),
        password: form.password,
        name: form.name.trim(),
        companyName: form.companyName.trim(),
        cpf: form.cpf.trim(),
        role: form.role,
        queueIds: form.queueIds,
      });

      if (form.role !== "admin") {
        await authApi.setUserPermissions(created.id, form.permissions);
      }
      if (form.sessionIds.length) {
        await authApi.setUserSessions(created.id, form.sessionIds);
      }
      if (avatarFile) {
        try {
          await authApi.uploadUserAvatar(created.id, avatarFile);
        } catch (err) {
          toast.error("Usuário criado, mas houve erro ao salvar o avatar.");
        }
      }

      toast.success(t("pages.users.createdToast", { defaultValue: "Usuário criado com sucesso!" }));
      setCreating(false);
      await reload();
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  const submitEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await authApi.updateUser(editing.id, {
        email: form.email.trim(),
        name: form.name.trim(),
        companyName: form.companyName.trim(),
        cpf: form.cpf.trim(),
        newPassword: form.password || undefined,
      });
      await authApi.setUserQueues(editing.id, form.queueIds);
      await authApi.setUserPermissions(editing.id, form.permissions);
      await authApi.setUserSessions(editing.id, form.sessionIds);

      if (avatarFile) {
        await authApi.uploadUserAvatar(editing.id, avatarFile);
      } else if (avatarRemoved) {
        await authApi.deleteUserAvatar(editing.id);
      }

      toast.success(t("pages.users.updatedToast", { defaultValue: "Usuário atualizado com sucesso!" }));
      setEditing(null);
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const requestRoleChange = (u: AuthUser, nextRole: "admin" | "user") => {
    const isCurrentlyAdmin = u.roles.includes("admin");
    const wantsAdmin = nextRole === "admin";
    if (isCurrentlyAdmin === wantsAdmin) return;
    if (!wantsAdmin && u.id === me?.id) {
      toast.error(
        t("pages.users.errRemoveOwnAdmin", {
          defaultValue: "Você não pode remover seu próprio papel de administrador.",
        }),
      );
      return;
    }
    if (!wantsAdmin && isCurrentlyAdmin && adminCount <= 1) {
      toast.error(
        t("pages.users.errNeedOneAdmin", {
          defaultValue: "É necessário pelo menos um administrador ativo no sistema.",
        }),
      );
      return;
    }
    setRoleChange({ user: u, nextRole });
  };

  const confirmRoleChange = async () => {
    if (!roleChange) return;
    const { user: u, nextRole } = roleChange;
    setRoleSaving(true);
    try {
      await authApi.setRole(u.id, "admin", nextRole === "admin");
      toast.success(
        nextRole === "admin"
          ? `${u.name || u.email} foi promovido a Administrador.`
          : `${u.name || u.email} agora é Atendente.`,
      );
      setRoleChange(null);
      await reload();
      if (auditOpen) void loadAudit();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRoleSaving(false);
    }
  };

  const remove = async (u: AuthUser) => {
    if (u.id === me?.id) {
      toast.error("Você não pode excluir sua própria conta.");
      return;
    }
    if (u.roles.includes("admin") && adminCount <= 1) {
      toast.error("Não é possível excluir o único administrador ativo.");
      return;
    }
    try {
      await authApi.deleteUser(u.id);
      toast.success("Usuário removido.");
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return users;
    const q = searchTerm.toLowerCase().trim();
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.companyName && u.companyName.toLowerCase().includes(q)),
    );
  }, [users, searchTerm]);

  const dialogOpen = creating || !!editing;
  const closeDialog = () => {
    setCreating(false);
    setEditing(null);
    setAvatarFile(null);
    setAvatarPreview(null);
    setAvatarRemoved(false);
  };

  const Wrapper: ElementType = embedded ? Fragment : AppShell;

  return (
    <Wrapper>
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              Gestão de Usuários e Operadores
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Gerencie atendentes e administradores, permissões por módulo, fotos, assinaturas e vínculos com filas e conexões.
            </p>
          </div>
          {canManage && (
            <Button onClick={openCreate} className="shadow-sm">
              <Plus className="mr-1.5 h-4 w-4" /> Novo Usuário
            </Button>
          )}
        </div>

        {/* Stats KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border bg-card p-3.5 shadow-xs flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total de Usuários</p>
              <p className="text-xl font-bold">{users.length}</p>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-3.5 shadow-xs flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Administradores</p>
              <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{adminCount}</p>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-3.5 shadow-xs flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <UserIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Atendentes</p>
              <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{agentCount}</p>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-3.5 shadow-xs flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Filas Cadastradas</p>
              <p className="text-xl font-bold text-purple-600 dark:text-purple-400">{queues.length}</p>
            </div>
          </div>
        </div>

        {/* Acessos Abertos (Quem está online) */}
        {canManage && <AcessosAbertos />}

        {/* Audit Log Box */}
        {canManage && (
          <div className="rounded-xl border bg-card shadow-xs overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => setAuditOpen((o) => !o)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm hover:bg-muted/40 transition-colors"
            >
              <span className="flex items-center gap-2 font-medium text-foreground">
                <History className="h-4 w-4 text-primary" />
                <span>Histórico Auditável de Mudança de Papéis (Quem promoveu/rebaixou quem)</span>
                {audit.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[11px] px-1.5 py-0 font-normal">
                    {audit.length} registros
                  </Badge>
                )}
              </span>
              <span className="text-xs font-medium text-primary hover:underline">
                {auditOpen ? "Ocultar Histórico" : "Ver Histórico Completo"}
              </span>
            </button>

            {auditOpen && (
              <div className="border-t bg-muted/20">
                <div className="p-3 flex items-center justify-between border-b bg-background/50">
                  <span className="text-xs text-muted-foreground">
                    Logs registrados automaticamente a cada alteração de permissão administrativa:
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1"
                    onClick={() => void loadAudit()}
                    disabled={auditLoading}
                  >
                    <RefreshCw className={`h-3 w-3 ${auditLoading ? "animate-spin" : ""}`} /> Atualizar
                  </Button>
                </div>

                {auditLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : audit.length === 0 ? (
                  <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                    Nenhuma mudança de papel registrada até o momento.
                  </p>
                ) : (
                  <div className="max-h-72 overflow-y-auto divide-y divide-border/60">
                    {audit.map((e) => (
                      <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {e.actorEmail || e.actorId || "Sistema"}
                          </span>
                          {e.granted ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-600 dark:text-emerald-400 font-medium border border-emerald-500/20">
                              <ArrowUpRight className="h-3 w-3" /> promoveu a
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-rose-600 dark:text-rose-400 font-medium border border-rose-500/20">
                              <ArrowDownRight className="h-3 w-3" /> rebaixou para atendente
                            </span>
                          )}
                          <RoleBadge role={e.granted ? "admin" : "user"} />
                          <span className="text-muted-foreground">o usuário</span>
                          <span className="font-semibold text-foreground">{e.targetEmail || e.targetId}</span>
                        </div>
                        <time className="text-muted-foreground font-mono text-[11px]">
                          {new Date(e.createdAt * 1000).toLocaleString("pt-BR")}
                        </time>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Users Table Card */}
        <div className="rounded-xl border bg-card shadow-xs overflow-hidden">
          {/* Table Toolbar */}
          <div className="p-3.5 border-b bg-muted/20 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filtrar por nome, email ou empresa..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Exibindo <strong>{filteredUsers.length}</strong> de <strong>{users.length}</strong> usuários</span>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground border-b uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="px-4 py-3">Usuário & Assinatura</th>
                    <th className="px-3 py-3">Papel / Função</th>
                    <th className="px-3 py-3">Filas Vinculadas</th>
                    <th className="px-3 py-3">Conexões</th>
                    <th className="px-3 py-3">Permissões</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredUsers.map((u) => {
                    const isMe = u.id === me?.id;
                    const isAdmin = u.roles.includes("admin");
                    const userQueueIds = u.queueIds ?? [];
                    const userSessionIds = u.sessionIds ?? [];
                    const userPerms = u.permissions ?? [];

                    return (
                      <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                        {/* User / Photo / Signature */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <UserAvatar name={u.name} email={u.email} avatarUrl={u.avatarUrl} size="md" />
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-semibold text-foreground truncate max-w-[200px]">
                                  {u.name?.trim() || u.email.split("@")[0]}
                                </span>
                                {isMe && (
                                  <Badge variant="outline" className="text-[10px] py-0 px-1 text-primary border-primary/40">
                                    você
                                  </Badge>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground truncate max-w-[220px]">
                                {u.email}
                              </span>
                              {u.name?.trim() && (
                                <span className="text-[10.5px] text-muted-foreground/80 mt-0.5 flex items-center gap-1">
                                  <span className="font-medium text-[10px] uppercase text-primary/80">Assinatura:</span> {u.name}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Role & Quick Promotion */}
                        <td className="px-3 py-3 align-middle">
                          <div className="flex flex-col gap-1.5 items-start">
                            <RoleBadge role={isAdmin ? "admin" : "user"} />
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => requestRoleChange(u, isAdmin ? "user" : "admin")}
                                disabled={isMe || (isAdmin && adminCount <= 1)}
                                title={
                                  isMe
                                    ? "Você não pode alterar seu próprio papel."
                                    : isAdmin && adminCount <= 1
                                    ? "Único administrador ativo."
                                    : isAdmin
                                    ? "Clique para rebaixar para Atendente"
                                    : "Clique para promover a Administrador"
                                }
                                className={`text-[11px] font-medium flex items-center gap-1 transition-colors ${
                                  isMe || (isAdmin && adminCount <= 1)
                                    ? "text-muted-foreground/50 cursor-not-allowed"
                                    : isAdmin
                                    ? "text-rose-600 hover:text-rose-700 hover:underline"
                                    : "text-amber-600 hover:text-amber-700 hover:underline"
                                }`}
                              >
                                {isAdmin ? (
                                  <>
                                    <ArrowDownRight className="h-3 w-3" /> Rebaixar
                                  </>
                                ) : (
                                  <>
                                    <ArrowUpRight className="h-3 w-3" /> Promover a Admin
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Linked Queues */}
                        <td className="px-3 py-3 align-middle">
                          {isAdmin ? (
                            <span className="text-xs text-muted-foreground italic flex items-center gap-1">
                              <Check className="h-3 w-3 text-emerald-500" /> Todas as filas (Admin)
                            </span>
                          ) : userQueueIds.length === 0 ? (
                            <span className="text-xs text-muted-foreground">— Nenhuma fila</span>
                          ) : (
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {userQueueIds.map((qid) => {
                                const q = queueById.get(qid);
                                return (
                                  <span
                                    key={qid}
                                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium text-white shadow-2xs"
                                    style={{ backgroundColor: q?.color || "#6b7280" }}
                                  >
                                    {q?.name || qid}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>

                        {/* Linked Connections */}
                        <td className="px-3 py-3 align-middle">
                          {isAdmin ? (
                            <span className="text-xs text-muted-foreground italic flex items-center gap-1">
                              <Check className="h-3 w-3 text-emerald-500" /> Todas as conexões (Admin)
                            </span>
                          ) : userSessionIds.length === 0 ? (
                            <span className="text-xs text-muted-foreground">— Todas liberadas</span>
                          ) : (
                            <div className="flex flex-wrap gap-1 max-w-[180px]">
                              {userSessionIds.map((sid) => {
                                const s = sessionById.get(sid);
                                return (
                                  <span
                                    key={sid}
                                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10.5px] font-medium text-primary"
                                  >
                                    <Wifi className="h-2.5 w-2.5" />
                                    {s?.name || sid}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>

                        {/* Granular Permissions */}
                        <td className="px-3 py-3 align-middle">
                          {isAdmin ? (
                            <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300 text-xs">
                              Acesso Total
                            </Badge>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md border bg-muted/60 px-2 py-0.5 text-xs text-foreground">
                              <Key className="h-3 w-3 text-muted-foreground" />
                              <strong>{userPerms.length}</strong> / {PERMISSIONS.length} módulos
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 align-middle text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {canManage ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void openEdit(u)}
                                  className="h-8 gap-1 text-xs"
                                >
                                  <Pencil className="h-3.5 w-3.5" /> Editar
                                </Button>
                                {!isMe && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setToDelete(u)}
                                    title="Excluir usuário"
                                    className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                        Nenhum usuário encontrado com os filtros informados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Edit / Create User Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              {editing ? <Pencil className="h-5 w-5 text-primary" /> : <Plus className="h-5 w-5 text-primary" />}
              {editing ? "Editar Usuário / Atendente" : "Novo Usuário / Atendente"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Configure foto de perfil, dados de acesso, filas permitidas, conexões e permissões granulares por módulo."
                : "Cadastre um novo membro na equipe com foto, permissões e filas de atendimento."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            {/* Foto de Perfil / Avatar Upload */}
            <div className="flex items-center gap-4 rounded-lg border bg-muted/20 p-3.5">
              <UserAvatar
                name={form.name}
                email={form.email || "user@example.com"}
                avatarUrl={avatarPreview || undefined}
                size="lg"
              />
              <div className="flex-1 space-y-1">
                <Label className="text-xs font-semibold text-foreground">Foto de Perfil do Usuário</Label>
                <p className="text-[11px] text-muted-foreground">
                  A foto é exibida nas conversas, transferências de chat e listagem de atendentes.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={handleAvatarSelect}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-3 w-3" /> {avatarPreview ? "Trocar Foto" : "Enviar Foto"}
                  </Button>
                  {avatarPreview && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:bg-destructive/10"
                      onClick={handleRemoveAvatar}
                    >
                      <X className="h-3 w-3 mr-1" /> Remover
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Basic Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="col-span-2 sm:col-span-1 space-y-1.5">
                <Label htmlFor="u-email">Email de Acesso *</Label>
                <Input
                  id="u-email"
                  type="email"
                  placeholder="exemplo@empresa.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>

              <div className="col-span-2 sm:col-span-1 space-y-1.5">
                <Label htmlFor="u-name">Nome do Usuário & Assinatura *</Label>
                <Input
                  id="u-name"
                  placeholder="Ex.: João Silva (usado na assinatura do chat)"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="u-pwd">
                  {editing ? "Nova Senha (opcional)" : "Senha de Acesso *"}
                </Label>
                <Input
                  id="u-pwd"
                  type="password"
                  placeholder={
                    editing
                      ? "Deixe em branco para manter a senha atual"
                      : "Mínimo de 8 caracteres"
                  }
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="u-company">Empresa</Label>
                <Input
                  id="u-company"
                  placeholder="Nome da empresa"
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="u-cpf">CPF / Documento</Label>
                <Input
                  id="u-cpf"
                  placeholder="000.000.000-00"
                  value={form.cpf}
                  onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                />
              </div>
            </div>

            {/* Role Selector */}
            <div className="space-y-2 rounded-lg border p-3 bg-card">
              <Label className="font-semibold text-xs text-foreground">Papel no Sistema (Função)</Label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, role: "admin" })}
                  className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-all ${
                    form.role === "admin"
                      ? "border-amber-500 bg-amber-500/10 text-foreground ring-1 ring-amber-500/30"
                      : "border-border hover:bg-muted/50 text-muted-foreground"
                  }`}
                >
                  <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="block font-semibold text-xs text-foreground">Administrador</span>
                    <span className="block text-[11px] text-muted-foreground mt-0.5">
                      Acesso total: gerencia usuários, configurações, conexões e todas as filas.
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setForm({ ...form, role: "user" })}
                  className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-all ${
                    form.role === "user"
                      ? "border-blue-500 bg-blue-500/10 text-foreground ring-1 ring-blue-500/30"
                      : "border-border hover:bg-muted/50 text-muted-foreground"
                  }`}
                >
                  <UserIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="block font-semibold text-xs text-foreground">Atendente</span>
                    <span className="block text-[11px] text-muted-foreground mt-0.5">
                      Acesso restrito às filas, conexões e permissões concedidas abaixo.
                    </span>
                  </div>
                </button>
              </div>
            </div>

            {/* Filas Vinculadas */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-semibold text-xs text-foreground">Filas Vinculadas</Label>
                <span className="text-[11px] text-muted-foreground">
                  O atendente receberá tickets apenas destas filas selecionadas.
                </span>
              </div>
              {queues.length === 0 ? (
                <p className="rounded-md border p-3 text-xs text-muted-foreground">
                  Nenhuma fila cadastrada no sistema. Cadastre filas no menu lateral.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 rounded-lg border p-2.5 bg-muted/10">
                  {queues.map((q) => {
                    const on = form.queueIds.includes(q.id);
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => toggleQueueInForm(q.id)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                          on
                            ? "border-transparent text-white shadow-xs"
                            : "border-border bg-background text-foreground hover:bg-muted"
                        }`}
                        style={on ? { backgroundColor: q.color } : undefined}
                      >
                        {on && <Check className="h-3 w-3" />}
                        {q.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Conexões Vinculadas */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-semibold text-xs text-foreground">Conexões WhatsApp Permitidas</Label>
                <span className="text-[11px] text-muted-foreground">
                  Deixe vazio para permitir todas ou restrinja às selecionadas.
                </span>
              </div>
              {sessions.length === 0 ? (
                <p className="rounded-md border p-3 text-xs text-muted-foreground">
                  Nenhuma conexão WhatsApp pareada no momento.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 rounded-lg border p-2.5 bg-muted/10">
                  {sessions.map((s) => {
                    const on = form.sessionIds.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleSessionInForm(s.id)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                          on
                            ? "border-transparent bg-primary text-primary-foreground shadow-xs"
                            : "border-border bg-background text-foreground hover:bg-muted"
                        }`}
                      >
                        <Wifi className="h-3 w-3" />
                        {s.name || s.id}
                        {on && <Check className="h-3 w-3 ml-0.5" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Granular Permissions Matrix */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-semibold text-xs text-foreground">Permissões Granulares por Módulo</Label>
                {form.role !== "admin" && (
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      className="text-primary hover:underline font-medium"
                      onClick={() => setAllPermissions(true)}
                    >
                      Marcar todos
                    </button>
                    <span className="text-muted-foreground">·</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground font-medium"
                      onClick={() => setAllPermissions(false)}
                    >
                      Limpar
                    </button>
                  </div>
                )}
              </div>

              {form.role === "admin" ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
                  <Shield className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>
                    Administradores possuem <strong>acesso irrestrito</strong> a todos os módulos e configurações do sistema.
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border p-2.5 max-h-56 overflow-y-auto bg-muted/10">
                  {PERMISSIONS.map((p) => {
                    const checked = form.permissions.includes(p.key);
                    return (
                      <label
                        key={p.key}
                        className={`flex cursor-pointer items-start gap-2.5 rounded-md p-2 text-xs transition border ${
                          checked
                            ? "border-primary/40 bg-primary/5"
                            : "border-transparent hover:bg-muted/50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-border accent-primary shrink-0"
                          checked={checked}
                          onChange={() => togglePermissionInForm(p.key)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-foreground leading-tight">{p.label}</span>
                          <span className="block text-[11px] text-muted-foreground mt-0.5">
                            {p.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="pt-3 border-t">
            <Button variant="ghost" onClick={closeDialog} disabled={saving}>
              Cancelar
            </Button>
            <Button
              onClick={() => (editing ? void submitEdit() : void submitCreate())}
              disabled={saving || !form.email || (!editing && !form.password)}
              className="gap-1.5"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Salvar Alterações" : "Criar Usuário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation */}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir Usuário"
        description={
          toDelete
            ? `Tem certeza que deseja excluir ${toDelete.name || toDelete.email}? O usuário perderá o acesso e as sessões ficarão sem responsável.`
            : undefined
        }
        confirmLabel="Excluir Definitivamente"
        destructive
        onConfirm={() => {
          if (toDelete) void remove(toDelete);
        }}
      />

      {/* Promote / Demote Role Confirmation with Safeguard */}
      <ConfirmDialog
        open={!!roleChange}
        onOpenChange={(o) => !o && !roleSaving && setRoleChange(null)}
        title={
          roleChange?.nextRole === "admin"
            ? "Promover a Administrador?"
            : "Rebaixar para Atendente?"
        }
        description={
          roleChange
            ? roleChange.nextRole === "admin"
              ? `${roleChange.user.name || roleChange.user.email} terá privilégios administrativos completos no sistema (gestão de usuários, empresas e conexões).`
              : `${roleChange.user.name || roleChange.user.email} perderá os acessos administrativos e ficará limitado às filas e conexões atribuídas.`
            : undefined
        }
        confirmLabel={roleChange?.nextRole === "admin" ? "Promover a Administrador" : "Rebaixar para Atendente"}
        destructive={roleChange?.nextRole === "user"}
        onConfirm={() => void confirmRoleChange()}
      />
    </Wrapper>
  );
};

const RoleBadge = ({ role }: { role: "admin" | "user" }) => {
  const isAdmin = role === "admin";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
        isAdmin
          ? "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300"
          : "border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-300"
      }`}
    >
      {isAdmin ? <Shield className="h-3 w-3" /> : <UserIcon className="h-3 w-3" />}
      {isAdmin ? "Administrador" : "Atendente"}
    </span>
  );
};