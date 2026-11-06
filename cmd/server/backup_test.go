package main

import (
	"archive/zip"
	"bytes"
	"context"
	"database/sql"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

func TestBackupExportAndImport(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "backup_test_*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	dbPath := filepath.Join(tempDir, "test.db")
	db, err := sql.Open("sqlite", "file:"+filepath.ToSlash(dbPath)+"?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	// Seed test data
	_, err = db.Exec(`
		CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, name TEXT);
		CREATE TABLE chats (jid TEXT PRIMARY KEY, name TEXT);
		CREATE TABLE messages (id TEXT PRIMARY KEY, chat_jid TEXT, body TEXT);
		CREATE TABLE contacts (id TEXT PRIMARY KEY, name TEXT);
		CREATE TABLE sessions (id TEXT PRIMARY KEY, name TEXT);
		INSERT INTO users VALUES ('u1', 'admin@test.com', 'Admin User');
		INSERT INTO chats VALUES ('chat1@s.whatsapp.net', 'Cliente Teste');
		INSERT INTO messages VALUES ('m1', 'chat1@s.whatsapp.net', 'Ola, mensagem de teste');
		INSERT INTO contacts VALUES ('c1', 'Contato Teste');
		INSERT INTO sessions VALUES ('s1', 'Conexao 1');
	`)
	if err != nil {
		t.Fatal(err)
	}

	srv := &server{db: db}

	// 1. Test Backup Info
	stats, err := srv.collectBackupStats(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if stats.MessageCount != 1 || stats.UserCount != 1 || stats.ChatCount != 1 {
		t.Fatalf("unexpected stats: %+v", stats)
	}

	// 2. Test Backup Export
	req := httptest.NewRequest(http.MethodGet, "/api/backup/export?includeMedia=false", nil)
	w := httptest.NewRecorder()
	srv.handleBackupExport(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("export status: %d", resp.StatusCode)
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}

	zr, err := zip.NewReader(bytes.NewReader(bodyBytes), int64(len(bodyBytes)))
	if err != nil {
		t.Fatalf("invalid zip: %v", err)
	}

	var hasDB, hasManifest bool
	for _, f := range zr.File {
		if f.Name == "wacalls.db" {
			hasDB = true
		}
		if f.Name == "manifest.json" {
			hasManifest = true
		}
	}
	if !hasDB || !hasManifest {
		t.Fatalf("missing files in zip. hasDB=%v, hasManifest=%v", hasDB, hasManifest)
	}

	// 3. Mutate database to verify import actually restores
	_, _ = db.Exec("DELETE FROM messages; INSERT INTO users VALUES ('u2', 'temp@test.com', 'Temp');")

	// 4. Test Backup Import
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	part, err := mw.CreateFormFile("file", "backup.zip")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = part.Write(bodyBytes)
	_ = mw.Close()

	importReq := httptest.NewRequest(http.MethodPost, "/api/backup/import", &buf)
	importReq.Header.Set("Content-Type", mw.FormDataContentType())
	importW := httptest.NewRecorder()

	srv.handleBackupImport(importW, importReq)
	importResp := importW.Result()
	if importResp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(importResp.Body)
		t.Fatalf("import status: %d, body: %s", importResp.StatusCode, string(b))
	}

	// 5. Verify restored data
	var count int
	_ = db.QueryRow("SELECT COUNT(*) FROM messages").Scan(&count)
	if count != 1 {
		t.Fatalf("expected 1 message restored, got %d", count)
	}

	var userCount int
	_ = db.QueryRow("SELECT COUNT(*) FROM users").Scan(&userCount)
	if userCount != 1 {
		t.Fatalf("expected 1 user restored (u2 deleted), got %d", userCount)
	}
}

