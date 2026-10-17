import { PointPhoto } from './PointPhoto.js';
import type { PublisherOption } from './PublisherProfilePanel.js';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { EquipmentContext } from './EquipmentPanel.js';

export type BookingPoint = {
  id: string;
  name: string;
  capacity?: number;
  allowedTypes: string[];
  days?: {
    day: number;
    mode: string;
    intervals: { start: string; end: string }[];
  }[];
};
type ExistingReservation = {
  pointId: string;
  date: string;
  startHour: number;
  duration: number;
  equipmentType: string;
  isResponsible: boolean;
  isParticipant?: boolean;
};
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
  reservations = [],
  equipment = [],
  onSaved,
  timezone,
  clock,
}: {
  context: EquipmentContext;
  month: string;
  points: BookingPoint[];
  reservations?: ExistingReservation[];
  equipment?: { type: string; units: number }[];
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
  const [people, setPeople] = useState<PublisherOption[]>([]),
    [responsible, setResponsible] = useState(''),
    [directoryError, setDirectoryError] = useState('');
  useEffect(() => {
    if (!context.canManage) return;
    const controller = new AbortController();
    void fetch(
      `/api/congregations/${encodeURIComponent(context.congregationId)}/reservation-publishers`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (!controller.signal.aborted) setPeople(result);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setDirectoryError('Não foi possível carregar os responsáveis.');
      });
    return () => controller.abort();
  }, [context.congregationId, context.canManage]);
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
  const equipmentUnits = (type: string) =>
    equipment.find((item) => item.type === type)?.units ?? 0;
  const overlaps = (
    leftDate: string,
    leftHour: number,
    leftDuration: number,
    rightDate: string,
    rightHour: number,
    rightDuration: number,
  ) => {
    const left = Date.parse(
      `${leftDate}T${String(leftHour).padStart(2, '0')}:00:00Z`,
    );
    const right = Date.parse(
      `${rightDate}T${String(rightHour).padStart(2, '0')}:00:00Z`,
    );
    return (
      left < right + rightDuration * 3_600_000 &&
      right < left + leftDuration * 3_600_000
    );
  };
  const inPointHours = (
    candidate: BookingPoint,
    date: string,
    start: number,
    length: number,
  ) => {
    const day = new Date(`${date}T12:00:00Z`).getUTCDay();
    const rule = candidate.days?.find((item) => item.day === day);
    if (!rule || rule.mode === 'unrestricted') return true;
    if (rule.mode === 'closed') return false;
    return rule.intervals.some((interval) => {
      const [from] = interval.start.split(':').map(Number);
      const [to] = interval.end.split(':').map(Number);
      return start >= from! && start + length <= to!;
    });
  };
  const available = (
    candidate: BookingPoint,
    start: number,
    length: number,
    type: string,
  ) => {
    if (
      !selectedDate ||
      !candidate.allowedTypes.includes(type) ||
      !inPointHours(candidate, selectedDate, start, length)
    )
      return false;
    const concurrent = reservations.filter((item) =>
      overlaps(
        selectedDate,
        start,
        length,
        item.date,
        item.startHour,
        item.duration,
      ),
    );
    return (
      !concurrent.some((item) => item.isResponsible || item.isParticipant) &&
      concurrent.filter((item) => item.pointId === candidate.id).length <
        (candidate.capacity ?? 1) &&
      concurrent.filter((item) => item.equipmentType === type).length <
        equipmentUnits(type)
    );
  };
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
  const usablePoints = points.filter(
    (candidate) =>
      !selectedDate ||
      candidate.allowedTypes.some((type) =>
        [1, 2].some((length) =>
          Array.from({ length: 24 }, (_, start) => start).some(
            (start) =>
              (selectedDate > today || start > currentHour) &&
              available(candidate, start, length, type),
          ),
        ),
      ),
  );
  const hours = Array.from({ length: 24 }, (_, index) => index).filter(
    (value) =>
      selectedDate &&
      (selectedDate > today || value > currentHour) &&
      !!point &&
      point.allowedTypes.some((type) =>
        [1, 2].some((length) => available(point, value, length, type)),
      ),
  );
  const selectedHour = hour !== '' && hours.includes(Number(hour)) ? hour : '';
  const durations = [1, 2].filter(
    (length) =>
      !!point &&
      selectedHour !== '' &&
      point.allowedTypes.some((type) =>
        available(point, Number(selectedHour), length, type),
      ),
  );
  const selectedDuration =
    duration !== '' && durations.includes(Number(duration)) ? duration : '';
  const usableTypes = (point?.allowedTypes ?? []).filter(
    (type) =>
      selectedDuration !== '' &&
      available(point!, Number(selectedHour), Number(selectedDuration), type),
  );
  const usableTypeKey = usableTypes.join(',');
  useEffect(() => {
    setEquipmentType((current) =>
      usableTypes.includes(current) ? current : (usableTypes[0] ?? ''),
    );
  }, [usableTypeKey]);
  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    const body = {
      ...(responsible ? { responsibleAccountId: responsible } : {}),
      pointId,
      date: selectedDate,
      startHour: Number(selectedHour),
      duration: Number(selectedDuration),
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
      <h2>Reservar ponto e horário</h2>
      <p>
        Escolha o dia da semana, a data, o ponto e o horário. Só aparecem opções
        com capacidade disponível.
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <fieldset disabled={busy}>
        {context.canManage && (
          <>
            <label htmlFor="booking-responsible">
              Responsável pela reserva
            </label>
            <select
              id="booking-responsible"
              value={responsible}
              onChange={(event) => setResponsible(event.target.value)}
            >
              <option value="">Eu mesmo</option>
              {people
                .filter(
                  (person) => person.status === 'ACTIVE' && person.verified,
                )
                .map((person) => (
                  <option value={person.id} key={person.id}>
                    {person.displayName || person.email}
                  </option>
                ))}
            </select>
            {directoryError && <p role="alert">{directoryError}</p>}
          </>
        )}
        <label htmlFor="booking-weekday">Dia da semana</label>
        <select
          id="booking-weekday"
          required
          value={weekday}
          onChange={(event) => {
            setWeekday(event.target.value);
            setDate('');
            setPointId('');
            setHour('');
            setDuration('');
            setEquipmentType('');
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
            setPointId('');
            setHour('');
            setDuration('');
            setEquipmentType('');
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
            setHour('');
            setDuration('');
            setEquipmentType('');
          }}
        >
          <option value="">Selecione</option>
          {usablePoints.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        {pointId && <PointPhoto context={context} pointId={pointId} />}
        <label htmlFor="booking-hour">Hora inicial</label>
        <select
          id="booking-hour"
          required
          value={selectedHour}
          onChange={(event) => {
            setHour(event.target.value);
            setDuration('');
            setEquipmentType('');
          }}
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
          onChange={(event) => {
            setDuration(event.target.value);
            setEquipmentType('');
          }}
        >
          <option value="">Selecione</option>
          {durations.includes(1) && <option value="1">Uma hora</option>}
          {durations.includes(2) && <option value="2">Duas horas</option>}
        </select>
        {selectedDuration && (
          <p>
            Equipamento compatível disponível:{' '}
            {usableTypes.map((type) => labels[type]).join(' ou ') || 'nenhum'}.
          </p>
        )}
        {hour !== '' &&
          selectedDuration !== '' &&
          Number(hour) + Number(selectedDuration) >= 24 && (
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
          {responsible
            ? 'O publicador escolhido será o responsável. O administrador não é incluído automaticamente.'
            : 'Você será o responsável por esta reserva. O grupo começa em formação.'}
        </p>
        <button className="button primary" type="submit">
          {busy ? 'Reservando…' : 'Confirmar reserva'}
        </button>
      </fieldset>
    </form>
  );
}
