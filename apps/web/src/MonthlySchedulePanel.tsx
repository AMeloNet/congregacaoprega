import { useEffect, useState } from 'react';
import type { EquipmentContext } from './EquipmentPanel.js';

type Schedule = {
  timezone: string;
  months: { month: string; state: string; canBook: boolean }[];
  equipment: { type: string; units: number }[];
  points: {
    id: string;
    name: string;
    capacity: number;
    allowedTypes: string[];
    days: {
      day: number;
      mode: string;
      intervals: { start: string; end: string }[];
    }[];
  }[];
};
const days = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
];
const labels: Record<string, string> = {
  CART: 'Carrinho',
  KIOSK: 'Quiosque',
  DISPLAY: 'Display',
};

export function MonthlySchedulePanel({
  context,
}: {
  context: EquipmentContext;
}) {
  const [data, setData] = useState<Schedule | null>(null);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const url = `/api/congregations/${encodeURIComponent(context.congregationId)}/schedule`;
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    void fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Não foi possível carregar a programação.');
        const result = (await response.json()) as Schedule;
        if (!controller.signal.aborted) {
          setData(result);
          setSelected(result.months[0]!.month);
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError((failure as Error).message);
      });
    return () => controller.abort();
  }, [url]);
  async function change(action: 'finalize' | 'reopen') {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${url}/${selected}/${action}`, {
        method: 'POST',
        headers: { 'x-csrf-token': context.csrfToken },
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message ?? 'Não foi possível alterar o mês.');
      setData(result as Schedule);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const month = data?.months.find((m) => m.month === selected);
  return (
    <section aria-label="Programação mensal">
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Carregando programação…</p>}
      {data && (
        <>
          <label htmlFor="schedule-month">Mês da programação</label>
          <select
            id="schedule-month"
            value={selected}
            disabled={busy}
            onChange={(event) => setSelected(event.target.value)}
          >
            {data.months.map((m) => (
              <option key={m.month} value={m.month}>
                {m.month.split('-').reverse().join('/')}
              </option>
            ))}
          </select>
          <p>Fuso da congregação: {data.timezone}</p>
          <p role="status">
            {month?.state === 'open'
              ? 'Mês liberado para marcação.'
              : month?.state === 'reopened'
                ? 'Reaberto somente para ajustes administrativos. Publicadores continuam bloqueados.'
                : 'Mês finalizado. Alterações bloqueadas.'}
          </p>
          {context.canManage && (
            <button
              type="button"
              className="button outline"
              disabled={busy}
              onClick={() =>
                void change(
                  month?.state === 'finalized' ? 'reopen' : 'finalize',
                )
              }
            >
              {month?.state === 'finalized'
                ? 'Reabrir para ajustes administrativos'
                : 'Finalizar mês'}
            </button>
          )}
          <p>
            A marcação de reservas será integrada no próximo incremento. As
            quantidades abaixo representam o inventário ativo, não uma garantia
            de disponibilidade por horário.
          </p>
          {!data.points.length && <p>Nenhum ponto cadastrado.</p>}
          <div className="schedule-list">
            {data.points.map((point) => (
              <article className="panel" key={point.id}>
                <h2>{point.name}</h2>
                <p>Capacidade: {point.capacity} grupo(s)</p>
                <p>
                  {point.allowedTypes
                    .map(
                      (type) =>
                        `${labels[type]}: ${data.equipment.find((e) => e.type === type)?.units ?? 0} unidade(s) ativa(s)`,
                    )
                    .join(' · ')}
                </p>
                <details>
                  <summary>Horários do ponto</summary>
                  <ul>
                    {point.days.map((day) => (
                      <li key={day.day}>
                        {days[day.day]}:{' '}
                        {day.mode === 'closed'
                          ? 'Fechado'
                          : day.mode === 'unrestricted'
                            ? '24 horas'
                            : day.intervals
                                .map((i) => `${i.start}–${i.end}`)
                                .join(', ')}
                      </li>
                    ))}
                  </ul>
                </details>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
