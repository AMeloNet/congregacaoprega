import { useState, type FormEvent } from 'react';
import type { EquipmentContext } from './EquipmentPanel.js';
export function ReservationExitControls({
  context,
  reservationId,
  series,
  canCancel,
  canLeave,
  onSaved,
}: {
  context: EquipmentContext;
  reservationId: string;
  series: boolean;
  canCancel: boolean;
  canLeave: boolean;
  onSaved: () => void;
}) {
  const [scope, setScope] = useState(''),
    [key, setKey] = useState(() => crypto.randomUUID()),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent, action: 'cancel' | 'leave') {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const response = await fetch(
        `/api/congregations/${encodeURIComponent(context.congregationId)}/reservations/${reservationId}/${action}`,
        {
          method: 'POST',
          headers: {
            'x-csrf-token': context.csrfToken,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            requestKey: key,
            ...(action === 'cancel' ? { scope } : {}),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message ?? 'Não foi possível concluir.');
      onSaved();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {canCancel && (
        <details>
          <summary>Cancelar reserva</summary>
          <form onSubmit={(event) => void submit(event, 'cancel')}>
            <p>
              Os participantes e convidados serão avisados. O tempo já decorrido
              será conservado no limite diário.
            </p>
            <label htmlFor={`cancel-${reservationId}`}>
              O que deseja cancelar?
            </label>
            <select
              required
              id={`cancel-${reservationId}`}
              value={scope}
              onChange={(event) => {
                setScope(event.target.value);
                setKey(crypto.randomUUID());
              }}
            >
              <option value="">Selecione</option>
              <option value="date">Somente esta data</option>
              {series && (
                <option value="following">
                  Esta data e as próximas da série
                </option>
              )}
            </select>
            {scope === 'following' && (
              <p>
                Encerra a série e cancela as reservas a partir desta data. Se
                alguma estiver bloqueada, nenhuma será cancelada.
              </p>
            )}
            <button className="button danger" disabled={busy}>
              Confirmar cancelamento
            </button>
          </form>
        </details>
      )}
      {canLeave && (
        <details>
          <summary>Desistir da participação</summary>
          <form onSubmit={(event) => void submit(event, 'leave')}>
            <p>
              Sua vaga será liberada. O responsável e os administradores
              designados serão avisados; o tempo já decorrido será conservado.
            </p>
            <button className="button outline" disabled={busy}>
              Confirmar desistência
            </button>
          </form>
        </details>
      )}
    </>
  );
}
