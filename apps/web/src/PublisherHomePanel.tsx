import { useEffect, useState } from 'react';
import type { EquipmentContext } from './EquipmentPanel.js';

type Invitation = {
  id: string;
  date: string;
  startHour: number;
  duration: number;
  pointName: string;
  state: string;
};
type Reservation = {
  id: string;
  date: string;
  startHour: number;
  duration: number;
  pointName: string;
  isResponsible: boolean;
  isParticipant?: boolean;
};
type Participant = { accountId: string; position: number; name: string };
type Detail = { id: string; participants: Participant[] };
type Schedule = { reservations?: Reservation[] };
type Inbox = { invitations: Invitation[] };

function dateLabel(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(date);
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${date.toLocaleDateString(
    'pt-BR',
    {
      timeZone: 'UTC',
    },
  )}`;
}

function hours(startHour: number, duration: number): string {
  return `${String(startHour).padStart(2, '0')}:00–${String((startHour + duration) % 24).padStart(2, '0')}:00`;
}

export function PublisherHomePanel({
  context,
  onNavigate,
}: {
  context: EquipmentContext;
  onNavigate: (screen: 'programacao' | 'nova-reserva' | 'convites') => void;
}) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [revision, setRevision] = useState(0);
  const base = `/api/congregations/${encodeURIComponent(context.congregationId)}`;

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setDetails({});
    void Promise.all([
      fetch(`${base}/reservation-inbox`, { signal: controller.signal }),
      fetch(`${base}/schedule`, { signal: controller.signal }),
    ])
      .then(async ([inboxResponse, scheduleResponse]) => {
        if (!inboxResponse.ok || !scheduleResponse.ok)
          throw new Error('Não foi possível carregar sua página inicial.');
        const inbox = (await inboxResponse.json()) as Inbox;
        const schedule = (await scheduleResponse.json()) as Schedule;
        if (controller.signal.aborted) return;
        const mine = (schedule.reservations ?? [])
          .filter((item) => item.isResponsible || item.isParticipant)
          .sort(
            (left, right) =>
              left.date.localeCompare(right.date) ||
              left.startHour - right.startHour,
          );
        setInvitations(
          inbox.invitations.filter((item) => item.state === 'pending'),
        );
        setReservations(mine);
        const loaded = await Promise.all(
          mine.map(async (reservation) => {
            const response = await fetch(
              `${base}/reservations/${reservation.id}`,
              {
                signal: controller.signal,
              },
            );
            if (!response.ok)
              throw new Error('Não foi possível carregar uma designação.');
            return (await response.json()) as Detail;
          }),
        );
        if (!controller.signal.aborted)
          setDetails(Object.fromEntries(loaded.map((item) => [item.id, item])));
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError((failure as Error).message);
      });
    return () => controller.abort();
  }, [base, revision]);

  async function invitationAction(id: string, action: 'accept' | 'decline') {
    setBusy(id);
    setError('');
    setMessage('');
    try {
      const response = await fetch(
        `${base}/reservation-invitations/${id}/${action}`,
        { method: 'POST', headers: { 'x-csrf-token': context.csrfToken } },
      );
      const result = (await response.json()) as { message?: string };
      if (!response.ok)
        throw new Error(
          result.message ?? 'Não foi possível alterar o convite.',
        );
      setMessage(
        action === 'accept'
          ? 'Convite aceito. Sua designação foi atualizada.'
          : 'Convite recusado.',
      );
      setRevision((value) => value + 1);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="publisher-home" aria-label="Resumo do publicador">
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {invitations.length > 0 && (
        <section aria-labelledby="home-invitations">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">AÇÃO NECESSÁRIA</p>
              <h2 id="home-invitations">Seus convites</h2>
            </div>
            <button
              className="text-button"
              type="button"
              onClick={() => onNavigate('convites')}
            >
              Ver todos →
            </button>
          </div>
          <div className="schedule-list">
            {invitations.map((invitation) => (
              <article className="schedule-card" key={invitation.id}>
                <div className="schedule-info">
                  <h3>{dateLabel(invitation.date)}</h3>
                  <p className="card-title">{invitation.pointName}</p>
                  <p>{hours(invitation.startHour, invitation.duration)}</p>
                </div>
                <div className="card-actions">
                  <button
                    className="button primary"
                    type="button"
                    disabled={busy === invitation.id}
                    onClick={() =>
                      void invitationAction(invitation.id, 'accept')
                    }
                  >
                    Aceitar convite
                  </button>
                  <button
                    className="button outline"
                    type="button"
                    disabled={busy === invitation.id}
                    onClick={() =>
                      void invitationAction(invitation.id, 'decline')
                    }
                  >
                    Recusar
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      <section aria-labelledby="home-reservations">
        <div className="section-heading compact-heading">
          <div>
            <p className="eyebrow">SUA AGENDA</p>
            <h2 id="home-reservations">Suas designações</h2>
          </div>
        </div>
        {reservations.length === 0 && (
          <p>Nenhuma designação reservada para você.</p>
        )}
        <div className="schedule-list">
          {reservations.map((reservation) => {
            const participants = details[reservation.id]?.participants;
            return (
              <article
                className="schedule-card publisher-assignment"
                key={reservation.id}
              >
                <div className="schedule-info">
                  <h3>{dateLabel(reservation.date)}</h3>
                  <p className="card-title">{reservation.pointName}</p>
                  <p>{hours(reservation.startHour, reservation.duration)}</p>
                  {!participants && <p>Carregando publicadores…</p>}
                  {participants && (
                    <ul
                      className="assignment-people"
                      aria-label="Publicadores designados"
                    >
                      {participants.map((person) => (
                        <li key={person.accountId}>
                          <strong>
                            {person.position === 1
                              ? 'Responsável: '
                              : 'Publicador: '}
                          </strong>
                          {person.name || 'Nome ainda não informado'}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
      <div className="home-categories publisher-actions">
        <button
          className="home-category"
          type="button"
          onClick={() => onNavigate('programacao')}
        >
          <strong>Ver programação da congregação</strong>
        </button>
        <button
          className="home-category"
          type="button"
          onClick={() => onNavigate('nova-reserva')}
        >
          <strong>Reservar ponto e horário</strong>
        </button>
      </div>
    </section>
  );
}
