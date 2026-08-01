import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminUser } from '@shared/types';
import { api } from '../lib/api';
import { qk } from '../lib/queries';
import { formatRelative } from '../lib/format';
import { ConfirmButton, ErrorNote, Sheet, Spinner } from '../components/ui';

function InviteSheet({
  invite,
  onClose,
}: {
  invite: { name: string; url: string } | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <Sheet open={invite !== null} title={`Invite link for ${invite?.name ?? ''}`} onClose={onClose}>
      <p className="mb-3 text-sm text-ink-soft">
        This link is shown once and works as {invite?.name}&rsquo;s permanent login. Send it to them
        directly.
      </p>
      <code className="block rounded-xl bg-surface-2 p-3 text-xs break-all">{invite?.url}</code>
      <button
        className="mt-3 btn-primary w-full"
        onClick={async () => {
          await navigator.clipboard.writeText(invite?.url ?? '');
          setCopied(true);
        }}
      >
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </Sheet>
  );
}

function UserRow({
  user,
  onInvite,
}: {
  user: AdminUser;
  onInvite: (invite: { name: string; url: string }) => void;
}) {
  const queryClient = useQueryClient();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(user.name);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.adminUsers });

  const regenerate = useMutation({
    mutationFn: () => api.regenerateInvite(user.id),
    onSuccess: (result) => {
      onInvite({ name: user.name, url: result.inviteUrl });
      void invalidate();
    },
  });
  const revoke = useMutation({
    mutationFn: () => api.revokeInvite(user.id),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: (patch: { name?: string; active?: boolean }) => api.updateUser(user.id, patch),
    onSuccess: () => {
      setRenaming(false);
      void invalidate();
    },
  });

  const status = [
    user.role === 'admin' ? 'admin' : null,
    user.active ? null : 'deactivated',
    user.hasPassword ? 'password set' : 'no password',
    user.role === 'admin' ? null : user.inviteRevoked ? 'link revoked' : 'link active',
  ].filter(Boolean);

  return (
    <li className="card p-3.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                update.mutate({ name: name.trim() });
              }}
            >
              <input
                className="field py-1.5"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button className="btn-primary px-3 py-1.5 text-xs">Save</button>
            </form>
          ) : (
            <p className="font-medium wrap-anywhere">{user.name}</p>
          )}
          <p className="mt-0.5 text-xs text-ink-soft">
            {status.join(' · ')} · seen {formatRelative(user.lastSeenAt)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setRenaming(!renaming)}>
          {renaming ? 'Cancel' : 'Rename'}
        </button>
        {user.role !== 'admin' && (
          <>
            <ConfirmButton
              label={user.hasInvite ? 'New link' : 'Create link'}
              confirmLabel="Generate a new invite link? The old one stops working."
              onConfirm={() => regenerate.mutate()}
              pending={regenerate.isPending}
            />
            {!user.inviteRevoked && user.hasInvite && (
              <ConfirmButton
                label="Revoke link"
                confirmLabel={`Revoke ${user.name}'s invite link?`}
                onConfirm={() => revoke.mutate()}
                pending={revoke.isPending}
              />
            )}
            <ConfirmButton
              label={user.active ? 'Deactivate' : 'Reactivate'}
              confirmLabel={
                user.active
                  ? `Deactivate ${user.name}? Their sessions end and both logins stop working. Their messages stay.`
                  : `Reactivate ${user.name}?`
              }
              onConfirm={() => update.mutate({ active: !user.active })}
              pending={update.isPending}
              className={`btn-ghost px-3 py-1.5 text-xs ${user.active ? 'text-bad' : ''}`}
            />
          </>
        )}
      </div>
      <ErrorNote error={update.error ?? regenerate.error ?? revoke.error} />
    </li>
  );
}

export function AdminPage() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [invite, setInvite] = useState<{ name: string; url: string } | null>(null);

  const users = useQuery({ queryKey: qk.adminUsers, queryFn: api.adminUsers });

  const createUser = useMutation({
    mutationFn: () => api.createUser(newName.trim()),
    onSuccess: (result) => {
      setInvite({ name: result.name, url: result.inviteUrl });
      setNewName('');
      void queryClient.invalidateQueries({ queryKey: qk.adminUsers });
    },
  });

  return (
    <div className="h-full overflow-y-auto p-4">
      <h2 className="mb-4 gradient-text text-xl font-bold tracking-tight">Admin</h2>

      <form
        className="mb-5 flex gap-2 card p-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          createUser.mutate();
        }}
      >
        <input
          className="field"
          placeholder="Add someone by name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          required
        />
        <button className="btn-primary shrink-0" disabled={createUser.isPending}>
          Add
        </button>
      </form>
      <ErrorNote error={createUser.error} />

      {users.isPending && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}
      <ul className="space-y-2.5">
        {users.data?.map((user) => (
          <UserRow key={user.id} user={user} onInvite={setInvite} />
        ))}
      </ul>

      <InviteSheet invite={invite} onClose={() => setInvite(null)} />
    </div>
  );
}
