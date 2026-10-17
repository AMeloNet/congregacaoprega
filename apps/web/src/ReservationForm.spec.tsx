import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReservationForm } from './ReservationForm.js';

describe('reservation dates in congregation timezone', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it('excludes past dates and hours using server time, and clears a selection after local midnight', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2030-01-01T12:00:00Z'));
    let elapsed = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ReservationForm
        context={{
          congregationId: 'test',
          csrfToken: 'csrf',
          canManage: false,
        }}
        month="2026-10"
        timezone="America/Sao_Paulo"
        clock={{ instant: '2026-10-17T00:30:00Z', observedAt: 0 }}
        points={[
          { id: 'point', name: 'Ponto de teste', allowedTypes: ['CART'] },
        ]}
        equipment={[{ type: 'CART', units: 1 }]}
        reservations={[
          {
            pointId: 'point',
            date: '2026-10-16',
            startHour: 22,
            duration: 1,
            equipmentType: 'CART',
            isResponsible: false,
          },
        ]}
        onSaved={() => {}}
      />,
    );
    await user.selectOptions(screen.getByLabelText('Dia da semana'), '5');
    const dates = screen.getByLabelText('Data');
    expect(
      within(dates)
        .getAllByRole('option')
        .map((option) => option.getAttribute('value')),
    ).toEqual(['', '2026-10-16', '2026-10-23', '2026-10-30']);
    await user.selectOptions(dates, '2026-10-16');
    await user.selectOptions(screen.getByLabelText('Ponto'), 'point');
    const hours = screen.getByLabelText('Hora inicial');
    expect(
      within(hours)
        .getAllByRole('option')
        .map((option) => option.getAttribute('value')),
    ).toEqual(['', '23']);
    await user.selectOptions(hours, '23');
    await act(async () => {
      elapsed = 3 * 3600000;
      vi.advanceTimersByTime(30_000);
    });
    expect(dates).toHaveValue('');
    expect(hours).toHaveValue('');
    expect(
      within(dates).queryByRole('option', { name: '16/10/2026' }),
    ).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Dia da semana'), '6');
    expect(
      within(dates)
        .getAllByRole('option')
        .map((option) => option.getAttribute('value')),
    ).toEqual(['', '2026-10-17', '2026-10-24', '2026-10-31']);
  });
});
