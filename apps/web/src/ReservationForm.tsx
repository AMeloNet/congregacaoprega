import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { EquipmentContext } from './EquipmentPanel.js';

export type BookingPoint = { id: string; name: string; allowedTypes: string[] };
const labels: Record<string, string> = {
  CART: 'Carrinho',
  KIOSK: 'Quiosque',
  DISPLAY: 'Display',
};
const weekdays = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];
export function ReservationForm({
  context,
  month,
  points,
  onSaved,
  timezone,
  clock,
}: {
  context: EquipmentContext;
  month: string;
  points: BookingPoint[];
  onSaved: () => void;
  timezone: string;
  clock: { instant: string; observedAt: number };
}) {
  const currentInstant = () =>
    new Date(Date.parse(clock.instant) + performance.now() - clock.observedAt);
  const [now, setNow] = useState(currentInstant);
  useEffect(() => {
    const timer = setInterval(
      () =>
        setNow(
          new Date(
            Date.parse(clock.instant) + performance.now() - clock.observedAt,
          ),
        ),
      30_000,
    );
    return () => clearInterval(timer);
  }, [clock.instant, clock.observedAt]);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const today = `${parts.year}-${parts.month}-${parts.day}`,
    currentHour = Number(parts.hour);
  const [weekday, setWeekday] = useState('');
  const [date, setDate] = useState('');
  const [pointId, setPointId] = useState('');
  const [equipmentType, setEquipmentType] = useState('');
  const [hour, setHour] = useState('');
  const [duration, setDuration] = useState('');
  const [third, setThird] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const request = useRef({ fingerprint: '', key: '' });
  const point = points.find((item) => item.id === pointId);
  const dates = Array.from(
    { length: 31 },
    (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`,
  ).filter((value) => {
    const instant = new Date(`${value}T12:00:00Z`);
    return (
      instant.toISOString().slice(0, 7) === month &&
      String(instant.getUTCDay()) === weekday &&
      (value > today || (value === today && currentHour < 23))
    );
  });
  const selectedDate = dates.includes(date) ? date : '';
  const hours = Array.from({ length: 24 }, (_, index) => index).filter(
    (value) => selectedDate && (selectedDate > today || value > currentHour),
  );
  const selectedHour = hour !== '' && hours.includes(Number(hour)) ? hour : '';
  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    const body = {
      pointId,
      date: selectedDate,
      startHour: Number(selectedHour),
      duration: Number(duration),
      equipmentType,
      thirdPositionOpen: third === 'open',
    };
    const fingerprint = JSON.stringify(body);
    if (request.current.fingerprint !== fingerprint)
      request.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const response = await fetch(
        `/api/congregations/${encodeURIComponent(context.congregationId)}/reservations`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': context.csrfToken,
          },
          body: JSON.stringify({ ...body, requestKey: request.current.key }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message ?? 'Não foi possível reservar.');
      setMessage(
        'Reserva registrada. Grupo em formação: somente o responsável está confirmado.',
      );
      onSaved();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="panel reservation-form"
      onSubmit={(event) => void save(event)}
    >
      <h2>Reservar ponto e equipamento</h2>
      <p>Escolha o dia da semana e a data deste mês.</p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <fieldset disabled={busy}>
        <label htmlFor="booking-weekday">Dia da semana</label>
        <select
          id="booking-weekday"
          required
          value={weekday}
          onChange={(event) => {
            setWeekday(event.target.value);
            setDate('');
          }}
        >
          <option value="">Selecione</option>
          {weekdays.map((label, index) => (
            <option key={label} value={index}>
              {label}
            </option>
          ))}
        </select>
        <label htmlFor="booking-date">Data</label>
        <select
          id="booking-date"
          required
          value={selectedDate}
          onChange={(event) => {
            setDate(event.target.value);
            setHour('');
          }}
        >
          <option value="">Selecione</option>
          {dates.map((value) => (
            <option key={value} value={value}>
              {value.split('-').reverse().join('/')}
            </option>
          ))}
        </select>
        <label htmlFor="booking-point">Ponto</label>
        <select
          id="booking-point"
          required
          value={pointId}
          onChange={(event) => {
            setPointId(event.target.value);
            setEquipmentType('');
          }}
        >
          <option value="">Selecione</option>
          {points.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <label htmlFor="booking-equipment">Tipo de equipamento</label>
        <select
          id="booking-equipment"
          required
          value={equipmentType}
          onChange={(event) => setEquipmentType(event.target.value)}
        >
          <option value="">Selecione</option>
          {point?.allowedTypes.map((type) => (
            <option key={type} value={type}>
              {labels[type]}
            </option>
          ))}
        </select>
        <label htmlFor="booking-hour">Hora inicial</label>
        <select
          id="booking-hour"
          required
          value={selectedHour}
          onChange={(event) => setHour(event.target.value)}
        >
          <option value="">Selecione</option>
          {hours.map((index) => (
            <option key={index} value={index}>
              {String(index).padStart(2, '0')}:00
            </option>
          ))}
        </select>
        <label htmlFor="booking-duration">Duração</label>
        <select
          id="booking-duration"
          required
          value={duration}
          onChange={(event) => setDuration(event.target.value)}
        >
          <option value="">Selecione</option>
          <option value="1">Uma hora</option>
          <option value="2">Duas horas</option>
        </select>
        {hour !== '' &&
          duration !== '' &&
          Number(hour) + Number(duration) >= 24 && (
            <p role="alert">
              Atenção: a reserva termina no dia seguinte e deve respeitar os
              horários e bloqueios das duas datas.
            </p>
          )}
        <label htmlFor="booking-third">Terceira vaga</label>
        <select
          id="booking-third"
          required
          value={third}
          onChange={(event) => setThird(event.target.value)}
        >
          <option value="">Selecione</option>
          <option value="open">Aberta</option>
          <option value="blocked">Bloqueada</option>
        </select>
        <p>
          Você será o responsável por esta reserva. O grupo começa em formação.
        </p>
        <button className="button primary" type="submit">
          {busy ? 'Reservando…' : 'Confirmar reserva'}
        </button>
      </fieldset>
    </form>
  );
}
