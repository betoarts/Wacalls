import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { clearAuthClientState, useAuth } from "@/stores/auth";
import { apiUrl } from "@/lib/api-base";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const RequireAuth = ({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) => {
  const user = useAuth((s) => s.user);
  const loading = useAuth((s) => s.loading);
  const refresh = useAuth((s) => s.refresh);
  const loc = useLocation();
  const nav = useNavigate();

  useEffect(() => {
    if (loading) void refresh();
  }, [loading, refresh]);

  // Política de sessão única: se outro navegador fizer login com o mesmo
  // usuário, o backend revoga o token atual. Mantemos uma conexão SSE em
  // /api/auth/stream para receber o evento "revoked" em tempo real, além
  // de ouvir o evento "auth:invalidated" (disparado pelo cliente HTTP em
  // respostas 401) como fallback.
  useEffect(() => {
    if (!user) return;

    let jaAvisou = false;
    let es: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let isCancelled = false;

    const encerrar = (motivo: "outro-acesso" | "expirou") => {
      if (jaAvisou) return;
      jaAvisou = true;
      toast.error(
        motivo === "outro-acesso"
          ? "Sua sessão foi encerrada porque esta conta entrou em outro navegador ou aparelho."
          : "Sua sessão expirou. Entre novamente.",
        { id: "sessao-encerrada" },
      );
      clearAuthClientState();
      useAuth.setState({ user: null });
      nav("/login", { replace: true });
    };

    const handleInvalidated = () => encerrar("expirou");
    window.addEventListener("auth:invalidated", handleInvalidated);

    const connectAuthStream = () => {
      if (isCancelled) return;
      try {
        es = new EventSource(apiUrl("/api/auth/stream"), { withCredentials: true });
        es.addEventListener("revoked", () => {
          encerrar("outro-acesso");
          if (es) es.close();
        });
        es.onerror = () => {
          if (es?.readyState === EventSource.CLOSED) {
            es.close();
            es = null;
            if (!isCancelled) {
              reconnectTimeout = setTimeout(connectAuthStream, 3000);
            }
          }
        };
      } catch {
        if (!isCancelled) {
          reconnectTimeout = setTimeout(connectAuthStream, 5000);
        }
      }
    };

    connectAuthStream();

    return () => {
      isCancelled = true;
      window.removeEventListener("auth:invalidated", handleInvalidated);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (es) es.close();
    };
  }, [user, refresh, nav]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }
  const isSuperAdmin = user.email.trim().toLowerCase() === "wacalls@admin.com";

  if (adminOnly && !user.roles.includes("admin") && !isSuperAdmin) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};