import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Trash2,
  MessageSquare,
  Loader2,
  Timer,
  AlertTriangle,
  Save,
  Pencil,
  Calendar,
  User,
  Upload,
  X,
  ExternalLink,
  Check,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  DragOverlay,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
  listBoards,
  getBoard,
  createBoard,
  updateBoard,
  deleteBoard,
  createColumn,
  deleteColumn,
  updateColumn,
  createCard,
  deleteCard,
  moveCard,
  updateCard,
  uploadKanbanImage,
  listOperators,
  type OperatorItem,
} from "@/services/kanban";
import type {
  KanbanBoard,
  KanbanColumn,
  KanbanCard,
  BoardSnapshot,
  StageType,
} from "@/types/kanban";
import { useChats } from "@/stores/chats";
import { cn } from "@/lib/utils";

const DEFAULT_COLORS = ["#4E93FF", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#0ea5e9", "#ec4899", "#64748b"];

type BoardTemplateKey = "atendimento" | "vendas" | "suporte";
type BoardTemplate = {
  label: string;
  color: string;
  cols: { name: string; color: string; type: StageType; slaHours?: number }[];
};

const HOUR_MS = 3600_000;

const cardAgeMs = (card: KanbanCard) => {
  const ts = (card.updatedAt || card.createdAt || 0) * 1000;
  return ts > 0 ? Date.now() - ts : 0;
};

const slaState = (card: KanbanCard, slaHours?: number) => {
  const hours = slaHours ?? 0;
  if (!hours) return { enabled: false, breached: false, warn: false, ageMs: cardAgeMs(card) };
  const ageMs = cardAgeMs(card);
  const limit = hours * HOUR_MS;
  return { enabled: true, breached: ageMs > limit, warn: ageMs > limit * 0.75, ageMs };
};

const fmtAge = (ms: number) => {
  const h = Math.floor(ms / HOUR_MS);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60000))}min`;
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

const tsToInputVal = (sec?: number) => {
  if (!sec) return "";
  const d = new Date(sec * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const inputValToTs = (val: string) => {
  if (!val) return 0;
  const d = new Date(val);
  return Math.floor(d.getTime() / 1000);
};

const getDueDateStatus = (dueAt?: number) => {
  if (!dueAt) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  const diffSec = dueAt - nowSec;
  const isPast = diffSec < 0;
  const d = new Date(dueAt * 1000);
  const today = new Date();
  const isToday =
    !isPast &&
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();

  const formatted = d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return { isPast, isToday, formatted };
};

function SortableCard({
  card,
  avatarUrl,
  contactName,
  attendantName,
  slaHours,
  onOpenChat,
  onEdit,
  onDelete,
}: {
  card: KanbanCard;
  avatarUrl?: string;
  contactName?: string;
  attendantName?: string;
  slaHours?: number;
  onOpenChat: (c: KanbanCard) => void;
  onEdit: (c: KanbanCard) => void;
  onDelete: (c: KanbanCard) => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card", card },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const displayName = contactName || card.title;
  const initials = (displayName || "??").slice(0, 2).toUpperCase();
  const sla = slaState(card, slaHours);
  const due = getDueDateStatus(card.dueAt);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onEdit(card)}
      className="group relative rounded-md border bg-card p-3 shadow-sm hover:border-primary/50 hover:shadow transition cursor-pointer select-none"
    >
      {/* Imagem de Capa se houver */}
      {card.imageUrl && (
        <div className="-mx-3 -mt-3 mb-2.5 overflow-hidden rounded-t-md border-b bg-muted/40">
          <img
            src={card.imageUrl}
            alt=""
            className="h-28 w-full object-cover transition duration-200 group-hover:scale-105"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}

      {/* Cabeçalho do Card com avatar e ações */}
      <div className="flex items-start gap-2">
        <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted grid place-items-center text-[10px] font-medium text-muted-foreground ring-1 ring-border/50">
          {avatarUrl ? (
            <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
          ) : (
            <span>{initials}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight text-foreground">{displayName}</p>
          {card.title && card.title !== displayName && (
            <p className="truncate text-[11px] text-muted-foreground">{card.title}</p>
          )}
        </div>

        {/* Botões de Ação Rápida */}
        <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(card);
            }}
            className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted"
            title={t("common.edit", { defaultValue: "Editar cartão" })}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(card);
            }}
            className="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-muted"
            title={t("pages.kanban.remove", { defaultValue: "Remover cartão" })}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Descrição */}
      {card.description && (
        <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {card.description}
        </p>
      )}

      {/* Atendente responsável pelo atendimento */}
      {(attendantName || card.chatJid) && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded border border-border/40">
          <User className="h-3 w-3 shrink-0 text-primary" />
          <span className="truncate">
            <span className="font-medium text-foreground/80">{t("pages.kanban.attendant", { defaultValue: "Atendente" })}:</span>{" "}
            {attendantName || t("pages.kanban.unassigned", { defaultValue: "Não atribuído" })}
          </span>
        </div>
      )}

      {/* Badges de Data e SLA */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {due && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
              due.isPast
                ? "bg-destructive/15 text-destructive font-semibold"
                : due.isToday
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold"
                  : "bg-blue-500/10 text-blue-600 dark:text-blue-400",
            )}
            title={t("pages.kanban.dueDate", { defaultValue: "Data de entrega / vencimento" })}
          >
            <Calendar className="h-3 w-3" />
            {due.isPast
              ? t("pages.kanban.overdue", { defaultValue: "Vencido · {{date}}", date: due.formatted })
              : due.isToday
                ? t("pages.kanban.dueToday", { defaultValue: "Vence hoje · {{date}}", date: due.formatted })
                : t("pages.kanban.due", { defaultValue: "Prazo: {{date}}", date: due.formatted })}
          </span>
        )}

        {sla.enabled && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
              sla.breached
                ? "bg-destructive/15 text-destructive"
                : sla.warn
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  : "bg-muted text-muted-foreground",
            )}
            title={t("pages.kanban.slaStageTitle", { defaultValue: "SLA da etapa: {{hours}}h", hours: slaHours })}
          >
            {sla.breached ? <AlertTriangle className="h-3 w-3" /> : <Timer className="h-3 w-3" />}
            {sla.breached
              ? t("pages.kanban.slaBreached", { defaultValue: "Fora do SLA · {{age}}", age: fmtAge(sla.ageMs) })
              : t("pages.kanban.slaOk", { defaultValue: "{{age}} / {{hours}}h", age: fmtAge(sla.ageMs), hours: slaHours })}
          </span>
        )}
      </div>

      {/* Link para abrir atendimento */}
      {card.chatJid && (
        <div className="mt-2.5 pt-2 border-t border-border/40 flex items-center justify-between">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenChat(card);
            }}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
          >
            <MessageSquare className="h-3 w-3" />
            {t("pages.kanban.openChat", { defaultValue: "Abrir conversa" })}
          </button>
        </div>
      )}
    </div>
  );
}

function ColumnView({
  column,
  cards,
  cardMeta,
  getAttendantName,
  onAddCard,
  onEditColumn,
  onDeleteColumn,
  onEditCard,
  onOpenChat,
  onDeleteCard,
}: {
  column: KanbanColumn;
  cards: KanbanCard[];
  cardMeta: (c: KanbanCard) => { avatarUrl?: string; contactName?: string };
  getAttendantName: (c: KanbanCard) => string | undefined;
  onAddCard: (colId: string) => void;
  onEditColumn: (col: KanbanColumn) => void;
  onDeleteColumn: (col: KanbanColumn) => void;
  onEditCard: (c: KanbanCard) => void;
  onOpenChat: (c: KanbanCard) => void;
  onDeleteCard: (c: KanbanCard) => void;
}) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { type: "column" } });
  const breached = cards.filter((c) => slaState(c, column.slaHours).breached).length;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-lg bg-muted/40 p-3 transition border border-border/40",
        isOver && "ring-2 ring-primary/40 bg-muted/60",
      )}
    >
      {/* Cabeçalho da Coluna */}
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: column.color || "#4E93FF" }} />
          <p className="truncate text-sm font-semibold text-foreground">{column.name}</p>
          <span className="text-xs font-medium text-muted-foreground rounded-full bg-muted px-1.5 py-0.2">
            {cards.length}
          </span>
          {breached > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive"
              title={t("pages.kanban.cardsBreachedSla", { defaultValue: "{{count}} fora do SLA", count: breached })}
            >
              <AlertTriangle className="h-3 w-3" />
              {breached}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Editar Coluna */}
          <button
            type="button"
            onClick={() => onEditColumn(column)}
            className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted"
            title={t("pages.kanban.editColumn", { defaultValue: "Editar coluna" })}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {/* Excluir Coluna */}
          <button
            type="button"
            onClick={() => onDeleteColumn(column)}
            className="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-muted"
            title={t("pages.kanban.removeColumn", { defaultValue: "Remover coluna" })}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Lista Sortable de Cards */}
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-2 min-h-[70px]">
          {cards.map((c) => {
            const meta = cardMeta(c);
            const attendant = getAttendantName(c);
            return (
              <SortableCard
                key={c.id}
                card={c}
                avatarUrl={meta.avatarUrl}
                contactName={meta.contactName}
                attendantName={attendant}
                slaHours={column.slaHours}
                onOpenChat={onOpenChat}
                onEdit={onEditCard}
                onDelete={onDeleteCard}
              />
            );
          })}
        </div>
      </SortableContext>

      {/* Botão de Novo Cartão */}
      <Button
        variant="ghost"
        size="sm"
        className="mt-2.5 justify-start text-muted-foreground hover:text-foreground hover:bg-card border border-dashed border-border/50"
        onClick={() => onAddCard(column.id)}
      >
        <Plus className="h-3.5 w-3.5 mr-1" />
        {t("pages.kanban.newCard", { defaultValue: "Novo cartão" })}
      </Button>
    </div>
  );
}

function BoardTab({
  board,
  active,
  onClick,
}: {
  board: KanbanBoard;
  active: boolean;
  onClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `board:${board.id}`, data: { type: "board" } });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 whitespace-nowrap rounded-md border px-3 py-1.5 text-sm transition",
        active
          ? "border-primary/60 bg-primary/10 text-foreground font-medium shadow-sm"
          : "border-border/60 bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50",
        isOver && "ring-2 ring-primary/60",
      )}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: board.color || "#4E93FF" }} />
      {board.name}
    </button>
  );
}

export default function KanbanPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Estados principais
  const [boards, setBoards] = useState<KanbanBoard[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string>("");
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [operators, setOperators] = useState<OperatorItem[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [dragCard, setDragCard] = useState<KanbanCard | null>(null);

  // Modais de Board
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [newBoardColor, setNewBoardColor] = useState("#4E93FF");
  const [newBoardDesc, setNewBoardDesc] = useState("");
  const [newBoardTemplate, setNewBoardTemplate] = useState<BoardTemplateKey | "blank">("atendimento");

  const [editingBoard, setEditingBoard] = useState<KanbanBoard | null>(null);
  const [editBoardName, setEditBoardName] = useState("");
  const [editBoardColor, setEditBoardColor] = useState("#4E93FF");
  const [editBoardDesc, setEditBoardDesc] = useState("");

  const [toDeleteBoard, setToDeleteBoard] = useState<KanbanBoard | null>(null);

  // Modais de Coluna
  const [creatingColumn, setCreatingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnColor, setNewColumnColor] = useState("#64748b");
  const [newColumnStageType, setNewColumnStageType] = useState<StageType>("open");
  const [newColumnSla, setNewColumnSla] = useState("0");

  const [editingColumn, setEditingColumn] = useState<KanbanColumn | null>(null);
  const [editColumnName, setEditColumnName] = useState("");
  const [editColumnColor, setEditColumnColor] = useState("#64748b");
  const [editColumnStageType, setEditColumnStageType] = useState<StageType>("open");
  const [editColumnSla, setEditColumnSla] = useState("0");

  const [toDeleteColumn, setToDeleteColumn] = useState<KanbanColumn | null>(null);

  // Modais de Card
  const [creatingCardColId, setCreatingCardColId] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [newCardDesc, setNewCardDesc] = useState("");
  const [newCardAssigneeId, setNewCardAssigneeId] = useState("");
  const [newCardDueAt, setNewCardDueAt] = useState("");
  const [newCardColor, setNewCardColor] = useState("");
  const [newCardImageUrl, setNewCardImageUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);

  const [editingCard, setEditingCard] = useState<KanbanCard | null>(null);
  const [editCardTitle, setEditCardTitle] = useState("");
  const [editCardDesc, setEditCardDesc] = useState("");
  const [editCardColId, setEditCardColId] = useState("");
  const [editCardAssigneeId, setEditCardAssigneeId] = useState("");
  const [editCardDueAt, setEditCardDueAt] = useState("");
  const [editCardColor, setEditCardColor] = useState("");
  const [editCardImageUrl, setEditCardImageUrl] = useState("");

  const [toDeleteCard, setToDeleteCard] = useState<KanbanCard | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editFileInputRef = useRef<HTMLInputElement | null>(null);

  const BOARD_TEMPLATES: Record<BoardTemplateKey, BoardTemplate> = useMemo(() => ({
    atendimento: {
      label: t("pages.kanban.templateSupportLabel", { defaultValue: "Atendimento" }),
      color: "#4E93FF",
      cols: [
        { name: t("pages.kanban.colWaiting", { defaultValue: "Aguardando" }), color: "#94a3b8", type: "open" },
        { name: t("pages.kanban.colInProgress", { defaultValue: "Em andamento" }), color: "#4E93FF", type: "open" },
        { name: t("pages.kanban.colWaitingClient", { defaultValue: "Aguardando cliente" }), color: "#f59e0b", type: "open" },
        { name: t("pages.kanban.colResolved", { defaultValue: "Resolvido" }), color: "#22c55e", type: "won" },
        { name: t("pages.kanban.colNoResponse", { defaultValue: "Sem retorno" }), color: "#ef4444", type: "lost" },
      ],
    },
    vendas: {
      label: t("pages.kanban.templateSalesLabel", { defaultValue: "Vendas" }),
      color: "#22c55e",
      cols: [
        { name: t("pages.kanban.colProspecting", { defaultValue: "Prospecção" }), color: "#94a3b8", type: "open" },
        { name: t("pages.kanban.colProposal", { defaultValue: "Proposta" }), color: "#4E93FF", type: "open" },
        { name: t("pages.kanban.colNegotiation", { defaultValue: "Negociação" }), color: "#a855f7", type: "open" },
        { name: t("pages.kanban.colWon", { defaultValue: "Ganho" }), color: "#22c55e", type: "won" },
        { name: t("pages.kanban.colLost", { defaultValue: "Perdido" }), color: "#ef4444", type: "lost" },
      ],
    },
    suporte: {
      label: t("pages.kanban.templateHelpdeskLabel", { defaultValue: "Suporte" }),
      color: "#f59e0b",
      cols: [
        { name: t("pages.kanban.colNewTicket", { defaultValue: "Novo ticket" }), color: "#94a3b8", type: "open" },
        { name: t("pages.kanban.colInReview", { defaultValue: "Em análise" }), color: "#4E93FF", type: "open" },
        { name: t("pages.kanban.colWaitingClient", { defaultValue: "Aguardando cliente" }), color: "#f59e0b", type: "open" },
        { name: t("pages.kanban.colResolved", { defaultValue: "Resolvido" }), color: "#22c55e", type: "won" },
      ],
    },
  }), [t]);

  const chatsBySession = useChats((s) => s.chatsBySession);

  // Mapa de operadores por id
  const operatorMap = useMemo(() => {
    const map = new Map<string, OperatorItem>();
    for (const op of operators) map.set(op.id, op);
    return map;
  }, [operators]);

  // Lookup de avatar e nome do contato pelo chat
  const chatMetaByKey = useMemo(() => {
    const map = new Map<string, { avatarUrl?: string; name?: string; assignedUserId?: string }>();
    for (const [sid, list] of Object.entries(chatsBySession)) {
      for (const c of list) {
        map.set(`${sid}::${c.chatJid}`, {
          avatarUrl: c.avatarUrl,
          name: c.name,
          assignedUserId: c.assignedUserId,
        });
      }
    }
    return map;
  }, [chatsBySession]);

  const cardMeta = (card: KanbanCard) => {
    if (!card.chatJid) return {};
    const key = `${card.sessionId ?? ""}::${card.chatJid}`;
    const m = chatMetaByKey.get(key);
    return { avatarUrl: m?.avatarUrl, contactName: m?.name };
  };

  // Obtém o nome legível do atendente / responsável
  const getAttendantName = (card: KanbanCard): string | undefined => {
    let uid = card.assigneeId;
    if (!uid && card.chatJid) {
      const key = `${card.sessionId ?? ""}::${card.chatJid}`;
      const m = chatMetaByKey.get(key);
      uid = m?.assignedUserId;
    }
    if (!uid) return undefined;
    const op = operatorMap.get(uid);
    if (op) {
      return op.name || op.email.split("@")[0];
    }
    return uid;
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const loadOperators = async () => {
    try {
      const ops = await listOperators();
      setOperators(ops);
    } catch {
      // silencioso se não tiver permissão
    }
  };

  const loadBoards = async () => {
    try {
      const bs = await listBoards();
      setBoards(bs);
      if (bs.length && !activeBoardId) setActiveBoardId(bs[0].id);
      if (!bs.length) {
        setActiveBoardId("");
        setSnapshot(null);
      }
      return bs;
    } catch (e) {
      toast.error((e as Error).message);
      return [] as KanbanBoard[];
    }
  };

  const loadSnapshot = async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const snap = await getBoard(id);
      setSnapshot(snap);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOperators();
    (async () => {
      const bs = await loadBoards();
      if (!seeded && bs.length === 0) {
        setSeeded(true);
        await seedExampleBoards();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeBoardId) void loadSnapshot(activeBoardId);
  }, [activeBoardId]);

  const cardsByColumn = useMemo(() => {
    const map = new Map<string, KanbanCard[]>();
    if (!snapshot) return map;
    for (const col of snapshot.columns) map.set(col.id, []);
    for (const card of [...snapshot.cards].sort((a, b) => a.position - b.position)) {
      const arr = map.get(card.columnId);
      if (arr) arr.push(card);
    }
    return map;
  }, [snapshot]);

  const columns = useMemo(
    () => (snapshot?.columns ?? []).slice().sort((a, b) => a.position - b.position),
    [snapshot],
  );

  const activeBoard = useMemo(
    () => boards.find((b) => b.id === activeBoardId) || snapshot?.board,
    [boards, activeBoardId, snapshot],
  );

  // ====== Ações de Board ======
  const handleCreateBoard = async () => {
    const name = newBoardName.trim();
    if (!name) {
      toast.error(t("pages.kanban.errNameRequired", { defaultValue: "Nome do board é obrigatório" }));
      return;
    }
    try {
      let colsToCreate: { name: string; color: string; type: StageType; slaHours?: number }[] = [];
      let color = newBoardColor;
      if (newBoardTemplate !== "blank") {
        const tpl = BOARD_TEMPLATES[newBoardTemplate];
        color = tpl.color;
        colsToCreate = tpl.cols;
      }
      const b = await createBoard(name, color, newBoardDesc.trim());
      for (const c of colsToCreate) {
        await createColumn(b.id, c.name, c.color, c.type, c.slaHours ?? 0);
      }
      setNewBoardName("");
      setNewBoardDesc("");
      setCreatingBoard(false);
      await loadBoards();
      setActiveBoardId(b.id);
      toast.success(t("pages.kanban.boardCreatedToast", { defaultValue: "Board criado com sucesso" }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const openEditBoard = () => {
    if (!activeBoard) return;
    setEditBoardName(activeBoard.name);
    setEditBoardColor(activeBoard.color || "#4E93FF");
    setEditBoardDesc(activeBoard.description || "");
    setEditingBoard(activeBoard);
  };

  const handleUpdateBoard = async () => {
    if (!editingBoard) return;
    const name = editBoardName.trim();
    if (!name) {
      toast.error(t("pages.kanban.errNameRequired", { defaultValue: "Nome do board é obrigatório" }));
      return;
    }
    try {
      await updateBoard(editingBoard.id, name, editBoardColor, editBoardDesc.trim());
      setEditingBoard(null);
      await loadBoards();
      if (activeBoardId === editingBoard.id) {
        await loadSnapshot(activeBoardId);
      }
      toast.success(t("pages.kanban.boardUpdatedToast", { defaultValue: "Board atualizado com sucesso" }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const seedExampleBoards = async () => {
    try {
      const examples = [
        {
          name: t("pages.kanban.templateSupportLabel", { defaultValue: "Atendimento" }),
          color: "#4E93FF",
          cols: [
            { name: t("pages.kanban.colInProgress", { defaultValue: "Em andamento" }), color: "#4E93FF", type: "open" as StageType },
            { name: t("pages.kanban.colWaitingClient", { defaultValue: "Aguardando cliente" }), color: "#f59e0b", type: "open" as StageType },
            { name: t("pages.kanban.colResolved", { defaultValue: "Resolvido" }), color: "#22c55e", type: "won" as StageType },
            { name: t("pages.kanban.colNoResponse", { defaultValue: "Sem retorno" }), color: "#ef4444", type: "lost" as StageType },
          ],
        },
        {
          name: t("pages.kanban.templateSalesLabel", { defaultValue: "Vendas" }),
          color: "#22c55e",
          cols: [
            { name: t("pages.kanban.colProspecting", { defaultValue: "Prospecção" }), color: "#94a3b8", type: "open" as StageType },
            { name: t("pages.kanban.colProposalSent", { defaultValue: "Proposta enviada" }), color: "#4E93FF", type: "open" as StageType },
            { name: t("pages.kanban.colNegotiation", { defaultValue: "Negociação" }), color: "#a855f7", type: "open" as StageType },
            { name: t("pages.kanban.colClosedWon", { defaultValue: "Fechado - Ganho" }), color: "#22c55e", type: "won" as StageType },
            { name: t("pages.kanban.colClosedLost", { defaultValue: "Fechado - Perdido" }), color: "#ef4444", type: "lost" as StageType },
          ],
        },
      ];
      for (const ex of examples) {
        const b = await createBoard(ex.name, ex.color, t("pages.kanban.exampleBoardDesc", { defaultValue: "Board exemplo — {{name}}", name: ex.name }));
        for (const c of ex.cols) await createColumn(b.id, c.name, c.color, c.type);
      }
      const bs = await loadBoards();
      if (bs.length) setActiveBoardId(bs[0].id);
    } catch {
      // silencia falha de seed inicial
    }
  };

  // ====== Ações de Coluna ======
  const handleCreateColumn = async () => {
    const name = newColumnName.trim();
    if (!name || !activeBoardId) {
      toast.error(t("pages.kanban.errColNameRequired", { defaultValue: "Nome da coluna é obrigatório" }));
      return;
    }
    const sla = Math.max(0, Number(newColumnSla) || 0);
    try {
      await createColumn(activeBoardId, name, newColumnColor, newColumnStageType, sla);
      setNewColumnName("");
      setNewColumnSla("0");
      setCreatingColumn(false);
      await loadSnapshot(activeBoardId);
      toast.success(t("pages.kanban.colCreatedToast", { defaultValue: "Coluna criada com sucesso" }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const openEditColumn = (col: KanbanColumn) => {
    setEditingColumn(col);
    setEditColumnName(col.name);
    setEditColumnColor(col.color || "#64748b");
    setEditColumnStageType(col.stageType || "open");
    setEditColumnSla(String(col.slaHours ?? 0));
  };

  const handleUpdateColumn = async () => {
    if (!editingColumn) return;
    const name = editColumnName.trim();
    if (!name) {
      toast.error(t("pages.kanban.errColNameRequired", { defaultValue: "Nome da coluna é obrigatório" }));
      return;
    }
    const sla = Math.max(0, Number(editColumnSla) || 0);
    try {
      await updateColumn(editingColumn.id, name, editColumnColor, editColumnStageType, sla);
      setEditingColumn(null);
      await loadSnapshot(activeBoardId);
      toast.success(t("pages.kanban.colUpdatedToast", { defaultValue: "Coluna atualizada com sucesso" }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // ====== Ações de Upload de Imagem ======
  const handleUploadImageFile = async (file: File, isEdit = false) => {
    setUploadingImage(true);
    try {
      const url = await uploadKanbanImage(file);
      if (isEdit) {
        setEditCardImageUrl(url);
      } else {
        setNewCardImageUrl(url);
      }
      toast.success(t("pages.kanban.imageUploadedToast", { defaultValue: "Imagem anexada com sucesso" }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploadingImage(false);
    }
  };

  // ====== Ações de Card ======
  const openNewCardModal = (columnId: string) => {
    setCreatingCardColId(columnId);
    setNewCardTitle("");
    setNewCardDesc("");
    setNewCardAssigneeId("");
    setNewCardDueAt("");
    setNewCardColor("");
    setNewCardImageUrl("");
  };

  const handleCreateCard = async () => {
    if (!creatingCardColId || !activeBoardId) return;
    const title = newCardTitle.trim();
    if (!title) {
      toast.error(t("pages.kanban.errCardTitleRequired", { defaultValue: "Título do cartão é obrigatório" }));
      return;
    }
    try {
      const dueAt = inputValToTs(newCardDueAt);
      await createCard(activeBoardId, {
        columnId: creatingCardColId,
        title,
        description: newCardDesc.trim() || undefined,
        assigneeId: newCardAssigneeId || undefined,
        dueAt: dueAt || undefined,
        color: newCardColor || undefined,
        imageUrl: newCardImageUrl.trim() || undefined,
      });
      setCreatingCardColId(null);
      await loadSnapshot(activeBoardId);
      toast.success(t("pages.kanban.cardCreatedToast", { defaultValue: "Cartão criado com sucesso" }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const openEditCardModal = (c: KanbanCard) => {
    setEditingCard(c);
    setEditCardTitle(c.title);
    setEditCardDesc(c.description || "");
    setEditCardColId(c.columnId);
    setEditCardAssigneeId(c.assigneeId || "");
    setEditCardDueAt(tsToInputVal(c.dueAt));
    setEditCardColor(c.color || "");
    setEditCardImageUrl(c.imageUrl || "");
  };

  const handleUpdateCard = async () => {
    if (!editingCard) return;
    const title = editCardTitle.trim();
    if (!title) {
      toast.error(t("pages.kanban.errCardTitleRequired", { defaultValue: "Título do cartão é obrigatório" }));
      return;
    }
    try {
      const dueAt = inputValToTs(editCardDueAt);
      await updateCard(editingCard.id, {
        title,
        description: editCardDesc,
        columnId: editCardColId !== editingCard.columnId ? editCardColId : undefined,
        assigneeId: editCardAssigneeId,
        dueAt,
        color: editCardColor,
        imageUrl: editCardImageUrl.trim(),
      });
      setEditingCard(null);
      await loadSnapshot(activeBoardId);
      toast.success(t("pages.kanban.cardUpdatedToast", { defaultValue: "Cartão atualizado com sucesso" }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // ====== Drag and Drop ======
  const handleDragStart = (e: DragStartEvent) => {
    const card = snapshot?.cards.find((c) => c.id === e.active.id);
    setDragCard(card ?? null);
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setDragCard(null);
    if (!snapshot) return;
    const { active, over } = e;
    if (!over) return;
    const activeCard = snapshot.cards.find((c) => c.id === active.id);
    if (!activeCard) return;

    // Drop em outra aba de board
    if (typeof over.id === "string" && over.id.startsWith("board:")) {
      const targetBoardId = over.id.slice("board:".length);
      if (targetBoardId === activeBoardId) return;
      try {
        const targetSnap = await getBoard(targetBoardId);
        const firstCol = [...targetSnap.columns].sort((a, b) => a.position - b.position)[0];
        if (!firstCol) {
          toast.error(t("pages.kanban.errNoTargetColumns", { defaultValue: "Board de destino não tem colunas" }));
          return;
        }
        await createCard(targetBoardId, {
          columnId: firstCol.id,
          title: activeCard.title,
          description: activeCard.description || undefined,
          color: activeCard.color || undefined,
          sessionId: activeCard.sessionId,
          chatJid: activeCard.chatJid,
          assigneeId: activeCard.assigneeId,
          dueAt: activeCard.dueAt,
          imageUrl: activeCard.imageUrl,
        });
        await deleteCard(activeCard.id);
        await loadSnapshot(activeBoardId);
        toast.success(t("pages.kanban.cardMovedToast", { defaultValue: "Cartão movido de board" }));
      } catch (err) {
        toast.error((err as Error).message);
      }
      return;
    }

    // Drop em coluna ou outro card
    let targetColumnId = activeCard.columnId;
    let targetIndex = 0;
    const overCard = snapshot.cards.find((c) => c.id === over.id);
    if (overCard) {
      targetColumnId = overCard.columnId;
      const list = (cardsByColumn.get(targetColumnId) ?? []).filter((c) => c.id !== activeCard.id);
      const idx = list.findIndex((c) => c.id === overCard.id);
      targetIndex = idx < 0 ? list.length : idx;
    } else if (typeof over.id === "string" && snapshot.columns.some((c) => c.id === over.id)) {
      targetColumnId = over.id;
      targetIndex = cardsByColumn.get(targetColumnId)?.length ?? 0;
    }

    // Atualização otimista
    const prev = snapshot;
    const nextCards = snapshot.cards.map((c) => ({ ...c }));
    const moving = nextCards.find((c) => c.id === activeCard.id);
    if (!moving) return;
    moving.columnId = targetColumnId;
    const inCol = nextCards
      .filter((c) => c.columnId === targetColumnId && c.id !== moving.id)
      .sort((a, b) => a.position - b.position);
    inCol.splice(targetIndex, 0, moving);
    inCol.forEach((c, i) => (c.position = i));
    setSnapshot({ ...snapshot, cards: nextCards });

    try {
      await moveCard(activeCard.id, targetColumnId, targetIndex);
    } catch (err) {
      toast.error((err as Error).message);
      setSnapshot(prev);
    }
  };

  const openChat = (c: KanbanCard) => {
    if (!c.chatJid) return;
    navigate(`/chats?jid=${encodeURIComponent(c.chatJid)}${c.sessionId ? `&sid=${c.sessionId}` : ""}`);
  };

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        {/* Barra Superior com Boards e Ações */}
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3 bg-card/60 backdrop-blur-sm">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto scrollbar-soft">
            {boards.map((b) => (
              <BoardTab
                key={b.id}
                board={b}
                active={b.id === activeBoardId}
                onClick={() => setActiveBoardId(b.id)}
              />
            ))}
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5 h-8 text-xs font-medium"
              onClick={() => {
                setNewBoardName("");
                setNewBoardDesc("");
                setNewBoardColor("#4E93FF");
                setNewBoardTemplate("atendimento");
                setCreatingBoard(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              {t("pages.kanban.newBoard", { defaultValue: "Novo board" })}
            </Button>

            {activeBoard && (
              <div className="flex items-center gap-1 ml-1 pl-2 border-l border-border/60">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                  onClick={openEditBoard}
                  title={t("pages.kanban.editBoard", { defaultValue: "Editar board atual" })}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t("common.edit", { defaultValue: "Editar" })}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive gap-1"
                  onClick={() => setToDeleteBoard(activeBoard)}
                  title={t("pages.kanban.removeBoard", { defaultValue: "Excluir board" })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t("common.delete", { defaultValue: "Excluir" })}</span>
                </Button>
              </div>
            )}
          </div>

          {activeBoardId && (
            <Button
              size="sm"
              className="shrink-0 gap-1.5 h-8 text-xs font-medium shadow-sm"
              onClick={() => {
                setNewColumnName("");
                setNewColumnColor(DEFAULT_COLORS[(columns.length ?? 0) % DEFAULT_COLORS.length]);
                setNewColumnStageType("open");
                setNewColumnSla("0");
                setCreatingColumn(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              {t("pages.kanban.newColumnButton", { defaultValue: "Nova coluna" })}
            </Button>
          )}
        </div>

        {/* Área Central do Kanban */}
        <div className="flex-1 overflow-auto scrollbar-soft p-4">
          {loading && (
            <div className="flex items-center justify-center h-48 gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              {t("common.loading", { defaultValue: "Carregando quadro..." })}
            </div>
          )}

          {!loading && !activeBoardId && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Plus className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold">{t("pages.kanban.noBoardsYet", { defaultValue: "Nenhum board encontrado" })}</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  {t("pages.kanban.createFirstBoardDesc", { defaultValue: "Crie seu primeiro board de atendimento, vendas ou suporte para organizar suas conversas." })}
                </p>
              </div>
              <Button onClick={() => setCreatingBoard(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                {t("pages.kanban.createFirstBoard", { defaultValue: "Criar primeiro board" })}
              </Button>
            </div>
          )}

          {!loading && activeBoardId && snapshot && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="flex gap-4 pb-6 min-h-full items-start">
                {columns.map((col) => (
                  <ColumnView
                    key={col.id}
                    column={col}
                    cards={cardsByColumn.get(col.id) ?? []}
                    cardMeta={cardMeta}
                    getAttendantName={getAttendantName}
                    onAddCard={openNewCardModal}
                    onEditColumn={openEditColumn}
                    onDeleteColumn={setToDeleteColumn}
                    onEditCard={openEditCardModal}
                    onOpenChat={openChat}
                    onDeleteCard={setToDeleteCard}
                  />
                ))}

                {!columns.length && (
                  <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground max-w-md mx-auto my-12">
                    <p className="font-medium text-foreground">{t("pages.kanban.noColumns", { defaultValue: "Nenhuma coluna neste board." })}</p>
                    <p className="mt-1 text-xs">{t("pages.kanban.addColHint", { defaultValue: 'Clique em "Nova coluna" acima para organizar suas etapas.' })}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => setCreatingColumn(true)}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      {t("pages.kanban.newColumnButton", { defaultValue: "Nova coluna" })}
                    </Button>
                  </div>
                )}
              </div>

              <DragOverlay>
                {dragCard && (
                  <div className="w-72 rounded-md border bg-card p-3 shadow-xl text-sm font-semibold ring-2 ring-primary">
                    {dragCard.title}
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          )}
        </div>

        {/* ================= MODAL: NOVO BOARD ================= */}
        <Dialog open={creatingBoard} onOpenChange={setCreatingBoard}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("pages.kanban.newBoard", { defaultValue: "Novo board" })}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-xs font-semibold text-foreground">{t("common.name", { defaultValue: "Nome do Board" })}</label>
                <Input
                  placeholder={t("pages.kanban.boardNamePlaceholder", { defaultValue: "Ex: Vendas, Atendimento SAC..." })}
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                  className="mt-1"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">{t("common.description", { defaultValue: "Descrição (opcional)" })}</label>
                <Input
                  placeholder={t("pages.kanban.boardDescPlaceholder", { defaultValue: "Objetivo deste pipeline..." })}
                  value={newBoardDesc}
                  onChange={(e) => setNewBoardDesc(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">{t("pages.kanban.modelLabel", { defaultValue: "Modelo inicial" })}</label>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {(Object.keys(BOARD_TEMPLATES) as BoardTemplateKey[]).map((k) => {
                    const tpl = BOARD_TEMPLATES[k];
                    const active = newBoardTemplate === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          setNewBoardTemplate(k);
                          setNewBoardColor(tpl.color);
                        }}
                        className={cn(
                          "rounded-md border p-2.5 text-left text-xs transition",
                          active ? "border-primary bg-primary/10 shadow-sm" : "border-border hover:border-primary/40",
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: tpl.color }} />
                          <span className="font-semibold">{tpl.label}</span>
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">
                          {tpl.cols.map((c) => c.name).join(" · ")}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">{t("pages.kanban.color", { defaultValue: "Cor de identificação" })}</label>
                <div className="mt-1.5 flex items-center gap-2">
                  {DEFAULT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewBoardColor(c)}
                      className={cn(
                        "h-6 w-6 rounded-full transition transform hover:scale-110 flex items-center justify-center",
                        newBoardColor === c && "ring-2 ring-primary ring-offset-2",
                      )}
                      style={{ background: c }}
                    >
                      {newBoardColor === c && <Check className="h-3.5 w-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCreatingBoard(false)}>
                {t("common.cancel", { defaultValue: "Cancelar" })}
              </Button>
              <Button onClick={handleCreateBoard}>{t("pages.kanban.create", { defaultValue: "Criar Board" })}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ================= MODAL: EDITAR BOARD ================= */}
        <Dialog open={!!editingBoard} onOpenChange={(o) => !o && setEditingBoard(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("pages.kanban.editBoard", { defaultValue: "Editar board" })}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-xs font-semibold text-foreground">{t("common.name", { defaultValue: "Nome" })}</label>
                <Input
                  value={editBoardName}
                  onChange={(e) => setEditBoardName(e.target.value)}
                  className="mt-1"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">{t("common.description", { defaultValue: "Descrição" })}</label>
                <Input
                  value={editBoardDesc}
                  onChange={(e) => setEditBoardDesc(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">{t("pages.kanban.color", { defaultValue: "Cor" })}</label>
                <div className="mt-1.5 flex items-center gap-2">
                  {DEFAULT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditBoardColor(c)}
                      className={cn(
                        "h-6 w-6 rounded-full transition transform hover:scale-110 flex items-center justify-center",
                        editBoardColor === c && "ring-2 ring-primary ring-offset-2",
                      )}
                      style={{ background: c }}
                    >
                      {editBoardColor === c && <Check className="h-3.5 w-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter className="flex sm:justify-between items-center gap-2">
              <Button
                variant="destructive"
                type="button"
                size="sm"
                onClick={() => {
                  if (editingBoard) {
                    setToDeleteBoard(editingBoard);
                    setEditingBoard(null);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {t("common.delete", { defaultValue: "Excluir" })}
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setEditingBoard(null)}>
                  {t("common.cancel", { defaultValue: "Cancelar" })}
                </Button>
                <Button onClick={handleUpdateBoard}>
                  <Save className="h-4 w-4 mr-1" />
                  {t("common.save", { defaultValue: "Salvar" })}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ================= MODAL: NOVA COLUNA ================= */}
        <Dialog open={creatingColumn} onOpenChange={setCreatingColumn}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("pages.kanban.newColumnButton", { defaultValue: "Nova coluna" })}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-xs font-semibold text-foreground">{t("pages.kanban.colName", { defaultValue: "Nome da etapa" })}</label>
                <Input
                  placeholder={t("pages.kanban.columnNamePlaceholder", { defaultValue: "Ex: Em negociação, Aguardando peça..." })}
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  className="mt-1"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground">{t("pages.kanban.colStageType", { defaultValue: "Tipo da etapa" })}</label>
                  <select
                    value={newColumnStageType}
                    onChange={(e) => setNewColumnStageType(e.target.value as StageType)}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="open">{t("pages.kanban.stageOpen", { defaultValue: "Em aberto / Andamento" })}</option>
                    <option value="won">{t("pages.kanban.stageWon", { defaultValue: "Ganho / Concluído" })}</option>
                    <option value="lost">{t("pages.kanban.stageLost", { defaultValue: "Perdido / Cancelado" })}</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground">{t("pages.kanban.slaLimitHours", { defaultValue: "SLA em horas" })}</label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={newColumnSla}
                    onChange={(e) => setNewColumnSla(e.target.value)}
                    className="mt-1"
                    placeholder="0 = sem SLA"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">{t("pages.kanban.color", { defaultValue: "Cor da etapa" })}</label>
                <div className="mt-1.5 flex items-center gap-2">
                  {DEFAULT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColumnColor(c)}
                      className={cn(
                        "h-6 w-6 rounded-full transition transform hover:scale-110 flex items-center justify-center",
                        newColumnColor === c && "ring-2 ring-primary ring-offset-2",
                      )}
                      style={{ background: c }}
                    >
                      {newColumnColor === c && <Check className="h-3.5 w-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCreatingColumn(false)}>
                {t("common.cancel", { defaultValue: "Cancelar" })}
              </Button>
              <Button onClick={handleCreateColumn}>{t("pages.kanban.create", { defaultValue: "Criar Coluna" })}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ================= MODAL: EDITAR COLUNA ================= */}
        <Dialog open={!!editingColumn} onOpenChange={(o) => !o && setEditingColumn(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("pages.kanban.editColumn", { defaultValue: "Editar coluna" })}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-xs font-semibold text-foreground">{t("pages.kanban.colName", { defaultValue: "Nome da etapa" })}</label>
                <Input
                  value={editColumnName}
                  onChange={(e) => setEditColumnName(e.target.value)}
                  className="mt-1"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground">{t("pages.kanban.colStageType", { defaultValue: "Tipo da etapa" })}</label>
                  <select
                    value={editColumnStageType}
                    onChange={(e) => setEditColumnStageType(e.target.value as StageType)}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="open">{t("pages.kanban.stageOpen", { defaultValue: "Em aberto / Andamento" })}</option>
                    <option value="won">{t("pages.kanban.stageWon", { defaultValue: "Ganho / Concluído" })}</option>
                    <option value="lost">{t("pages.kanban.stageLost", { defaultValue: "Perdido / Cancelado" })}</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground">{t("pages.kanban.slaLimitHours", { defaultValue: "SLA em horas" })}</label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={editColumnSla}
                    onChange={(e) => setEditColumnSla(e.target.value)}
                    className="mt-1"
                    placeholder="0 = desativado"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">{t("pages.kanban.color", { defaultValue: "Cor" })}</label>
                <div className="mt-1.5 flex items-center gap-2">
                  {DEFAULT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditColumnColor(c)}
                      className={cn(
                        "h-6 w-6 rounded-full transition transform hover:scale-110 flex items-center justify-center",
                        editColumnColor === c && "ring-2 ring-primary ring-offset-2",
                      )}
                      style={{ background: c }}
                    >
                      {editColumnColor === c && <Check className="h-3.5 w-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter className="flex sm:justify-between items-center gap-2">
              <Button
                variant="destructive"
                type="button"
                size="sm"
                onClick={() => {
                  if (editingColumn) {
                    setToDeleteColumn(editingColumn);
                    setEditingColumn(null);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {t("common.delete", { defaultValue: "Excluir" })}
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setEditingColumn(null)}>
                  {t("common.cancel", { defaultValue: "Cancelar" })}
                </Button>
                <Button onClick={handleUpdateColumn}>
                  <Save className="h-4 w-4 mr-1" />
                  {t("common.save", { defaultValue: "Salvar" })}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ================= MODAL: NOVO CARTÃO ================= */}
        <Dialog open={!!creatingCardColId} onOpenChange={(o) => !o && setCreatingCardColId(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("pages.kanban.newCardDialogTitle", { defaultValue: "Novo cartão" })}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-xs font-semibold text-foreground">{t("pages.kanban.cardTitle", { defaultValue: "Título" })} *</label>
                <Input
                  placeholder={t("pages.kanban.cardTitlePlaceholder", { defaultValue: "Nome da oportunidade ou cliente" })}
                  value={newCardTitle}
                  onChange={(e) => setNewCardTitle(e.target.value)}
                  className="mt-1"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">{t("pages.kanban.cardDescPlaceholder", { defaultValue: "Descrição ou notas" })}</label>
                <Textarea
                  placeholder={t("pages.kanban.cardDescHint", { defaultValue: "Detalhes sobre o cliente, negociação ou atendimento..." })}
                  value={newCardDesc}
                  onChange={(e) => setNewCardDesc(e.target.value)}
                  rows={3}
                  className="mt-1 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Atendente / Usuário Responsável */}
                <div>
                  <label className="text-xs font-semibold text-foreground">{t("pages.kanban.attendant", { defaultValue: "Atendente / Responsável" })}</label>
                  <select
                    value={newCardAssigneeId}
                    onChange={(e) => setNewCardAssigneeId(e.target.value)}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">{t("pages.kanban.unassigned", { defaultValue: "Nenhum / Desatribuído" })}</option>
                    {operators.map((op) => (
                      <option key={op.id} value={op.id}>
                        {op.name ? `${op.name} (${op.email})` : op.email}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Data de Vencimento / Prazo */}
                <div>
                  <label className="text-xs font-semibold text-foreground">{t("pages.kanban.dueDate", { defaultValue: "Data de entrega / prazo" })}</label>
                  <Input
                    type="datetime-local"
                    value={newCardDueAt}
                    onChange={(e) => setNewCardDueAt(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Imagem de Capa / Anexo */}
              <div>
                <label className="text-xs font-semibold text-foreground">{t("pages.kanban.coverImage", { defaultValue: "Imagem do cartão" })}</label>
                {newCardImageUrl ? (
                  <div className="mt-2 relative rounded-md border overflow-hidden max-h-40 bg-muted/30">
                    <img src={newCardImageUrl} alt="" className="w-full h-36 object-cover" />
                    <button
                      type="button"
                      onClick={() => setNewCardImageUrl("")}
                      className="absolute top-2 right-2 p-1 rounded-full bg-background/80 hover:bg-destructive hover:text-white transition"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="mt-1.5 flex gap-2">
                    <Input
                      placeholder={t("pages.kanban.imageUrlPlaceholder", { defaultValue: "Cole o link da imagem ou..." })}
                      value={newCardImageUrl}
                      onChange={(e) => setNewCardImageUrl(e.target.value)}
                      className="flex-1 text-xs"
                    />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleUploadImageFile(file, false);
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploadingImage}
                      onClick={() => fileInputRef.current?.click()}
                      className="shrink-0 gap-1.5"
                    >
                      {uploadingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      {t("pages.kanban.upload", { defaultValue: "Enviar arquivo" })}
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCreatingCardColId(null)}>
                {t("common.cancel", { defaultValue: "Cancelar" })}
              </Button>
              <Button onClick={handleCreateCard}>{t("pages.kanban.create", { defaultValue: "Criar Cartão" })}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ================= MODAL: EDIÇÃO GERAL DO CARTÃO ================= */}
        <Dialog open={!!editingCard} onOpenChange={(o) => !o && setEditingCard(null)}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-primary" />
                {t("pages.kanban.editCardTitle", { defaultValue: "Editar cartão" })}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Vínculo de Chat WhatsApp (se houver) */}
              {editingCard?.chatJid && (
                <div className="rounded-lg border bg-muted/30 p-3 flex items-center justify-between">
                  <div className="min-w-0 flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary shrink-0" />
                    <div className="truncate">
                      <p className="text-xs font-semibold text-foreground truncate">{editingCard.chatJid}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {t("pages.kanban.linkedChat", { defaultValue: "Atendimento WhatsApp vinculado" })}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1 shrink-0"
                    onClick={() => {
                      if (editingCard) openChat(editingCard);
                    }}
                  >
                    <ExternalLink className="h-3 w-3" />
                    {t("pages.kanban.openChat", { defaultValue: "Ver conversa" })}
                  </Button>
                </div>
              )}

              {/* Título */}
              <div>
                <label className="text-xs font-semibold text-foreground">{t("pages.kanban.cardTitle", { defaultValue: "Título" })} *</label>
                <Input
                  value={editCardTitle}
                  onChange={(e) => setEditCardTitle(e.target.value)}
                  className="mt-1 font-medium"
                />
              </div>

              {/* Descrição */}
              <div>
                <label className="text-xs font-semibold text-foreground">{t("pages.kanban.cardDescPlaceholder", { defaultValue: "Descrição ou notas" })}</label>
                <Textarea
                  value={editCardDesc}
                  onChange={(e) => setEditCardDesc(e.target.value)}
                  rows={3}
                  className="mt-1 resize-none"
                  placeholder={t("pages.kanban.addDetailsPlaceholder", { defaultValue: "Adicione notas, históricos ou lembretes sobre este card..." })}
                />
              </div>

              {/* Etapa e Atendente */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground">{t("pages.kanban.column", { defaultValue: "Coluna / Etapa" })}</label>
                  <select
                    value={editCardColId}
                    onChange={(e) => setEditCardColId(e.target.value)}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {columns.map((col) => (
                      <option key={col.id} value={col.id}>
                        {col.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground">{t("pages.kanban.attendant", { defaultValue: "Atendente / Responsável" })}</label>
                  <select
                    value={editCardAssigneeId}
                    onChange={(e) => setEditCardAssigneeId(e.target.value)}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">{t("pages.kanban.unassigned", { defaultValue: "Nenhum / Desatribuído" })}</option>
                    {operators.map((op) => (
                      <option key={op.id} value={op.id}>
                        {op.name ? `${op.name} (${op.email})` : op.email}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Data de Vencimento / Entrega */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">{t("pages.kanban.dueDate", { defaultValue: "Data de entrega / prazo" })}</label>
                  {editCardDueAt && (
                    <button
                      type="button"
                      onClick={() => setEditCardDueAt("")}
                      className="text-[11px] text-muted-foreground hover:text-destructive"
                    >
                      {t("common.clear", { defaultValue: "Limpar data" })}
                    </button>
                  )}
                </div>
                <Input
                  type="datetime-local"
                  value={editCardDueAt}
                  onChange={(e) => setEditCardDueAt(e.target.value)}
                  className="mt-1"
                />
              </div>

              {/* Imagem de Capa */}
              <div>
                <label className="text-xs font-semibold text-foreground">{t("pages.kanban.coverImage", { defaultValue: "Imagem do cartão" })}</label>
                {editCardImageUrl ? (
                  <div className="mt-2 relative rounded-md border overflow-hidden max-h-48 bg-muted/30">
                    <img src={editCardImageUrl} alt="" className="w-full h-44 object-cover" />
                    <button
                      type="button"
                      onClick={() => setEditCardImageUrl("")}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-background/90 hover:bg-destructive hover:text-white transition shadow"
                      title={t("pages.kanban.removeImage", { defaultValue: "Remover imagem" })}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="mt-1.5 flex gap-2">
                    <Input
                      placeholder={t("pages.kanban.imageUrlPlaceholder", { defaultValue: "Cole o link da imagem ou..." })}
                      value={editCardImageUrl}
                      onChange={(e) => setEditCardImageUrl(e.target.value)}
                      className="flex-1 text-xs"
                    />
                    <input
                      ref={editFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleUploadImageFile(file, true);
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploadingImage}
                      onClick={() => editFileInputRef.current?.click()}
                      className="shrink-0 gap-1.5"
                    >
                      {uploadingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      {t("pages.kanban.upload", { defaultValue: "Enviar arquivo" })}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="flex sm:justify-between items-center gap-2 pt-2 border-t">
              <Button
                variant="destructive"
                type="button"
                size="sm"
                onClick={() => {
                  if (editingCard) {
                    setToDeleteCard(editingCard);
                    setEditingCard(null);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {t("common.delete", { defaultValue: "Excluir cartão" })}
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setEditingCard(null)}>
                  {t("common.cancel", { defaultValue: "Cancelar" })}
                </Button>
                <Button onClick={handleUpdateCard}>
                  <Save className="h-4 w-4 mr-1" />
                  {t("common.save", { defaultValue: "Salvar alterações" })}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ================= CONFIRMAÇÃO DE DELEÇÃO: BOARD ================= */}
        <ConfirmDialog
          open={!!toDeleteBoard}
          onOpenChange={(o) => !o && setToDeleteBoard(null)}
          title={t("pages.kanban.deleteBoardTitle", { defaultValue: "Excluir board?" })}
          description={
            toDeleteBoard
              ? t("pages.kanban.deleteBoardDescription", {
                  defaultValue: 'O board "{{name}}" e todas as suas etapas e cartões serão excluídos permanentemente.',
                  name: toDeleteBoard.name,
                })
              : undefined
          }
          confirmLabel={t("pages.kanban.remove", { defaultValue: "Excluir definitivamente" })}
          destructive
          onConfirm={async () => {
            if (!toDeleteBoard) return;
            try {
              await deleteBoard(toDeleteBoard.id);
              setActiveBoardId("");
              setSnapshot(null);
              await loadBoards();
              toast.success(t("pages.kanban.boardDeletedToast", { defaultValue: "Board excluído com sucesso" }));
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        />

        {/* ================= CONFIRMAÇÃO DE DELEÇÃO: COLUNA ================= */}
        <ConfirmDialog
          open={!!toDeleteColumn}
          onOpenChange={(o) => !o && setToDeleteColumn(null)}
          title={t("pages.kanban.deleteColumnTitle", { defaultValue: "Excluir coluna?" })}
          description={
            toDeleteColumn
              ? t("pages.kanban.deleteColumnDescription", {
                  defaultValue: 'A coluna "{{name}}" e todos os cartões dentro dela serão excluídos.',
                  name: toDeleteColumn.name,
                })
              : undefined
          }
          confirmLabel={t("pages.kanban.remove", { defaultValue: "Excluir coluna" })}
          destructive
          onConfirm={async () => {
            if (!toDeleteColumn) return;
            try {
              await deleteColumn(toDeleteColumn.id);
              await loadSnapshot(activeBoardId);
              toast.success(t("pages.kanban.columnDeletedToast", { defaultValue: "Coluna excluída com sucesso" }));
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        />

        {/* ================= CONFIRMAÇÃO DE DELEÇÃO: CARTÃO ================= */}
        <ConfirmDialog
          open={!!toDeleteCard}
          onOpenChange={(o) => !o && setToDeleteCard(null)}
          title={t("pages.kanban.deleteCardTitle", { defaultValue: "Excluir cartão?" })}
          description={
            toDeleteCard
              ? t("pages.kanban.deleteCardDescription", {
                  defaultValue: 'Deseja excluir o cartão "{{title}}"? Esta ação não pode ser desfeita.',
                  title: toDeleteCard.title,
                })
              : undefined
          }
          confirmLabel={t("pages.kanban.remove", { defaultValue: "Excluir cartão" })}
          destructive
          onConfirm={async () => {
            if (!toDeleteCard) return;
            try {
              await deleteCard(toDeleteCard.id);
              await loadSnapshot(activeBoardId);
              toast.success(t("pages.kanban.cardDeletedToast", { defaultValue: "Cartão excluído com sucesso" }));
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        />
      </div>
    </AppShell>
  );
}