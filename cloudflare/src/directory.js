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
  }

  // ---- small helpers -------------------------------------------------------
  rows(q, ...args) { return this.sql.exec(q, ...args).toArray(); }
  row(q, ...args) { return this.rows(q, ...args)[0] || null; }
  now() { return Math.floor(Date.now() / 1000); }
  member(email) { return this.row("SELECT m.email, m.name, m.household, h.name AS householdName FROM members m JOIN households h ON h.id = m.household WHERE m.email = ?", email); }
  peopleCount() { return this.row("SELECT COUNT(*) AS n FROM members").n; }
  householdMembers(id) { return this.rows("SELECT email, name, added_by AS addedBy, created FROM members WHERE household = ? ORDER BY created, email", id); }
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

  /** Who is this? Admins who aren't in a household yet get one, so they can use the app. */
  whoIs(email, { admin = false } = {}) {
    let m = this.member(email);
    if (!m && admin) {
      const id = newId(), first = email.split("@")[0];
      const name = first.charAt(0).toUpperCase() + first.slice(1);
      this.insertHousehold(id, "Home");
      this.insertMember(email, id, name, "admin");
      m = this.member(email);
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
    const households = this.rows("SELECT id, name, created FROM households ORDER BY created");
    return { households: households.map((h) => ({ ...h, members: this.householdMembers(h.id) })), people: this.peopleCount(), limits: LIMITS, lastSync: JSON.parse(this.meta("lastSync") || "null") };
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

  allEmails() { return this.rows("SELECT email FROM members ORDER BY email").map((r) => r.email); }
  recordSync(result) { this.setMeta("lastSync", JSON.stringify({ ...result, at: this.now() })); }
}
