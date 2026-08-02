import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { mentionTokens } from '@shared/names';
import { COMMENT_MAX } from '@shared/schemas';
import { api } from '../lib/api';
import { formatRelative } from '../lib/format';
import { placeHeading, placeImageUrl } from '../lib/places';
import { qk } from '../lib/queries';
import { useSession } from '../lib/session';
import { MentionComposer } from '../components/chat/MentionComposer';
import { MentionText } from '../components/MentionText';
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
  const members = useQuery({ queryKey: qk.members, queryFn: api.members });

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
        <p className="text-ink-soft">Toto místo už neexistuje.</p>
        <Link to="/places" className="mt-4 btn-ghost">
          Zpět na Ubytování
        </Link>
      </div>
    );
  }

  const data = place.data;
  const imageUrl = data ? placeImageUrl(data) : null;
  const hasVotes = data ? data.up.length + data.down.length > 0 : false;

  return (
    <div className="h-full overflow-y-auto p-4">
      <button className="mb-3 btn-ghost px-3 py-1.5 text-sm" onClick={() => navigate('/places')}>
        ← Ubytování
      </button>

      {place.isPending && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}

      {data && (
        <>
          {imageUrl && (
            <div className="mb-4 overflow-hidden rounded-2xl border border-line/70 bg-surface-2">
              <img
                src={imageUrl}
                alt={placeHeading(data)}
                className="aspect-[16/9] w-full object-cover"
              />
            </div>
          )}

          <PlaceCard place={data} compact hideImage />

          {(data.ogTitle || data.ogDescription) && (
            <section className="mt-4 card p-4">
              <h3 className="mb-2 text-sm font-semibold text-ink-soft">Z náhledu odkazu</h3>
              <dl className="space-y-2 text-sm">
                {data.ogTitle && (
                  <div>
                    <dt className="text-xs text-ink-soft">Název</dt>
                    <dd className="wrap-anywhere font-medium">{data.ogTitle}</dd>
                  </div>
                )}
                {data.ogDescription && (
                  <div>
                    <dt className="text-xs text-ink-soft">Popis</dt>
                    <dd className="wrap-anywhere text-ink-soft">{data.ogDescription}</dd>
                  </div>
                )}
              </dl>
              <p className="mt-3 text-xs text-ink-soft">
                Načteno automaticky z odkazu — nejde upravit. Booking a Airbnb to často blokují.
              </p>
            </section>
          )}

          <section className="mt-4 card p-4">
            <h3 className="mb-3 font-semibold">Hlasy</h3>
            {!hasVotes && <p className="text-sm text-ink-soft">Zatím nikdo nehlasoval.</p>}
            {data.up.length > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 text-xs font-medium text-good">👍 Palec nahoru</p>
                <ul className="flex flex-wrap gap-2">
                  {data.up.map((voter) => (
                    <li
                      key={voter.userId}
                      className="inline-flex items-center gap-1.5 rounded-full border border-good/30 bg-good/10 px-2.5 py-1 text-sm"
                    >
                      <Avatar name={voter.name} size={22} />
                      {voter.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.down.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-bad">👎 Palec dolů</p>
                <ul className="flex flex-wrap gap-2">
                  {data.down.map((voter) => (
                    <li
                      key={voter.userId}
                      className="inline-flex items-center gap-1.5 rounded-full border border-bad/30 bg-bad/10 px-2.5 py-1 text-sm"
                    >
                      <Avatar name={voter.name} size={22} />
                      {voter.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </>
      )}

      <h3 className="mt-6 mb-2 font-semibold">Diskuze</h3>
      <ul className="space-y-3">
        {comments.data?.map((comment) => (
          <li key={comment.id} className="flex gap-2.5">
            <Avatar name={comment.userName} size={32} />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-ink-soft">
                {comment.userName} · {formatRelative(comment.createdAt)}
              </p>
              <p className={`text-sm wrap-anywhere ${comment.deleted ? 'italic opacity-60' : ''}`}>
                {comment.deleted ? (
                  'komentář smazán'
                ) : (
                  <MentionText
                    text={comment.body}
                    mentionNames={[
                      ...new Set(
                        (comment.mentions ?? []).flatMap((mention) => {
                          const member = members.data?.find((m) => m.id === mention.userId);
                          return member
                            ? mentionTokens(member)
                            : [mention.name];
                        }),
                      ),
                    ]}
                  />
                )}
              </p>
            </div>
            {!comment.deleted && (comment.userId === me.id || me.role === 'admin') && (
              <ConfirmButton
                label="✕"
                confirmLabel="Smazat tento komentář?"
                onConfirm={() => deleteComment.mutate(comment.id)}
                className="text-xs text-ink-soft hover:text-bad"
              />
            )}
          </li>
        ))}
      </ul>
      {comments.data?.length === 0 && (
        <p className="text-sm text-ink-soft">Zatím žádné komentáře. Začni debatu.</p>
      )}

      <form
        className="mt-4 flex items-stretch gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) addComment.mutate();
        }}
      >
        <MentionComposer
          value={draft}
          onChange={setDraft}
          members={members.data ?? []}
          selfId={me.id}
          maxLength={COMMENT_MAX}
          placeholder="Přidej komentář… (@jméno)"
          onSubmit={() => {
            if (draft.trim()) addComment.mutate();
          }}
        />
        <button
          type="submit"
          className="btn-primary shrink-0 self-stretch px-4 py-0"
          disabled={!draft.trim() || addComment.isPending}
        >
          Odeslat
        </button>
      </form>
      <ErrorNote error={addComment.error} />
    </div>
  );
}
