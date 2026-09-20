import { useEffect, useState } from "react";
import { Check, Info, Loader2, Lock, Mail, Save, Send, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import * as smtpApi from "@/services/smtp";

interface ProviderPreset {
  name: string;
  host: string;
  port: string;
  hint: string;
}

const PRESETS: ProviderPreset[] = [
  { name: "Gmail", host: "smtp.gmail.com", port: "587", hint: "Requer Senha de App (16 caracteres) gerada na conta Google." },
  { name: "Outlook / 365", host: "smtp.office365.com", port: "587", hint: "Use seu e-mail e senha da conta Microsoft / Office 365." },
  { name: "Hostinger", host: "smtp.hostinger.com", port: "465", hint: "Usa conexão segura SSL/TLS direta na porta 465." },
  { name: "Zoho Mail", host: "smtp.zoho.com", port: "465", hint: "Conexão SSL/TLS direta na porta 465 (ou 587 STARTTLS)." },
  { name: "Amazon SES", host: "email-smtp.us-east-1.amazonaws.com", port: "587", hint: "Use as credenciais SMTP geradas no console da AWS." },
  { name: "cPanel / Próprio", host: "mail.seudominio.com", port: "465", hint: "Geralmente porta 465 (SSL) ou 587 (STARTTLS)." },
];

export const EmailSettingsPage = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [passSet, setPassSet] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [form, setForm] = useState({ host: "", port: "587", user: "", pass: "", from: "" });
  const [testTo, setTestTo] = useState("");

  useEffect(() => {
    let alive = true;
    smtpApi
      .getSmtp()
      .then((c) => {
        if (!alive) return;
        setForm({ host: c.host || "", port: c.port || "587", user: c.user || "", pass: "", from: c.from || "" });
        setPassSet(!!c.passSet);
        setConfigured(!!c.configured);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : t("pages.emailSettings.errLoad", { defaultValue: "Falha ao carregar SMTP" })))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [t]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const applyPreset = (p: ProviderPreset) => {
    setForm((f) => ({
      ...f,
      host: p.host,
      port: p.port,
    }));
    toast.info(`Preenchido com as configurações recomendadas para ${p.name}`);
  };

  const setPort = (p: string) => {
    setForm((f) => ({ ...f, port: p }));
  };

  const save = async () => {
    if (!form.host.trim() || !form.from.trim()) {
      toast.error(t("pages.emailSettings.errRequired", { defaultValue: "Informe ao menos servidor (host) e remetente (from)." }));
      return;
    }
    setSaving(true);
    try {
      const c = await smtpApi.saveSmtp({
        host: form.host.trim(),
        port: form.port.trim() || "587",
        user: form.user.trim(),
        pass: form.pass.trim() || undefined,
        from: form.from.trim(),
      });
      setPassSet(!!c.passSet);
      setConfigured(!!c.configured);
      setForm((f) => ({ ...f, pass: "" }));
      toast.success(t("pages.emailSettings.savedToast", { defaultValue: "Configurações de e-mail salvas." }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("pages.emailSettings.errSave", { defaultValue: "Falha ao salvar" }));
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (!testTo.trim()) {
      toast.error(t("pages.emailSettings.errTestTo", { defaultValue: "Informe um e-mail de destino para o teste." }));
      return;
    }
    setTesting(true);
    try {
      await smtpApi.testSmtp(testTo.trim());
      toast.success(t("pages.emailSettings.testSentToast", { defaultValue: "E-mail de teste enviado com sucesso!" }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha no envio de teste";
      toast.error(`Falha no envio: ${msg}`);
    } finally {
      setTesting(false);
    }
  };

  const isPort465 = form.port.trim() === "465";
  const isPort587 = form.port.trim() === "587";

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-6 space-y-6">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <Mail className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{t("pages.emailSettings.title", { defaultValue: "E-mail / Servidor SMTP" })}</h1>
              <p className="text-sm text-muted-foreground">
                {t("pages.emailSettings.subtitle", { defaultValue: "Servidor usado para recuperação de senhas, ativação de contas e notificações." })}
              </p>
            </div>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
              configured ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"
            }`}
          >
            {configured
              ? t("pages.emailSettings.configured", { defaultValue: "● Configurado" })
              : t("pages.emailSettings.notConfigured", { defaultValue: "○ Não configurado" })}
          </span>
        </header>

        {loading ? (
          <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" /> {t("common.loading", { defaultValue: "Carregando…" })}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Atalhos de Provedores Populares */}
            <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                <span>Preencher com provedor popular:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <Button
                    key={p.name}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-medium hover:border-primary hover:text-primary transition"
                    onClick={() => applyPreset(p)}
                  >
                    {p.name}
                  </Button>
                ))}
              </div>
            </div>

            {/* Formulário Principal */}
            <div className="space-y-5 rounded-xl border bg-card p-5 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label htmlFor="smtp-host" className="font-semibold">{t("pages.emailSettings.hostLabel", { defaultValue: "Servidor SMTP (Host)" })}</Label>
                  <Input
                    id="smtp-host"
                    placeholder="smtp.gmail.com ou smtp.hostinger.com"
                    value={form.host}
                    onChange={set("host")}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="smtp-port" className="font-semibold">{t("pages.emailSettings.portLabel", { defaultValue: "Porta" })}</Label>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setPort("587")}
                        className={`px-1.5 py-0.5 text-[10px] rounded font-mono transition ${
                          isPort587 ? "bg-primary text-primary-foreground font-bold" : "bg-muted hover:bg-muted/80 text-muted-foreground"
                        }`}
                      >
                        587
                      </button>
                      <button
                        type="button"
                        onClick={() => setPort("465")}
                        className={`px-1.5 py-0.5 text-[10px] rounded font-mono transition ${
                          isPort465 ? "bg-primary text-primary-foreground font-bold" : "bg-muted hover:bg-muted/80 text-muted-foreground"
                        }`}
                      >
                        465
                      </button>
                      <button
                        type="button"
                        onClick={() => setPort("25")}
                        className={`px-1.5 py-0.5 text-[10px] rounded font-mono transition ${
                          form.port === "25" ? "bg-primary text-primary-foreground font-bold" : "bg-muted hover:bg-muted/80 text-muted-foreground"
                        }`}
                      >
                        25
                      </button>
                    </div>
                  </div>
                  <Input id="smtp-port" placeholder="587 ou 465" value={form.port} onChange={set("port")} />
                </div>
              </div>

              {/* Informação sobre o modo de segurança da porta selecionada */}
              <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                <div>
                  {isPort465 && (
                    <span>
                      <strong className="text-foreground">Porta 465 (SSL/TLS Direto):</strong> Conexão segura nativa do início ao fim. Ideal para Hostinger, cPanel, Locaweb e Zoho.
                    </span>
                  )}
                  {isPort587 && (
                    <span>
                      <strong className="text-foreground">Porta 587 (STARTTLS):</strong> Conexão padrão moderna com atualização segura TLS. Recomendada para Gmail, Outlook/365 e Amazon SES.
                    </span>
                  )}
                  {!isPort465 && !isPort587 && (
                    <span>
                      <strong className="text-foreground">Porta {form.port || "25"}:</strong> Conexão SMTP padrão com suporte a upgrade TLS quando disponível.
                    </span>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-user" className="font-semibold">{t("pages.emailSettings.userLabel", { defaultValue: "Usuário SMTP" })}</Label>
                  <Input
                    id="smtp-user"
                    autoComplete="off"
                    placeholder="usuario@dominio.com ou chave de API"
                    value={form.user}
                    onChange={set("user")}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="smtp-pass" className="font-semibold">{t("pages.emailSettings.passLabel", { defaultValue: "Senha SMTP" })}</Label>
                  <Input
                    id="smtp-pass"
                    type="password"
                    autoComplete="new-password"
                    placeholder={passSet ? t("pages.emailSettings.passKeptPlaceholder", { defaultValue: "•••••••• (mantida)" }) : t("pages.emailSettings.passPlaceholder", { defaultValue: "senha ou senha de app" })}
                    value={form.pass}
                    onChange={set("pass")}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {passSet
                      ? t("pages.emailSettings.passKeptHint", { defaultValue: "Deixe em branco para manter a senha atual." })
                      : t("pages.emailSettings.passRequiredHint", { defaultValue: "Necessária quando o servidor exige autenticação." })}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="smtp-from" className="font-semibold">{t("pages.emailSettings.fromLabel", { defaultValue: "Remetente (From)" })}</Label>
                <Input
                  id="smtp-from"
                  placeholder="Meu Sistema <nao-responda@seudominio.com>"
                  value={form.from}
                  onChange={set("from")}
                />
                <p className="text-[11px] text-muted-foreground">
                  Pode ser no formato simples <code className="text-xs font-mono">contato@dominio.com</code> ou com nome <code className="text-xs font-mono">Suporte &lt;contato@dominio.com&gt;</code>.
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={save} disabled={saving} className="min-w-[140px]">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  {t("common.save", { defaultValue: "Salvar Configurações" })}
                </Button>
              </div>

              {/* Seção de Teste */}
              <div className="border-t pt-5 space-y-2">
                <Label htmlFor="smtp-test" className="font-semibold text-sm">{t("pages.emailSettings.testLabel", { defaultValue: "Testar Envio de E-mail" })}</Label>
                <p className="text-xs text-muted-foreground">
                  Envie uma mensagem de teste para verificar se as credenciais e a porta estão funcionando corretamente.
                </p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="smtp-test"
                    placeholder="seu-email-pessoal@gmail.com"
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                    className="flex-1"
                  />
                  <Button variant="outline" onClick={sendTest} disabled={testing} className="shrink-0">
                    {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    {t("pages.emailSettings.testButton", { defaultValue: "Enviar Teste" })}
                  </Button>
                </div>
              </div>
            </div>

            {/* Dicas de Configuração */}
            <div className="rounded-xl border bg-card p-4 space-y-2 text-xs text-muted-foreground shadow-sm">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <Info className="h-4 w-4 text-primary" />
                <span>Dicas para Provedores Específicos:</span>
              </div>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <strong>Gmail / Google Workspace:</strong> Ative a verificação em duas etapas e gere uma <em>Senha de App</em> de 16 caracteres em Segurança da Conta Google. Use a porta <strong>587</strong>.
                </li>
                <li>
                  <strong>Microsoft Outlook / Office 365:</strong> Use host <code className="font-mono">smtp.office365.com</code> na porta <strong>587</strong> com autenticação STARTTLS.
                </li>
                <li>
                  <strong>Hostinger / cPanel / Locaweb:</strong> Use o host do seu provedor (ex.: <code className="font-mono">smtp.hostinger.com</code>) na porta <strong>465</strong> (SSL direto) e o e-mail completo como usuário.
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default EmailSettingsPage;
