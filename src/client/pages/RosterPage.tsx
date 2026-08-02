import { useEffect, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Attendee } from '@shared/types';
import { api } from '../lib/api';
import { qk } from '../lib/queries';
import { ConfirmButton, EmptyState, ErrorNote, Spinner } from '../components/ui';

function SortableRow({
  attendee,
  index,
  onRename,
  onDelete,
  pending,
}: {
  attendee: Attendee;
  index: number;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
  pending: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: attendee.id,
  });
  const [draft, setDraft] = useState(attendee.name);

  useEffect(() => {
    setDraft(attendee.name);
  }, [attendee.name]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const commit = () => {
    const next = draft.trim();
    if (!next || next === attendee.name) {
      setDraft(attendee.name);
      return;
    }
    onRename(attendee.id, next);
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 ${isDragging ? 'z-10' : ''}`}
    >
      <span className="w-5 shrink-0 text-center text-xs tabular-nums text-ink-soft">
        {index + 1}
      </span>
      <div
        className={`card flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 ${
          isDragging ? 'opacity-90 shadow-lg' : ''
        }`}
      >
        <button
          type="button"
          className="flex size-10 shrink-0 cursor-grab items-center justify-center rounded-lg text-ink-soft touch-none active:cursor-grabbing"
          aria-label={`Přesunout ${attendee.name}`}
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
        <input
          className="field min-w-0 flex-1 border-transparent bg-transparent px-2 py-2 focus:border-brand focus:bg-surface"
          value={draft}
          disabled={pending}
          maxLength={80}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === 'Escape') {
              setDraft(attendee.name);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <ConfirmButton
          label="✕"
          confirmLabel={`Smazat „${attendee.name}“ ze soupisky?`}
          onConfirm={() => onDelete(attendee.id)}
          pending={pending}
          className="btn-ghost shrink-0 px-3 py-2 text-sm text-bad"
        />
      </div>
    </li>
  );
}

export function RosterPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const attendees = useQuery({ queryKey: qk.attendees, queryFn: api.attendees });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: qk.attendees });

  const create = useMutation({
    mutationFn: () => api.createAttendee(name.trim()),
    onSuccess: () => {
      setName('');
      void invalidate();
    },
  });

  const rename = useMutation({
    mutationFn: ({ id, next }: { id: number; next: string }) => api.updateAttendee(id, next),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.deleteAttendee(id),
    onSuccess: invalidate,
  });

  const reorder = useMutation({
    mutationFn: (ids: number[]) => api.reorderAttendees(ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: qk.attendees });
      const previous = queryClient.getQueryData<Attendee[]>(qk.attendees);
      if (previous) {
        const byId = new Map(previous.map((a) => [a.id, a]));
        queryClient.setQueryData(
          qk.attendees,
          ids
            .map((id, position) => {
              const row = byId.get(id);
              return row ? { ...row, position } : null;
            })
            .filter((row): row is Attendee => row !== null),
        );
      }
      return { previous };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(qk.attendees, ctx.previous);
    },
    onSettled: invalidate,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const items = attendees.data ?? [];

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((a) => a.id === active.id);
    const newIndex = items.findIndex((a) => a.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(items, oldIndex, newIndex);
    reorder.mutate(next.map((a) => a.id));
  };

  const busy = create.isPending || rename.isPending || remove.isPending || reorder.isPending;

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-4">
        <h2 className="gradient-text text-xl font-bold tracking-tight">Kdo jede</h2>
        <p className="mt-0.5 text-xs text-ink-soft">
          Společná soupiska — klidně i jména mimo appku. Přetáhni pro pořadí, klepni na jméno pro
          úpravu.
        </p>
      </div>

      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <input
          className="field"
          placeholder="Jméno"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          disabled={create.isPending}
        />
        <button className="btn-primary shrink-0 px-4" disabled={!name.trim() || create.isPending}>
          Přidat
        </button>
      </form>
      <ErrorNote error={create.error ?? rename.error ?? remove.error ?? reorder.error} />

      {attendees.isPending && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}

      {!attendees.isPending && items.length === 0 && (
        <EmptyState title="Zatím nikdo" hint="Přidej první jméno na soupisku výletu." />
      )}

      {items.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((a) => a.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {items.map((attendee, index) => (
                <SortableRow
                  key={attendee.id}
                  attendee={attendee}
                  index={index}
                  pending={busy}
                  onRename={(id, next) => rename.mutate({ id, next })}
                  onDelete={(id) => remove.mutate(id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
