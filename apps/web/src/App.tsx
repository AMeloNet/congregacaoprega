import { useEffect, useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import './styles.css';

type Screen =
  | 'inicio'
  | 'programacao'
  | 'nova-reserva'
  | 'detalhe'
  | 'convites'
  | 'administracao'
  | 'recursos'
  | 'relatorio';
type Role = 'publicador' | 'administrador';
type MonthState = 'liberado' | 'finalizado' | 'reaberto';
type InvitationState = 'pendente' | 'aceito' | 'recusado';
type Equipment = 'Carrinho' | 'Quiosque' | 'Display';
type ThemeMode = 'light' | 'dark' | 'system';
type Accent = 'purple' | 'orange' | 'blue' | 'green';

type Appearance = {
  themeMode: ThemeMode;
  accent: Accent;
};

const appearanceStorageKey = 'congregacaoprega.ui-002.appearance';
const defaultAppearance: Appearance = { themeMode: 'light', accent: 'purple' };

const themeOptions: { id: ThemeMode; label: string }[] = [
  { id: 'light', label: 'Tema claro' },
  { id: 'dark', label: 'Tema escuro' },
  { id: 'system', label: 'Usar aparência do sistema' },
];

const accentOptions: { id: Accent; label: string }[] = [
  { id: 'purple', label: 'Roxo' },
  { id: 'orange', label: 'Laranja' },
  { id: 'blue', label: 'Azul' },
  { id: 'green', label: 'Verde' },
];

function readAppearance(): Appearance {
  try {
    const saved = window.localStorage.getItem(appearanceStorageKey);
    if (!saved) return defaultAppearance;
    const value = JSON.parse(saved) as Partial<Appearance>;
    const themeMode = themeOptions.some((item) => item.id === value.themeMode)
      ? (value.themeMode as ThemeMode)
      : defaultAppearance.themeMode;
    const accent = accentOptions.some((item) => item.id === value.accent)
      ? (value.accent as Accent)
      : defaultAppearance.accent;
    return { themeMode, accent };
  } catch {
    return defaultAppearance;
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

const navigation: { id: Screen; label: string; marker: string }[] = [
  { id: 'inicio', label: 'Início', marker: '⌂' },
  { id: 'programacao', label: 'Programação', marker: '▦' },
  { id: 'nova-reserva', label: 'Nova reserva', marker: '+' },
  { id: 'detalhe', label: 'Detalhe da reserva', marker: '◫' },
  { id: 'convites', label: 'Convites e avisos', marker: '✉' },
  { id: 'administracao', label: 'Administração', marker: '◇' },
  { id: 'recursos', label: 'Recursos', marker: '▤' },
  { id: 'relatorio', label: 'Relatório', marker: '▥' },
];

type Place = {
  name: string;
  capacity: number;
  types: [Equipment, ...Equipment[]];
  note: string;
};
const places: [Place, ...Place[]] = [
  {
    name: 'Praça Central',
    capacity: 1,
    types: ['Carrinho', 'Display'],
    note: 'Ponto próximo à estação',
  },
  {
    name: 'Largo do Sol',
    capacity: 2,
    types: ['Carrinho', 'Quiosque'],
    note: 'Entrada principal',
  },
  {
    name: 'Jardim das Flores',
    capacity: 1,
    types: ['Display'],
    note: 'Portão norte',
  },
];

function routeFromHash(): Screen {
  const route = window.location.hash.slice(1);
  return navigation.some(({ id }) => id === route)
    ? (route as Screen)
    : 'inicio';
}

function stateLabel(state: MonthState): string {
  if (state === 'finalizado') return 'Mês finalizado';
  if (state === 'reaberto') return 'Reaberto para ajustes administrativos';
  return 'Mês liberado · cenário ilustrativo';
}

export function App() {
  const [screen, setScreen] = useState<Screen>(routeFromHash);
  const [role, setRole] = useState<Role>('publicador');
  const [monthState, setMonthState] = useState<MonthState>('liberado');
  const [version, setVersion] = useState(0);
  const [invitation, setInvitation] = useState<InvitationState>('pendente');
  const [thirdOpen, setThirdOpen] = useState(true);
  const [cancelled, setCancelled] = useState(false);
  const [adminAdded, setAdminAdded] = useState(false);
  const [newReservation, setNewReservation] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<
    'base' | 'new'
  >('base');
  const [place, setPlace] = useState('Praça Central');
  const [hour, setHour] = useState('10:00–12:00');
  const [equipment, setEquipment] = useState<Equipment>('Carrinho');
  const [review, setReview] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [appearance, setAppearance] = useState<Appearance>(readAppearance);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useLayoutEffect(() => {
    const theme =
      appearance.themeMode === 'system'
        ? systemDark
          ? 'dark'
          : 'light'
        : appearance.themeMode;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.accent = appearance.accent;
    document.documentElement.style.colorScheme = theme;
  }, [appearance, systemDark]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        appearanceStorageKey,
        JSON.stringify(appearance),
      );
    } catch {
      // A demonstração segue utilizável quando o navegador bloqueia armazenamento local.
    }
  }, [appearance]);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const update = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    setSystemDark(media.matches);
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    const handleHash = () => setScreen(routeFromHash());
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  function go(to: Screen): void {
    window.location.hash = to;
    setScreen(to);
    setError('');
    setMessage('');
  }

  function reset(): void {
    setRole('publicador');
    setMonthState('liberado');
    setVersion(0);
    setInvitation('pendente');
    setThirdOpen(true);
    setCancelled(false);
    setAdminAdded(false);
    setNewReservation(false);
    setSelectedReservation('base');
    setPlace('Praça Central');
    setHour('10:00–12:00');
    setEquipment('Carrinho');
    setReview(false);
    setError('');
    setMessage('Demonstração restaurada.');
  }

  const selectedPlace = places.find((item) => item.name === place) ?? places[0];
  const publisherCanEdit = monthState === 'liberado';
  const canEdit =
    role === 'administrador' ? monthState !== 'finalizado' : publisherCanEdit;
  const currentPage =
    navigation.find(({ id }) => id === screen)?.label ?? 'Início';
  const reportLabel =
    monthState === 'finalizado'
      ? `Versão ${version}`
      : version > 0
        ? `Prévia da versão ${version + 1}`
        : 'Prévia não definitiva';

  function reviewReservation(): void {
    setMessage('');
    if (!canEdit) {
      setError('Mês finalizado: publicadores não podem alterar designações.');
      return;
    }
    if (hour === '08:00–10:00' && place === 'Praça Central') {
      setError(
        'Horário indisponível neste local: a capacidade já foi utilizada.',
      );
      setReview(false);
      return;
    }
    if (!selectedPlace.types.includes(equipment)) {
      setError('Esse tipo de equipamento não é permitido no local.');
      setReview(false);
      return;
    }
    setError('');
    setReview(true);
  }

  function confirmReservation(): void {
    if (!canEdit || !review) return;
    setNewReservation(true);
    setSelectedReservation('new');
    setReview(false);
    go('detalhe');
    setMessage('Reserva simulada criada. Nenhum dado foi enviado ao servidor.');
  }

  function finalize(): void {
    if (role !== 'administrador' || monthState === 'finalizado') return;
    flushSync(() => {
      setMonthState('finalizado');
      setVersion((current) => current + 1);
      go('relatorio');
      setMessage(
        'Mês finalizado na demonstração. A impressão pode ser cancelada sem reabrir o mês.',
      );
    });
    window.print();
  }

  const detailIsNew = selectedReservation === 'new' && newReservation;
  const detailTitle = detailIsNew
    ? `${place} · 20 out`
    : 'Praça Central · 17 out';
  const detailHour = detailIsNew ? hour : '08:00–10:00';

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Pular para o conteúdo
      </a>
      <aside className="sidebar" aria-label="Menu principal">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            ✦
          </div>
          <div>
            <strong>congregacaoprega</strong>
            <span>Testemunho Público</span>
          </div>
        </div>
        <div className="sidebar-section-label">CONGREGAÇÃO</div>
        <div className="congregation-chip">
          <span className="chip-icon">C</span>
          <span>
            Congregação Exemplo<small>Brasília · UTC−03</small>
          </span>
        </div>
        <div className="sidebar-section-label">NAVEGAR</div>
        <nav aria-label="Telas do protótipo" className="nav-list">
          {navigation.map(({ id, label, marker }) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={(event) => {
                event.preventDefault();
                go(id);
              }}
              aria-current={screen === id ? 'page' : undefined}
            >
              <span className="nav-marker" aria-hidden="true">
                {marker}
              </span>
              {label}
            </a>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="demo-dot" /> Protótipo UI-001
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            Congregação Exemplo <span>/</span> <strong>{currentPage}</strong>
          </div>
          <div className="topbar-right">
            <span className="date-note">OUTUBRO 2026</span>
            <div className="appearance-control">
              <button
                type="button"
                className="appearance-trigger"
                aria-expanded={appearanceOpen}
                aria-controls="appearance-panel"
                onClick={() => setAppearanceOpen((open) => !open)}
              >
                Aparência
              </button>
              {appearanceOpen && (
                <section
                  id="appearance-panel"
                  className="appearance-panel"
                  aria-label="Aparência"
                >
                  <p>Tema</p>
                  <div className="appearance-options" aria-label="Tema">
                    {themeOptions.map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={appearance.themeMode === id}
                        onClick={() =>
                          setAppearance((current) => ({
                            ...current,
                            themeMode: id,
                          }))
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p>Cor de destaque</p>
                  <div
                    className="appearance-options"
                    aria-label="Cor de destaque"
                  >
                    {accentOptions.map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        className="accent-option"
                        aria-pressed={appearance.accent === id}
                        onClick={() =>
                          setAppearance((current) => ({
                            ...current,
                            accent: id,
                          }))
                        }
                      >
                        <span
                          className={`accent-dot ${id}`}
                          aria-hidden="true"
                        />
                        {label}
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
            <span className="avatar">A</span>
          </div>
        </header>
        <div className="demo-banner">
          <span className="demo-dot" />
          <span>
            Programação e reservas ainda usam dados fictícios. Identidade e
            convites de acesso são tratados pela aplicação.
          </span>
        </div>
        <main id="main-content" className="content" tabIndex={-1}>
          <div className="page-top">
            <div>
              <p className="eyebrow">UI-001 · VISUALIZAÇÃO</p>
              <h1>{currentPage}</h1>
            </div>
            <div className="role-tools" aria-label="Perfil da demonstração">
              <button
                type="button"
                className={role === 'publicador' ? 'role-active' : ''}
                aria-pressed={role === 'publicador'}
                onClick={() => {
                  setRole('publicador');
                  setMessage('Visão de publicador fictício.');
                }}
              >
                Ver como publicador
              </button>
              <button
                type="button"
                className={role === 'administrador' ? 'role-active' : ''}
                aria-pressed={role === 'administrador'}
                onClick={() => {
                  setRole('administrador');
                  setMessage('Visão de administrador local fictício.');
                }}
              >
                Ver como administrador
              </button>
            </div>
          </div>

          {message && (
            <p className="feedback success" role="status" aria-live="polite">
              {message}
            </p>
          )}
          {error && (
            <p className="feedback error" role="alert">
              {error}
            </p>
          )}

          {screen === 'inicio' && (
            <>
              <div className="hero-panel">
                <div>
                  <p className="eyebrow">BEM-VINDO À DEMONSTRAÇÃO</p>
                  <h2>Organize cada designação com clareza.</h2>
                  <p>
                    Explore a programação, os convites e a visão administrativa
                    usando uma congregação fictícia.
                  </p>
                  <button
                    type="button"
                    className="button light"
                    onClick={() => go('programacao')}
                  >
                    Explorar programação <span aria-hidden="true">→</span>
                  </button>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <span className="art-sun" />
                  <span className="art-hill one" />
                  <span className="art-hill two" />
                  <span className="art-kiosk">✦</span>
                </div>
              </div>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">SUA VISÃO</p>
                  <h2>Visão geral</h2>
                </div>
                <span className="soft-badge">14 de outubro de 2026</span>
              </div>
              <div className="summary-grid">
                <article className="metric-card">
                  <span>Próximas designações</span>
                  <strong>
                    {String(
                      (cancelled ? 0 : 1) + (newReservation ? 1 : 0),
                    ).padStart(2, '0')}
                  </strong>
                  <small>Na programação fictícia</small>
                </article>
                <article className="metric-card">
                  <span>Convites pendentes</span>
                  <strong>{invitation === 'pendente' ? '01' : '00'}</strong>
                  <small>Uma resposta pode ser simulada</small>
                </article>
                <article className="metric-card">
                  <span>Estado do mês</span>
                  <strong className="metric-state">
                    {monthState === 'liberado'
                      ? 'Liberado'
                      : monthState === 'finalizado'
                        ? 'Finalizado'
                        : 'Reaberto'}
                  </strong>
                  <small>Outubro de 2026</small>
                </article>
              </div>
              <div className="two-column">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">AGENDA</p>
                      <h3>
                        {cancelled ? 'Reserva recente' : 'Próxima designação'}
                      </h3>
                    </div>
                    <span className={cancelled ? 'tag neutral' : 'tag green'}>
                      {cancelled ? 'Cancelada' : 'Confirmada'}
                    </span>
                  </div>
                  <p className="card-title">Praça Central</p>
                  <p className="muted">Sábado, 17 de outubro · 08:00–10:00</p>
                  <div className="people-row">
                    <span className="person-avatar">A</span>
                    <span className="person-avatar second">M</span>
                    <span>
                      {cancelled
                        ? 'Reserva cancelada nesta demonstração'
                        : `Ana e Marina · 1 vaga ${thirdOpen ? 'aberta' : 'bloqueada'}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setSelectedReservation('base');
                      go('detalhe');
                    }}
                  >
                    Ver detalhes →
                  </button>
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">CAIXA DE ENTRADA</p>
                      <h3>Convites e avisos</h3>
                    </div>
                    <span className="tag amber">
                      {invitation === 'pendente' ? '1 pendente' : 'Atualizado'}
                    </span>
                  </div>
                  <p className="card-title">Largo do Sol</p>
                  <p className="muted">
                    Convite para 20 de outubro · 16:00–18:00
                  </p>
                  <p>
                    Convites pendentes ocupam uma posição, mas não contam como
                    participação confirmada.
                  </p>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => go('convites')}
                  >
                    Abrir convites →
                  </button>
                </section>
              </div>
            </>
          )}

          {screen === 'programacao' && (
            <>
              <div className="intro-row">
                <p>
                  Confira as designações de outubro e abra um horário para
                  conhecer a formação do grupo.
                </p>
                <span className="tag green">{stateLabel(monthState)}</span>
              </div>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">OUTUBRO 2026</p>
                  <h2>Próximas atividades</h2>
                </div>
                <button
                  type="button"
                  className="button primary"
                  onClick={() => go('nova-reserva')}
                >
                  + Criar reserva simulada
                </button>
              </div>
              <div className="schedule-list">
                <article className="schedule-card">
                  <div className="date-tile">
                    <strong>17</strong>
                    <span>SÁB</span>
                  </div>
                  <div className="schedule-info">
                    <span className={cancelled ? 'tag neutral' : 'tag green'}>
                      {cancelled ? 'Cancelada' : 'Confirmada'}
                    </span>
                    <h3>Praça Central</h3>
                    <p>
                      {cancelled
                        ? '08:00–10:00 · Recursos liberados no exemplo'
                        : '08:00–10:00 · Carrinho · Ana e Marina'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="button outline"
                    onClick={() => {
                      setSelectedReservation('base');
                      go('detalhe');
                    }}
                  >
                    Abrir detalhe
                  </button>
                </article>
                <article className="schedule-card">
                  <div className="date-tile">
                    <strong>20</strong>
                    <span>TER</span>
                  </div>
                  <div className="schedule-info">
                    <span className="tag neutral">Ocupada</span>
                    <h3>Praça Central</h3>
                    <p>08:00–10:00 · Carrinho · Rui e Clara</p>
                  </div>
                  <span className="muted">Capacidade 1 de 1</span>
                </article>
                <article className="schedule-card">
                  <div className="date-tile">
                    <strong>20</strong>
                    <span>TER</span>
                  </div>
                  <div className="schedule-info">
                    <span
                      className={
                        invitation === 'aceito' || adminAdded
                          ? 'tag green'
                          : 'tag amber'
                      }
                    >
                      {invitation === 'aceito' || adminAdded
                        ? 'Confirmada'
                        : invitation === 'recusado'
                          ? 'Convite recusado'
                          : 'Convite pendente'}
                    </span>
                    <h3>Largo do Sol</h3>
                    <p>
                      16:00–18:00 · Quiosque · Teresa
                      {adminAdded ? ' e Joaquim' : ''}
                      {invitation === 'aceito' ? ' e Ana' : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="button outline"
                    onClick={() => go('convites')}
                  >
                    Ver convite
                  </button>
                </article>
                {newReservation && (
                  <article className="schedule-card">
                    <div className="date-tile">
                      <strong>20</strong>
                      <span>TER</span>
                    </div>
                    <div className="schedule-info">
                      <span className="tag blue">Em formação</span>
                      <h3>{place}</h3>
                      <p>
                        {hour} · {equipment} · Ana e 2 vagas abertas
                      </p>
                    </div>
                    <button
                      type="button"
                      className="button outline"
                      onClick={() => {
                        setSelectedReservation('new');
                        go('detalhe');
                      }}
                    >
                      Abrir detalhe
                    </button>
                  </article>
                )}
              </div>
            </>
          )}

          {screen === 'nova-reserva' && (
            <>
              <div className="intro-row">
                <p>
                  Escolha um ponto, um horário e o tipo de equipamento. A
                  disponibilidade abaixo é apenas um exemplo fixo.
                </p>
                <span className="tag green">{stateLabel(monthState)}</span>
              </div>
              <div className="two-column form-layout">
                <section className="panel">
                  <p className="eyebrow">PASSO 1 DE 2</p>
                  <h2>Escolha a designação</h2>
                  <div className="field">
                    <label htmlFor="place">Local</label>
                    <select
                      id="place"
                      value={place}
                      onChange={(event) => {
                        const next =
                          places.find(
                            (item) => item.name === event.target.value,
                          ) ?? places[0];
                        setPlace(next.name);
                        setEquipment(next.types[0]);
                        setReview(false);
                        setError('');
                      }}
                    >
                      {places.map((item) => (
                        <option key={item.name}>{item.name}</option>
                      ))}
                    </select>
                    <small>{selectedPlace.note}</small>
                  </div>
                  <div className="field">
                    <label htmlFor="day">Data</label>
                    <input id="day" value="20 de outubro de 2026" readOnly />
                    <small>Data fixa desta demonstração.</small>
                  </div>
                  <div className="field">
                    <label htmlFor="hour">Horário</label>
                    <select
                      id="hour"
                      value={hour}
                      onChange={(event) => {
                        setHour(event.target.value);
                        setReview(false);
                        setError('');
                      }}
                    >
                      <option>10:00–12:00</option>
                      <option>08:00–10:00</option>
                      <option>14:00–16:00</option>
                    </select>
                    <small>
                      Praça Central, 08:00–10:00: capacidade ocupada no exemplo.
                    </small>
                  </div>
                  <div className="field">
                    <label htmlFor="equipment">Equipamento</label>
                    <select
                      id="equipment"
                      value={equipment}
                      onChange={(event) => {
                        setEquipment(event.target.value as Equipment);
                        setReview(false);
                      }}
                    >
                      {selectedPlace.types.map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </select>
                    <small>O grupo escolhe o tipo, não a unidade física.</small>
                  </div>
                  <button
                    type="button"
                    className="button primary full"
                    onClick={reviewReservation}
                    disabled={!canEdit}
                  >
                    Revisar reserva
                  </button>
                  {!canEdit && (
                    <p className="lock-note">
                      Mês finalizado: publicadores não podem alterar
                      designações.
                    </p>
                  )}
                </section>
                <aside className="panel summary-panel">
                  <p className="eyebrow">PASSO 2 DE 2</p>
                  <h2>Resumo</h2>
                  <div className="summary-line">
                    <span>Local</span>
                    <strong>{place}</strong>
                  </div>
                  <div className="summary-line">
                    <span>Quando</span>
                    <strong>20 out · {hour}</strong>
                  </div>
                  <div className="summary-line">
                    <span>Tipo</span>
                    <strong>{equipment}</strong>
                  </div>
                  <div className="summary-line">
                    <span>Responsável</span>
                    <strong>Ana · você</strong>
                  </div>
                  <div className="divider" />
                  <p className="muted">
                    Ao criar, o responsável ocupa uma das três posições. As
                    demais começam abertas neste cenário ilustrativo.
                  </p>
                  {review ? (
                    <button
                      type="button"
                      className="button primary full"
                      onClick={confirmReservation}
                    >
                      Confirmar reserva simulada
                    </button>
                  ) : (
                    <p className="review-hint">
                      Revise as escolhas para habilitar a confirmação.
                    </p>
                  )}
                </aside>
              </div>
            </>
          )}

          {screen === 'detalhe' && (
            <>
              <div className="intro-row">
                <p>
                  Veja quem confirmou presença e quais posições ainda estão
                  disponíveis.
                </p>
                <span className="tag blue">
                  {cancelled && !detailIsNew ? 'Cancelada' : 'Em formação'}
                </span>
              </div>
              <div className="detail-banner">
                <div>
                  <p className="eyebrow">DESIGNAÇÃO · OUTUBRO 2026</p>
                  <h2>{detailTitle}</h2>
                  <p>
                    {detailHour} · {detailIsNew ? equipment : 'Carrinho'} ·
                    Congregação Exemplo
                  </p>
                </div>
                <div className="detail-date">
                  {detailIsNew ? '20' : '17'}
                  <span>OUT</span>
                </div>
              </div>
              <div className="two-column">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">GRUPO</p>
                      <h2>Participantes e vagas</h2>
                    </div>
                    <span className="soft-badge">3 posições</span>
                  </div>
                  <ol className="position-list" data-testid="positions">
                    {cancelled && !detailIsNew ? (
                      [1, 2, 3].map((number) => (
                        <li key={number}>
                          <span className="position-number">{number}</span>
                          <div>
                            <strong>Posição liberada</strong>
                            <small>Reserva cancelada na demonstração</small>
                          </div>
                        </li>
                      ))
                    ) : (
                      <>
                        <li>
                          <span className="position-number">1</span>
                          <div>
                            <strong>Ana · responsável</strong>
                            <small>Participação confirmada</small>
                          </div>
                          <span className="tag green">Confirmada</span>
                        </li>
                        {detailIsNew ? (
                          <li>
                            <span className="position-number">2</span>
                            <div>
                              <strong>Vaga aberta</strong>
                              <small>Publicador elegível pode ingressar</small>
                            </div>
                          </li>
                        ) : (
                          <li>
                            <span className="position-number">2</span>
                            <div>
                              <strong>Marina</strong>
                              <small>Participação confirmada</small>
                            </div>
                            <span className="tag green">Confirmada</span>
                          </li>
                        )}
                        <li>
                          <span className="position-number">3</span>
                          <div>
                            <strong>
                              {detailIsNew || thirdOpen
                                ? 'Vaga aberta'
                                : 'Vaga bloqueada'}
                            </strong>
                            <small>
                              {detailIsNew || thirdOpen
                                ? 'Disponível para ingresso elegível'
                                : 'Controlada pelo responsável'}
                            </small>
                          </div>
                        </li>
                      </>
                    )}
                  </ol>
                  <div className="panel-actions">
                    <button
                      type="button"
                      className="button outline"
                      disabled={!canEdit || cancelled || detailIsNew}
                      onClick={() => {
                        setThirdOpen((open) => !open);
                        setMessage(
                          thirdOpen
                            ? 'Terceira vaga bloqueada na demonstração.'
                            : 'Terceira vaga aberta na demonstração.',
                        );
                      }}
                    >
                      {thirdOpen
                        ? 'Bloquear terceira vaga'
                        : 'Abrir terceira vaga'}
                    </button>
                    <button
                      type="button"
                      className="button danger"
                      disabled={!canEdit || cancelled || detailIsNew}
                      onClick={() => {
                        setCancelled(true);
                        setMessage(
                          'Reserva simulada cancelada. As posições foram liberadas apenas nesta página.',
                        );
                      }}
                    >
                      Cancelar reserva simulada
                    </button>
                  </div>
                  {!canEdit && (
                    <p className="lock-note">
                      Mês finalizado: ações do publicador indisponíveis.
                    </p>
                  )}
                </section>
                <aside className="panel">
                  <p className="eyebrow">SOBRE A RESERVA</p>
                  <h2>Informações</h2>
                  <div className="summary-line">
                    <span>Local</span>
                    <strong>{detailIsNew ? place : 'Praça Central'}</strong>
                  </div>
                  <div className="summary-line">
                    <span>Horário</span>
                    <strong>{detailHour}</strong>
                  </div>
                  <div className="summary-line">
                    <span>Equipamento</span>
                    <strong>{detailIsNew ? equipment : 'Carrinho'}</strong>
                  </div>
                  <div className="summary-line">
                    <span>Fuso</span>
                    <strong>Brasília</strong>
                  </div>
                  <p className="info-callout">
                    A disponibilidade e as permissões desta tela são simuladas.
                    A etapa funcional verificará tudo no servidor.
                  </p>
                </aside>
              </div>
            </>
          )}

          {screen === 'convites' && (
            <>
              <div className="intro-row">
                <p>
                  Convites para designações são diferentes dos convites de
                  acesso à congregação.
                </p>
                <span className="tag green">{stateLabel(monthState)}</span>
              </div>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">CAIXA DE ENTRADA</p>
                  <h2>Convites para designações</h2>
                </div>
                <span className="soft-badge">Outubro 2026</span>
              </div>
              <div className="invite-grid">
                <article className="panel invitation">
                  <div className="panel-heading">
                    <span className="tag amber">
                      {invitation === 'pendente'
                        ? 'Convite pendente'
                        : invitation === 'aceito'
                          ? 'Convite aceito'
                          : 'Convite recusado'}
                    </span>
                    <span className="muted">20 out</span>
                  </div>
                  <h3>Largo do Sol</h3>
                  <p>Terça-feira · 16:00–18:00 · Quiosque</p>
                  <p className="muted">
                    Responsável: Teresa. Resposta demonstrativa até o início da
                    designação.
                  </p>
                  <div className="panel-actions">
                    <button
                      type="button"
                      className="button primary"
                      disabled={invitation !== 'pendente' || !canEdit}
                      onClick={() => {
                        setInvitation('aceito');
                        setMessage(
                          'Convite aceito. Sua participação foi confirmada na demonstração.',
                        );
                      }}
                    >
                      Aceitar convite
                    </button>
                    <button
                      type="button"
                      className="button outline"
                      disabled={invitation !== 'pendente' || !canEdit}
                      onClick={() => {
                        setInvitation('recusado');
                        setMessage(
                          'Convite recusado. A posição está aberta na demonstração.',
                        );
                      }}
                    >
                      Recusar convite
                    </button>
                  </div>
                  {!canEdit && (
                    <p className="lock-note">
                      Mês finalizado: aceite e recusa indisponíveis para
                      publicadores.
                    </p>
                  )}
                </article>
                <article className="panel invitation">
                  <div className="panel-heading">
                    <span className="tag neutral">Convite expirado</span>
                    <span className="muted">12 out</span>
                  </div>
                  <h3>Jardim das Flores</h3>
                  <p>Segunda-feira · 14:00–16:00 · Display</p>
                  <p className="muted">
                    Este convite venceu; a posição voltou a ficar aberta.
                  </p>
                  <button type="button" className="button outline" disabled>
                    Aceitar convite
                  </button>
                </article>
              </div>
              <div className="panel notice-panel">
                <p className="eyebrow">AVISOS NO SISTEMA · EXEMPLOS</p>
                <h2>Atualizações recentes</h2>
                <ul className="notice-list">
                  <li>
                    <span className="notice-icon">✓</span>
                    <span>
                      A designação da Praça Central está confirmada para 17 de
                      outubro.
                    </span>
                  </li>
                  <li>
                    <span className="notice-icon">i</span>
                    <span>
                      O administrador pode acompanhar grupos com menos de duas
                      pessoas confirmadas.
                    </span>
                  </li>
                </ul>
              </div>
            </>
          )}

          {screen === 'administracao' && (
            <>
              <div className="intro-row">
                <p>
                  Uma visão fictícia para revisar o mês, os alertas e a
                  impressão.
                </p>
                <span className="tag green">{stateLabel(monthState)}</span>
              </div>
              <div className="admin-overview">
                <div>
                  <p className="eyebrow">PAINEL DO MÊS</p>
                  <h2>Outubro de 2026</h2>
                  <p>
                    Antes da primeira finalização, o estado liberado é apenas
                    ilustrativo: a regra de publicação ainda será especificada.
                  </p>
                </div>
                <div className="admin-metrics">
                  <div>
                    <strong>03</strong>
                    <span>Locais</span>
                  </div>
                  <div>
                    <strong>
                      {3 + (newReservation ? 1 : 0) - (cancelled ? 1 : 0)}
                    </strong>
                    <span>Designações</span>
                  </div>
                  <div>
                    <strong>
                      {adminAdded || invitation === 'aceito' ? '00' : '01'}
                    </strong>
                    <span>Alerta</span>
                  </div>
                </div>
              </div>
              <div className="two-column">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">RELATÓRIO</p>
                      <h2>Testemunho Público</h2>
                    </div>
                    <span className="tag blue">{reportLabel}</span>
                  </div>
                  <p>
                    Consulte a prévia antes de finalizar. A finalização simulada
                    bloqueia as ações dos publicadores antes de abrir a
                    impressão.
                  </p>
                  <div className="panel-actions">
                    <button
                      type="button"
                      className="button outline"
                      onClick={() => go('relatorio')}
                    >
                      Ver prévia
                    </button>
                    <button
                      type="button"
                      className="button primary"
                      disabled={
                        role !== 'administrador' || monthState === 'finalizado'
                      }
                      onClick={finalize}
                    >
                      Finalizar e imprimir
                    </button>
                    {monthState === 'finalizado' && (
                      <button
                        type="button"
                        className="button outline"
                        disabled={role !== 'administrador'}
                        onClick={() => {
                          setMonthState('reaberto');
                          setMessage(
                            'Mês reaberto somente para ajustes administrativos na demonstração.',
                          );
                        }}
                      >
                        Reabrir para ajustes
                      </button>
                    )}
                    {monthState === 'reaberto' && role === 'administrador' && (
                      <button
                        type="button"
                        className="button outline"
                        disabled={adminAdded}
                        onClick={() => {
                          setAdminAdded(true);
                          setMessage(
                            'Joaquim incluído no grupo fictício. A próxima finalização mostrará o ajuste.',
                          );
                        }}
                      >
                        Adicionar participante fictício
                      </button>
                    )}
                  </div>
                </section>
                <section className="panel">
                  <p className="eyebrow">ATENÇÃO ADMINISTRATIVA</p>
                  <h2>Alertas do mês</h2>
                  {adminAdded || invitation === 'aceito' ? (
                    <p>Não há grupos abaixo do mínimo neste exemplo.</p>
                  ) : (
                    <div className="alert-item">
                      <span className="alert-symbol">!</span>
                      <div>
                        <strong>Grupo abaixo do mínimo</strong>
                        <p>
                          Largo do Sol · 20 out, 16:00. Há somente uma pessoa
                          confirmada; convite pendente não conta para o mínimo.
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="divider" />
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => go('recursos')}
                  >
                    Ver locais e equipamentos →
                  </button>
                </section>
              </div>
            </>
          )}

          {screen === 'recursos' && (
            <>
              <div className="intro-row">
                <p>
                  Exemplos de locais, tipos permitidos e unidades. Alterações
                  reais serão implementadas em outra etapa.
                </p>
                <span className="soft-badge">Congregação Exemplo</span>
              </div>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">PONTOS DE PREGAÇÃO</p>
                  <h2>Locais</h2>
                </div>
                <span className="soft-badge">3 locais</span>
              </div>
              <div className="resource-grid">
                {places.map((item) => (
                  <article className="panel resource-card" key={item.name}>
                    <div className="resource-icon">⌖</div>
                    <h3>{item.name}</h3>
                    <p className="muted">{item.note}</p>
                    <div className="summary-line">
                      <span>Grupos simultâneos</span>
                      <strong>{item.capacity}</strong>
                    </div>
                    <div className="summary-line">
                      <span>Tipos permitidos</span>
                      <strong>{item.types.join(', ')}</strong>
                    </div>
                  </article>
                ))}
              </div>
              <div className="two-column resource-bottom">
                <section className="panel">
                  <p className="eyebrow">INVENTÁRIO FICTÍCIO</p>
                  <h2>Equipamentos</h2>
                  <div className="summary-line">
                    <span>Carrinhos</span>
                    <strong>2 ativos</strong>
                  </div>
                  <div className="summary-line">
                    <span>Quiosques</span>
                    <strong>1 ativo</strong>
                  </div>
                  <div className="summary-line">
                    <span>Displays</span>
                    <strong>1 ativo · 1 inativo</strong>
                  </div>
                  <p className="info-callout">
                    Unidades inativas não entram na disponibilidade de novas
                    reservas.
                  </p>
                </section>
                <section className="panel">
                  <p className="eyebrow">CONFIGURAÇÃO FICTÍCIA</p>
                  <h2>Horários semanais</h2>
                  <div className="summary-line">
                    <span>Segunda a sexta</span>
                    <strong>08:00–18:00</strong>
                  </div>
                  <div className="summary-line">
                    <span>Sábado</span>
                    <strong>07:00–19:00</strong>
                  </div>
                  <div className="summary-line">
                    <span>Domingo</span>
                    <strong>Sem restrição</strong>
                  </div>
                  <p className="info-callout">
                    Fuso da congregação: America/Sao_Paulo. Estes horários
                    servem apenas para visualizar a interface.
                  </p>
                </section>
              </div>
            </>
          )}

          {screen === 'relatorio' && (
            <>
              <div className="intro-row no-print">
                <p>
                  Prévia demonstrativa do relatório. Use a impressão do
                  navegador para avaliar a leitura no papel.
                </p>
                <div className="panel-actions">
                  <span className="tag blue">{reportLabel}</span>
                  <button
                    type="button"
                    className="button outline"
                    onClick={() => window.print()}
                  >
                    Imprimir prévia
                  </button>
                </div>
              </div>
              <article className="print-sheet">
                <div className="report-top">
                  <div>
                    <p className="eyebrow">CONGREGAÇÃO EXEMPLO</p>
                    <h2>Testemunho Público</h2>
                    <p>Programação de outubro de 2026 · Fuso de Brasília</p>
                  </div>
                  <span>{reportLabel}</span>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Dia</th>
                      <th>Local</th>
                      <th>Horário</th>
                      <th>Publicadores</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!cancelled && (
                      <tr>
                        <td>17/10</td>
                        <td>Sábado</td>
                        <td>Praça Central</td>
                        <td>08:00–10:00</td>
                        <td>Ana; Marina</td>
                      </tr>
                    )}
                    <tr>
                      <td>20/10</td>
                      <td>Terça</td>
                      <td>Praça Central</td>
                      <td>08:00–10:00</td>
                      <td>Rui; Clara</td>
                    </tr>
                    <tr>
                      <td>20/10</td>
                      <td>Terça</td>
                      <td>Largo do Sol</td>
                      <td>16:00–18:00</td>
                      <td>
                        Teresa{adminAdded ? '; Joaquim' : ''}
                        {invitation === 'aceito' ? '; Ana' : ''}
                      </td>
                    </tr>
                    {newReservation && (
                      <tr>
                        <td>20/10</td>
                        <td>Terça</td>
                        <td>{place}</td>
                        <td>{hour}</td>
                        <td>Ana</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <p className="report-footnote">
                  Dados fictícios para avaliação do leiaute. Convites pendentes
                  não aparecem neste exemplo; a apresentação definitiva ainda
                  depende de PM-06. Não usar como programação oficial.
                </p>
              </article>
            </>
          )}

          <footer className="page-footer no-print">
            <span>UI-001 · Módulos de programação ainda demonstrativos</span>
            <button type="button" className="text-button" onClick={reset}>
              Restaurar demonstração
            </button>
          </footer>
        </main>
      </div>
    </div>
  );
}
