package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"html"
	"math/rand"
	"net"
	"net/http"
	"net/smtp"
	"strings"
	"time"
)

// emailBrand reúne os campos do whitelabel usados nos e-mails transacionais.
type emailBrand struct {
	AppName string
	LogoURL string // absoluto, pronto para <img src>
	BaseURL string // http(s)://host
}

func (s *server) loadEmailBrand(ctx context.Context, r *http.Request) emailBrand {
	b := emailBrand{AppName: "VozZap"}
	b.BaseURL = baseURLFromRequest(r)
	v, _ := s.settings.getKV(ctx, "whitelabel")
	if v != "" {
		var wl map[string]any
		if err := json.Unmarshal([]byte(v), &wl); err == nil {
			if n, ok := wl["appName"].(string); ok && strings.TrimSpace(n) != "" {
				b.AppName = strings.TrimSpace(n)
			}
			logo, _ := wl["logoLight"].(string)
			if logo == "" {
				logo, _ = wl["logoDark"].(string)
			}
			if logo == "" {
				logo, _ = wl["favicon"].(string)
			}
			if logo != "" {
				if strings.HasPrefix(logo, "http://") || strings.HasPrefix(logo, "https://") {
					b.LogoURL = logo
				} else if b.BaseURL != "" {
					b.LogoURL = strings.TrimRight(b.BaseURL, "/") + "/" + strings.TrimLeft(logo, "/")
				}
			}
		}
	}
	return b
}

func baseURLFromRequest(r *http.Request) string {
	if r == nil {
		return ""
	}
	scheme := "https"
	if r.TLS == nil && !strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		scheme = "http"
	}
	host := r.Host
	if f := r.Header.Get("X-Forwarded-Host"); f != "" {
		host = strings.TrimSpace(strings.Split(f, ",")[0])
	}
	return fmt.Sprintf("%s://%s", scheme, host)
}

// renderBrandedEmail monta um HTML simples e responsivo com a logo do
// whitelabel no topo. ctaURL/ctaLabel são opcionais.
func renderBrandedEmail(b emailBrand, title, message, ctaURL, ctaLabel string) string {
	return renderBrandedEmailRich(b, title, message, "", ctaURL, ctaLabel)
}

// renderBrandedEmailRich aceita um bloco HTML extra (ex.: código de ativação)
// que NÃO é escapado, evitando que tags apareçam como texto no e-mail.
func renderBrandedEmailRich(b emailBrand, title, message, extraHTML, ctaURL, ctaLabel string) string {
	logoBlock := ""
	if b.LogoURL != "" {
		logoBlock = fmt.Sprintf(`<img src="%s" alt="%s" style="max-height:48px;max-width:200px;display:block;margin:0 auto 16px;">`,
			html.EscapeString(b.LogoURL), html.EscapeString(b.AppName))
	} else {
		logoBlock = fmt.Sprintf(`<div style="font-size:22px;font-weight:700;color:#111;margin-bottom:16px;text-align:center;">%s</div>`,
			html.EscapeString(b.AppName))
	}
	cta := ""
	if ctaURL != "" && ctaLabel != "" {
		cta = fmt.Sprintf(`<div style="text-align:center;margin:28px 0;">
  <a href="%s" style="background:#1f6feb;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block;">%s</a>
</div>
<p style="font-size:12px;color:#6b7280;text-align:center;">Caso o botão não funcione, copie e cole no navegador:<br><a href="%s" style="color:#1f6feb;word-break:break-all;">%s</a></p>`,
			html.EscapeString(ctaURL), html.EscapeString(ctaLabel),
			html.EscapeString(ctaURL), html.EscapeString(ctaURL))
	}
	return fmt.Sprintf(`<!doctype html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table width="100%%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;box-shadow:0 4px 14px rgba(0,0,0,.06);overflow:hidden;">
<tr><td style="padding:32px 36px 24px;">
%s
<h1 style="font-size:20px;color:#111827;margin:0 0 12px;text-align:center;">%s</h1>
<p style="font-size:15px;color:#374151;line-height:1.55;margin:0 0 8px;">%s</p>
%s
%s
<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;">
<p style="font-size:11px;color:#9ca3af;text-align:center;margin:0;">Você recebeu este e-mail porque está cadastrado em %s.</p>
</td></tr></table>
</td></tr></table></body></html>`,
		logoBlock,
		html.EscapeString(title),
		html.EscapeString(message),
		extraHTML,
		cta,
		html.EscapeString(b.AppName),
	)
}

// renderActivationCodeBlock devolve o bloco HTML estilizado com o código.
func renderActivationCodeBlock(code string) string {
	return fmt.Sprintf(`<div style="margin:24px auto;max-width:320px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:18px 12px;text-align:center;">
  <div style="font-size:11px;letter-spacing:2px;color:#6b7280;text-transform:uppercase;margin-bottom:8px;">Seu código</div>
  <div style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#111827;">%s</div>
</div>`, html.EscapeString(code))
}

// loginAuth implementa autenticação AUTH LOGIN para servidores que não suportam PLAIN (ex.: Office 365, cPanel).
type loginAuth struct {
	username, password string
}

func LoginAuth(username, password string) smtp.Auth {
	return &loginAuth{username: username, password: password}
}

func (a *loginAuth) Start(server *smtp.ServerInfo) (string, []byte, error) {
	return "LOGIN", []byte(a.username), nil
}

func (a *loginAuth) Next(fromServer []byte, more bool) ([]byte, error) {
	if more {
		prompt := strings.ToLower(string(fromServer))
		if strings.Contains(prompt, "user") {
			return []byte(a.username), nil
		}
		if strings.Contains(prompt, "pass") {
			return []byte(a.password), nil
		}
		// Fallback para outros desafios
		return []byte(a.password), nil
	}
	return nil, nil
}

func extractEmailAddress(raw string) string {
	raw = strings.TrimSpace(raw)
	if strings.Contains(raw, "<") && strings.Contains(raw, ">") {
		start := strings.Index(raw, "<")
		end := strings.Index(raw, ">")
		if start < end {
			return strings.TrimSpace(raw[start+1 : end])
		}
	}
	return raw
}

// sendBrandedEmail entrega um e-mail HTML usando a configuração SMTP com suporte completo para:
// - Porta 465 (SSL / TLS direto / SMTPS)
// - Porta 587 (STARTTLS)
// - Porta 25 / 2525 e outras
// - Autenticação PLAIN e fallback LOGIN
func sendBrandedEmail(cfg smtpConfig, to, subject, htmlBody string) error {
	host := strings.TrimSpace(cfg.Host)
	port := strings.TrimSpace(cfg.Port)
	if port == "" {
		port = "587"
	}
	if host == "" {
		return fmt.Errorf("servidor SMTP (host) não configurado")
	}
	if cfg.From == "" {
		return fmt.Errorf("remetente SMTP (from) não configurado")
	}

	addr := net.JoinHostPort(host, port)
	tlsConfig := &tls.Config{
		ServerName: host,
		MinVersion: tls.VersionTLS12,
	}

	dateStr := time.Now().Format(time.RFC1123Z)
	msgID := fmt.Sprintf("<%d.%d@%s>", time.Now().UnixNano(), rand.Int63(), host)

	headers := []string{
		"From: " + cfg.From,
		"To: " + to,
		"Subject: " + subject,
		"Date: " + dateStr,
		"Message-ID: " + msgID,
		"MIME-Version: 1.0",
		"Content-Type: text/html; charset=UTF-8",
	}
	msg := []byte(strings.Join(headers, "\r\n") + "\r\n\r\n" + htmlBody)

	var client *smtp.Client
	var err error

	// Porta 465 exige conexão TLS direta desde o handshake inicial (SMTPS)
	if port == "465" {
		dialer := &net.Dialer{Timeout: 15 * time.Second}
		tlsConn, dialErr := tls.DialWithDialer(dialer, "tcp", addr, tlsConfig)
		if dialErr != nil {
			return fmt.Errorf("falha na conexão SSL/TLS (porta 465) com %s: %w", addr, dialErr)
		}
		defer tlsConn.Close()

		client, err = smtp.NewClient(tlsConn, host)
		if err != nil {
			return fmt.Errorf("falha ao inicializar cliente SMTP (SSL/TLS 465): %w", err)
		}
	} else {
		// Portas 587, 25, 2525 etc iniciam conexão TCP e atualizam via STARTTLS
		conn, dialErr := net.DialTimeout("tcp", addr, 15*time.Second)
		if dialErr != nil {
			return fmt.Errorf("falha na conexão com servidor SMTP %s: %w", addr, dialErr)
		}
		defer conn.Close()

		client, err = smtp.NewClient(conn, host)
		if err != nil {
			return fmt.Errorf("falha ao inicializar cliente SMTP: %w", err)
		}

		if ok, _ := client.Extension("STARTTLS"); ok {
			if startErr := client.StartTLS(tlsConfig); startErr != nil {
				client.Close()
				return fmt.Errorf("falha ao iniciar STARTTLS com %s: %w", host, startErr)
			}
		}
	}
	defer client.Close()

	// Autenticação (quando usuário e senha são informados)
	if cfg.User != "" && cfg.Pass != "" {
		var authErr error
		authOK := false

		// 1. Tenta PLAIN auth
		plainAuth := smtp.PlainAuth("", cfg.User, cfg.Pass, host)
		if errAuth := client.Auth(plainAuth); errAuth == nil {
			authOK = true
		} else {
			authErr = errAuth
			// 2. Fallback para LOGIN auth (necessário para Office365, cPanel, etc.)
			lAuth := LoginAuth(cfg.User, cfg.Pass)
			if errLogin := client.Auth(lAuth); errLogin == nil {
				authOK = true
				authErr = nil
			} else {
				authErr = fmt.Errorf("autenticação falhou: %v (tentativa LOGIN: %v)", errAuth, errLogin)
			}
		}

		if !authOK && authErr != nil {
			return fmt.Errorf("erro de autenticação SMTP (%s): %w", cfg.User, authErr)
		}
	}

	fromAddr := extractEmailAddress(cfg.From)
	toAddr := extractEmailAddress(to)

	if err := client.Mail(fromAddr); err != nil {
		return fmt.Errorf("servidor rejeitou o remetente (MAIL FROM:<%s>): %w", fromAddr, err)
	}
	if err := client.Rcpt(toAddr); err != nil {
		return fmt.Errorf("servidor rejeitou o destinatário (RCPT TO:<%s>): %w", toAddr, err)
	}

	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("falha ao abrir canal de dados (DATA): %w", err)
	}

	if _, err := w.Write(msg); err != nil {
		w.Close()
		return fmt.Errorf("falha ao enviar conteúdo do e-mail: %w", err)
	}

	if err := w.Close(); err != nil {
		return fmt.Errorf("falha ao confirmar término do e-mail: %w", err)
	}

	_ = client.Quit()
	return nil
}
