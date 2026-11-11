package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func openFreeTierTestServer(t *testing.T) (*server, context.Context) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "freetier_test.db")
	db, err := openDB(dbPath)
	if err != nil {
		t.Fatalf("openDB: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	ctx := context.Background()
	auth, err := newAuthStore(ctx, db)
	if err != nil {
		t.Fatalf("newAuthStore: %v", err)
	}
	settings, err := newSettingsStore(ctx, db)
	if err != nil {
		t.Fatalf("newSettingsStore: %v", err)
	}
	srv := &server{db: db, auth: auth, settings: settings}
	if err := srv.ensureBillingSchema(ctx); err != nil {
		t.Fatalf("ensureBillingSchema: %v", err)
	}
	if err := srv.ensureFreeTierSchema(ctx); err != nil {
		t.Fatalf("ensureFreeTierSchema: %v", err)
	}
	if err := srv.ensureFreeTierNotifySchema(ctx); err != nil {
		t.Fatalf("ensureFreeTierNotifySchema: %v", err)
	}
	return srv, ctx
}

func TestFreeTierDefaultsAreUnlimited(t *testing.T) {
	srv, ctx := openFreeTierTestServer(t)

	lim := srv.freeTierLimits(ctx)
	if lim.Connections != 0 || lim.CallsWeek != 0 || lim.ChatsWeek != 0 {
		t.Fatalf("expected all default free tier limits to be 0 (unlimited), got %+v", lim)
	}

	op, err := srv.auth.AdminCreateUser(ctx, "operador@empresa.com", "SenhaForte123", "", "", RoleUser, "")
	if err != nil {
		t.Fatalf("AdminCreateUser: %v", err)
	}

	for _, kind := range []string{"free_connections", "free_calls", "free_chats"} {
		if qerr := srv.enforceFreeTier(ctx, op.ID, false, kind, 10000); qerr != nil {
			t.Fatalf("expected no free tier block for %s, got %v", kind, qerr)
		}
	}
	for _, kind := range []string{"usuarios", "conexoes", "filas"} {
		if qerr := srv.enforceQuota(ctx, kind, 10000); qerr != nil {
			t.Fatalf("expected no plan quota block for %s, got %v", kind, qerr)
		}
	}
	if qerr := srv.enforcePaidConnect(ctx, op.ID, false); qerr != nil {
		t.Fatalf("expected no paid connect block by default, got %v", qerr)
	}

	srv.bumpWeeklyUsage(ctx, op.ID, "free_chats")
	srv.bumpWeeklyUsage(ctx, op.ID, "free_calls")
	if got := srv.weeklyUsage(ctx, op.ID, "free_chats"); got != 0 {
		t.Fatalf("expected bumpWeeklyUsage to be a no-op when unlimited, got %d", got)
	}
	if alerts := srv.listFreeTierAlerts(ctx, op.ID); len(alerts) != 0 {
		t.Fatalf("expected no alerts generated when unlimited, got %+v", alerts)
	}
}

func TestFreeTierStatusHidesLegacyAlertsWhenUnlimited(t *testing.T) {
	srv, ctx := openFreeTierTestServer(t)

	op, err := srv.auth.AdminCreateUser(ctx, "operador2@empresa.com", "SenhaForte123", "", "", RoleUser, "")
	if err != nil {
		t.Fatalf("AdminCreateUser: %v", err)
	}
	if _, err := srv.db.ExecContext(ctx,
		`INSERT INTO free_tier_notifications(user_id, week, kind, threshold, created_at) VALUES(?,?,?,?,?)`,
		op.ID, currentWeekKey(), "free_chats", 80, 1700000000,
	); err != nil {
		t.Fatalf("insert stale alert: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/billing/free-tier", nil)
	cu := &currentUser{ID: op.ID, Email: op.Email, Roles: []string{RoleUser}}
	req = req.WithContext(context.WithValue(req.Context(), ctxUserKey, cu))
	rr := httptest.NewRecorder()
	srv.handleFreeTierStatus(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	var resp freeTierStatusResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !resp.Paid {
		t.Fatalf("expected Paid=true when free tier limits are disabled, got false")
	}
	if len(resp.Alerts) != 0 {
		t.Fatalf("expected 0 alerts when unlimited, got %+v", resp.Alerts)
	}
}

func TestFreeTierThresholdNeverNotifiesAdminsEvenWithExplicitLimits(t *testing.T) {
	srv, ctx := openFreeTierTestServer(t)

	if _, err := srv.auth.SeedAdmin(ctx, "admin@empresa.com", "SenhaForte123"); err != nil {
		t.Fatalf("SeedAdmin: %v", err)
	}
	users, err := srv.auth.ListUsers(ctx)
	if err != nil || len(users) == 0 {
		t.Fatalf("ListUsers: %v len=%d", err, len(users))
	}
	adminID := users[0].ID

	if err := srv.settings.setKV(ctx, "free_tier_chats_week", "10"); err != nil {
		t.Fatalf("setKV: %v", err)
	}
	for i := 0; i < 10; i++ {
		srv.bumpWeeklyUsage(ctx, adminID, "free_chats")
	}
	if alerts := srv.listFreeTierAlerts(ctx, adminID); len(alerts) != 0 {
		t.Fatalf("expected 0 free tier alerts for admin user, got %+v", alerts)
	}
}

