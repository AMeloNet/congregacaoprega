import { BadRequestException } from '@nestjs/common';

const formatters = new Map<string, Intl.DateTimeFormat>();

export function localParts(instant: Date, timezone: string) {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timezone, formatter);
  }
  const values = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

export function nextDate(date: string) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86400000)
    .toISOString()
    .slice(0, 10);
}

// Compare all surrounding offsets and round-trip the civil time. Neither gaps
// nor repeated times are silently shifted or assigned an arbitrary offset.
export function localInstant(date: string, hour: number, timezone: string) {
  const target = Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);
  const offsets = new Set<number>();
  for (let delta = -36; delta <= 36; delta += 6) {
    const sample = new Date(target + delta * 3600000);
    const parts = localParts(sample, timezone);
    offsets.add(
      Date.parse(
        `${parts.date}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(parts.second).padStart(2, '0')}Z`,
      ) - sample.getTime(),
    );
  }
  const matches = [...offsets]
    .map((offset) => new Date(target - offset))
    .filter((instant) => {
      const parts = localParts(instant, timezone);
      return (
        parts.date === date &&
        parts.hour === hour &&
        parts.minute === 0 &&
        parts.second === 0
      );
    });
  if (matches.length !== 1)
    throw new BadRequestException(
      'Horário local inexistente ou ambíguo. Escolha outro horário.',
    );
  return matches[0]!;
}

export function reservationTimes(
  date: string,
  hour: number,
  duration: number,
  timezone: string,
) {
  const start = localInstant(date, hour, timezone);
  const endHour = hour + duration;
  const end = localInstant(
    endHour >= 24 ? nextDate(date) : date,
    endHour % 24,
    timezone,
  );
  if (end.getTime() - start.getTime() !== duration * 3600000)
    throw new BadRequestException(
      'O intervalo atravessa uma mudança de fuso. Escolha outro horário.',
    );
  const segments = Array.from({ length: duration }, (_, index) => {
    const parts = localParts(
      new Date(start.getTime() + index * 3600000),
      timezone,
    );
    return {
      ...parts,
      weekday: new Date(`${parts.date}T00:00:00Z`).getUTCDay(),
    };
  });
  return { start, end, segments, crossesMidnight: endHour >= 24 };
}
