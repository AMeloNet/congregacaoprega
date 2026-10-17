import { useEffect, useState, type FormEvent } from 'react';
import type { EquipmentContext } from './EquipmentPanel.js';
type Settings = {
  administrators: { id: string; email: string }[];
  selected: string[];
  alerts: {
    id: string;
    date: string;
    startHour: number;
    pointName: string;
    confirmedAtStart: number;
    cancelledAt: string | null;
  }[];
  mailIssues: {
    id: string;
    mailState: string;
    attempts: number;
    overdue: boolean;
  }[];
};
export function ScheduleAlertsPanel({
  context,
}: {
  context: EquipmentContext;
}) {
  const [data, setData] = useState<Settings | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const url = `/api/congregations/${encodeURIComponent(context.congregationId)}/schedule-alerts`;
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    void fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            'Não foi possível carregar os alertas administrativos.',
          );
        const result = (await response.json()) as Settings;
        if (!controller.signal.aborted) {
          setData(result);
          setSelected(result.selected);
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError((failure as Error).message);
      });
    return () => controller.abort();
  }, [url]);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'x-csrf-token': context.csrfToken,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ accountIds: selected }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message ?? 'Não foi possível salvar.');
      setData(result);
      setMessage(
        'Destinatários salvos. Alertas existentes também foram disponibilizados aos selecionados.',
      );
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Alertas administrativos">
      <h2>Alertas administrativos</h2>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {data && (
        <>
          <form onSubmit={(event) => void save(event)}>
            <fieldset disabled={busy}>
              <legend>Administradores destinatários</legend>
              {data.administrators.map((a) => (
                <label key={a.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(a.id)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, a.id]
                          : current.filter((id) => id !== a.id),
                      )
                    }
                  />
                  {a.email}
                </label>
              ))}
              <button
                className="button outline"
                disabled={selected.length === 0}
              >
                Salvar destinatários
              </button>
            </fieldset>
          </form>
          {data.selected.length === 0 && (
            <p role="alert">
              Nenhum administrador destinatário configurado. Os alertas
              continuam registrados nesta tela; selecione quem receberá os
              avisos.
            </p>
          )}
          <h3>Grupos abaixo do mínimo no início</h3>
          {data.alerts.length === 0 && <p>Nenhum alerta registrado.</p>}
          {data.alerts.map((a) => (
            <article className="panel" key={a.id}>
              <p>
                {a.date.split('-').reverse().join('/')} ·{' '}
                {String(a.startHour).padStart(2, '0')}:00 · {a.pointName}
              </p>
              <p>
                {a.confirmedAtStart} confirmado(s) no início.{' '}
                {a.cancelledAt
                  ? 'Reserva cancelada posteriormente.'
                  : 'Reserva mantida para decisão administrativa.'}
              </p>
            </article>
          ))}
          <h3>Falhas e atrasos de e-mail</h3>
          <p>
            Captura de teste não comprova entrega externa. No ambiente gratuito,
            suspensão do serviço pode atrasar o processamento.
          </p>
          {data.mailIssues.length === 0 && (
            <p>Nenhuma falha ou atraso registrado.</p>
          )}
          {data.mailIssues.map((issue) => (
            <p key={issue.id}>
              Aviso {issue.id.slice(0, 8)} ·{' '}
              {issue.mailState === 'captured'
                ? 'Capturado, sem entrega externa'
                : issue.mailState === 'failed'
                  ? 'Falha de transporte'
                  : 'Entrega não confirmada'}{' '}
              · {issue.attempts} tentativa(s)
              {issue.overdue ? ' · Prazo de uma hora ultrapassado' : ''}
            </p>
          ))}
        </>
      )}
    </section>
  );
}
