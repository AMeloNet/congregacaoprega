import {
  ReservationConfigurationForm,
  type ReservationConfiguration,
} from './ReservationConfigurationForm.js';
import { PointPhoto } from './PointPhoto.js';
import { useEffect, useState, type FormEvent } from 'react';
import type { EquipmentContext } from './EquipmentPanel.js';
import type { PublisherOption } from './PublisherProfilePanel.js';
type Detail = ReservationConfiguration & {
  id: string;
  pointName: string;
  date: string;
  startHour: number;
  duration: number;
  revision: string;
  cancelledAt: string | null;
  participants: { accountId: string; position: number; name: string | null }[];
  history: { action: string; createdAt: string }[];
};
export function ReservationDetailsPanel({
  context,
  reservationId,
  onSaved = () => {},
}: {
  context: EquipmentContext;
  reservationId: string;
  onSaved?: () => void;
}) {
  const [data, setData] = useState<Detail | null>(null),
    [directory, setDirectory] = useState<PublisherOption[]>([]),
    [action, setAction] = useState(''),
    [target, setTarget] = useState(''),
    [key, setKey] = useState(() => crypto.randomUUID()),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const base = `/api/congregations/${encodeURIComponent(context.congregationId)}`;
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    void (async () => {
      const response = await fetch(`${base}/reservations/${reservationId}`, {
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error('Não foi possível carregar a designação.');
      const result = (await response.json()) as Detail;
      if (!controller.signal.aborted) setData(result);
      if (context.canManage) {
        const people = await fetch(`${base}/reservation-publishers`, {
          signal: controller.signal,
        });
        if (!people.ok)
          throw new Error('Não foi possível carregar os publicadores.');
        const list = (await people.json()) as PublisherOption[];
        if (!controller.signal.aborted) setDirectory(list);
      }
    })().catch((failure) => {
      if (!controller.signal.aborted) setError((failure as Error).message);
    });
    return () => controller.abort();
  }, [base, reservationId, context.canManage, revision]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!data) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(
        `${base}/reservations/${reservationId}/administration`,
        {
          method: 'POST',
          headers: {
            'x-csrf-token': context.csrfToken,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            requestKey: key,
            revision: data.revision,
            action,
            accountId: target,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message ?? 'Não foi possível ajustar a designação.',
        );
      setMessage('Ajuste registrado e avisos disponibilizados.');
      setKey(crypto.randomUUID());
      setAction('');
      setTarget('');
      setRevision((r) => r + 1);
      onSaved();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const eligible = directory.filter((p) => p.status === 'ACTIVE' && p.verified);
  const candidates =
    action === 'include'
      ? eligible.filter(
          (p) =>
            !data?.participants.some((current) => current.accountId === p.id),
        )
      : (data?.participants ?? [])
          .filter((p) => p.position !== 1)
          .map((p) => ({
            id: p.accountId,
            displayName: p.name,
            email:
              directory.find((member) => member.id === p.accountId)?.email ??
              '',
          }));
  return (
    <section aria-label="Detalhes da designação">
      {error && (
        <p role="alert">
          {error}
          <button
            className="button outline"
            onClick={() => setRevision((r) => r + 1)}
          >
            Recarregar designação
          </button>
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {!data && !error && <p>Carregando designação…</p>}
      {data && (
        <>
          <h3>
            {data.date.split('-').reverse().join('/')} · {data.pointName}
          </h3>
          <PointPhoto context={context} pointId={data.pointId} />
          {data.cancelledAt && <p>Reserva cancelada.</p>}
          <ul>
            {data.participants.map((p) => (
              <li key={p.accountId}>
                {p.position === 1 ? 'Responsável' : 'Participante'}:{' '}
                {p.name || 'Nome ainda não informado'}
              </li>
            ))}
          </ul>
          {context.canManage && !data.cancelledAt && (
            <>
              <details>
                <summary>Editar dados da reserva</summary>
                <ReservationConfigurationForm
                  key={data.revision}
                  context={context}
                  reservationId={reservationId}
                  initial={{
                    pointId: data.pointId,
                    date: data.date,
                    startHour: data.startHour,
                    duration: data.duration,
                    equipmentType: data.equipmentType,
                    thirdPositionOpen: data.thirdPositionOpen,
                    revision: data.revision,
                  }}
                  onSaved={() => {
                    setRevision((r) => r + 1);
                    onSaved();
                  }}
                />
              </details>
              <details>
                <summary>Ajustar participantes</summary>
                <form onSubmit={(event) => void submit(event)}>
                  <label htmlFor={`admin-action-${reservationId}`}>
                    Ajuste administrativo
                  </label>
                  <select
                    required
                    id={`admin-action-${reservationId}`}
                    value={action}
                    disabled={busy}
                    onChange={(event) => {
                      setAction(event.target.value);
                      setTarget('');
                      setKey(crypto.randomUUID());
                    }}
                  >
                    <option value="">Selecione</option>
                    <option value="include">Incluir participante</option>
                    <option value="remove">Retirar participante</option>
                    <option value="responsible">Trocar responsável</option>
                  </select>
                  {action && (
                    <>
                      <label htmlFor={`admin-person-${reservationId}`}>
                        Publicador
                      </label>
                      <select
                        required
                        id={`admin-person-${reservationId}`}
                        disabled={busy}
                        value={target}
                        onChange={(event) => {
                          setTarget(event.target.value);
                          setKey(crypto.randomUUID());
                        }}
                      >
                        <option value="">Selecione</option>
                        {candidates.map((p) => (
                          <option value={p.id} key={p.id}>
                            {p.displayName || p.email || 'Nome não informado'}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  {action === 'responsible' && (
                    <p>
                      O responsável anterior sairá do grupo. O participante
                      escolhido assumirá esta data; a série original não será
                      transferida.
                    </p>
                  )}
                  {action === 'remove' && (
                    <p>
                      O participante sairá do grupo e será avisado. O tempo
                      decorrido será conservado.
                    </p>
                  )}
                  <button
                    className="button outline"
                    disabled={busy || !action || !target}
                  >
                    Confirmar ajuste
                  </button>
                </form>
              </details>
            </>
          )}
          {data.history.length > 0 && (
            <details>
              <summary>Histórico da designação</summary>
              <ul>
                {data.history.map((h, index) => (
                  <li key={index}>
                    {h.createdAt} ·{' '}
                    {(
                      {
                        'created-for': 'Reserva criada pelo administrador',
                        'admin-edited':
                          'Dados da reserva alterados pelo administrador',
                        'admin-included':
                          'Participante incluído pelo administrador',
                        'admin-removed':
                          'Participante retirado pelo administrador',
                        'responsible-changed': 'Responsável alterado',
                        'participant-left': 'Desistência',
                        cancelled: 'Cancelamento',
                        'third-position': 'Terceira vaga alterada',
                        'invitation-created': 'Convite enviado',
                        'invitation-accepted': 'Convite aceito',
                        'invitation-resent': 'Convite reenviado',
                        'invitation-declined': 'Convite recusado',
                        'invitation-revoked': 'Convite retirado',
                      } as Record<string, string>
                    )[h.action] ?? 'Alteração registrada'}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
export function ReservationDetailPage({
  context,
}: {
  context: EquipmentContext;
}) {
  const [items, setItems] = useState<
      { id: string; date: string; pointName: string }[]
    >([]),
    [selected, setSelected] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setItems([]);
    setSelected('');
    void fetch(
      `/api/congregations/${encodeURIComponent(context.congregationId)}/schedule`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Não foi possível carregar as designações.');
        const result = await response.json();
        if (!controller.signal.aborted) setItems(result.reservations ?? []);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError((failure as Error).message);
      });
    return () => controller.abort();
  }, [context.congregationId]);
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <label htmlFor="detail-reservation">Designação</label>
      <select
        id="detail-reservation"
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
      >
        <option value="">Selecione</option>
        {items.map((r) => (
          <option key={r.id} value={r.id}>
            {r.date.split('-').reverse().join('/')} · {r.pointName}
          </option>
        ))}
      </select>
      {selected && (
        <ReservationDetailsPanel
          key={selected}
          context={context}
          reservationId={selected}
        />
      )}
    </>
  );
}

export function ReservationDetailsToggle({
  context,
  reservationId,
  onSaved,
}: {
  context: EquipmentContext;
  reservationId: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Participantes e detalhes</summary>
      {open && (
        <ReservationDetailsPanel
          context={context}
          reservationId={reservationId}
          onSaved={onSaved}
        />
      )}
    </details>
  );
}
