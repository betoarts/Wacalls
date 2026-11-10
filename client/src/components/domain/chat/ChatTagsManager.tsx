import { useEffect, useMemo, useState } from "react";
import { Plus, X, Tag as TagIcon, Check, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Tag } from "@/types/tag";
import {
  listTags,
  attachChatTag,
  detachChatTag,
  listChatTags,
  createTag,
} from "@/services/tags";
import { setChatTagsStore } from "@/stores/chats";
import { tagChipStyle } from "@/lib/tag-color";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const QUICK_COLORS = [
  "#25D366",
  "#0F7A41",
  "#2F80ED",
  "#1C4F8A",
  "#F0B357",
  "#E8796A",
  "#B5179E",
  "#7048E8",
  "#00B8D9",
  "#6B7D91",
];

interface Props {
  sessionId: string;
  chatJid: string;
  tags?: Tag[];
  allTags?: Tag[];
  onChange?: (tags: Tag[]) => void;
  onTagCreated?: (tag: Tag) => void;
  compact?: boolean;
  allowCreate?: boolean;
}

export const ChatTagsManager = ({
  sessionId,
  chatJid,
  tags,
  allTags,
  onChange,
  onTagCreated,
  compact,
  allowCreate = true,
}: Props) => {
  const [current, setCurrent] = useState<Tag[]>(tags ?? []);
  const [fetchedAll, setFetchedAll] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creatingMode, setCreatingMode] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(QUICK_COLORS[0]);

  useEffect(() => {
    if (tags !== undefined) {
      setCurrent(tags);
    }
  }, [tags]);

  useEffect(() => {
    if (tags !== undefined || !sessionId || !chatJid) return;
    let cancelled = false;
    setLoading(true);
    listChatTags(sessionId, chatJid)
      .then((mine) => {
        if (cancelled) return;
        setCurrent(mine);
        onChange?.(mine);
      })
      .catch(() => {
        /* ignore initial silent fetch */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, chatJid, tags === undefined]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setCreatingMode(false);
      setNewName("");
      return;
    }
    if (allTags !== undefined) return;
    let cancelled = false;
    setLoading(true);
    listTags()
      .then((every) => {
        if (!cancelled) setFetchedAll(every);
      })
      .catch((err) => {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Erro ao carregar tags");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, allTags]);

  const catalog = allTags ?? fetchedAll;
  const selectedIds = useMemo(() => new Set(current.map((t) => t.id)), [current]);

  const filteredAvailable = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((t) => {
      if (selectedIds.has(t.id)) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q);
    });
  }, [catalog, selectedIds, search]);

  const exactMatchExists = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return catalog.some((t) => t.name.toLowerCase() === q);
  }, [catalog, search]);

  const commitTags = (next: Tag[]) => {
    setCurrent(next);
    setChatTagsStore(sessionId, chatJid, next);
    onChange?.(next);
  };

  const attach = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await attachChatTag(sessionId, chatJid, id);
      commitTags(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível adicionar a tag");
    } finally {
      setBusy(false);
    }
  };

  const detach = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await detachChatTag(sessionId, chatJid, id);
      const next = current.filter((t) => t.id !== id);
      commitTags(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível remover a tag");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateAndAttach = async (rawName: string, color: string) => {
    const clean = rawName.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      const created = await createTag(clean, color);
      setFetchedAll((prev) => [...prev, created]);
      onTagCreated?.(created);
      const next = await attachChatTag(sessionId, chatJid, created.id);
      commitTags(next);
      setSearch("");
      setNewName("");
      setCreatingMode(false);
      toast.success(`Tag "${created.name}" criada e aplicada`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar tag");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={compact ? "flex flex-wrap items-center gap-1" : "flex flex-wrap items-center gap-1.5"}
    >
      {current.map((t) => (
        <span
          key={t.id}
          className="inline-flex max-w-[140px] items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium leading-none"
          style={tagChipStyle(t.color)}
          title={t.name}
        >
          <TagIcon className="h-2.5 w-2.5 shrink-0 opacity-80" />
          <span className="truncate">{t.name}</span>
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              void detach(t.id);
            }}
            className="ml-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full hover:bg-black/10 disabled:opacity-40"
            title="Remover tag"
            aria-label={`Remover ${t.name}`}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={(e) => e.stopPropagation()}
            className="h-6 gap-1 rounded-full border-dashed px-2 text-[10px]"
            title="Adicionar tag"
          >
            <Plus className="h-3 w-3" />
            {compact && current.length > 0 ? "" : "Tag"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-64 p-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex items-center gap-1.5 rounded-md border bg-background px-2 py-1">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Buscar tag…"
              className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Limpar busca"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Disponíveis
          </div>
          {loading ? (
            <div className="flex items-center gap-1.5 px-1 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Carregando…
            </div>
          ) : filteredAvailable.length === 0 ? (
            <div className="px-1 py-2 text-xs text-muted-foreground">
              {catalog.length === 0
                ? "Nenhuma tag cadastrada ainda."
                : search.trim()
                  ? "Nenhuma tag correspondente."
                  : "Todas as tags já estão vinculadas."}
            </div>
          ) : (
            <ul className="max-h-48 space-y-0.5 overflow-y-auto">
              {filteredAvailable.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void attach(t.id);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50"
                  >
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-border"
                      style={{ backgroundColor: t.color }}
                    />
                    <span className="flex-1 truncate">{t.name}</span>
                    <Check className="h-3 w-3 opacity-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {allowCreate && (
            <div className="mt-2 border-t pt-2">
              {search.trim() && !exactMatchExists && !creatingMode ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {QUICK_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewColor(c)}
                        className={`h-4 w-4 rounded-full border-2 transition ${newColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                        style={{ backgroundColor: c }}
                        aria-label={`Cor ${c}`}
                      />
                    ))}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void handleCreateAndAttach(search, newColor)}
                    className="h-7 w-full justify-start gap-1.5 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span className="truncate">Criar &ldquo;{search.trim()}&rdquo;</span>
                  </Button>
                </div>
              ) : creatingMode ? (
                <div className="space-y-2">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter" && newName.trim()) {
                        void handleCreateAndAttach(newName, newColor);
                      }
                    }}
                    maxLength={40}
                    placeholder="Nome da nova tag"
                    className="h-7 w-full rounded-md border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-primary"
                    autoFocus
                  />
                  <div className="flex flex-wrap items-center gap-1">
                    {QUICK_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewColor(c)}
                        className={`h-4 w-4 rounded-full border-2 transition ${newColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                        style={{ backgroundColor: c }}
                        aria-label={`Cor ${c}`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => {
                        setCreatingMode(false);
                        setNewName("");
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy || !newName.trim()}
                      className="h-6 px-2 text-[11px]"
                      onClick={() => void handleCreateAndAttach(newName, newColor)}
                    >
                      Criar
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreatingMode(true)}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-muted"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Criar nova tag
                </button>
              )}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
