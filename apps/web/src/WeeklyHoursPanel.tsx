import { useEffect, useState, type FormEvent } from 'react';
import type { EquipmentContext } from './EquipmentPanel.js';

const names = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];
type Day = {
  day: number;
  mode: 'unrestricted' | 'closed' | 'intervals';
  intervals: { start: string; end: string }[];
};
type Configuration = {
  timezone: string;
  version: number;
  timezoneVersion: number;
  days: Day[];
};
type Point = { id: string; name: string };

export function WeeklyHoursPanel({
  context,
  pointsRevision = 0,
}: {
  context: EquipmentContext;
  pointsRevision?: number;
}) {
  const [points, setPoints] = useState<Point[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!context.canManage) return;
    const controller = new AbortController();
    setError('');
    setLoading(true);
    void fetch(
      `/api/congregations/${encodeURIComponent(context.congregationId)}/points`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const value = (await response.json()) as Point[];
        if (controller.signal.aborted) return;
        setPoints(value);
        setSelected((current) =>
          value.some((point) => point.id === current)
            ? current
            : (value[0]?.id ?? ''),
        );
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('Não foi possível carregar os locais.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [context.congregationId, context.canManage, pointsRevision, retry]);
  const point = points.find((value) => value.id === selected);
  return (
    <section
      className="panel equipment-panel weekly-hours-panel"
      aria-label="Horários semanais por local"
    >
      <p className="eyebrow">CONFIGURAÇÃO POR LOCAL</p>
      <h2>Horários semanais</h2>
      {!context.canManage ? (
        <p>Acesso restrito ao administrador local.</p>
      ) : (
        <>
          {error && (
            <>
              <p role="alert" className="feedback error">
                {error}
              </p>
              <button
                type="button"
                className="text-button"
                onClick={() => setRetry((value) => value + 1)}
              >
                Tentar carregar locais novamente
              </button>
            </>
          )}
          {loading && <p role="status">Carregando locais…</p>}
          {!loading && !error && points.length === 0 && (
            <p>Cadastre um ponto de pregação para configurar seus horários.</p>
          )}
          {points.length > 0 && (
            <>
              <label htmlFor="weekly-point">Local dos horários semanais</label>
              <select
                id="weekly-point"
                value={selected}
                disabled={loading}
                onChange={(event) => setSelected(event.target.value)}
              >
                {points.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.name}
                  </option>
                ))}
              </select>
              {point && (
                <PointWeeklyHoursEditor
                  key={point.id}
                  context={context}
                  point={point}
                />
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

function PointWeeklyHoursEditor({
  context,
  point,
}: {
  context: EquipmentContext;
  point: Point;
}) {
  const [config, setConfig] = useState<Configuration | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [conflict, setConflict] = useState(false);
  const url = `/api/congregations/${encodeURIComponent(context.congregationId)}/points/${encodeURIComponent(point.id)}/weekly-hours`;

  async function load(signal?: AbortSignal) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('Não foi possível carregar os horários.');
    const value = (await response.json()) as Configuration;
    if (!signal?.aborted) {
      setConfig(value);
      setConflict(false);
      setError('');
      setMessage('');
    }
  }
  useEffect(() => {
    if (!context.canManage) return;
    const controller = new AbortController();
    void load(controller.signal).catch(() => {
      if (!controller.signal.aborted)
        setError('Não foi possível carregar os horários.');
    });
    return () => controller.abort();
  }, [url, context.canManage]);

  function updateDay(index: number, day: Day) {
    setConfig(
      (current) =>
        current && {
          ...current,
          days: current.days.map((value, i) => (i === index ? day : value)),
        },
    );
    setMessage('');
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': context.csrfToken,
        },
        body: JSON.stringify(config),
      });
      const body = (await response.json()) as Configuration & {
        message?: string;
      };
      if (!response.ok) {
        if (response.status === 409) setConflict(true);
        throw new Error(
          typeof body.message === 'string'
            ? body.message
            : 'Não foi possível salvar os horários.',
        );
      }
      setConfig(body);
      setMessage('Horários semanais salvos.');
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Não foi possível conectar ao servidor.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div aria-label={`Horários de ${point.name}`}>
      <h3>{point.name}</h3>
      {!context.canManage ? (
        <p>Acesso restrito ao administrador local.</p>
      ) : (
        <>
          {error && (
            <p className="feedback error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="feedback success" role="status">
              {message}
            </p>
          )}
          {!config && !error && <p role="status">Carregando horários…</p>}
          {(error || config) && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void load()
                  .catch(() =>
                    setError('Não foi possível carregar os horários.'),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              {config
                ? 'Descartar edição e recarregar'
                : 'Tentar carregar novamente'}
            </button>
          )}
          {config && (
            <form onSubmit={(event) => void save(event)}>
              <fieldset disabled={busy || conflict}>
                <legend>Disponibilidade semanal</legend>
                <label htmlFor="weekly-timezone">
                  Fuso da congregação (IANA)
                </label>
                <input
                  id="weekly-timezone"
                  required
                  maxLength={100}
                  list="weekly-timezones"
                  value={config.timezone}
                  onChange={(event) => {
                    setConfig({ ...config, timezone: event.target.value });
                    setMessage('');
                  }}
                />
                <datalist id="weekly-timezones">
                  {[
                    'America/Sao_Paulo',
                    'America/Manaus',
                    'America/Rio_Branco',
                    'America/Noronha',
                    'UTC',
                  ].map((zone) => (
                    <option key={zone} value={zone} />
                  ))}
                </datalist>
                <p className="muted">
                  O fuso é compartilhado por todos os locais da congregação.
                  Alterá-lo mantém as horas locais informadas. Os intervalos
                  abaixo valem somente para {point.name}. Sem restrição, o dia
                  oferece 24 horas.
                </p>
                {config.days.map((day, index) => (
                  <fieldset key={day.day} className="weekly-day">
                    <legend>{names[day.day]}</legend>
                    <label htmlFor={`weekly-mode-${day.day}`}>
                      Disponibilidade — {names[day.day]}
                    </label>
                    <select
                      id={`weekly-mode-${day.day}`}
                      value={day.mode}
                      onChange={(event) => {
                        const mode = event.target.value as Day['mode'];
                        updateDay(index, {
                          ...day,
                          mode,
                          intervals:
                            mode === 'intervals'
                              ? [{ start: '08:00', end: '18:00' }]
                              : [],
                        });
                      }}
                    >
                      <option value="unrestricted">
                        24 horas (sem restrição)
                      </option>
                      <option value="closed">Fechado</option>
                      <option value="intervals">Intervalos definidos</option>
                    </select>
                    {day.intervals.map((interval, position) => (
                      <div className="weekly-interval" key={position}>
                        <label>
                          Início {position + 1} — {names[day.day]}
                          <input
                            type="time"
                            required
                            step={60}
                            value={interval.start}
                            onChange={(event) =>
                              updateDay(index, {
                                ...day,
                                intervals: day.intervals.map((value, i) =>
                                  i === position
                                    ? { ...value, start: event.target.value }
                                    : value,
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          Fim {position + 1} — {names[day.day]}
                          <input
                            type="text"
                            inputMode="numeric"
                            required
                            pattern="([01][0-9]|2[0-3]):[0-5][0-9]|24:00"
                            placeholder="18:00"
                            maxLength={5}
                            value={interval.end}
                            onChange={(event) =>
                              updateDay(index, {
                                ...day,
                                intervals: day.intervals.map((value, i) =>
                                  i === position
                                    ? { ...value, end: event.target.value }
                                    : value,
                                ),
                              })
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="text-button"
                          disabled={day.intervals.length === 1}
                          aria-label={`Remover intervalo ${position + 1} de ${names[day.day]}`}
                          onClick={() =>
                            updateDay(index, {
                              ...day,
                              intervals: day.intervals.filter(
                                (_, i) => i !== position,
                              ),
                            })
                          }
                        >
                          Remover
                        </button>
                      </div>
                    ))}
                    {day.mode === 'intervals' && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() =>
                          updateDay(index, {
                            ...day,
                            intervals: [
                              ...day.intervals,
                              { start: '', end: '' },
                            ],
                          })
                        }
                      >
                        Adicionar intervalo — {names[day.day]}
                      </button>
                    )}
                  </fieldset>
                ))}
                <p className="info-callout">
                  Intervalos não atravessam meia-noite. Use 24:00 somente para o
                  fim do dia. Intervalos do mesmo dia não podem se sobrepor.
                </p>
                <button className="button" type="submit">
                  {busy ? 'Salvando…' : 'Salvar horários semanais'}
                </button>
              </fieldset>
            </form>
          )}
        </>
      )}
    </div>
  );
}
