package main

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

// tagRow is a labelable marker that operators can attach to chats, contacts,
// or WhatsApp groups. Tags are scoped per-tenant (owner_id holds TenantID).
type tagRow struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Color     string `json:"color"`
	OwnerID   string `json:"ownerId,omitempty"`
	CreatedAt int64  `json:"createdAt"`
}

type tagStore struct{ db *sql.DB }

var ErrTagNotFound = errors.New("tag not found")

func newTagStore(ctx context.Context, db *sql.DB) (*tagStore, error) {
	if _, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS tags (
		id         TEXT PRIMARY KEY,
		name       TEXT NOT NULL,
		color      TEXT NOT NULL DEFAULT '#57adf8',
		owner_id   TEXT NOT NULL DEFAULT '',
		created_at INTEGER NOT NULL
	)`); err != nil {
		return nil, err
	}
	if _, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS contact_tags (
		session_id TEXT NOT NULL,
		chat_jid   TEXT NOT NULL,
		tag_id     TEXT NOT NULL,
		owner_id   TEXT NOT NULL DEFAULT '',
		created_at INTEGER NOT NULL,
		PRIMARY KEY (session_id, chat_jid, tag_id)
	)`); err != nil {
		return nil, err
	}
	_, _ = db.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_contact_tags_session_chat ON contact_tags (session_id, chat_jid)`)
	_, _ = db.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_contact_tags_tag ON contact_tags (tag_id)`)
	return &tagStore{db: db}, nil
}

// List returns tags scoped to the caller's tenant. Only the SaaS super-admin
// sees tags across all companies; tenant admins and operators see tags owned by
// their tenant (including legacy tags created by any sub-user inside the same
// tenant) as well as unscoped global tags (owner_id = '').
func (s *tagStore) List(ctx context.Context, tenantID string, isSuperAdmin bool) ([]tagRow, error) {
	var (
		rows *sql.Rows
		err  error
	)
	if isSuperAdmin {
		rows, err = s.db.QueryContext(ctx, `SELECT id, name, color, owner_id, created_at FROM tags ORDER BY created_at ASC`)
	} else {
		rows, err = s.db.QueryContext(ctx, `SELECT id, name, color, owner_id, created_at
			FROM tags
			WHERE owner_id = '' OR owner_id = ? OR owner_id IN (SELECT id FROM users WHERE id = ? OR parent_id = ?)
			ORDER BY created_at ASC`, tenantID, tenantID, tenantID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []tagRow{}
	for rows.Next() {
		var r tagRow
		if err := rows.Scan(&r.ID, &r.Name, &r.Color, &r.OwnerID, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ListForSession loads all tags associated with chats/groups of a session
// in a single query to hydrate GET /chats and GET /contacts without N+1.
func (s *tagStore) ListForSession(ctx context.Context, sessionID string) (map[string][]tagRow, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT ct.chat_jid, t.id, t.name, t.color, t.owner_id, t.created_at
		FROM contact_tags ct
		JOIN tags t ON t.id = ct.tag_id
		WHERE ct.session_id = ?
		ORDER BY ct.created_at ASC`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make(map[string][]tagRow)
	for rows.Next() {
		var chatJID string
		var r tagRow
		if err := rows.Scan(&chatJID, &r.ID, &r.Name, &r.Color, &r.OwnerID, &r.CreatedAt); err != nil {
			return nil, err
		}
		out[chatJID] = append(out[chatJID], r)
	}
	return out, rows.Err()
}

func (s *tagStore) Create(ctx context.Context, name, color, ownerID string) (tagRow, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return tagRow{}, errors.New("name required")
	}
	if color == "" {
		color = "#57adf8"
	}
	r := tagRow{ID: newID(), Name: name, Color: color, OwnerID: ownerID, CreatedAt: time.Now().Unix()}
	if _, err := s.db.ExecContext(ctx, `INSERT INTO tags (id, name, color, owner_id, created_at) VALUES (?,?,?,?,?)`,
		r.ID, r.Name, r.Color, r.OwnerID, r.CreatedAt); err != nil {
		return tagRow{}, err
	}
	return r, nil
}

func (s *tagStore) Update(ctx context.Context, id, name, color string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return errors.New("name required")
	}
	res, err := s.db.ExecContext(ctx, `UPDATE tags SET name = ?, color = ? WHERE id = ?`, name, color, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrTagNotFound
	}
	return nil
}

func (s *tagStore) Delete(ctx context.Context, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `DELETE FROM contact_tags WHERE tag_id = ?`, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM tags WHERE id = ?`, id); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *tagStore) Get(ctx context.Context, id string) (tagRow, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, name, color, owner_id, created_at FROM tags WHERE id = ?`, id)
	var r tagRow
	if err := row.Scan(&r.ID, &r.Name, &r.Color, &r.OwnerID, &r.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return tagRow{}, ErrTagNotFound
		}
		return tagRow{}, err
	}
	return r, nil
}

// FindByNameInTenant looks up a tag by exact case-insensitive name (or ID)
// visible to the given tenant.
func (s *tagStore) FindByNameInTenant(ctx context.Context, nameOrID, tenantID string) (tagRow, error) {
	q := strings.TrimSpace(nameOrID)
	if q == "" {
		return tagRow{}, errors.New("tag required")
	}
	row := s.db.QueryRowContext(ctx, `SELECT id, name, color, owner_id, created_at
		FROM tags
		WHERE (id = ? OR LOWER(TRIM(name)) = LOWER(?))
		  AND (? = '' OR owner_id = '' OR owner_id = ? OR owner_id IN (SELECT id FROM users WHERE id = ? OR parent_id = ?))
		ORDER BY created_at ASC
		LIMIT 1`, q, q, tenantID, tenantID, tenantID, tenantID)
	var r tagRow
	if err := row.Scan(&r.ID, &r.Name, &r.Color, &r.OwnerID, &r.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return tagRow{}, ErrTagNotFound
		}
		return tagRow{}, err
	}
	return r, nil
}

// ResolveOrCreateInTenant finds an existing tag by ID/name in the tenant or
// creates one so automated flows can tag contacts on first mention.
func (s *tagStore) ResolveOrCreateInTenant(ctx context.Context, nameOrID, tenantID string) (tagRow, error) {
	nameOrID = strings.TrimSpace(nameOrID)
	if nameOrID == "" {
		return tagRow{}, errors.New("tag required")
	}
	if existing, err := s.FindByNameInTenant(ctx, nameOrID, tenantID); err == nil {
		return existing, nil
	} else if !errors.Is(err, ErrTagNotFound) {
		return tagRow{}, err
	}
	return s.Create(ctx, nameOrID, "#57adf8", tenantID)
}

// ListForChat returns the tag definitions currently attached to a chat,
// ordered by attach time.
func (s *tagStore) ListForChat(ctx context.Context, sessionID, chatJID string) ([]tagRow, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT t.id, t.name, t.color, t.owner_id, t.created_at
		FROM contact_tags ct
		JOIN tags t ON t.id = ct.tag_id
		WHERE ct.session_id = ? AND ct.chat_jid = ?
		ORDER BY ct.created_at ASC`, sessionID, chatJID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []tagRow{}
	for rows.Next() {
		var r tagRow
		if err := rows.Scan(&r.ID, &r.Name, &r.Color, &r.OwnerID, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// chatComTag é uma conversa marcada com uma tag.
type chatComTag struct {
	SessionID string `json:"sessionId"`
	ChatJID   string `json:"chatJid"`
}

// ChatsWithTag lista as conversas marcadas com a tag.
//
// Existe para a campanha montar a lista "todo mundo com a tag X" numa consulta
// só. Sem isso a tela teria que perguntar as tags de cada contato, uma chamada
// por contato — inviável com alguns milhares.
func (s *tagStore) ChatsWithTag(ctx context.Context, tagID string) ([]chatComTag, error) {
	if strings.TrimSpace(tagID) == "" {
		return nil, errors.New("tagId required")
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT session_id, chat_jid FROM contact_tags WHERE tag_id = ? ORDER BY created_at`, tagID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []chatComTag{}
	for rows.Next() {
		var c chatComTag
		if err := rows.Scan(&c.SessionID, &c.ChatJID); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *tagStore) AttachToChat(ctx context.Context, sessionID, chatJID, tagID, ownerID string) error {
	sessionID = strings.TrimSpace(sessionID)
	chatJID = strings.TrimSpace(chatJID)
	tagID = strings.TrimSpace(tagID)
	if sessionID == "" || chatJID == "" {
		return errors.New("sessionId and chatJid required")
	}
	if tagID == "" {
		return errors.New("tagId required")
	}
	if _, err := s.Get(ctx, tagID); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx, `INSERT OR IGNORE INTO contact_tags (session_id, chat_jid, tag_id, owner_id, created_at) VALUES (?,?,?,?,?)`,
		sessionID, chatJID, tagID, ownerID, time.Now().Unix())
	return err
}

func (s *tagStore) DetachFromChat(ctx context.Context, sessionID, chatJID, tagID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM contact_tags WHERE session_id = ? AND chat_jid = ? AND tag_id = ?`,
		sessionID, chatJID, tagID)
	return err
}

func (s *tagStore) DeleteForChat(ctx context.Context, sessionID, chatJID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM contact_tags WHERE session_id = ? AND chat_jid = ?`,
		sessionID, chatJID)
	return err
}

func (s *tagStore) BulkAttachToChats(ctx context.Context, items []chatComTag, tagID, ownerID string) error {
	tagID = strings.TrimSpace(tagID)
	if tagID == "" {
		return errors.New("tagId required")
	}
	if _, err := s.Get(ctx, tagID); err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	now := time.Now().Unix()
	stmt, err := tx.PrepareContext(ctx, `INSERT OR IGNORE INTO contact_tags (session_id, chat_jid, tag_id, owner_id, created_at) VALUES (?,?,?,?,?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, it := range items {
		sid := strings.TrimSpace(it.SessionID)
		jid := strings.TrimSpace(it.ChatJID)
		if sid == "" || jid == "" {
			continue
		}
		if _, err := stmt.ExecContext(ctx, sid, jid, tagID, ownerID, now); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *tagStore) BulkDetachFromChats(ctx context.Context, items []chatComTag, tagID string) error {
	tagID = strings.TrimSpace(tagID)
	if tagID == "" {
		return errors.New("tagId required")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, `DELETE FROM contact_tags WHERE session_id = ? AND chat_jid = ? AND tag_id = ?`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, it := range items {
		sid := strings.TrimSpace(it.SessionID)
		jid := strings.TrimSpace(it.ChatJID)
		if sid == "" || jid == "" {
			continue
		}
		if _, err := stmt.ExecContext(ctx, sid, jid, tagID); err != nil {
			return err
		}
	}
	return tx.Commit()
}
