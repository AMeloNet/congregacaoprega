import { useEffect, useState } from 'react';
import type { EquipmentContext } from './EquipmentPanel.js';
import { ReservationForm } from './ReservationForm.js';

type Schedule = {
  timezone: string;
  months: { month: string; state: string; canBook: boolean }[];
  equipment: { type: string; units: number }[];
  reservations?: {
    id: string;
    pointName: string;
    date: string;
    startHour: number;
    duration: number;
    equipmentType: string;
    thirdPositionOpen: boolean;
    isResponsible: boolean;
    seriesId?: string | null;
    seriesStoppedAt?: string | null;
  }[];
  recurrences?: {
    id: string;
    sourceReservationId: string;
    stoppedAt: string | null;
    pointId: string;
    weekday: number;
    startHour: number;
    equipmentType: string;
    isResponsible: boolean;
    conflicts: { date: string; message: string }[];
  }[];
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
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
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
          setSelected((previous) =>
            result.months.some((item) => item.month === previous)
              ? previous
              : result.months[0]!.month,
          );
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError((failure as Error).message);
      });
    return () => controller.abort();
  }, [url, revision]);
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
  async function recurrence(path: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(
        `/api/congregations/${encodeURIComponent(context.congregationId)}/${path}`,
        { method: 'POST', headers: { 'x-csrf-token': context.csrfToken } },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message ?? 'Não foi possível alterar a recorrência.',
        );
      setMessage(
        result.stopped
          ? 'Recorrência encerrada. Reservas já criadas foram preservadas.'
          : result.conflicts?.length
            ? 'Há datas indisponíveis. Confira as pendências da recorrência; nenhuma reserva conflitante foi incluída.'
            : 'Recorrência atualizada. As reservas disponíveis foram registradas.',
      );
      setRevision((value) => value + 1);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Programação mensal">
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
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
            As quantidades abaixo representam o inventário ativo. A
            disponibilidade do intervalo será verificada ao confirmar sua
            reserva.
          </p>
          {!data.points.length && <p>Nenhum ponto cadastrado.</p>}
          {(month?.canBook ||
            (context.canManage && month?.state === 'reopened')) &&
            data.points.length > 0 && (
              <ReservationForm
                key={selected}
                context={context}
                month={selected}
                points={data.points}
                onSaved={() => setRevision((value) => value + 1)}
              />
            )}
          <h2>Designações do mês</h2>
          {!(data.reservations ?? []).some((item) =>
            item.date.startsWith(selected),
          ) && <p>Nenhuma designação neste mês.</p>}
          <div className="schedule-list">
            {(data.reservations ?? [])
              .filter((item) => item.date.startsWith(selected))
              .map((item) => (
                <article className="schedule-card" key={item.id}>
                  <div>
                    <h3>
                      {item.date.split('-').reverse().join('/')} ·{' '}
                      {item.pointName}
                    </h3>
                    <p>
                      {String(item.startHour).padStart(2, '0')}:00–
                      {String((item.startHour + item.duration) % 24).padStart(
                        2,
                        '0',
                      )}
                      :00
                      {item.startHour + item.duration >= 24
                        ? ' (dia seguinte)'
                        : ''}{' '}
                      · {labels[item.equipmentType]}
                    </p>
                    <p>
                      {item.isResponsible ? 'Sua reserva' : 'Grupo em formação'}{' '}
                      · 1 responsável ·{' '}
                      {item.thirdPositionOpen
                        ? '2 vagas abertas'
                        : '1 vaga aberta e terceira bloqueada'}
                    </p>
                    {item.seriesId ? (
                      <p>
                        {item.seriesStoppedAt
                          ? 'Recorrência encerrada; esta reserva foi preservada.'
                          : 'Parte de uma recorrência semanal.'}
                      </p>
                    ) : (
                      (item.isResponsible || context.canManage) &&
                      (month?.canBook ||
                        (context.canManage && month?.state === 'reopened')) && (
                        <button
                          className="button outline"
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void recurrence(
                              `reservations/${item.id}/recurrence`,
                            )
                          }
                        >
                          Repetir toda semana
                        </button>
                      )
                    )}
                  </div>
                </article>
              ))}
          </div>
          <section aria-label="Recorrências semanais">
            <h2>Recorrências semanais</h2>
            <p>
              Repetir toda semana mantém somente o responsável, no mesmo dia da
              semana, ponto, horário e tipo de equipamento, nos meses seguintes
              até encerrar. Datas indisponíveis ficam pendentes para tratamento.
            </p>
            {(data.recurrences ?? []).map((series) => (
              <article className="panel" key={series.id}>
                <h3>
                  {days[series.weekday]} ·{' '}
                  {String(series.startHour).padStart(2, '0')}:00 ·{' '}
                  {
                    data.points.find((point) => point.id === series.pointId)
                      ?.name
                  }{' '}
                  · {labels[series.equipmentType]}
                </h3>
                <p>{series.stoppedAt ? 'Encerrada' : 'Ativa'}</p>
                {!series.stoppedAt && (
                  <button
                    className="button outline"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void recurrence(`recurrences/${series.id}/stop`)
                    }
                  >
                    Encerrar recorrência
                  </button>
                )}
                {series.conflicts.map((conflict) => (
                  <div key={conflict.date}>
                    <p role="alert">
                      {conflict.date.split('-').reverse().join('/')}:{' '}
                      {conflict.message}
                    </p>
                    {!series.stoppedAt && (
                      <button
                        className="button outline"
                        type="button"
                        disabled={
                          busy ||
                          !data.months.some(
                            (item) =>
                              conflict.date.startsWith(item.month) &&
                              (item.canBook ||
                                (context.canManage &&
                                  item.state === 'reopened')),
                          )
                        }
                        onClick={() =>
                          void recurrence(
                            `recurrences/${series.id}/retry/${conflict.date}`,
                          )
                        }
                      >
                        Tentar novamente em{' '}
                        {conflict.date.split('-').reverse().join('/')}
                      </button>
                    )}
                  </div>
                ))}
              </article>
            ))}
          </section>
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
