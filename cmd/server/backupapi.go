package main

import (
	"archive/zip"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type backupStats struct {
	DBSize       int64  `json:"dbSize"`
	MediaCount   int    `json:"mediaCount"`
	MediaSize    int64  `json:"mediaSize"`
	MessageCount int    `json:"messageCount"`
	ChatCount    int    `json:"chatCount"`
	ContactCount int    `json:"contactCount"`
	UserCount    int    `json:"userCount"`
	SessionCount int    `json:"sessionCount"`
	CreatedAt    string `json:"createdAt"`
}

type backupManifest struct {
	Version      string      `json:"version"`
	Server       string      `json:"server"`
	CreatedAt    string      `json:"createdAt"`
	IncludeMedia bool        `json:"includeMedia"`
	Stats        backupStats `json:"stats"`
}

func (s *server) registerBackupRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/backup/info", s.requireAdmin(s.handleBackupInfo))
	mux.HandleFunc("GET /api/backup/export", s.requireAdmin(s.handleBackupExport))
	mux.HandleFunc("POST /api/backup/import", s.requireAdmin(s.handleBackupImport))
}

func (s *server) collectBackupStats(ctx context.Context) (backupStats, error) {
	var stats backupStats
	stats.CreatedAt = time.Now().Format(time.RFC3339)

	// Tamanho do arquivo SQLite
	dbPath := "wacalls.db"
	if fi, err := os.Stat(dbPath); err == nil {
		stats.DBSize = fi.Size()
	}

	// Contagem de arquivos e tamanho em media/
	if fi, err := os.Stat("media"); err == nil && fi.IsDir() {
		_ = filepath.Walk("media", func(path string, info os.FileInfo, err error) error {
			if err == nil && !info.IsDir() {
				stats.MediaCount++
				stats.MediaSize += info.Size()
			}
			return nil
		})
	}

	// Estatísticas do Banco de Dados
	if s.db != nil {
		_ = s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM messages").Scan(&stats.MessageCount)
		_ = s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM chats").Scan(&stats.ChatCount)
		_ = s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM contacts").Scan(&stats.ContactCount)
		_ = s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&stats.UserCount)
		_ = s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM sessions").Scan(&stats.SessionCount)
	}

	return stats, nil
}

func (s *server) handleBackupInfo(w http.ResponseWriter, r *http.Request) {
	stats, err := s.collectBackupStats(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

func (s *server) handleBackupExport(w http.ResponseWriter, r *http.Request) {
	includeMedia := r.URL.Query().Get("includeMedia") != "false"

	stats, _ := s.collectBackupStats(r.Context())

	// Snapshot atômico do banco de dados via SQLite VACUUM INTO
	tempDB := filepath.Join(os.TempDir(), fmt.Sprintf("wacalls_backup_%d.db", time.Now().UnixNano()))
	defer os.Remove(tempDB)

	cleanPath := filepath.ToSlash(tempDB)
	_, err := s.db.ExecContext(r.Context(), fmt.Sprintf("VACUUM INTO '%s'", cleanPath))
	if err != nil {
		if s.log != nil {
			s.log.Error("backup vacuum failed", "err", err)
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Falha ao gerar snapshot do banco de dados: " + err.Error()})
		return
	}

	timestamp := time.Now().Format("2006-01-02_15-04-05")
	filename := fmt.Sprintf("wacalls-backup-%s.zip", timestamp)

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))

	zw := zip.NewWriter(w)
	defer zw.Close()

	// 1. Gravar manifest.json
	manifest := backupManifest{
		Version:      "1.0.0",
		Server:       "WaCalls Chat",
		CreatedAt:    time.Now().Format(time.RFC3339),
		IncludeMedia: includeMedia,
		Stats:        stats,
	}
	if mb, err := json.MarshalIndent(manifest, "", "  "); err == nil {
		if fw, err := zw.Create("manifest.json"); err == nil {
			_, _ = fw.Write(mb)
		}
	}

	// 2. Gravar snapshot do SQLite (wacalls.db)
	if f, err := os.Open(tempDB); err == nil {
		if fw, err := zw.Create("wacalls.db"); err == nil {
			_, _ = io.Copy(fw, f)
		}
		f.Close()
	}

	// 3. Gravar arquivos de media (se selecionado)
	if includeMedia {
		_ = filepath.Walk("media", func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return nil
			}
			rel, err := filepath.Rel(".", path)
			if err != nil {
				return nil
			}
			rel = filepath.ToSlash(rel)

			fw, err := zw.Create(rel)
			if err != nil {
				return nil
			}
			f, err := os.Open(path)
			if err != nil {
				return nil
			}
			defer f.Close()
			_, _ = io.Copy(fw, f)
			return nil
		})
	}
}

func (s *server) handleBackupImport(w http.ResponseWriter, r *http.Request) {
	// Limite de upload de até 2 GB para backups com bastante mídia
	r.Body = http.MaxBytesReader(w, r.Body, 2<<30)

	mr, err := r.MultipartReader()
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Multipart form esperado: " + err.Error()})
		return
	}

	tempDir, err := os.MkdirTemp("", "wacalls_restore_*")
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Falha ao criar diretório temporário"})
		return
	}
	defer os.RemoveAll(tempDir)

	var tempZipPath string
	for {
		part, err := mr.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Falha ao ler arquivo: " + err.Error()})
			return
		}
		if part.FormName() == "file" {
			tempZipPath = filepath.Join(tempDir, "backup.zip")
			dst, err := os.Create(tempZipPath)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Falha ao gravar arquivo temporário"})
				return
			}
			_, err = io.Copy(dst, part)
			dst.Close()
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Upload interrompido"})
				return
			}
			break
		}
	}

	if tempZipPath == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Nenhum arquivo 'file' foi enviado"})
		return
	}

	zr, err := zip.OpenReader(tempZipPath)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Arquivo inválido. Deve ser um arquivo .zip de backup do WaCalls: " + err.Error()})
		return
	}
	defer zr.Close()

	// Procura e extrai o banco e mídias
	var foundDB bool
	extractedDBPath := filepath.Join(tempDir, "extracted_wacalls.db")
	mediaRestoredCount := 0

	for _, f := range zr.File {
		cleanName := filepath.Clean(f.Name)
		if strings.HasPrefix(cleanName, "..") {
			continue // Evita Zip Slip vulnerability
		}

		if cleanName == "wacalls.db" || filepath.Base(cleanName) == "wacalls.db" {
			foundDB = true
			if err := extractZipFile(f, extractedDBPath); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Falha ao extrair banco de dados: " + err.Error()})
				return
			}
		} else if strings.HasPrefix(filepath.ToSlash(cleanName), "media/") {
			targetPath := filepath.Join(".", cleanName)
			if err := extractZipFile(f, targetPath); err == nil {
				mediaRestoredCount++
			}
		}
	}

	if !foundDB {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "O arquivo .zip não contém um banco de dados válido 'wacalls.db'"})
		return
	}

	// 1. Testa a integridade do banco extraído antes de aplicar
	testDB, err := sql.Open("sqlite", "file:"+filepath.ToSlash(extractedDBPath)+"?mode=ro")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Banco extraído inválido: " + err.Error()})
		return
	}
	var integrity string
	_ = testDB.QueryRowContext(r.Context(), "PRAGMA integrity_check").Scan(&integrity)
	testDB.Close()
	if integrity != "ok" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Integridade do banco comprometida: " + integrity})
		return
	}

	// 2. Faz backup preventivo do banco atual antes de sobrescrever
	preRestoreBackup := fmt.Sprintf("wacalls.db.pre_restore_%s", time.Now().Format("20060102_150405"))
	_, _ = s.db.ExecContext(r.Context(), fmt.Sprintf("VACUUM INTO '%s'", filepath.ToSlash(preRestoreBackup)))

	// 3. Aplica a restauração transacional no SQLite ativo via ATTACH
	tablesRestored, err := s.restoreDatabaseFrom(r.Context(), extractedDBPath)
	if err != nil {
		if s.log != nil {
			s.log.Error("restore failed", "err", err)
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Falha ao aplicar restauração no banco: " + err.Error()})
		return
	}

	// 4. Garante índices compostos
	if s.log != nil {
		ensureTenantIndexes(r.Context(), s.db, s.log)
		s.log.Info("backup import completed", "tables", tablesRestored, "mediaFiles", mediaRestoredCount)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success":            true,
		"message":            "Backup restaurado com sucesso!",
		"tablesRestored":     tablesRestored,
		"mediaFilesRestored": mediaRestoredCount,
		"preRestoreBackup":   preRestoreBackup,
	})
}

func extractZipFile(f *zip.File, destPath string) error {
	if f.FileInfo().IsDir() {
		return os.MkdirAll(destPath, 0o755)
	}
	if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
		return err
	}
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()

	out, err := os.OpenFile(destPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, rc)
	return err
}

func (s *server) restoreDatabaseFrom(ctx context.Context, srcDBPath string) (int, error) {
	slashPath := filepath.ToSlash(srcDBPath)

	// Anexa a base temporária
	if _, err := s.db.ExecContext(ctx, fmt.Sprintf("ATTACH '%s' AS src_backup", slashPath)); err != nil {
		return 0, fmt.Errorf("attach backup: %w", err)
	}
	defer func() {
		_, _ = s.db.ExecContext(context.Background(), "DETACH src_backup")
	}()

	// Lista todas as tabelas na fonte (exceto internas do SQLite)
	rows, err := s.db.QueryContext(ctx, "SELECT name, sql FROM src_backup.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
	if err != nil {
		return 0, fmt.Errorf("list backup tables: %w", err)
	}
	type tableDef struct {
		name string
		sql  string
	}
	var tables []tableDef
	for rows.Next() {
		var td tableDef
		if err := rows.Scan(&td.name, &td.sql); err == nil && td.sql != "" {
			tables = append(tables, td)
		}
	}
	rows.Close()

	// Lista todos os índices na fonte
	idxRows, err := s.db.QueryContext(ctx, "SELECT sql FROM src_backup.sqlite_master WHERE type='index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'")
	if err != nil {
		return 0, fmt.Errorf("list backup indexes: %w", err)
	}
	var indexes []string
	for idxRows.Next() {
		var sqlStr string
		if err := idxRows.Scan(&sqlStr); err == nil && sqlStr != "" {
			indexes = append(indexes, sqlStr)
		}
	}
	idxRows.Close()

	// Executa a restauração dentro de uma transação exclusiva
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{})
	if err != nil {
		return 0, fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, "PRAGMA foreign_keys = OFF"); err != nil {
		return 0, fmt.Errorf("disable foreign keys: %w", err)
	}

	// 1. Limpa tabelas existentes no banco principal
	mainRows, err := tx.QueryContext(ctx, "SELECT name FROM main.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
	if err == nil {
		var toDrop []string
		for mainRows.Next() {
			var n string
			if err := mainRows.Scan(&n); err == nil {
				toDrop = append(toDrop, n)
			}
		}
		mainRows.Close()
		for _, name := range toDrop {
			_, _ = tx.ExecContext(ctx, fmt.Sprintf("DROP TABLE IF EXISTS main.%s", name))
		}
	}

	// 2. Cria as tabelas do backup e copia os dados
	restoredCount := 0
	for _, td := range tables {
		if _, err := tx.ExecContext(ctx, td.sql); err != nil {
			return 0, fmt.Errorf("create table %s: %w", td.name, err)
		}
		if _, err := tx.ExecContext(ctx, fmt.Sprintf("INSERT INTO main.%s SELECT * FROM src_backup.%s", td.name, td.name)); err != nil {
			return 0, fmt.Errorf("copy data into %s: %w", td.name, err)
		}
		restoredCount++
	}

	// 3. Recria os índices
	for _, idxSQL := range indexes {
		_, _ = tx.ExecContext(ctx, idxSQL)
	}

	if _, err := tx.ExecContext(ctx, "PRAGMA foreign_keys = ON"); err != nil {
		return 0, fmt.Errorf("enable foreign keys: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("commit restore: %w", err)
	}

	return restoredCount, nil
}
