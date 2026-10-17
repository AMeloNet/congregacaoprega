import { useEffect, useState } from 'react';
import type { EquipmentContext } from './EquipmentPanel.js';
import { ScheduleAlertsPanel } from './ScheduleAlertsPanel.js';
import { PublisherProfilePanel } from './PublisherProfilePanel.js';
type Inbox = {
  invitations: {
    id: string;
    date: string;
    startHour: number;
    duration: number;
    pointName: string;
    state: string;
    expiresAt: string;
  }[];
  notices: {
    id: string;
    message: string;
    readAt: string | null;
    mailState: string;
  }[];
};
const states: Record<string, string> = {
  pending: 'Pendente',
  accepted: 'Aceito',
  declined: 'Recusado',
  revoked: 'Retirado',
  expired: 'Expirado',
  superseded: 'Substituído',
  cancelled: 'Cancelado',
};
export function ReservationInboxPanel({
  context,
}: {
  context: EquipmentContext;
}) {
  const [data, setData] = useState<Inbox | null>(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const base = `/api/congregations/${encodeURIComponent(context.congregationId)}`;
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    void fetch(`${base}/reservation-inbox`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Não foi possível carregar convites e avisos.');
        const result = (await response.json()) as Inbox;
        if (!controller.signal.aborted) setData(result);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError((failure as Error).message);
      });
    return () => controller.abort();
  }, [base, revision]);
  async function act(path: string) {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const response = await fetch(`${base}/${path}`, {
        method: 'POST',
        headers: { 'x-csrf-token': context.csrfToken },
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message ?? 'Não foi possível concluir.');
      setMessage(
        result.state === 'accepted'
          ? 'Convite aceito. Convites conflitantes foram recusados automaticamente.'
          : 'Alteração registrada.',
      );
      setRevision((r) => r + 1);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Convites e avisos reais">
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!data && !error && <p>Carregando convites e avisos…</p>}
      <h2>Seus convites</h2>
      {data?.invitations.length === 0 && <p>Nenhum convite recebido.</p>}
      {data?.invitations.map((i) => (
        <article className="panel" key={i.id}>
          <h3>
            {i.date.split('-').reverse().join('/')} · {i.pointName}
          </h3>
          <p>
            {String(i.startHour).padStart(2, '0')}:00 · {i.duration} hora(s) ·{' '}
            {states[i.state] ?? i.state}
          </p>
          {i.state === 'pending' && (
            <>
              <p>
                O aceite confirma sua participação e recusa outros convites
                conflitantes.
              </p>
              <button
                className="button primary"
                disabled={busy}
                onClick={() =>
                  void act(`reservation-invitations/${i.id}/accept`)
                }
              >
                Aceitar convite
              </button>
              <button
                className="button outline"
                disabled={busy}
                onClick={() =>
                  void act(`reservation-invitations/${i.id}/decline`)
                }
              >
                Recusar convite
              </button>
            </>
          )}
        </article>
      ))}
      <h2>Avisos</h2>
      {data?.notices.length === 0 && <p>Nenhum aviso.</p>}
      {data?.notices.map((n) => (
        <article className="panel" key={n.id}>
          <p>{n.message}</p>
          <p>
            {n.mailState === 'captured'
              ? 'E-mail em captura de teste; sem entrega externa.'
              : n.mailState === 'failed'
                ? 'E-mail com falha; nova tentativa pendente.'
                : n.mailState === 'sent'
                  ? 'E-mail enviado.'
                  : 'E-mail aguardando processamento.'}
          </p>
          {!n.readAt && (
            <button
              className="button outline"
              disabled={busy}
              onClick={() => void act(`schedule-notices/${n.id}/read`)}
            >
              Marcar como lido
            </button>
          )}
        </article>
      ))}
      {context.canManage && <ScheduleAlertsPanel context={context} />}
      <PublisherProfilePanel context={context} />
    </section>
  );
}
