import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listOperators, transferChat, assignChatTo, type OperatorRef } from "@/services/chats";
import { listQueues } from "@/services/queues";
import type { Queue } from "@/types/queue";
import { tagChipStyle } from "@/lib/tag-color";
import { Layers, User } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  chatJid: string;
  chatName: string;
  excludeUserId?: string | null;
  onTransferred?: () => void;
}

type TargetTab = "operator" | "queue";

export const TransferDialog = ({ open, onOpenChange, sessionId, chatJid, chatName, excludeUserId, onTransferred }: Props) => {
  const [tab, setTab] = useState<TargetTab>("operator");
  const [operators, setOperators] = useState<OperatorRef[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [pickedUser, setPickedUser] = useState<string | null>(null);
  const [pickedQueue, setPickedQueue] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab("operator");
    setQuery("");
    setPickedUser(null);
    setPickedQueue(null);
    setLoading(true);
    Promise.all([
      listOperators().catch(() => [] as OperatorRef[]),
      listQueues().catch(() => [] as Queue[]),
    ])
      .then(([ops, qs]) => {
        setOperators(ops);
        setQueues(qs);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Não foi possível carregar operadores ou filas"))
      .finally(() => setLoading(false));
  }, [open]);

  const filteredOperators = useMemo(() => {
    const q = query.trim().toLowerCase();
    return operators
      .filter((o) => !excludeUserId || o.id !== excludeUserId)
      .filter((o) =>
        !q
          ? true
          : o.email.toLowerCase().includes(q) ||
            (o.name ?? "").toLowerCase().includes(q) ||
            (o.companyName ?? "").toLowerCase().includes(q),
      );
  }, [operators, query, excludeUserId]);

  const filteredQueues = useMemo(() => {
    const q = query.trim().toLowerCase();
    return queues.filter((item) =>
      !q ? true : item.name.toLowerCase().includes(q),
    );
  }, [queues, query]);

  const handleConfirm = async () => {
    if (tab === "operator" && !pickedUser) return;
    if (tab === "queue" && !pickedQueue) return;
    setBusy(true);
    try {
      if (tab === "operator" && pickedUser) {
        await transferChat(sessionId, chatJid, pickedUser);
      } else if (tab === "queue" && pickedQueue) {
        await assignChatTo(sessionId, chatJid, { queueId: pickedQueue });
      }
      toast.success(tab === "operator" ? "Atendimento transferido para o operador" : "Atendimento transferido para a fila");
      onTransferred?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao transferir");
    } finally {
      setBusy(false);
    }
  };

  const isSelected = tab === "operator" ? !!pickedUser : !!pickedQueue;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transferir atendimento</DialogTitle>
          <DialogDescription>Escolha o destino para a conversa “{chatName}”.</DialogDescription>
        </DialogHeader>

        {queues.length > 0 && (
          <div className="flex rounded-lg border bg-muted/30 p-1 text-xs">
            <button
              type="button"
              onClick={() => setTab("operator")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 font-medium transition-colors ${
                tab === "operator" ? "bg-background shadow-xs text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <User className="h-3.5 w-3.5" />
              Operador ({operators.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("queue")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 font-medium transition-colors ${
                tab === "queue" ? "bg-background shadow-xs text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              Fila ({queues.length})
            </button>
          </div>
        )}

        <Input
          autoFocus
          placeholder={tab === "operator" ? "Buscar por e-mail ou nome…" : "Buscar por nome da fila…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="scrollbar-thin max-h-72 overflow-y-auto rounded-md border">
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">Carregando…</div>
          ) : tab === "operator" ? (
            filteredOperators.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">Nenhum operador encontrado.</div>
            ) : (
              <ul>
                {filteredOperators.map((op) => {
                  const active = pickedUser === op.id;
                  return (
                    <li key={op.id}>
                      <button
                        type="button"
                        onClick={() => setPickedUser(op.id)}
                        className={`flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/60 ${active ? "bg-muted" : ""}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">
                            {op.name?.trim() || op.email}
                          </span>
                          {(op.name?.trim() ? op.email : op.companyName) && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {op.name?.trim() ? op.email : op.companyName}
                            </span>
                          )}
                        </span>
                        {active && (
                          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
                            Selecionado
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
          ) : (
            filteredQueues.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">Nenhuma fila encontrada.</div>
            ) : (
              <ul>
                {filteredQueues.map((q) => {
                  const active = pickedQueue === q.id;
                  return (
                    <li key={q.id}>
                      <button
                        type="button"
                        onClick={() => setPickedQueue(q.id)}
                        className={`flex w-full items-center justify-between gap-3 border-b px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-muted/60 ${active ? "bg-muted" : ""}`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: q.color || "#57adf8" }}
                          />
                          <span className="truncate font-medium text-foreground">
                            {q.name}
                          </span>
                        </span>
                        {active && (
                          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
                            Selecionada
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!isSelected || busy}>
            Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};