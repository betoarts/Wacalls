package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

func (s *server) registerTagRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/tags", s.requireAuth(s.handleTagList))
	mux.HandleFunc("POST /api/tags", s.requireAuth(s.handleTagCreate))
	mux.HandleFunc("PUT /api/tags/{id}", s.requireAuth(s.handleTagUpdate))
	mux.HandleFunc("DELETE /api/tags/{id}", s.requireAuth(s.handleTagDelete))
	mux.HandleFunc("POST /api/tags/bulk/attach", s.requireAuth(s.handleTagsBulkAttach))
	mux.HandleFunc("POST /api/tags/bulk/detach", s.requireAuth(s.handleTagsBulkDetach))
	mux.HandleFunc("GET /api/sessions/{sid}/chats/{jid}/tags", s.requireAuth(s.handleChatTagsList))
	mux.HandleFunc("POST /api/sessions/{sid}/chats/{jid}/tags", s.requireAuth(s.handleChatTagsAttach))
	mux.HandleFunc("DELETE /api/sessions/{sid}/chats/{jid}/tags/{tagId}", s.requireAuth(s.handleChatTagsDetach))
}

func (s *server) handleTagList(w http.ResponseWriter, r *http.Request) {
	u := currentUserFromReq(r)
	rows, err := s.tags.List(r.Context(), u.TenantID(), u.IsSuperAdmin())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tags": rows})
}

func (s *server) handleTagCreate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name  string `json:"name"`
		Color string `json:"color"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	u := currentUserFromReq(r)
	// Store TenantID as owner_id so all admins and operators inside the same
	// company share the created tags (mirrors queues).
	row, err := s.tags.Create(r.Context(), body.Name, body.Color, u.TenantID())
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, row)
}

func (s *server) handleTagUpdate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !s.canManageTag(r, id) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}
	var body struct {
		Name  string `json:"name"`
		Color string `json:"color"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	if err := s.tags.Update(r.Context(), id, body.Name, body.Color); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	invalidateContactsCache()
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleTagDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !s.canManageTag(r, id) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}
	if err := s.tags.Delete(r.Context(), id); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	invalidateContactsCache()
	w.WriteHeader(http.StatusNoContent)
}

// canAccessTag verifies whether the authenticated user can view/attach/detach
// or filter by a given tag ID within their tenant boundary.
func (s *server) canAccessTag(r *http.Request, id string) (bool, error) {
	u := currentUserFromReq(r)
	if u == nil {
		return false, nil
	}
	row, err := s.tags.Get(r.Context(), id)
	if err != nil {
		return false, err
	}
	if u.IsSuperAdmin() {
		return true, nil
	}
	if row.OwnerID == "" || row.OwnerID == u.TenantID() || row.OwnerID == u.ID {
		return true, nil
	}
	if s.auth != nil {
		if pid, perr := s.auth.ParentOf(r.Context(), row.OwnerID); perr == nil && pid != "" && pid == u.TenantID() {
			return true, nil
		}
	}
	return false, nil
}

// canManageTag enforces ownership when editing or deleting tag definitions:
// super-admins and tenant roots may manage any tag in their tenant; sub-users
// may manage tags whose owner_id matches their own user ID.
func (s *server) canManageTag(r *http.Request, id string) bool {
	u := currentUserFromReq(r)
	if u == nil {
		return false
	}
	if u.IsSuperAdmin() {
		return true
	}
	row, err := s.tags.Get(r.Context(), id)
	if err != nil {
		return false
	}
	if row.OwnerID == u.ID {
		return true
	}
	if u.ParentID == "" && row.OwnerID != "" {
		if row.OwnerID == u.TenantID() {
			return true
		}
		if s.auth != nil {
			if pid, perr := s.auth.ParentOf(r.Context(), row.OwnerID); perr == nil && pid == u.ID {
				return true
			}
		}
	}
	return false
}

// notifyChatTagsUpdated invalidates the contact list cache, loads the current
// tag slice for the chat/group, and publishes a scoped SSE event.
func (s *server) notifyChatTagsUpdated(ctx context.Context, sessionID, chatJID string) []tagRow {
	invalidateContactsCache()
	rows, _ := s.tags.ListForChat(ctx, sessionID, chatJID)
	if rows == nil {
		rows = []tagRow{}
	}
	if s.broker != nil {
		s.broker.deliverScoped(sessionID, map[string]any{
			"type":      "chat-tags",
			"sessionId": sessionID,
			"chatJid":   chatJID,
			"tags":      rows,
		})
	}
	return rows
}

func (s *server) handleChatTagsList(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r, r.PathValue("sid"))
	if sess == nil {
		return
	}
	rows, err := s.tags.ListForChat(r.Context(), sess.id, r.PathValue("jid"))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tags": rows})
}

func (s *server) handleChatTagsAttach(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r, r.PathValue("sid"))
	if sess == nil {
		return
	}
	var body struct {
		TagID string `json:"tagId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	body.TagID = strings.TrimSpace(body.TagID)
	ok, err := s.canAccessTag(r, body.TagID)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, ErrTagNotFound) {
			status = http.StatusNotFound
		}
		writeJSON(w, status, map[string]string{"error": err.Error()})
		return
	}
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}
	u := currentUserFromReq(r)
	ownerID := ""
	if u != nil {
		ownerID = u.TenantID()
	}
	jid := r.PathValue("jid")
	if err := s.tags.AttachToChat(r.Context(), sess.id, jid, body.TagID, ownerID); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	rows := s.notifyChatTagsUpdated(r.Context(), sess.id, jid)
	writeJSON(w, http.StatusOK, map[string]any{"tags": rows})
}

func (s *server) handleChatTagsDetach(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r, r.PathValue("sid"))
	if sess == nil {
		return
	}
	jid := r.PathValue("jid")
	if err := s.tags.DetachFromChat(r.Context(), sess.id, jid, r.PathValue("tagId")); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	s.notifyChatTagsUpdated(r.Context(), sess.id, jid)
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleTagsBulkAttach(w http.ResponseWriter, r *http.Request) {
	u := currentUserFromReq(r)
	var body struct {
		TagID string       `json:"tagId"`
		Items []chatComTag `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	body.TagID = strings.TrimSpace(body.TagID)
	if body.TagID == "" || len(body.Items) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "tagId e items são obrigatórios"})
		return
	}
	ok, err := s.canAccessTag(r, body.TagID)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, ErrTagNotFound) {
			status = http.StatusNotFound
		}
		writeJSON(w, status, map[string]string{"error": err.Error()})
		return
	}
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}
	cleaned := make([]chatComTag, 0, len(body.Items))
	for _, it := range body.Items {
		sid := strings.TrimSpace(it.SessionID)
		jid := strings.TrimSpace(it.ChatJID)
		if sid == "" || jid == "" {
			continue
		}
		if !s.userCanAccessSession(u, sid) {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "sem acesso à conexão"})
			return
		}
		cleaned = append(cleaned, chatComTag{SessionID: sid, ChatJID: jid})
	}
	if len(cleaned) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "nenhum contato válido selecionado"})
		return
	}
	if err := s.tags.BulkAttachToChats(r.Context(), cleaned, body.TagID, u.TenantID()); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	seen := make(map[string]bool, len(cleaned))
	for _, it := range cleaned {
		k := it.SessionID + "|" + it.ChatJID
		if seen[k] {
			continue
		}
		seen[k] = true
		s.notifyChatTagsUpdated(r.Context(), it.SessionID, it.ChatJID)
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "count": len(seen)})
}

func (s *server) handleTagsBulkDetach(w http.ResponseWriter, r *http.Request) {
	u := currentUserFromReq(r)
	var body struct {
		TagID string       `json:"tagId"`
		Items []chatComTag `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	body.TagID = strings.TrimSpace(body.TagID)
	if body.TagID == "" || len(body.Items) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "tagId e items são obrigatórios"})
		return
	}
	ok, err := s.canAccessTag(r, body.TagID)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, ErrTagNotFound) {
			status = http.StatusNotFound
		}
		writeJSON(w, status, map[string]string{"error": err.Error()})
		return
	}
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}
	cleaned := make([]chatComTag, 0, len(body.Items))
	for _, it := range body.Items {
		sid := strings.TrimSpace(it.SessionID)
		jid := strings.TrimSpace(it.ChatJID)
		if sid == "" || jid == "" {
			continue
		}
		if !s.userCanAccessSession(u, sid) {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "sem acesso à conexão"})
			return
		}
		cleaned = append(cleaned, chatComTag{SessionID: sid, ChatJID: jid})
	}
	if len(cleaned) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "nenhum contato válido selecionado"})
		return
	}
	if err := s.tags.BulkDetachFromChats(r.Context(), cleaned, body.TagID); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	seen := make(map[string]bool, len(cleaned))
	for _, it := range cleaned {
		k := it.SessionID + "|" + it.ChatJID
		if seen[k] {
			continue
		}
		seen[k] = true
		s.notifyChatTagsUpdated(r.Context(), it.SessionID, it.ChatJID)
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "count": len(seen)})
}
