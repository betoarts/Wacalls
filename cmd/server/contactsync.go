package main

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/appstate"
	"go.mau.fi/whatsmeow/types"
)

// resolveContactNameAndAvatar best-effort enriches a chat's name and profile
// picture using the WhatsApp client. It writes the cached picture under
// media/avatars/ and returns the served URL path (or "" if unavailable).
//
// Safe to call multiple times — picture is re-downloaded only when WhatsApp
// reports a new ID.
func resolveContactNameAndAvatar(ctx context.Context, sess *Session, jidStr string, existingName, existingAvatar string) (name, avatarURL string, err error) {
	if sess == nil || sess.client == nil {
		return existingName, existingAvatar, fmt.Errorf("session not ready")
	}
	jid, parseErr := types.ParseJID(jidStr)
	if parseErr != nil {
		return existingName, existingAvatar, parseErr
	}
	name = existingName
	avatarURL = existingAvatar

	// --- Name resolution --------------------------------------------------
	isGroup := jid.Server == types.GroupServer || strings.HasSuffix(jidStr, "@g.us")
	isNewsletter := jid.Server == types.NewsletterServer || strings.HasSuffix(jidStr, "@newsletter")
	if isGroup {
		if gi, gerr := sess.client.GetGroupInfo(ctx, jid); gerr == nil && gi != nil && gi.Name != "" {
			name = gi.Name
		}
	} else if isNewsletter {
		if nm, nerr := sess.client.GetNewsletterInfo(ctx, jid); nerr == nil && nm != nil {
			if t := strings.TrimSpace(nm.ThreadMeta.Name.Text); t != "" {
				name = t
			}
			// Try to seed avatar from newsletter preview/picture if no
			// profile picture is later returned by GetProfilePictureInfo.
			if nm.ThreadMeta.Picture != nil && nm.ThreadMeta.Picture.URL != "" {
				if saved, derr := downloadAvatar(ctx, jidStr, nm.ThreadMeta.Picture.ID, nm.ThreadMeta.Picture.URL); derr == nil {
					avatarURL = saved
				}
			} else if nm.ThreadMeta.Preview.URL != "" {
				if saved, derr := downloadAvatar(ctx, jidStr, nm.ThreadMeta.Preview.ID, nm.ThreadMeta.Preview.URL); derr == nil {
					avatarURL = saved
				}
			}
		}
	} else {
		// Local contact cache populated by whatsmeow from sync events.
		if sess.client.Store != nil && sess.client.Store.Contacts != nil {
			if ci, cerr := sess.client.Store.Contacts.GetContact(ctx, jid.ToNonAD()); cerr == nil && ci.Found {
				switch {
				case ci.FullName != "":
					name = ci.FullName
				case ci.PushName != "":
					name = ci.PushName
				case ci.BusinessName != "":
					name = ci.BusinessName
				case ci.FirstName != "":
					name = ci.FirstName
				}
			}
		}
	}

	// --- Profile picture --------------------------------------------------
	existingID := ""
	if existingAvatar != "" {
		// We embed the ppId in the filename (avatars/<hash>-<id>.jpg) so we
		// can avoid re-downloading when WhatsApp returns the same id.
		if idx := strings.LastIndex(existingAvatar, "-"); idx > 0 {
			tail := existingAvatar[idx+1:]
			tail = strings.TrimSuffix(tail, ".jpg")
			if tail != "" {
				existingID = tail
			}
		}
	}
	info, perr := sess.client.GetProfilePictureInfo(ctx, jid, &whatsmeow.GetProfilePictureParams{
		Preview:    false,
		ExistingID: existingID,
	})
	if perr != nil {
		// Privacy or "not authorized" — keep existing avatar.
		return name, avatarURL, nil
	}
	if info == nil {
		// Nil means picture unchanged.
		return name, avatarURL, nil
	}
	if info.URL == "" {
		return name, avatarURL, nil
	}
	saved, derr := downloadAvatar(ctx, jidStr, info.ID, info.URL)
	if derr != nil {
		return name, avatarURL, nil
	}
	avatarURL = saved
	return name, avatarURL, nil
}

// downloadAvatar fetches the profile picture and stores it under
// media/avatars/<sha1(jid)>-<pictureId>.jpg, returning the public path.
func downloadAvatar(ctx context.Context, jidStr, pictureID, url string) (string, error) {
	dir := filepath.Join("media", "avatars")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	h := sha1.Sum([]byte(jidStr))
	hash := hex.EncodeToString(h[:])
	id := pictureID
	if id == "" {
		id = fmt.Sprintf("%d", time.Now().Unix())
	}
	// sanitize id
	id = strings.Map(func(r rune) rune {
		switch {
		case r >= '0' && r <= '9', r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r == '_', r == '-':
			return r
		}
		return '_'
	}, id)
	name := hash + "-" + id + ".jpg"
	full := filepath.Join(dir, name)
	if _, err := os.Stat(full); err == nil {
		return "/api/media/avatars/" + name, nil
	}

	reqCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("avatar download: %s", resp.Status)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(full, data, 0o644); err != nil {
		return "", err
	}
	return "/api/media/avatars/" + name, nil
}

// handleChatSync forces a refresh of one conversation (name + avatar) and
// returns the updated ChatMeta. Used by the "Sincronizar contato" button.
func (s *server) handleChatSync(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r, r.PathValue("sid"))
	if sess == nil {
		return
	}
	if sess.client == nil || sess.client.Store == nil || sess.client.Store.ID == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "not paired"})
		return
	}
	jid := r.PathValue("jid")
	cur, _, _ := s.chatMeta.Get(r.Context(), sess.id, jid)
	if cur.SessionID == "" {
		cur.SessionID = sess.id
		cur.ChatJID = jid
		if strings.HasSuffix(jid, "@g.us") {
			cur.IsGroup = true
			cur.Status = ChatStatusGroup
		} else {
			cur.Status = ChatStatusWaiting
		}
	}
	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
	defer cancel()
	name, avatar, err := resolveContactNameAndAvatar(ctx, sess, jid, cur.Name, cur.AvatarURL)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	cur.Name = name
	cur.AvatarURL = avatar
	cur.UpdatedAt = time.Now().UnixMilli()
	if err := s.chatMeta.Upsert(r.Context(), cur); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	s.broker.emitChatMeta(cur)
	writeJSON(w, http.StatusOK, map[string]any{"meta": cur})
}

// handleLidToPN resolves a WhatsApp LID (e.g. "199347350294740@lid") to the
// real phone-number JID, using whatsmeow's local LID↔PN store. Triggers a
// best-effort USync when the mapping is missing so the next call hits the
// cache. Returns {"phone": "<digits>", "jid": "<pn@s.whatsapp.net>"} or 404.
func (s *server) handleLidToPN(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r, r.PathValue("sid"))
	if sess == nil {
		return
	}
	if sess.client == nil || sess.client.Store == nil || sess.client.Store.LIDs == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "not paired"})
		return
	}
	raw := r.PathValue("jid")
	parsed, perr := types.ParseJID(raw)
	if perr != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid jid"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	// Already a phone-number JID — short-circuit.
	if parsed.Server != types.HiddenUserServer {
		writeJSON(w, http.StatusOK, map[string]any{"phone": parsed.User, "jid": parsed.String()})
		return
	}
	if pn, err := sess.client.Store.LIDs.GetPNForLID(ctx, parsed); err == nil && !pn.IsEmpty() {
		writeJSON(w, http.StatusOK, map[string]any{"phone": pn.User, "jid": pn.String()})
		return
	}
	// USync warm-up: asking for devices populates Store.LIDs as a side-effect.
	_, _ = sess.client.GetUserDevices(ctx, []types.JID{parsed})
	if pn, err := sess.client.Store.LIDs.GetPNForLID(ctx, parsed); err == nil && !pn.IsEmpty() {
		writeJSON(w, http.StatusOK, map[string]any{"phone": pn.User, "jid": pn.String()})
		return
	}
	writeJSON(w, http.StatusNotFound, map[string]string{"error": "lid not mapped"})
}

// syncAllConversations pulls joined groups, subscribed newsletters, and contacts from
// WhatsApp, registers them in chatMeta, triggers app-state sync, and schedules avatar enrichment.
func (s *Session) syncAllConversations(ctx context.Context) (groupsCount, channelsCount, contactsCount int, err error) {
	if s.client == nil || s.client.Store == nil || s.client.Store.ID == nil {
		return 0, 0, 0, fmt.Errorf("sessão não está conectada ou pareada")
	}

	now := time.Now().UnixMilli()

	// 1. Grupos participantes
	if s.client.IsConnected() {
		if groups, gerr := s.client.GetJoinedGroups(ctx); gerr == nil && groups != nil {
			for _, g := range groups {
				if g == nil || g.JID.IsEmpty() {
					continue
				}
				jidStr := g.JID.String()
				name := strings.TrimSpace(g.Name)
				if name == "" {
					name = "Grupo " + jidStr
				}
				cur, _, _ := s.mgr.chatMeta.Get(ctx, s.id, jidStr)
				cur.SessionID = s.id
				cur.ChatJID = jidStr
				cur.Name = name
				cur.IsGroup = true
				cur.Status = ChatStatusGroup
				if cur.QueueID == "" {
					cur.QueueID = s.queueID
				}
				if cur.UpdatedAt <= 0 {
					cur.UpdatedAt = now
				}
				if err := s.mgr.chatMeta.Upsert(ctx, cur); err == nil {
					groupsCount++
					s.mgr.broker.emitChatMeta(cur)
				}
			}
		}
	}

	// 2. Canais / Newsletters inscritos
	if s.client.IsConnected() {
		if newsletters, nerr := s.client.GetSubscribedNewsletters(ctx); nerr == nil && newsletters != nil {
			for _, nl := range newsletters {
				if nl == nil || nl.ID.IsEmpty() {
					continue
				}
				jidStr := nl.ID.String()
				name := strings.TrimSpace(nl.ThreadMeta.Name.Text)
				if name == "" {
					name = "Canal " + jidStr
				}
				cur, _, _ := s.mgr.chatMeta.Get(ctx, s.id, jidStr)
				cur.SessionID = s.id
				cur.ChatJID = jidStr
				cur.Name = name
				cur.IsGroup = true
				cur.Status = ChatStatusGroup
				if cur.QueueID == "" {
					cur.QueueID = s.queueID
				}
				if cur.UpdatedAt <= 0 {
					cur.UpdatedAt = now
				}
				if err := s.mgr.chatMeta.Upsert(ctx, cur); err == nil {
					channelsCount++
					s.mgr.broker.emitChatMeta(cur)
				}
			}
		}
	}

	// 3. Contatos armazenados pelo WhatsApp
	if s.client.Store.Contacts != nil {
		if contacts, cerr := s.client.Store.Contacts.GetAllContacts(ctx); cerr == nil && contacts != nil {
			for jid, ci := range contacts {
				if jid.Server != types.DefaultUserServer && jid.Server != types.HiddenUserServer {
					continue
				}
				jidStr := jid.ToNonAD().String()
				name := strings.TrimSpace(ci.FullName)
				if name == "" {
					name = strings.TrimSpace(ci.PushName)
				}
				if name == "" {
					name = strings.TrimSpace(ci.BusinessName)
				}
				if name == "" {
					name = strings.TrimSpace(ci.FirstName)
				}
				phone := jidPhone(jidStr)
				if name == "" {
					name = phone
				}
				if name == "" {
					continue
				}
				cur, exists, _ := s.mgr.chatMeta.Get(ctx, s.id, jidStr)
				if !exists || cur.SessionID == "" {
					cur = ChatMeta{
						SessionID: s.id,
						ChatJID:   jidStr,
						Name:      name,
						IsGroup:   false,
						Status:    ChatStatusWaiting,
						QueueID:   s.queueID,
						UpdatedAt: now,
					}
					if err := s.mgr.chatMeta.Upsert(ctx, cur); err == nil {
						contactsCount++
						s.mgr.broker.emitChatMeta(cur)
					}
				} else if cur.Name == "" || cur.Name == jidStr || cur.Name == phone {
					if name != phone && name != jidStr {
						cur.Name = name
						cur.UpdatedAt = now
						if err := s.mgr.chatMeta.Upsert(ctx, cur); err == nil {
							contactsCount++
							s.mgr.broker.emitChatMeta(cur)
						}
					}
				}
			}
		}
	}

	// 4. Dispara sincronização de App State
	go func() {
		for _, patch := range appstate.AllPatchNames {
			_ = s.client.FetchAppState(context.Background(), patch, false, false)
		}
	}()

	// 5. Invalida cache de contatos
	contactsCacheMu.Lock()
	contactsCache = map[string]contactsCacheEntry{}
	contactsCacheMu.Unlock()

	// 6. Atualização em segundo plano de fotos e nomes
	go func() {
		metas, err := s.mgr.chatMeta.ListBySession(context.Background(), s.id)
		if err != nil {
			return
		}
		bgCtx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()
		for _, m := range metas {
			select {
			case <-bgCtx.Done():
				return
			default:
			}
			name, avatar, err := resolveContactNameAndAvatar(bgCtx, s, m.ChatJID, m.Name, m.AvatarURL)
			if err != nil {
				continue
			}
			if name == m.Name && avatar == m.AvatarURL {
				continue
			}
			m.Name = name
			m.AvatarURL = avatar
			m.UpdatedAt = time.Now().UnixMilli()
			if err := s.mgr.chatMeta.Upsert(bgCtx, m); err == nil {
				s.mgr.broker.emitChatMeta(m)
			}
			time.Sleep(120 * time.Millisecond)
		}
	}()

	return groupsCount, channelsCount, contactsCount, nil
}

// handleChatSyncAll pulls all conversations (groups, contacts, channels) from the
// WhatsApp API and updates their metadata and avatars.
func (s *server) handleChatSyncAll(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r, r.PathValue("sid"))
	if sess == nil {
		return
	}
	if sess.client == nil || sess.client.Store == nil || sess.client.Store.ID == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "WhatsApp não está conectado ou pareado"})
		return
	}
	groupsCount, channelsCount, contactsCount, err := sess.syncAllConversations(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	metas, _ := s.chatMeta.ListBySession(r.Context(), sess.id)
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":       true,
		"groups":   groupsCount,
		"channels": channelsCount,
		"contacts": contactsCount,
		"total":    len(metas),
		"queued":   len(metas),
	})
}
