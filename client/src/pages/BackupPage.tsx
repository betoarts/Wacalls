import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Database,
  FileArchive,
  HardDrive,
  Info,
  Loader2,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
  getBackupInfo,
  getExportBackupUrl,
  importBackup,
  type BackupStats,
  type RestoreResult,
} from "@/services/backup";

function formatBytes(bytes: number) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export const BackupPage = () => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<BackupStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [includeMedia, setIncludeMedia] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadStats = async () => {
    setLoading(true);
    try {
      const data = await getBackupInfo();
      setStats(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar informações do sistema");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const handleExport = () => {
    setExporting(true);
    try {
      const url = getExportBackupUrl(includeMedia);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wacalls-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success("Download do backup iniciado!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar backup");
    } finally {
      setTimeout(() => setExporting(false), 2000);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.toLowerCase().endsWith(".zip")) {
        toast.error("O arquivo de backup deve estar no formato .zip");
        return;
      }
      setSelectedFile(file);
      setRestoreResult(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (!file.name.toLowerCase().endsWith(".zip")) {
        toast.error("O arquivo de backup deve estar no formato .zip");
        return;
      }
      setSelectedFile(file);
      setRestoreResult(null);
    }
  };

  const executeRestore = async () => {
    if (!selectedFile) return;
    setImporting(true);
    setRestoreResult(null);
    try {
      const result = await importBackup(selectedFile);
      setRestoreResult(result);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.success("Backup restaurado com sucesso!");
      loadStats();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao restaurar backup");
    } finally {
      setImporting(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl p-4 sm:p-6 space-y-6">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <Database className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Backup & Restauração</h1>
              <p className="text-sm text-muted-foreground">
                Exporte ou restaure todas as conversas, contatos, mídias e configurações do WaCalls.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={loadStats} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar Status
          </Button>
        </header>

        {/* Estatísticas do Sistema */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold uppercase">Banco de Dados</span>
              <HardDrive className="h-4 w-4 text-primary" />
            </div>
            <p className="text-2xl font-bold tracking-tight">
              {stats ? formatBytes(stats.dbSize) : "..."}
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> SQLite WAL Ativo
            </p>
          </div>

          <div className="rounded-xl border bg-card p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold uppercase">Mensagens</span>
              <MessageSquare className="h-4 w-4 text-primary" />
            </div>
            <p className="text-2xl font-bold tracking-tight">
              {stats ? stats.messageCount.toLocaleString() : "..."}
            </p>
            <p className="text-xs text-muted-foreground">
              em {stats ? stats.chatCount.toLocaleString() : "..."} conversas
            </p>
          </div>

          <div className="rounded-xl border bg-card p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold uppercase">Contatos & Usuários</span>
              <Users className="h-4 w-4 text-primary" />
            </div>
            <p className="text-2xl font-bold tracking-tight">
              {stats ? (stats.contactCount + stats.userCount).toLocaleString() : "..."}
            </p>
            <p className="text-xs text-muted-foreground">
              {stats ? `${stats.contactCount} contatos, ${stats.userCount} usuários` : "..."}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold uppercase">Arquivos de Mídia</span>
              <FileArchive className="h-4 w-4 text-primary" />
            </div>
            <p className="text-2xl font-bold tracking-tight">
              {stats ? formatBytes(stats.mediaSize) : "..."}
            </p>
            <p className="text-xs text-muted-foreground">
              {stats ? `${stats.mediaCount} arquivos salvos` : "..."}
            </p>
          </div>
        </div>

        {/* Feedback de Restauração Concluída */}
        {restoreResult && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                {restoreResult.message}
              </p>
              <p className="text-muted-foreground text-xs">
                Foram restauradas <b>{restoreResult.tablesRestored}</b> tabelas e <b>{restoreResult.mediaFilesRestored}</b> arquivos de mídia.
              </p>
              {restoreResult.preRestoreBackup && (
                <p className="text-xs text-muted-foreground/80">
                  Cópia de segurança criada preventivamente em: <code>{restoreResult.preRestoreBackup}</code>
                </p>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card Exportação (Download) */}
          <div className="rounded-xl border bg-card p-5 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <ArrowDownToLine className="h-4 w-4" />
                </span>
                <h2 className="text-base font-semibold">Exportar Backup Completo</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Gera um arquivo compacto <code>.zip</code> com snapshot seguro do banco de dados e arquivos de mídia.
              </p>

              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <label className="flex items-center gap-2.5 cursor-pointer text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={includeMedia}
                    onChange={(e) => setIncludeMedia(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span>Incluir pasta de mídias (fotos, áudios e gravações)</span>
                </label>
                <p className="text-xs text-muted-foreground pl-6.5">
                  {includeMedia
                    ? `O arquivo .zip conterá o banco de dados (~${stats ? formatBytes(stats.dbSize) : "7MB"}) e todas as mídias (~${stats ? formatBytes(stats.mediaSize) : "45MB"}).`
                    : "Exporta apenas o banco de dados (download instantâneo e super leve)."}
                </p>
              </div>
            </div>

            <Button
              onClick={handleExport}
              disabled={exporting}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            >
              {exporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Gerando Backup...
                </>
              ) : (
                <>
                  <ArrowDownToLine className="h-4 w-4 mr-2" />
                  Baixar Backup (.zip)
                </>
              )}
            </Button>
          </div>

          {/* Card Importação (Upload) */}
          <div className="rounded-xl border bg-card p-5 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <ArrowUpFromLine className="h-4 w-4" />
                </span>
                <h2 className="text-base font-semibold">Restaurar / Importar Backup</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Envie um arquivo <code>.zip</code> exportado anteriormente para restabelecer conversas e mídias.
              </p>

              {/* Área de Seleção / Drop */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
                  selectedFile
                    ? "border-primary/50 bg-primary/5"
                    : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/20"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <FileArchive className="h-8 w-8 mx-auto text-muted-foreground/70 mb-2" />
                {selectedFile ? (
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-primary truncate max-w-xs mx-auto">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Tamanho: {formatBytes(selectedFile.size)}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      Clique ou arraste o arquivo <span className="font-semibold text-primary">.zip</span> aqui
                    </p>
                    <p className="text-xs text-muted-foreground">Arquivos de até 2 GB suportados</p>
                  </div>
                )}
              </div>
            </div>

            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!selectedFile || importing}
              variant="default"
              className="w-full"
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Restaurando Dados...
                </>
              ) : (
                <>
                  <ArrowUpFromLine className="h-4 w-4 mr-2" />
                  Restaurar Backup Selecionado
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Informações Importantes & Dicas de Segurança */}
        <div className="rounded-xl border bg-muted/30 p-4 space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 font-semibold text-foreground text-sm">
            <Info className="h-4 w-4 text-primary" />
            Como funciona a segurança do backup?
          </div>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li>
              <b>Snapshot Atômico</b>: A exportação utiliza o comando SQLite <code>VACUUM INTO</code>, que cria uma imagem íntegra sem interromper o fluxo de mensagens ou ligações ativas.
            </li>
            <li>
              <b>Cópia de Segurança Preventiva</b>: Toda vez que você restaura um backup, o sistema gera automaticamente uma cópia do banco anterior antes de aplicar as mudanças.
            </li>
            <li>
              <b>Migração de Computador</b>: Para mover o WaCalls de um computador para outro, basta exportar o arquivo <code>.zip</code> aqui, instalar o WaCalls no novo computador e restaurá-lo por esta mesma tela.
            </li>
          </ul>
        </div>
      </div>

      {/* Confirmação de Restauração */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Restaurar backup do sistema?"
        description={`Você selecionou o arquivo "${selectedFile?.name}". Todos os dados atuais do banco de dados serão substituídos pelo conteúdo deste backup. Uma cópia de segurança preventiva será criada antes do processo. Deseja continuar?`}
        confirmLabel="Sim, Restaurar Backup"
        destructive
        onConfirm={executeRestore}
      />
    </AppShell>
  );
};
export default BackupPage;

