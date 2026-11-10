package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"testing"
	"time"

	"go.mau.fi/whatsmeow"
	waLog "go.mau.fi/whatsmeow/util/log"
)

func openTagTestStores(t *testing.T) (*authStore, *tagStore, *sql.DB) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "tags_test.db")
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
	tags, err := newTagStore(ctx, db)
	if err != nil {
		t.Fatalf("newTagStore: %v", err)
	}
	return auth, tags, db
}

func registerOfflineSession(t *testing.T, srv *server, name, ownerID string) *Session {
	t.Helper()
	ctx := context.Background()
	id := newSessionID()
	if err := srv.sessStore.insertWithOwner(ctx, id, name, ownerID); err != nil {
		t.Fatalf("insertWithOwner: %v", err)
	}
	client := whatsmeow.NewClient(srv.sessions.container.NewDevice(), waLog.Noop)
	sess := newSession(srv.sessions, id, name, client)
	sess.ownerID = ownerID
	sess.allowGroups = true
	srv.sessions.register(sess)
	return sess
}

func doAuthRequest(t *testing.T, h http.Handler, method, target, token string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatalf("encode request body: %v", err)
		}
	}
	req := httptest.NewRequest(method, target, &buf)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.AddCookie(&http.Cookie{Name: authCookieName, Value: token})
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func drainBrokerEvents(sub *subscriber) []map[string]any {
	var out []map[string]any
	for {
		select {
		case raw := <-sub.ch:
			var ev map[string]any
			if err := json.Unmarshal(raw, &ev); err == nil {
				out = append(out, ev)
			}
		default:
			return out
		}
	}
}

func TestTagStoreCRUDAndTenantIsolation(t *testing.T) {
	ctx := context.Background()
	auth, tags, _ := openTagTestStores(t)

	tenantA, err := auth.AdminCreateUser(ctx, "tenanta@example.com", "secret1234", "Empresa A", "11111111111", RoleUser, "")
	if err != nil {
		t.Fatalf("create tenantA: %v", err)
	}
	subA, err := auth.AdminCreateUser(ctx, "opa@example.com", "secret1234", "Empresa A", "22222222222", RoleUser, tenantA.ID)
	if err != nil {
		t.Fatalf("create subA: %v", err)
	}
	tenantB, err := auth.AdminCreateUser(ctx, "tenantb@example.com", "secret1234", "Empresa B", "33333333333", RoleUser, "")
	if err != nil {
		t.Fatalf("create tenantB: %v", err)
	}

	tagA, err := tags.Create(ctx, "VIP", "#22c55e", tenantA.ID)
	if err != nil {
		t.Fatalf("create tagA: %v", err)
	}
	tagLegacySubA, err := tags.Create(ctx, "Suporte", "#3b82f6", subA.ID)
	if err != nil {
		t.Fatalf("create tagLegacySubA: %v", err)
	}
	tagGlobal, err := tags.Create(ctx, "Geral", "#eab308", "")
	if err != nil {
		t.Fatalf("create tagGlobal: %v", err)
	}
	tagB, err := tags.Create(ctx, "Segredo B", "#ef4444", tenantB.ID)
	if err != nil {
		t.Fatalf("create tagB: %v", err)
	}

	// Tenant A sees own tag, sub-user legacy tag, and global tag — never Tenant B.
	listA, err := tags.List(ctx, tenantA.ID, false)
	if err != nil {
		t.Fatalf("List tenantA: %v", err)
	}
	seenA := map[string]bool{}
	for _, r := range listA {
		seenA[r.ID] = true
	}
	if !seenA[tagA.ID] || !seenA[tagLegacySubA.ID] || !seenA[tagGlobal.ID] || seenA[tagB.ID] {
		t.Fatalf("unexpected tenantA tag visibility: %+v", listA)
	}

	// Tenant B sees own + global only.
	listB, err := tags.List(ctx, tenantB.ID, false)
	if err != nil {
		t.Fatalf("List tenantB: %v", err)
	}
	seenB := map[string]bool{}
	for _, r := range listB {
		seenB[r.ID] = true
	}
	if !seenB[tagB.ID] || !seenB[tagGlobal.ID] || seenB[tagA.ID] || seenB[tagLegacySubA.ID] {
		t.Fatalf("unexpected tenantB tag visibility: %+v", listB)
	}

	// Super-admin sees all 4 tags.
	listAll, err := tags.List(ctx, "super-admin", true)
	if err != nil {
		t.Fatalf("List superadmin: %v", err)
	}
	if len(listAll) != 4 {
		t.Fatalf("expected 4 tags for superadmin, got %d", len(listAll))
	}

	// Update validation & ErrTagNotFound.
	if err := tags.Update(ctx, tagA.ID, "   ", "#000000"); err == nil {
		t.Fatal("expected error updating tag with empty name")
	}
	if err := tags.Update(ctx, "non-existent", "Novo", "#111111"); !errors.Is(err, ErrTagNotFound) {
		t.Fatalf("expected ErrTagNotFound, got %v", err)
	}
	if err := tags.Update(ctx, tagA.ID, "VIP Ouro", "#f59e0b"); err != nil {
		t.Fatalf("Update tagA: %v", err)
	}

	// Attach rejects missing tag ID.
	if err := tags.AttachToChat(ctx, "s1", "5511999990001@s.whatsapp.net", "missing-id", tenantA.ID); !errors.Is(err, ErrTagNotFound) {
		t.Fatalf("expected ErrTagNotFound attaching missing tag, got %v", err)
	}

	contactJID := "5511999990001@s.whatsapp.net"
	groupJID := "120363000111222@g.us"
	if err := tags.AttachToChat(ctx, "s1", contactJID, tagA.ID, tenantA.ID); err != nil {
		t.Fatalf("AttachToChat contact: %v", err)
	}
	if err := tags.AttachToChat(ctx, "s1", groupJID, tagA.ID, tenantA.ID); err != nil {
		t.Fatalf("AttachToChat group: %v", err)
	}

	sessMap, err := tags.ListForSession(ctx, "s1")
	if err != nil {
		t.Fatalf("ListForSession: %v", err)
	}
	if len(sessMap[contactJID]) != 1 || sessMap[contactJID][0].Name != "VIP Ouro" {
		t.Fatalf("contact missing updated tag: %+v", sessMap[contactJID])
	}
	if len(sessMap[groupJID]) != 1 || sessMap[groupJID][0].ID != tagA.ID {
		t.Fatalf("group missing tag: %+v", sessMap[groupJID])
	}

	// Case-insensitive resolve & auto-create in tenant.
	resolved, err := tags.ResolveOrCreateInTenant(ctx, "vip ouro", tenantA.ID)
	if err != nil || resolved.ID != tagA.ID {
		t.Fatalf("ResolveOrCreateInTenant existing failed: got %+v err=%v", resolved, err)
	}
	createdFlowTag, err := tags.ResolveOrCreateInTenant(ctx, "Lead Quente", tenantA.ID)
	if err != nil || createdFlowTag.OwnerID != tenantA.ID || createdFlowTag.Name != "Lead Quente" {
		t.Fatalf("ResolveOrCreateInTenant new failed: got %+v err=%v", createdFlowTag, err)
	}

	// Bulk attach + detach across contact and group.
	items := []chatComTag{
		{SessionID: "s1", ChatJID: contactJID},
		{SessionID: "s1", ChatJID: groupJID},
	}
	if err := tags.BulkAttachToChats(ctx, items, createdFlowTag.ID, tenantA.ID); err != nil {
		t.Fatalf("BulkAttachToChats: %v", err)
	}
	if list, _ := tags.ListForChat(ctx, "s1", groupJID); len(list) != 2 {
		t.Fatalf("expected 2 tags on group after bulk attach, got %d", len(list))
	}
	if err := tags.BulkDetachFromChats(ctx, items, createdFlowTag.ID); err != nil {
		t.Fatalf("BulkDetachFromChats: %v", err)
	}
	if list, _ := tags.ListForChat(ctx, "s1", groupJID); len(list) != 1 {
		t.Fatalf("expected 1 tag on group after bulk detach, got %d", len(list))
	}

	// Delete cascades contact_tags.
	if err := tags.Delete(ctx, tagA.ID); err != nil {
		t.Fatalf("Delete tagA: %v", err)
	}
	if list, _ := tags.ListForChat(ctx, "s1", contactJID); len(list) != 0 {
		t.Fatalf("expected contact tags cleared after tag Delete, got %+v", list)
	}
	if chats, _ := tags.ChatsWithTag(ctx, tagA.ID); len(chats) != 0 {
		t.Fatalf("expected no ChatsWithTag after Delete, got %+v", chats)
	}
}

func TestTagHTTPAPIEndpointsAndHydration(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	srv, err := newServer(ctx, filepath.Join(dir, "http_tags.db"), dir, 5, slog.Default())
	if err != nil {
		t.Fatalf("newServer: %v", err)
	}
	defer srv.db.Close()
	invalidateContactsCache()

	tenantA, err := srv.auth.AdminCreateUser(ctx, "compa@example.com", "secret1234", "Empresa A", "11111111111", RoleUser, "")
	if err != nil {
		t.Fatalf("create tenantA: %v", err)
	}
	opA, err := srv.auth.AdminCreateUser(ctx, "op@compa.com", "secret1234", "Empresa A", "22222222222", RoleUser, tenantA.ID)
	if err != nil {
		t.Fatalf("create opA: %v", err)
	}
	tenantB, err := srv.auth.AdminCreateUser(ctx, "compb@example.com", "secret1234", "Empresa B", "33333333333", RoleUser, "")
	if err != nil {
		t.Fatalf("create tenantB: %v", err)
	}

	tokTenantA, err := srv.auth.IssueToken(ctx, tenantA.ID)
	if err != nil {
		t.Fatalf("IssueToken tenantA: %v", err)
	}
	tokOpA, err := srv.auth.IssueToken(ctx, opA.ID)
	if err != nil {
		t.Fatalf("IssueToken opA: %v", err)
	}
	tokTenantB, err := srv.auth.IssueToken(ctx, tenantB.ID)
	if err != nil {
		t.Fatalf("IssueToken tenantB: %v", err)
	}

	sessA := registerOfflineSession(t, srv, "Conexão A", tenantA.ID)
	sessB := registerOfflineSession(t, srv, "Conexão B", tenantB.ID)
	_ = srv.auth.SetUserSessions(ctx, opA.ID, []string{sessA.id})

	contactJID := "5511988887777@s.whatsapp.net"
	groupJID := "120363222333444@g.us"
	now := time.Now().UnixMilli()

	// Seed a message-backed contact AND a chatMeta-only group in session A.
	if err := srv.messages.Insert(ctx, MessageRow{
		ID: "msg-1", SessionID: sessA.id, ChatJID: contactJID, SenderJID: contactJID,
		FromMe: false, Ts: now, Kind: "text", Body: "Olá!",
	}); err != nil {
		t.Fatalf("insert contact msg: %v", err)
	}
	if err := srv.chatMeta.Upsert(ctx, ChatMeta{
		SessionID: sessA.id, ChatJID: contactJID, Name: "Maria Cliente",
		IsGroup: false, Status: ChatStatusWaiting, UpdatedAt: now,
	}); err != nil {
		t.Fatalf("upsert contact meta: %v", err)
	}
	if err := srv.chatMeta.Upsert(ctx, ChatMeta{
		SessionID: sessA.id, ChatJID: groupJID, Name: "Grupo VIP Vendas",
		IsGroup: true, Status: ChatStatusGroup, UpdatedAt: now - 1000,
	}); err != nil {
		t.Fatalf("upsert group meta: %v", err)
	}

	// Also seed one chat in Tenant B to test session & tag authorization.
	_ = srv.chatMeta.Upsert(ctx, ChatMeta{
		SessionID: sessB.id, ChatJID: "5511977776666@s.whatsapp.net", Name: "Contato B",
		IsGroup: false, Status: ChatStatusWaiting, UpdatedAt: now,
	})

	subA := srv.broker.subscribe("clientA", tenantA.ID, tenantA.ID, false)
	defer srv.broker.unsubscribe(subA)
	subB := srv.broker.subscribe("clientB", tenantB.ID, tenantB.ID, false)
	defer srv.broker.unsubscribe(subB)

	h := srv.routes()

	// 1. Operator opA creates a tag -> saved under tenantA.ID so company shares it.
	rec := doAuthRequest(t, h, http.MethodPost, "/api/tags", tokOpA, map[string]string{
		"name":  "Prioridade",
		"color": "#22c55e",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("POST /api/tags expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var createdTag tagRow
	if err := json.Unmarshal(rec.Body.Bytes(), &createdTag); err != nil {
		t.Fatalf("decode created tag: %v", err)
	}
	if createdTag.OwnerID != tenantA.ID {
		t.Fatalf("expected created tag ownerId=%q (TenantID), got %q", tenantA.ID, createdTag.OwnerID)
	}

	// Tenant B creates its own tag.
	rec = doAuthRequest(t, h, http.MethodPost, "/api/tags", tokTenantB, map[string]string{
		"name":  "Externo B",
		"color": "#ef4444",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("POST /api/tags tenantB expected 200, got %d", rec.Code)
	}
	var tagB tagRow
	_ = json.Unmarshal(rec.Body.Bytes(), &tagB)

	// 2. GET /api/tags returns createdTag to tenantA, hides tagB.
	rec = doAuthRequest(t, h, http.MethodGet, "/api/tags", tokTenantA, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/tags expected 200, got %d", rec.Code)
	}
	var listResp struct {
		Tags []tagRow `json:"tags"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &listResp)
	if len(listResp.Tags) != 1 || listResp.Tags[0].ID != createdTag.ID {
		t.Fatalf("unexpected GET /api/tags for tenantA: %+v", listResp.Tags)
	}

	// 3. Cross-tenant attach must be blocked (tenantA cannot attach tagB).
	rec = doAuthRequest(t, h, http.MethodPost, "/api/sessions/"+sessA.id+"/chats/"+url.PathEscape(contactJID)+"/tags", tokTenantA, map[string]string{
		"tagId": tagB.ID,
	})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 attaching foreign tenant tag, got %d", rec.Code)
	}

	// 4. Bulk attach tag to BOTH contact & group as opA.
	rec = doAuthRequest(t, h, http.MethodPost, "/api/tags/bulk/attach", tokOpA, map[string]any{
		"tagId": createdTag.ID,
		"items": []map[string]string{
			{"sessionId": sessA.id, "chatJid": contactJID},
			{"sessionId": sessA.id, "chatJid": groupJID},
		},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("POST /api/tags/bulk/attach expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// Tenant A SSE received two "chat-tags" events; Tenant B received zero.
	evsA := drainBrokerEvents(subA)
	evsB := drainBrokerEvents(subB)
	chatTagsEvs := 0
	for _, ev := range evsA {
		if ev["type"] == "chat-tags" {
			chatTagsEvs++
		}
	}
	if chatTagsEvs != 2 {
		t.Fatalf("expected 2 chat-tags SSE events for tenantA, got %d (%+v)", chatTagsEvs, evsA)
	}
	if len(evsB) != 0 {
		t.Fatalf("tenantB should NOT receive tenantA SSE events, got %+v", evsB)
	}

	// Cross-tenant bulk attach must return 403 Forbidden.
	rec = doAuthRequest(t, h, http.MethodPost, "/api/tags/bulk/attach", tokTenantB, map[string]any{
		"tagId": createdTag.ID,
		"items": []map[string]string{{"sessionId": sessA.id, "chatJid": contactJID}},
	})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for tenantB bulk attach on tenantA tag/session, got %d", rec.Code)
	}

	// 5. GET /api/sessions/{sid}/chats hydrates tags for both contacts and groups.
	rec = doAuthRequest(t, h, http.MethodGet, "/api/sessions/"+sessA.id+"/chats", tokTenantA, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET chats expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var chatsResp struct {
		Chats []ChatSummary `json:"chats"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &chatsResp)
	if len(chatsResp.Chats) != 2 {
		t.Fatalf("expected 2 chats (contact + group), got %d", len(chatsResp.Chats))
	}
	for _, c := range chatsResp.Chats {
		if len(c.Tags) != 1 || c.Tags[0].ID != createdTag.ID {
			t.Fatalf("chat %s missing hydrated tag: %+v", c.ChatJID, c.Tags)
		}
	}

	// 6. GET /api/contacts hydrates tags AND filters cleanly by ?tagId= and ?kind=group.
	rec = doAuthRequest(t, h, http.MethodGet, "/api/contacts?tagId="+url.QueryEscape(createdTag.ID), tokTenantA, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/contacts?tagId= expected 200, got %d", rec.Code)
	}
	var contactsResp struct {
		Contacts []contactRow `json:"contacts"`
		Total    int          `json:"total"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &contactsResp)
	if contactsResp.Total != 2 || len(contactsResp.Contacts) != 2 {
		t.Fatalf("expected 2 tagged contacts (contact + group), got total=%d rows=%+v", contactsResp.Total, contactsResp.Contacts)
	}

	rec = doAuthRequest(t, h, http.MethodGet, "/api/contacts?kind=group&tagId="+url.QueryEscape(createdTag.ID), tokTenantA, nil)
	_ = json.Unmarshal(rec.Body.Bytes(), &contactsResp)
	if contactsResp.Total != 1 || contactsResp.Contacts[0].ChatJID != groupJID || !contactsResp.Contacts[0].IsGroup {
		t.Fatalf("expected filtered group only, got %+v", contactsResp.Contacts)
	}

	// 7. GET /api/tags/{id}/chats scoped to tenant.
	rec = doAuthRequest(t, h, http.MethodGet, "/api/tags/"+createdTag.ID+"/chats", tokTenantA, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/tags/{id}/chats expected 200, got %d", rec.Code)
	}
	var tagChatsResp struct {
		Chats []chatComTag `json:"chats"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &tagChatsResp)
	if len(tagChatsResp.Chats) != 2 {
		t.Fatalf("expected 2 chats for tag, got %+v", tagChatsResp.Chats)
	}
	rec = doAuthRequest(t, h, http.MethodGet, "/api/tags/"+createdTag.ID+"/chats", tokTenantB, nil)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 on GET /api/tags/{id}/chats from tenantB, got %d", rec.Code)
	}

	// 8. Bulk detach from group -> invalidates contacts cache immediately & emits empty chat-tags SSE.
	rec = doAuthRequest(t, h, http.MethodPost, "/api/tags/bulk/detach", tokOpA, map[string]any{
		"tagId": createdTag.ID,
		"items": []map[string]string{{"sessionId": sessA.id, "chatJid": groupJID}},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("POST /api/tags/bulk/detach expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	evsA = drainBrokerEvents(subA)
	if len(evsA) != 1 || evsA[0]["type"] != "chat-tags" || evsA[0]["chatJid"] != groupJID {
		t.Fatalf("expected 1 chat-tags SSE event for detached group, got %+v", evsA)
	}
	if tagsSlice, _ := evsA[0]["tags"].([]any); len(tagsSlice) != 0 {
		t.Fatalf("expected empty tags slice in SSE after detach, got %+v", tagsSlice)
	}

	// Cache invalidation check inside 2s TTL: group must no longer match ?tagId=.
	rec = doAuthRequest(t, h, http.MethodGet, "/api/contacts?tagId="+url.QueryEscape(createdTag.ID), tokTenantA, nil)
	_ = json.Unmarshal(rec.Body.Bytes(), &contactsResp)
	if contactsResp.Total != 1 || contactsResp.Contacts[0].ChatJID != contactJID {
		t.Fatalf("contacts cache was not invalidated after bulk detach: %+v", contactsResp.Contacts)
	}
}

func TestFlowExecutorChatTagNodes(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	srv, err := newServer(ctx, filepath.Join(dir, "flow_tags.db"), dir, 5, slog.Default())
	if err != nil {
		t.Fatalf("newServer: %v", err)
	}
	defer srv.db.Close()
	invalidateContactsCache()

	tenant, err := srv.auth.AdminCreateUser(ctx, "flowtenant@example.com", "secret1234", "Flow Co", "44444444444", RoleUser, "")
	if err != nil {
		t.Fatalf("create tenant: %v", err)
	}
	sess := registerOfflineSession(t, srv, "Bot Conn", tenant.ID)
	sub := srv.broker.subscribe("flowClient", tenant.ID, tenant.ID, false)
	defer srv.broker.unsubscribe(sub)

	groupJID := "120363999888777@g.us"
	vars := map[string]interface{}{
		"message": map[string]interface{}{
			"chat": groupJID,
			"from": "5511911112222@s.whatsapp.net",
		},
		"flow": map[string]interface{}{
			"id":    "flow-1",
			"owner": tenant.ID,
		},
		"vars": map[string]interface{}{},
	}
	noopLog := func(string, string, interface{}) {}

	// Run chat_tag_add -> auto-creates "Pós-Venda" in tenant and attaches to groupJID.
	addNode := FlowNode{
		ID:   "n-add",
		Type: "chat_tag_add",
		Data: map[string]interface{}{"tag": "Pós-Venda"},
	}
	if _, _, err := srv.flowExec.runChatNode(ctx, addNode, nil, vars, noopLog, false, sess.id, "call-1"); err != nil {
		t.Fatalf("runChatNode add: %v", err)
	}
	attached, err := srv.tags.ListForChat(ctx, sess.id, groupJID)
	if err != nil || len(attached) != 1 || attached[0].Name != "Pós-Venda" || attached[0].OwnerID != tenant.ID {
		t.Fatalf("expected auto-created Pós-Venda tag attached to group, got %+v (err=%v)", attached, err)
	}
	if vMap, _ := vars["vars"].(map[string]interface{}); vMap["last_tag_added"] != "Pós-Venda" {
		t.Fatalf("expected vars.last_tag_added set, got %+v", vMap)
	}
	evs := drainBrokerEvents(sub)
	if len(evs) != 1 || evs[0]["type"] != "chat-tags" || evs[0]["chatJid"] != groupJID {
		t.Fatalf("expected chat-tags SSE from chat_tag_add, got %+v", evs)
	}

	// Run chat_tag_remove (case-insensitive match) -> detaches tag and emits SSE.
	remNode := FlowNode{
		ID:   "n-rem",
		Type: "chat_tag_remove",
		Data: map[string]interface{}{"tag": "pós-venda"},
	}
	if _, _, err := srv.flowExec.runChatNode(ctx, remNode, nil, vars, noopLog, false, sess.id, "call-1"); err != nil {
		t.Fatalf("runChatNode remove: %v", err)
	}
	attached, _ = srv.tags.ListForChat(ctx, sess.id, groupJID)
	if len(attached) != 0 {
		t.Fatalf("expected tag removed from group after chat_tag_remove, got %+v", attached)
	}
	evs = drainBrokerEvents(sub)
	if len(evs) != 1 || evs[0]["type"] != "chat-tags" {
		t.Fatalf("expected chat-tags SSE from chat_tag_remove, got %+v", evs)
	}
}

