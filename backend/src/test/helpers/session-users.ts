/**
 * Fragment de script backend (voir `runBackendScript`) qui crée des utilisateurs directement en
 * base avec une session valide, pour tester les contrôles d'appartenance entre comptes.
 * Nécessite `db` importé au préalable dans le script.
 */
export const sessionUserHelpers = `
const { authRepository } = await import("./repositories/auth/auth.repository.ts");
const { hashToken } = await import("./services/auth/auth-user.mapper.ts");
function createUserWithSession(username) {
  db.prepare("INSERT INTO users (username, password_hash) VALUES (?, 'hash')").run(username);
  const id = db.prepare("SELECT id FROM users WHERE username = ?").get(username).id;
  const token = "session-token-" + username;
  authRepository.insertSession({ userId: id, tokenHash: hashToken(token), expiresAt: Math.floor(Date.now() / 1000) + 3600 });
  return { id, cookie: "pea_session=" + token };
}
`;
