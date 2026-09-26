import type { Store } from '../../data/storage/database.js';
import { config } from '../../gateway/config.js';
import { AuthService, GLOBAL_ADMIN_CODE } from './service.js';
import { hashPassword } from './crypto.js';
export async function initAuth(store: Store) {
  for (const sql of [
    "CREATE TABLE IF NOT EXISTS users (user_code TEXT PRIMARY KEY, email TEXT NOT NULL, email_lookup TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, must_change_password INTEGER NOT NULL DEFAULT 0, two_factor_secret TEXT, two_factor_enabled INTEGER NOT NULL DEFAULT 0, password_changed_at TEXT, last_login_at TEXT, last_seen_at TEXT, blocked_at TEXT, blocked_reason TEXT, last_totp_step BIGINT NOT NULL DEFAULT -1)",
    'CREATE TABLE IF NOT EXISTS user_module_access (user_code TEXT NOT NULL REFERENCES users(user_code), module_id TEXT NOT NULL, PRIMARY KEY(user_code,module_id))',
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_user_module_access_single_core ON user_module_access(module_id) WHERE module_id='CORE'",
    'CREATE TABLE IF NOT EXISTS sessions (session_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, user_code TEXT NOT NULL REFERENCES users(user_code), expires_at BIGINT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT, last_seen_at TEXT, last_rotated_at TEXT, elevated INTEGER NOT NULL DEFAULT 0)',
    'CREATE TABLE IF NOT EXISTS account_activation_tokens (token_hash TEXT PRIMARY KEY, user_code TEXT NOT NULL REFERENCES users(user_code), expires_at BIGINT NOT NULL, password_set_at TEXT, used_at TEXT)',
    'CREATE TABLE IF NOT EXISTS password_reset_tokens (token_hash TEXT PRIMARY KEY, user_code TEXT NOT NULL REFERENCES users(user_code), expires_at BIGINT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL, used_at TEXT)',
    "CREATE TABLE IF NOT EXISTS access_requests (id TEXT PRIMARY KEY, request_code TEXT NOT NULL UNIQUE, requested_module TEXT NOT NULL, email TEXT NOT NULL, email_lookup TEXT NOT NULL, name TEXT NOT NULL, requested_scopes TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, decided_at TEXT, decided_by TEXT, decision_note TEXT)",
    'CREATE TABLE IF NOT EXISTS auth_settings (setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL, updated_at TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS auth_failures (identifier TEXT PRIMARY KEY, failures INTEGER NOT NULL, locked_until BIGINT NOT NULL)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_code,expires_at)',
    'CREATE INDEX IF NOT EXISTS idx_auth_requests_email ON access_requests(email_lookup,status)'
  ]) await store.sql(sql);
  await store.sql("INSERT INTO auth_settings(setting_key,setting_value,updated_at) VALUES ('inactive_lock_days','90',?) ON CONFLICT(setting_key) DO NOTHING", [new Date().toISOString()]);
  if (config.AUTH_MODE === 'native' && !(await store.sql('SELECT 1 FROM users WHERE user_code=?', [GLOBAL_ADMIN_CODE])).length) {
    if (!config.IRIS_ADMIN_EMAIL || !config.IRIS_ADMIN_FIRST_PASSWORD) {
      throw new Error('Configure IRIS_ADMIN_EMAIL e IRIS_ADMIN_FIRST_PASSWORD no .env para criar a conta administradora AG000001.');
    }
    const passwordHash = await hashPassword(config.IRIS_ADMIN_FIRST_PASSWORD);
    await store.transaction(async () => {
      if ((await store.sql('SELECT 1 FROM users WHERE user_code=?', [GLOBAL_ADMIN_CODE])).length) return;
      await new AuthService(store).createUser({ code: GLOBAL_ADMIN_CODE, email: config.IRIS_ADMIN_EMAIL, name: 'Administrador', role: 'admin', passwordHash, scopes: ['CORE'], mustChange: 1 });
    });
  }
}
