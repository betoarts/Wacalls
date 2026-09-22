import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Pencil, Users2, Smartphone, Check } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { BusinessHoursEditor } from "@/components/domain/settings/BusinessHoursEditor";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listQueues,
  createQueue,
  updateQueue,
  deleteQueue,
  setQueueSessions,
} from "@/services/queues";
import { useSessions, ensureSessionsWired, refreshSessions } from "@/stores/sessions";
import type { Queue } from "@/types/queue";

const DEFAULT_COLORS = [
  "#57adf8", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6", "#06b6d4", "#eab308",
];

type Editing = {
  queue: Queue | null;
  name: string;
  color: string;
  greeting: string;
  distribution: string;
  maxLoad: number;
  sessionIds: string[];
};

const emptyEditing = (): Editing => ({
  queue: null,
  name: "",
  color: DEFAULT_COLORS[0],
  greeting: "",
  distribution: "manual",
  maxLoad: 0,
  sessionIds: [],
});

export default function QueuesPage() {
  const { t } = useTranslation();
  const [queues, setQueues] = useState<Queue[]>([]);
  const sessions = useSessions((s) => s.sessions);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<Editing | null>(null);
  const [toDelete, setToDelete] = useState<Queue | null>(null);

  const DISTRIBUTIONS = [
    { value: "manual", label: t("pages.queues.distManual", { defaultValue: "Manual (sem distribuição)" }) },
    { value: "round-robin", label: t("pages.queues.distRoundRobin", { defaultValue: "Round-robin (rodízio)" }) },
    { value: "least-busy", label: t("pages.queues.distLeastBusy", { defaultValue: "Menor carga" }) },
    { value: "random", label: t("pages.queues.distRandom", { defaultValue: "Aleatório" }) },
  ];

  const load = async () => {
    setLoading(true);
    try {
      const list = await listQueues();
      setQueues(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("pages.queues.errLoad", { defaultValue: "Erro ao carregar filas" }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    ensureSessionsWired();
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openEdit = (q: Queue) => {
    const linkedIds = sessions.filter((s) => s.queueId === q.id).map((s) => s.id);
    setModal({
      queue: q,
      name: q.name,
      color: q.color,
      greeting: q.greeting ?? "",
      distribution: q.distribution || "manual",
      maxLoad: q.maxLoad ?? 0,
      sessionIds: linkedIds,
    });
  };

  const onSave = async () => {
    if (!modal || !modal.name.trim()) return;
    setSaving(true);
    try {
      let targetQueueId = modal.queue?.id;
      if (modal.queue) {
        await updateQueue(modal.queue.id, modal.name.trim(), modal.color, {
          greeting: modal.greeting,
          distribution: modal.distribution,
          maxLoad: modal.maxLoad,
        });
        toast.success(t("pages.queues.updatedToast", { defaultValue: "Fila atualizada" }));
      } else {
        const q = await createQueue(modal.name.trim(), modal.color);
        targetQueueId = q.id;
        if (modal.greeting.trim() || modal.distribution !== "manual" || modal.maxLoad > 0) {
          await updateQueue(q.id, modal.name.trim(), modal.color, {
            greeting: modal.greeting,
            distribution: modal.distribution,
            maxLoad: modal.maxLoad,
          });
        }
        toast.success(t("pages.queues.createdToast", { defaultValue: "Fila criada" }));
      }

      if (targetQueueId) {
        await setQueueSessions(targetQueueId, modal.sessionIds);
        await refreshSessions();
      }

      setModal(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("pages.queues.errSave", { defaultValue: "Erro ao salvar" }));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (q: Queue) => {
    try {
      await deleteQueue(q.id);
      await refreshSessions();
      toast.success(t("pages.queues.removedToast", { defaultValue: "Fila removida" }));
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("pages.queues.errRemove", { defaultValue: "Erro ao remover" }));
    }
  };

  return (
    <AppShell>
      <div className="space-y-5 pb-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
              <Users2 className="h-5 w-5 text-primary" /> {t("pages.queues.title", { defaultValue: "Filas" })}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("pages.queues.subtitle", { defaultValue: "Organize atendimentos em filas e vincule a conexões e usuários." })}
            </p>
          </div>
          <Button onClick={() => setModal(emptyEditing())}>
            <Plus className="h-4 w-4" /> {t("pages.queues.newQueue", { defaultValue: "Nova fila" })}
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : queues.length === 0 ? (
          <div className="grid place-items-center rounded-xl border border-dashed bg-card/40 p-12 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
              <Users2 className="h-5 w-5" />
            </div>
            <div className="mt-3 text-sm font-medium">{t("pages.queues.empty", { defaultValue: "Nenhuma fila criada" })}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t("pages.queues.emptyHint", { defaultValue: "Crie sua primeira fila para começar a organizar atendimentos." })}
            </div>
            <Button className="mt-4" onClick={() => setModal(emptyEditing())}>
              <Plus className="h-4 w-4" /> {t("pages.queues.newQueue", { defaultValue: "Nova fila" })}
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {queues.map((q) => {
              const linkedSessions = sessions.filter((s) => s.queueId === q.id);

              return (
                <div key={q.id} className="rounded-xl border bg-card p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-8 w-8 shrink-0 rounded-lg"
                          style={{ backgroundColor: q.color }}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{q.name}</p>
                          <span className="text-[11px] text-muted-foreground">
                            {DISTRIBUTIONS.find((d) => d.value === (q.distribution || "manual"))?.label}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEdit(q)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => setToDelete(q)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                        <span className="flex items-center gap-1 font-medium">
                          <Smartphone className="h-3.5 w-3.5 text-primary" />
                          {t("pages.queues.linkedConnections", { defaultValue: "Conexões vinculadas" })}
                        </span>
                        <span className="text-[11px] font-semibold bg-muted px-1.5 py-0.2 rounded-full">
                          {linkedSessions.length}
                        </span>
                      </div>
                      {linkedSessions.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">
                          {t("pages.queues.noLinkedConnections", { defaultValue: "Nenhuma conexão vinculada" })}
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {linkedSessions.map((s) => {
                            const isOnline = s.state === "connected" || s.paired;
                            return (
                              <span
                                key={s.id}
                                className="inline-flex items-center gap-1.5 text-xs bg-muted/60 hover:bg-muted border px-2 py-0.5 rounded-md text-foreground transition"
                                title={s.jid ? `${s.name} (${s.jid})` : s.name}
                              >
                                <span
                                  className={`h-2 w-2 rounded-full shrink-0 ${
                                    isOnline ? "bg-emerald-500 shadow-xs shadow-emerald-500/50" : "bg-zinc-400"
                                  }`}
                                />
                                <span className="truncate max-w-[130px] font-medium">{s.name}</span>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!modal} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {modal?.queue
                ? t("pages.queues.editTitle", { defaultValue: "Editar fila" })
                : t("pages.queues.newQueue", { defaultValue: "Nova fila" })}
            </DialogTitle>
          </DialogHeader>
          {modal && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("common.name", { defaultValue: "Nome" })}</Label>
                <Input
                  value={modal.name}
                  onChange={(e) => setModal({ ...modal, name: e.target.value })}
                  placeholder={t("pages.queues.namePlaceholder", { defaultValue: "Ex: Vendas, Suporte..." })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("common.color", { defaultValue: "Cor" })}</Label>
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setModal({ ...modal, color: c })}
                      className={`h-8 w-8 rounded-md border-2 transition ${
                        modal.color === c ? "border-foreground" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c }}
                      aria-label={t("pages.queues.colorAria", { defaultValue: "Cor {{color}}", color: c })}
                    />
                  ))}
                  <Input
                    type="color"
                    value={modal.color}
                    onChange={(e) => setModal({ ...modal, color: e.target.value })}
                    className="h-8 w-14 cursor-pointer p-1"
                  />
                </div>
              </div>

              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                    <Smartphone className="h-4 w-4 text-primary" />
                    {t("pages.queues.linkedConnections", { defaultValue: "Conexões WhatsApp vinculadas" })}
                  </Label>
                  <span className="text-xs text-muted-foreground font-medium">
                    {modal.sessionIds.length}{" "}
                    {modal.sessionIds.length === 1 ? "selecionada" : "selecionadas"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("pages.queues.connectionsSelectHint", {
                    defaultValue:
                      "Selecione quais conexões direcionarão novos atendimentos diretamente para esta fila.",
                  })}
                </p>

                {sessions.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground bg-muted/30">
                    Nenhuma conexão de WhatsApp cadastrada. Cadastre em Conexões.
                  </div>
                ) : (
                  <div className="grid gap-2 max-h-48 overflow-y-auto pr-1">
                    {sessions.map((sess) => {
                      const isSelected = modal.sessionIds.includes(sess.id);
                      const isOnline = sess.state === "connected" || sess.paired;
                      const otherQueue =
                        !isSelected && sess.queueId && sess.queueId !== modal.queue?.id
                          ? queues.find((q) => q.id === sess.queueId)
                          : null;

                      return (
                        <label
                          key={sess.id}
                          className={`flex items-center justify-between gap-3 p-2.5 rounded-lg border text-sm cursor-pointer transition select-none ${
                            isSelected
                              ? "border-primary bg-primary/5 shadow-xs"
                              : "border-border hover:bg-muted/40"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                setModal({
                                  ...modal,
                                  sessionIds: isSelected
                                    ? modal.sessionIds.filter((id) => id !== sess.id)
                                    : [...modal.sessionIds, sess.id],
                                });
                              }}
                              className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                            />
                            <div
                              className="h-3 w-3 rounded-full shrink-0"
                              style={{ backgroundColor: sess.color || "#57adf8" }}
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium truncate">{sess.name}</span>
                                <span
                                  className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
                                    isOnline ? "bg-emerald-500" : "bg-zinc-400"
                                  }`}
                                />
                              </div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                {sess.jid || "Aguardando pareamento"}
                                {otherQueue && (
                                  <span className="ml-1.5 text-amber-600 dark:text-amber-400 font-medium">
                                    (atualmente em: {otherQueue.name})
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <span
                            className={`text-[11px] px-2 py-0.5 rounded font-medium shrink-0 ${
                              isSelected
                                ? "bg-primary/15 text-primary"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {isSelected ? "Vinculada" : "Não vinculada"}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 border-t pt-4">
                <div className="space-y-2">
                  <Label>{t("pages.queues.distributionLabel", { defaultValue: "Distribuição automática" })}</Label>
                  <select
                    value={modal.distribution}
                    onChange={(e) => setModal({ ...modal, distribution: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {DISTRIBUTIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{t("pages.queues.maxLoadLabel", { defaultValue: "Limite de atendimentos por agente" })}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={modal.maxLoad}
                    onChange={(e) =>
                      setModal({ ...modal, maxLoad: Math.max(0, Number(e.target.value) || 0) })
                    }
                    placeholder={t("pages.queues.maxLoadPlaceholder", { defaultValue: "0 = sem limite" })}
                  />
                </div>
                <p className="sm:col-span-2 text-xs text-muted-foreground">
                  {t("pages.queues.autoAssignHint", {
                    defaultValue: "Novas conversas desta fila são atribuídas automaticamente aos agentes vinculados, respeitando o horário de atendimento e o limite de atendimentos simultâneos.",
                  })}
                </p>
              </div>

              {modal.queue && <BusinessHoursEditor scope="queue" scopeId={modal.queue.id} />}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(null)}>
              {t("common.cancel", { defaultValue: "Cancelar" })}
            </Button>
            <Button onClick={onSave} disabled={saving || !modal?.name.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.save", { defaultValue: "Salvar" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={t("pages.queues.deleteTitle", { defaultValue: "Remover fila?" })}
        description={toDelete ? t("pages.queues.deleteDescription", { defaultValue: 'A fila "{{name}}" será removida.', name: toDelete.name }) : undefined}
        confirmLabel={t("pages.queues.remove", { defaultValue: "Remover" })}
        destructive
        onConfirm={() => {
          if (toDelete) void onDelete(toDelete);
        }}
      />
    </AppShell>
  );
}
