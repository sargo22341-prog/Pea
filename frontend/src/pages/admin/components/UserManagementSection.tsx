import type { AdminManagedUser } from "@pea/shared";
import { RefreshCcw, Trash2, UserPlus, Users } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ConfirmDialog } from "../../../components/common/feedback/ConfirmDialog";
import { Collapsible, Toast, type SettingsToast } from "../../../components/common/feedback";
import { api } from "../../../lib/api";

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function UserManagementSection() {
  const [users, setUsers] = useState<AdminManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pendingDelete, setPendingDelete] = useState<AdminManagedUser | null>(null);
  const [toast, setToast] = useState<SettingsToast | null>(null);

  async function load() {
    setLoading(true);
    setToast(null);
    try {
      setUsers(await api.adminUsers());
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : "Utilisateurs indisponibles" });
    } finally {
      setLoading(false);
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setToast(null);
    try {
      const created = await api.createAdminUser({ username, password });
      setUsers((current) => [...current, created].sort((a, b) => a.id - b.id));
      setUsername("");
      setPassword("");
      setToast({ tone: "success", text: `${created.username} ajoute comme utilisateur standard.` });
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : "Creation impossible" });
    } finally {
      setCreating(false);
    }
  }

  async function deleteUser(user: AdminManagedUser) {
    setPendingDelete(null);
    setToast(null);
    try {
      await api.deleteAdminUser(user.id);
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setToast({ tone: "success", text: `${user.username} supprime.` });
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : "Suppression impossible" });
      await load();
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <Collapsible title="Manager users">
      {toast && <Toast tone={toast.tone}>{toast.text}</Toast>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3 rounded-md border border-line bg-panel2/70 p-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-sky/40 bg-sky/10 text-sky">
            <Users size={18} />
          </div>
          <div className="min-w-0">
            <p className="muted">Comptes applicatifs</p>
            <p className="text-sm font-semibold">{loading ? "Chargement..." : `${users.length} utilisateur${users.length > 1 ? "s" : ""}`}</p>
          </div>
        </div>
        <button className="btn-ghost shrink-0 gap-2" disabled={loading} onClick={() => void load()} type="button">
          <RefreshCcw size={16} />
          Actualiser
        </button>
      </div>

      <form className="grid gap-3 rounded-md border border-line bg-panel2/50 p-4 md:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => void createUser(event)}>
        <label className="space-y-2 text-sm font-medium">
          <span>Username</span>
          <input className="input" disabled={creating} onChange={(event) => setUsername(event.target.value)} required type="text" value={username} />
        </label>
        <label className="space-y-2 text-sm font-medium">
          <span>Mot de passe</span>
          <input className="input" disabled={creating} minLength={10} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
        </label>
        <div className="flex items-end">
          <button className="btn-primary w-full gap-2 md:w-auto" disabled={creating} type="submit">
            <UserPlus size={16} />
            {creating ? "Ajout..." : "Ajouter"}
          </button>
        </div>
        <p className="muted md:col-span-3">Les nouveaux comptes sont toujours crees avec le role utilisateur standard. Le role admin est reserve au compte bootstrap cree pendant le setup initial.</p>
      </form>

      <UsersTable loading={loading} onDelete={setPendingDelete} users={users} />

      {pendingDelete ? (
        <ConfirmDialog
          danger
          confirmLabel="Supprimer"
          description={`Cette action supprimera le compte ${pendingDelete.username} et ses donnees associees. Le compte administrateur bootstrap et votre session courante sont proteges cote serveur.`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void deleteUser(pendingDelete)}
          title={`Supprimer ${pendingDelete.username} ?`}
        />
      ) : null}
    </Collapsible>
  );
}

function UsersTable({ loading, onDelete, users }: { loading: boolean; onDelete: (user: AdminManagedUser) => void; users: AdminManagedUser[] }) {
  if (loading) return <p className="muted">Chargement des utilisateurs...</p>;
  if (!users.length) return <p className="muted">Aucun utilisateur pour le moment.</p>;

  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-panel2/80 text-xs uppercase text-slate-400">
          <tr>
            <th className="p-3">Username</th>
            <th className="p-3">Role</th>
            <th className="p-3">Creation</th>
            <th className="p-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {users.map((user) => (
            <tr key={user.id}>
              <td className="p-3 font-semibold">{user.username}</td>
              <td className="p-3 text-slate-300">
                <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${user.role === "admin" ? "border-amber/40 bg-amber/10 text-amber" : "border-sky/40 bg-sky/10 text-sky"}`}>
                  {user.role}
                </span>
              </td>
              <td className="p-3 text-slate-300">{formatDate(user.createdAt)}</td>
              <td className="p-3 text-right">
                {user.isProtectedAdmin ? (
                  <span className="muted">Protege</span>
                ) : (
                  <button aria-label={`Supprimer ${user.username}`} className="btn-ghost px-2 text-coral" onClick={() => onDelete(user)} type="button">
                    <Trash2 size={16} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
