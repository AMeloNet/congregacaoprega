import { useState, useEffect, type FormEvent } from 'react';
import type { EquipmentContext } from './EquipmentPanel.js';
export type ReservationConfiguration = {
  pointId: string;
  date: string;
  startHour: number;
  duration: number;
  equipmentType: string;
  thirdPositionOpen: boolean;
  revision: string;
};
export function ReservationConfigurationForm({
  context,
  reservationId,
  initial,
  onSaved,
}: {
  context: EquipmentContext;
  reservationId: string;
  initial: ReservationConfiguration;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(initial),
    [points, setPoints] = useState<
      { id: string; name: string; allowedTypes: string[] }[]
    >([]),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [key, setKey] = useState(() => crypto.randomUUID());
  const base = `/api/congregations/${encodeURIComponent(context.congregationId)}`;
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${base}/schedule`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (!controller.signal.aborted) setPoints(result.points);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('Não foi possível carregar os pontos.');
      });
    return () => controller.abort();
  }, [base]);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(
        `${base}/reservations/${reservationId}/configuration`,
        {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': context.csrfToken,
          },
          body: JSON.stringify({ ...form, requestKey: key }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message ?? 'Não foi possível salvar a reserva.');
      setMessage('Reserva atualizada.');
      onSaved();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const labels: Record<string, string> = {
    CART: 'Carrinho',
    KIOSK: 'Quiosque',
    DISPLAY: 'Display',
  };
  return (
    <form
      onSubmit={(event) => void save(event)}
      onChange={() => setKey(crypto.randomUUID())}
    >
      <fieldset disabled={busy}>
        <p>
          A alteração vale somente para esta reserva. Outras datas da série são
          preservadas. Os envolvidos receberão aviso.
        </p>
        <label htmlFor="edit-booking-date">Data da reserva</label>
        <input
          id="edit-booking-date"
          type="date"
          required
          value={form.date}
          onChange={(event) => setForm({ ...form, date: event.target.value })}
        />
        <label htmlFor="edit-booking-point">Ponto da reserva</label>
        <select
          id="edit-booking-point"
          required
          value={form.pointId}
          onChange={(event) => {
            const point = points.find((p) => p.id === event.target.value);
            setForm({
              ...form,
              pointId: event.target.value,
              equipmentType: point?.allowedTypes.includes(form.equipmentType)
                ? form.equipmentType
                : '',
            });
          }}
        >
          {points.map((point) => (
            <option value={point.id} key={point.id}>
              {point.name}
            </option>
          ))}
        </select>
        <label htmlFor="edit-booking-hour">Hora inicial da reserva</label>
        <select
          id="edit-booking-hour"
          value={form.startHour}
          onChange={(event) =>
            setForm({ ...form, startHour: Number(event.target.value) })
          }
        >
          {Array.from({ length: 24 }, (_, hour) => (
            <option value={hour} key={hour}>
              {String(hour).padStart(2, '0')}:00
            </option>
          ))}
        </select>
        <label htmlFor="edit-booking-duration">Duração da reserva</label>
        <select
          id="edit-booking-duration"
          value={form.duration}
          onChange={(event) =>
            setForm({ ...form, duration: Number(event.target.value) })
          }
        >
          <option value={1}>Uma hora</option>
          <option value={2}>Duas horas</option>
        </select>
        <label htmlFor="edit-booking-equipment">Equipamento da reserva</label>
        <select
          id="edit-booking-equipment"
          required
          value={form.equipmentType}
          onChange={(event) =>
            setForm({ ...form, equipmentType: event.target.value })
          }
        >
          <option value="">Selecione</option>
          {points
            .find((p) => p.id === form.pointId)
            ?.allowedTypes.map((type) => (
              <option value={type} key={type}>
                {labels[type]}
              </option>
            ))}
        </select>
        <label htmlFor="edit-booking-third">Terceira vaga da reserva</label>
        <select
          id="edit-booking-third"
          value={String(form.thirdPositionOpen)}
          onChange={(event) =>
            setForm({
              ...form,
              thirdPositionOpen: event.target.value === 'true',
            })
          }
        >
          <option value="true">Aberta</option>
          <option value="false">Bloqueada</option>
        </select>
        <button className="button" disabled={!points.length}>
          {busy ? 'Salvando…' : 'Salvar alterações da reserva'}
        </button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </form>
  );
}
