import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { EquipmentContext } from './EquipmentPanel.js';
type Snapshot = {
  title: string;
  congregationName: string;
  timezone: string;
  month: string;
  entries: {
    id: string;
    date: string;
    weekday: number;
    pointName: string;
    startHour: number;
    duration: number;
    equipmentType: string;
    crossesMidnight: boolean;
    participants: {
      name: string | null;
      status: string;
      responsible: boolean;
    }[];
  }[];
};
type EmittedReport = {
  id: string;
  version: number;
  createdAt: string;
  snapshot: Snapshot;
};
type Preview = {
  draft: true;
  state: string;
  snapshot: Snapshot;
  missingNames: string[];
  reports: { id: string; version: number; createdAt: string }[];
};
const days = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];
const equipment: Record<string, string> = {
  CART: 'Carrinho',
  KIOSK: 'Quiosque',
  DISPLAY: 'Display',
};

export function ScheduleReportPanel({
  context,
}: {
  context: EquipmentContext;
}) {
  const [months, setMonths] = useState<string[]>([]),
    [month, setMonth] = useState(''),
    [preview, setPreview] = useState<Preview | null>(null),
    [report, setReport] = useState<EmittedReport | null>(null),
    [selected, setSelected] = useState(''),
    [key, setKey] = useState(() => crypto.randomUUID()),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const cache = useRef(new Map<string, EmittedReport>());
  const base = `/api/congregations/${encodeURIComponent(context.congregationId)}`;
  useEffect(() => {
    if (!context.canManage) return;
    const controller = new AbortController();
    cache.current.clear();
    setMonths([]);
    setMonth('');
    setPreview(null);
    setReport(null);
    setSelected('');
    setError('');
    void fetch(`${base}/schedule`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Não foi possível carregar os meses.');
        const result = (await response.json()) as {
          months: { month: string }[];
        };
        if (!controller.signal.aborted) {
          const available = result.months.map((m) => m.month);
          const requested = new URLSearchParams(
            window.location.hash.split('?')[1] ?? '',
          ).get('month');
          setMonths(available);
          setMonth(
            requested && available.includes(requested)
              ? requested
              : (available[0] ?? ''),
          );
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError((failure as Error).message);
      });
    return () => controller.abort();
  }, [base, context.canManage]);
  useEffect(() => {
    if (!month || !context.canManage) return;
    const controller = new AbortController();
    setPreview(null);
    setReport(null);
    setSelected('');
    setError('');
    setMessage('');
    setKey(crypto.randomUUID());
    void fetch(`${base}/schedule/${month}/report-preview`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.message ?? 'Não foi possível carregar o relatório.',
          );
        if (!controller.signal.aborted) {
          setPreview(result);
          setSelected(
            result.state === 'finalized' ? (result.reports[0]?.id ?? '') : '',
          );
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError((failure as Error).message);
      });
    return () => controller.abort();
  }, [base, month, context.canManage]);
  useEffect(() => {
    if (!selected) {
      setReport(null);
      return;
    }
    const cached = cache.current.get(selected);
    if (cached) {
      setReport(cached);
      return;
    }
    const controller = new AbortController();
    setReport(null);
    void fetch(`${base}/schedule-reports/${selected}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.message ?? 'Não foi possível carregar a versão emitida.',
          );
        if (!controller.signal.aborted) {
          cache.current.set(result.id, result);
          setReport(result);
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError((failure as Error).message);
      });
    return () => controller.abort();
  }, [base, selected]);
  function print() {
    try {
      window.print();
    } catch {
      setError(
        'A versão continua emitida e o mês bloqueado. Use Reimprimir versão para tentar imprimir novamente.',
      );
    }
  }
  async function finalize() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`${base}/schedule/${month}/finalize-print`, {
        method: 'POST',
        headers: {
          'x-csrf-token': context.csrfToken,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ requestKey: key }),
      });
      const result = (await response.json()) as EmittedReport & {
        message?: string;
      };
      if (!response.ok)
        throw new Error(
          result.message ?? 'Não foi possível finalizar e emitir.',
        );
      cache.current.set(result.id, result);
      flushSync(() => {
        setReport(result);
        setSelected(result.id);
        setPreview((current) =>
          current
            ? {
                ...current,
                state: 'finalized',
                reports: [
                  {
                    id: result.id,
                    version: result.version,
                    createdAt: result.createdAt,
                  },
                  ...current.reports.filter((r) => r.id !== result.id),
                ],
              }
            : current,
        );
        setMessage(
          `Versão ${result.version} emitida. O mês está bloqueado, mesmo se a impressão for cancelada.`,
        );
      });
      print();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!context.canManage)
    return <p>Relatório restrito ao administrador local.</p>;
  const snapshot =
    report?.snapshot ?? (!selected ? preview?.snapshot : undefined);
  const draft = !report;
  return (
    <section aria-label="Relatório da programação">
      <div className="no-print">
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        <label htmlFor="report-month">Mês do relatório</label>
        <select
          id="report-month"
          disabled={busy}
          value={month}
          onChange={(event) => setMonth(event.target.value)}
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {m.split('-').reverse().join('/')}
            </option>
          ))}
        </select>
        {preview && (
          <>
            <p>
              {preview.state === 'reopened'
                ? 'Mês reaberto somente para ajustes administrativos.'
                : preview.state === 'finalized'
                  ? 'Mês finalizado; alterações bloqueadas.'
                  : 'Prévia atual; o mês ainda permite marcação.'}
            </p>
            <label htmlFor="report-version">Versão do relatório</label>
            <select
              id="report-version"
              disabled={busy}
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">Prévia atual — sem emitir</option>
              {preview.reports.map((r) => (
                <option key={r.id} value={r.id}>
                  Versão {r.version}
                </option>
              ))}
            </select>
            {preview.missingNames.length > 0 && (
              <p role="alert">
                Há {preview.missingNames.length} publicador(es) sem nome
                cadastrado.{' '}
                <a href="#administracao">Completar nomes em Administração</a>{' '}
                antes de emitir.
              </p>
            )}
            {(preview.state !== 'finalized' ||
              preview.reports.length === 0) && (
              <>
                <p>
                  Finalizar grava esta versão e bloqueia o mês antes de abrir a
                  impressão. Cancelar o diálogo não desfaz a emissão. Após
                  ajustes, reabra e emita nova versão.
                </p>
                <button
                  className="button primary"
                  disabled={busy || preview.missingNames.length > 0}
                  onClick={() => void finalize()}
                >
                  Finalizar e imprimir
                  {preview.reports.length > 0 ? ' nova versão' : ''}
                </button>
              </>
            )}
            {report && (
              <button
                className="button outline"
                disabled={busy}
                onClick={print}
              >
                Reimprimir versão {report.version}
              </button>
            )}
          </>
        )}
      </div>
      {snapshot && (
        <article
          className="print-sheet schedule-report"
          aria-label={
            draft ? 'Prévia do relatório' : 'Versão emitida do relatório'
          }
        >
          <header className="report-top">
            <div>
              <p className="eyebrow">{snapshot.congregationName}</p>
              <h2>{snapshot.title}</h2>
              <p>
                Programação de{' '}
                {new Intl.DateTimeFormat('pt-BR', {
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'UTC',
                }).format(new Date(`${snapshot.month}-01T12:00:00Z`))}
              </p>
              <p>Fuso: {snapshot.timezone}</p>
            </div>
            <div>
              <strong>
                {draft
                  ? 'PRÉVIA — NÃO FINALIZADA'
                  : `Versão ${report!.version}`}
              </strong>
              {report && (
                <p>
                  Emitida em{' '}
                  {new Intl.DateTimeFormat('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                    timeZone: snapshot.timezone,
                  }).format(new Date(report.createdAt))}
                </p>
              )}
            </div>
          </header>
          <div className="report-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Dia</th>
                  <th>Local e equipamento</th>
                  <th>Horário</th>
                  <th>Publicadores</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.entries.map((r) => (
                  <tr key={r.id}>
                    <td>{r.date.split('-').reverse().join('/')}</td>
                    <td>{days[r.weekday]}</td>
                    <td>
                      {r.pointName}
                      <br />
                      {equipment[r.equipmentType] ?? r.equipmentType}
                    </td>
                    <td>
                      {String(r.startHour).padStart(2, '0')}:00–
                      {String((r.startHour + r.duration) % 24).padStart(2, '0')}
                      :00
                      {r.crossesMidnight && (
                        <>
                          <br />
                          Fim no dia seguinte
                        </>
                      )}
                    </td>
                    <td>
                      {r.participants.map((p, index) => (
                        <div key={index}>
                          {p.name || 'Nome pendente de cadastro'}
                          {p.responsible ? ' (responsável)' : ''}
                          {p.status === 'pending' ? ' — pendente' : ''}
                        </div>
                      ))}
                      {r.participants.filter((p) => p.status === 'confirmed')
                        .length < 2 && <strong>Grupo em formação</strong>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {snapshot.entries.length === 0 && (
            <p>Nenhuma designação neste mês.</p>
          )}
          <p className="report-footnote">
            Convidados pendentes ocupam uma posição e ainda não contam como
            confirmados. Reservas que atravessam meia-noite indicam o término no
            dia seguinte.{' '}
            {draft
              ? 'Esta prévia não é uma versão definitiva.'
              : 'Esta versão preserva o conteúdo da emissão; alterações posteriores exigem nova finalização.'}
          </p>
        </article>
      )}
    </section>
  );
}
