import { useState, type FormEvent } from 'react';
import type { EquipmentContext } from './EquipmentPanel.js';
export type ManagedReservationInvitation = {
  id: string;
  reservationId: string;
  recipientEmail: string;
  state: string;
  expiresAt: string;
};
export function ReservationInvitationsForm({
  context,
  reservationId,
  invitations,
  onSaved,
}: {
  context: EquipmentContext;
  reservationId: string;
  invitations: ManagedReservationInvitation[];
  onSaved: () => void;
}) {
  const [email, setEmail] = useState(''),
    [key, setKey] = useState(() => crypto.randomUUID()),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const base = `/api/congregations/${encodeURIComponent(context.congregationId)}`;
  async function act(path: string, body?: unknown) {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const response = await fetch(`${base}/${path}`, {
        method: 'POST',
        headers: {
          'x-csrf-token': context.csrfToken,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message ?? 'Não foi possível alterar o convite.',
        );
      setMessage('Convite atualizado.');
      setEmail('');
      setKey(crypto.randomUUID());
      onSaved();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function send(event: FormEvent) {
    event.preventDefault();
    void act(`reservations/${reservationId}/invitations`, {
      requestKey: key,
      recipientEmail: email,
    });
  }
  return (
    <details>
      <summary>Gerenciar convites</summary>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <form onSubmit={send}>
        <label htmlFor={`invite-${reservationId}`}>
          E-mail do publicador desta congregação
        </label>
        <input
          type="email"
          id={`invite-${reservationId}`}
          required
          value={email}
          disabled={busy}
          onChange={(event) => {
            setEmail(event.target.value);
            setKey(crypto.randomUUID());
          }}
        />
        <button className="button outline" disabled={busy}>
          Convidar publicador
        </button>
      </form>
      {invitations.map((i) => (
        <div key={i.id}>
          <p>
            {i.recipientEmail} ·{' '}
            {i.state === 'pending'
              ? 'Pendente'
              : i.state === 'expired'
                ? 'Expirado'
                : i.state === 'accepted'
                  ? 'Aceito'
                  : 'Encerrado'}
          </p>
          {i.state === 'pending' && (
            <button
              className="button outline"
              disabled={busy}
              onClick={() => void act(`reservation-invitations/${i.id}/revoke`)}
            >
              Retirar convite
            </button>
          )}
          {['pending', 'expired'].includes(i.state) && (
            <button
              className="button outline"
              disabled={busy}
              onClick={() => void act(`reservation-invitations/${i.id}/resend`)}
            >
              Reenviar convite
            </button>
          )}
        </div>
      ))}
    </details>
  );
}
