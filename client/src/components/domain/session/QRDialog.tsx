import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, RefreshCw, Smartphone } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useSessions } from "@/stores/sessions";
import { getSessionQR, pairSession } from "@/services/sessions";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  sessionName: string;
};

// Modal that displays the WhatsApp pairing QR code with the same wording and
// numbered instructions used by the reference design. The QR string is read
// reactively from the sessions store, so it refreshes as the broker rotates
// the code.
export const QRDialog = ({ open, onOpenChange, sessionId, sessionName }: Props) => {
  const qr = useSessions((s) => s.qrs[sessionId] ?? "");
  const paired = useSessions((s) =>
    s.sessions.find((x) => x.id === sessionId)?.paired ?? false,
  );

  const [refreshing, setRefreshing] = useState(false);

  // Solicita pareamento e busca o QR code ativo imediatamente (com fallback de polling)
  useEffect(() => {
    if (!open || paired) return;
    let cancelled = false;

    // Dispara a geracao ou conexao de pareamento
    pairSession(sessionId).catch((e) => toast.error((e as Error).message));

    // Busca o QR code caso ja esteja pronto
    const fetchQR = async () => {
      try {
        const res = await getSessionQR(sessionId);
        if (!cancelled && res?.qr) {
          useSessions.setState((s) => ({ qrs: { ...s.qrs, [sessionId]: res.qr } }));
        }
      } catch {}
    };

    void fetchQR();
    const interval = setInterval(() => {
      if (!useSessions.getState().qrs[sessionId]) {
        void fetchQR();
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [open, paired, sessionId]);

  // Fecha o modal automaticamente quando o pareamento for concluido
  useEffect(() => {
    if (open && paired) {
      toast.success("WhatsApp conectado com sucesso!");
      onOpenChange(false);
    }
  }, [open, paired, onOpenChange]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      await pairSession(sessionId);
      const res = await getSessionQR(sessionId);
      if (res?.qr) {
        useSessions.setState((s) => ({ qrs: { ...s.qrs, [sessionId]: res.qr } }));
      }
      toast.success("Solicitação enviada. Novo QR Code sendo gerado...");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTimeout(() => setRefreshing(false), 1500);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Smartphone className="h-4 w-4 text-primary" />
            Conectar WhatsApp — {sessionName}
          </div>
        </div>

        <div className="space-y-5 px-5 py-5">
          <ol className="space-y-1.5 rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed">
            <li>1. Abra o WhatsApp no seu celular</li>
            <li>
              2. Toque em <b>Menu</b> ou <b>Configurações</b>
            </li>
            <li>
              3. Toque em <b>Aparelhos conectados</b>
            </li>
            <li>4. Aponte seu celular para esta tela para escanear o código</li>
          </ol>

          <div className="grid place-items-center">
            <div className="grid h-[260px] w-[260px] place-items-center rounded-xl bg-white p-3 shadow-inner">
              {qr ? (
                <QRCodeSVG value={qr} size={232} includeMargin={false} />
              ) : (
                <div className="text-center text-xs text-muted-foreground">
                  Gerando QR Code…
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-col items-center gap-1.5">
              <p className="text-center text-xs text-muted-foreground">
                O QR Code é atualizado automaticamente
              </p>
              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline disabled:opacity-50"
              >
                {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Gerar novo QR Code
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
