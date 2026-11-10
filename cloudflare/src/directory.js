// The directory: who belongs to which household. One Durable Object holds it for the whole
// site, in a small SQLite database, so households and invites survive deploys and never live
// in the repo. Every rule about who may add or remove whom is enforced here.

import { DurableObject } from "cloudflare:workers";
import { parseHouseholds } from "./logic.js";

export const LIMITS = { people: 45, perHousehold: 8 }; // Access's free plan allows 50 people

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
export function cleanEmail(e) {
  const v = String(e || "").trim().toLowerCase();
  if (!EMAIL.test(v) || v.length > 120) throw new UserError("That doesn't look like an email address");
  return v;
}
export function cleanName(n, what = "name") {
  const v = String(n || "").replace(/[<>"]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!v) throw new UserError(`Please enter a ${what}`);
  return v;
}
/** An error that's safe and useful to show to the person. */
export class UserError extends Error {}

const newId = () => [...crypto.getRandomValues(new Uint8Array(9))].map((b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");

export class Directory extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS households (id TEXT PRIMARY KEY, name TEXT NOT NULL, created INTEGER NOT NULL)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS members (email TEXT PRIMARY KEY, household TEXT NOT NULL, name TEXT NOT NULL, added_by TEXT, created INTEGER NOT NULL)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)");
    // added in 0.9: when each person last used the app (Unix seconds, updated at most hourly)
    const cols = this.sql.exec("PRAGMA table_info(members)").toArray().map((c) => c.name);
    if (!cols.includes("last_seen")) this.sql.exec("ALTER TABLE members ADD COLUMN last_seen INTEGER");
    // added in 0.9.9: the newest admin message each person has dismissed
    if (!cols.includes("notice_seen")) this.sql.exec("ALTER TABLE members ADD COLUMN notice_seen INTEGER");
    // added in 0.9.5: when each recipe rating was left (no contents), so the admin dashboard can
    // say "3 new" without opening every household. The ratings themselves stay in each household.
    this.sql.exec("CREATE TABLE IF NOT EXISTS feedback_log (at INTEGER NOT NULL, household TEXT NOT NULL)");
  }

  // ---- small helpers -------------------------------------------------------
  rows(q, ...args) { return this.sql.exec(q, ...args).toArray(); }
  row(q, ...args) { return this.rows(q, ...args)[0] || null; }
  now() { return Math.floor(Date.now() / 1000); }
  member(email) { return this.row("SELECT m.email, m.name, m.household, h.name AS householdName FROM members m JOIN households h ON h.id = m.household WHERE m.email = ?", email); }
  peopleCount() { return this.row("SELECT COUNT(*) AS n FROM members").n; }
  householdMembers(id) { return this.rows("SELECT email, name, added_by AS addedBy, created, last_seen AS lastSeen FROM members WHERE household = ? ORDER BY created, email", id); }
  household(id) { return this.row("SELECT id, name FROM households WHERE id = ?", id); }
  meta(key) { const r = this.row("SELECT value FROM meta WHERE key = ?", key); return r ? r.value : null; }
  setMeta(key, value) { this.sql.exec("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value); }

  insertHousehold(id, name) { this.sql.exec("INSERT INTO households (id, name, created) VALUES (?, ?, ?)", id, name, this.now()); }
  insertMember(email, household, name, by) {
    if (this.peopleCount() >= LIMITS.people) throw new UserError(`FoodIsHard is full (${LIMITS.people} people, the free sign-in limit)`);
    this.sql.exec("INSERT INTO members (email, household, name, added_by, created) VALUES (?, ?, ?, ?, ?)", email, household, name, by || null, this.now());
  }

  // ---- set-up --------------------------------------------------------------
  /** First run only: bring in the old HOUSEHOLDS setting, so nothing is lost moving to invites. */
  importOnce(householdsSetting) {
    if (this.meta("imported")) return { imported: 0 };
    let n = 0;
    if (householdsSetting) {
      const byEmail = parseHouseholds(householdsSetting);
      for (const [email, m] of Object.entries(byEmail)) {
        if (!this.row("SELECT id FROM households WHERE id = ?", m.household)) this.insertHousehold(m.household, m.household);
        if (!this.member(email)) { this.insertMember(email, m.household, m.name, "import"); n++; }
      }
    }
    this.setMeta("imported", String(this.now()));
    return { imported: n };
  }

  /**
   * Who is this? Returns their membership, or null. Admins don't need a household: an admin
   * with none uses the admin dashboard only. Also records "last active", at most once an hour.
   */
  whoIs(email) {
    const m = this.member(email);
    if (m) {
      const now = this.now();
      this.sql.exec("UPDATE members SET last_seen = ? WHERE email = ? AND (last_seen IS NULL OR last_seen < ?)", now, email, now - 3600);
    }
    return m;
  }

  // ---- for everyone: their own household ------------------------------------
  account(email) {
    const me = this.member(email);
    if (!me) throw new UserError("You're not in a household");
    return { me, household: { id: me.household, name: me.householdName, members: this.householdMembers(me.household) }, people: this.peopleCount(), limits: LIMITS };
  }

  invite(byEmail, { email, name }) {
    const me = this.member(byEmail);
    if (!me) throw new UserError("You're not in a household");
    email = cleanEmail(email); name = cleanName(name);
    const existing = this.member(email);
    if (existing) throw new UserError(existing.household === me.household ? `${email} is already in your household` : `${email} is already in another household`);
    if (this.householdMembers(me.household).length >= LIMITS.perHousehold) throw new UserError(`A household can have up to ${LIMITS.perHousehold} people`);
    this.insertMember(email, me.household, name, byEmail);
    return this.account(byEmail);
  }

  /** Remove someone from your own household (or yourself, to leave). Admins can remove anyone. */
  remove(byEmail, email, { admin = false } = {}) {
    email = cleanEmail(email);
    const me = this.member(byEmail), target = this.member(email);
    if (!target) throw new UserError(`${email} isn't in a household`);
    if (!admin && (!me || me.household !== target.household)) throw new UserError("You can only remove people from your own household");
    if (this.householdMembers(target.household).length <= 1) throw new UserError("That's the last person in the household. An admin can delete the household instead.");
    this.sql.exec("DELETE FROM members WHERE email = ?", email);
    return { removed: email };
  }

  rename(byEmail, { name, householdName }) {
    const me = this.member(byEmail);
    if (!me) throw new UserError("You're not in a household");
    if (name != null) this.sql.exec("UPDATE members SET name = ? WHERE email = ?", cleanName(name), byEmail);
    if (householdName != null) this.sql.exec("UPDATE households SET name = ? WHERE id = ?", cleanName(householdName, "household name"), me.household);
    return this.account(byEmail);
  }

  // ---- admins only (the Worker checks ADMINS before calling these) ----------
  overview() {
    const households = this.rows("SELECT id, name, created FROM households ORDER BY name COLLATE NOCASE");
    return { households: households.map((h) => ({ ...h, members: this.householdMembers(h.id) })), people: this.peopleCount(), limits: LIMITS, lastSync: JSON.parse(this.meta("lastSync") || "null"), notice: this.noticeStats() };
  }

  createHousehold(byEmail, { householdName, email, name }) {
    householdName = cleanName(householdName, "household name"); email = cleanEmail(email); name = cleanName(name);
    if (this.member(email)) throw new UserError(`${email} is already in a household`);
    const id = newId();
    this.insertHousehold(id, householdName);
    try { this.insertMember(email, id, name, byEmail); } catch (err) { this.sql.exec("DELETE FROM households WHERE id = ?", id); throw err; }
    return { id };
  }

  deleteHousehold(byEmail, id) {
    const h = this.row("SELECT id FROM households WHERE id = ?", id);
    if (!h) throw new UserError("No such household");
    const me = this.member(byEmail);
    if (me && me.household === id) throw new UserError("You can't delete your own household");
    this.sql.exec("DELETE FROM members WHERE household = ?", id);
    this.sql.exec("DELETE FROM households WHERE id = ?", id);
    return { deleted: id };
  }

  /** Admin: add someone to any household. */
  addMember(byEmail, { household, email, name }) {
    const h = this.household(String(household || ""));
    if (!h) throw new UserError("No such household");
    email = cleanEmail(email); name = cleanName(name);
    const existing = this.member(email);
    if (existing) throw new UserError(`${email} is already in ${existing.householdName}`);
    if (this.householdMembers(h.id).length >= LIMITS.perHousehold) throw new UserError(`A household can have up to ${LIMITS.perHousehold} people`);
    this.insertMember(email, h.id, name, byEmail);
    return { added: email };
  }

  /** Admin: move someone to another household. */
  moveMember(email, household) {
    email = cleanEmail(email);
    const m = this.member(email), h = this.household(String(household || ""));
    if (!m) throw new UserError(`${email} isn't in a household`);
    if (!h) throw new UserError("No such household");
    if (m.household === h.id) throw new UserError(`${m.name} is already in ${h.name}`);
    if (this.householdMembers(m.household).length <= 1) throw new UserError(`${m.name} is the last person in ${m.householdName}. Delete that household instead, or add someone to it first.`);
    if (this.householdMembers(h.id).length >= LIMITS.perHousehold) throw new UserError(`A household can have up to ${LIMITS.perHousehold} people`);
    this.sql.exec("UPDATE members SET household = ? WHERE email = ?", h.id, email);
    return { moved: email };
  }

  /** Admin: rename any household. */
  renameHousehold(id, name) {
    if (!this.household(String(id || ""))) throw new UserError("No such household");
    this.sql.exec("UPDATE households SET name = ? WHERE id = ?", cleanName(name, "household name"), id);
    return { renamed: id };
  }

  /** Admin: stop being in a household (making this an admin-only account). Returns the household to wipe if it's now empty. */
  leave(email) {
    const m = this.member(email);
    if (!m) throw new UserError("You're not in a household");
    this.sql.exec("DELETE FROM members WHERE email = ?", email);
    if (this.householdMembers(m.household).length === 0) {
      this.sql.exec("DELETE FROM households WHERE id = ?", m.household);
      return { left: m.household, deleted: m.household };
    }
    return { left: m.household };
  }

  // ---- a message from the admin to everyone, shown once each -----------------
  notice() { return JSON.parse(this.meta("notice") || "null"); }
  noticeStats() {
    const n = this.notice();
    if (!n) return null;
    return { ...n, seenBy: this.row("SELECT COUNT(*) AS n FROM members WHERE notice_seen >= ?", n.id).n };
  }
  setNotice(byEmail, text) {
    text = String(text || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
    if (!text) throw new UserError("Please write a message");
    if (text.length > 400) throw new UserError("Please keep it under 400 characters");
    const prev = this.notice();
    const id = Math.max(this.now(), prev ? prev.id + 1 : 0); // always newer, so everyone sees it
    this.setMeta("notice", JSON.stringify({ id, text, at: this.now() }));
    this.sql.exec("UPDATE members SET notice_seen = ? WHERE email = ?", id, byEmail); // you've seen your own
    return this.noticeStats();
  }
  clearNotice() { this.sql.exec("DELETE FROM meta WHERE key = 'notice'"); return null; }
  /** The message, if this person hasn't dismissed it yet. */
  noticeFor(email) {
    const n = this.notice(), m = n && this.row("SELECT notice_seen AS seen FROM members WHERE email = ?", email);
    if (!n || !m || (m.seen || 0) >= n.id) return null;
    return { id: n.id, text: n.text, at: n.at };
  }
  markNotice(email, id) {
    this.sql.exec("UPDATE members SET notice_seen = ? WHERE email = ? AND (notice_seen IS NULL OR notice_seen < ?)", Number(id) || 0, email, Number(id) || 0);
    return { ok: true };
  }

  // ---- recipe feedback ------------------------------------------------------
  noteFeedback(household) {
    const now = this.now();
    this.sql.exec("INSERT INTO feedback_log (at, household) VALUES (?, ?)", now, household);
    this.sql.exec("DELETE FROM feedback_log WHERE at < ?", now - 400 * 86400);
  }
  /** How many ratings have arrived since this admin last opened the Feedback screen. */
  feedbackNew(email) {
    const seen = Number(this.meta(`feedbackSeen:${email}`) || 0);
    const n = this.row("SELECT COUNT(*) AS n FROM feedback_log f JOIN households h ON h.id = f.household WHERE f.at > ?", seen).n;
    return { new: n, seen };
  }
  markFeedbackSeen(email) { this.setMeta(`feedbackSeen:${email}`, String(this.now())); return this.feedbackNew(email); }

  allEmails() { return this.rows("SELECT email FROM members ORDER BY email").map((r) => r.email); }
  recordSync(result) { this.setMeta("lastSync", JSON.stringify({ ...result, at: this.now() })); }
}
