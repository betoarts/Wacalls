package main

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestAllRoutesRegisterWithoutPanic(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test.db")

	ctx := context.Background()
	srv, err := newServer(ctx, dbPath, dir, 10, slog.Default())
	if err != nil {
		t.Fatalf("newServer failed: %v", err)
	}

	handler := srv.routes()
	if handler == nil {
		t.Fatalf("routes() returned nil handler")
	}

	req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected /api/auth/me to return 200 OK, got %d", rec.Code)
	}
}
