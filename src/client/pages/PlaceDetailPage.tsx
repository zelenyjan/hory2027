import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { qk } from '../lib/queries';
import { COMMENT_MAX } from '@shared/schemas';
import { formatRelative } from '../lib/format';
import { useSession } from '../lib/session';
import { PlaceCard } from '../components/places/PlaceCard';
import { Avatar, ConfirmButton, ErrorNote, Spinner } from '../components/ui';

export function PlaceDetailPage() {
  const me = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const id = Number(useParams().id);
  const [draft, setDraft] = useState('');

  const place = useQuery({
    queryKey: qk.accommodation(id),
    queryFn: () => api.accommodation(id),
    retry: false,
  });
  const comments = useQuery({ queryKey: qk.comments(id), queryFn: () => api.comments(id) });

  // The comment tally lives on the accommodation payload, in both the list and the detail cache.
  const invalidateCounts = () => {
    void queryClient.invalidateQueries({ queryKey: ['accommodations'] });
    void queryClient.invalidateQueries({ queryKey: ['accommodation'] });
  };

  const addComment = useMutation({
    mutationFn: () => api.addComment(id, draft.trim()),
    onSuccess: (list) => {
      queryClient.setQueryData(qk.comments(id), list);
      invalidateCounts();
      setDraft('');
    },
  });

  const deleteComment = useMutation({
    mutationFn: (commentId: number) => api.deleteComment(commentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.comments(id) });
      invalidateCounts();
    },
  });

  if (place.isError) {
    return (
      <div className="p-6 text-center">
        <p className="text-ink-soft">This place is gone.</p>
        <Link to="/places" className="mt-4 btn-ghost">
          Back to Places
        </Link>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <button className="mb-3 btn-ghost px-3 py-1.5 text-sm" onClick={() => navigate('/places')}>
        ← Places
      </button>

      {place.isPending && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}
      {place.data && <PlaceCard place={place.data} />}

      <h3 className="mt-6 mb-2 font-semibold">Discussion</h3>
      <ul className="space-y-3">
        {comments.data?.map((comment) => (
          <li key={comment.id} className="flex gap-2.5">
            <Avatar name={comment.userName} size={32} />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-ink-soft">
                {comment.userName} · {formatRelative(comment.createdAt)}
              </p>
              <p className={`text-sm wrap-anywhere ${comment.deleted ? 'italic opacity-60' : ''}`}>
                {comment.deleted ? 'comment deleted' : comment.body}
              </p>
            </div>
            {!comment.deleted && (comment.userId === me.id || me.role === 'admin') && (
              <ConfirmButton
                label="✕"
                confirmLabel="Delete this comment?"
                onConfirm={() => deleteComment.mutate(comment.id)}
                className="text-xs text-ink-soft hover:text-bad"
              />
            )}
          </li>
        ))}
      </ul>
      {comments.data?.length === 0 && (
        <p className="text-sm text-ink-soft">No comments yet. Start the debate.</p>
      )}

      <form
        className="mt-4 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) addComment.mutate();
        }}
      >
        <textarea
          className="min-h-11 field flex-1 resize-none py-2.5"
          rows={1}
          maxLength={COMMENT_MAX}
          placeholder="Add a comment…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="btn-primary h-11 px-4" disabled={!draft.trim() || addComment.isPending}>
          Post
        </button>
      </form>
      <ErrorNote error={addComment.error} />
    </div>
  );
}
