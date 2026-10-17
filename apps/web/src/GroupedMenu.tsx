import { useEffect, useRef, useState } from 'react';

export type MenuScreen =
  | 'inicio'
  | 'programacao'
  | 'nova-reserva'
  | 'detalhe'
  | 'convites'
  | 'administracao'
  | 'recursos'
  | 'relatorio'
  | 'publicadores'
  | 'equipamentos'
  | 'pontos'
  | 'horarios'
  | 'alertas'
  | 'conta'
  | 'administradores';
type MenuEntry = { screen: MenuScreen; label: string; icon: string };
function MenuIcon({ icon }: { icon: string }) {
  const paths: Record<string, string> = {
    '⌂': 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
    '▦': 'M4 5h16v16H4zM4 10h16M8 3v4M16 3v4M8 14h2M14 14h2M8 18h2',
    '+': 'M12 5v14M5 12h14',
    '◫': 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h4',
    '✉': 'M3 5h18v14H3zM3 6l9 7 9-7',
    '♧': 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21v-3a7 7 0 0 1 14 0v3M17 4a4 4 0 0 1 0 7M19 14a6 6 0 0 1 3 5v2',
    '▤': 'M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10',
    '⌖': 'M12 22s8-9 8-14a8 8 0 1 0-16 0c0 5 8 14 8 14ZM12 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
    '◷': 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM12 6v6l4 2',
    '!': 'M4 17h16l-2-3V9a6 6 0 0 0-12 0v5zM9 21h6',
    '▥': 'M5 3h14v18H5zM9 17v-4M12 17V9M15 17v-6',
    '○': 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM3 22v-2a9 9 0 0 1 18 0v2',
    '◇': 'M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6zM8 12l3 3 5-6',
    '◐': 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM12 2v20',
    '↪': 'M9 4H3v16h6M8 12h13M16 7l5 5-5 5',
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[icon]} />
    </svg>
  );
}
export const screenLabels: Record<MenuScreen, string> = {
  inicio: 'Início',
  programacao: 'Programação',
  'nova-reserva': 'Nova reserva',
  detalhe: 'Detalhe da reserva',
  convites: 'Convites e avisos',
  administracao: 'Gestão mensal',
  recursos: 'Recursos',
  relatorio: 'Relatório',
  publicadores: 'Publicadores',
  equipamentos: 'Equipamentos',
  pontos: 'Pontos',
  horarios: 'Horários',
  alertas: 'Alertas administrativos',
  conta: 'Minha conta',
  administradores: 'Administradores',
};
export function canOpenScreen(
  screen: MenuScreen,
  canManage: boolean,
  hasMembership: boolean,
  isMaster: boolean,
) {
  if (screen === 'administradores') return isMaster;
  if (screen === 'inicio' || screen === 'conta') return true;
  if (
    [
      'administracao',
      'recursos',
      'relatorio',
      'publicadores',
      'equipamentos',
      'pontos',
      'horarios',
      'alertas',
    ].includes(screen)
  )
    return hasMembership && canManage;
  return hasMembership;
}
export function GroupedMenu({
  screen,
  onNavigate,
  onAppearance,
  congregationName,
  canManage,
  hasMembership,
  isMaster = false,
}: {
  screen: MenuScreen;
  onNavigate: (screen: MenuScreen) => void;
  onAppearance: () => void;
  congregationName?: string;
  canManage: boolean;
  hasMembership: boolean;
  isMaster?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    Programação: true,
  });
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const entries: { label: string; entries: MenuEntry[] }[] = [
    {
      label: 'Programação',
      entries: [
        { screen: 'inicio', label: 'Início', icon: '⌂' },
        { screen: 'programacao', label: 'Programação', icon: '▦' },
        { screen: 'nova-reserva', label: 'Nova reserva', icon: '+' },
        { screen: 'detalhe', label: 'Detalhe da reserva', icon: '◫' },
      ],
    },
    {
      label: 'Participação',
      entries: [{ screen: 'convites', label: 'Convites e avisos', icon: '✉' }],
    },
    {
      label: 'Cadastros',
      entries: [
        { screen: 'publicadores', label: 'Publicadores', icon: '♧' },
        { screen: 'equipamentos', label: 'Equipamentos', icon: '▤' },
        { screen: 'pontos', label: 'Pontos', icon: '⌖' },
        { screen: 'horarios', label: 'Horários', icon: '◷' },
      ],
    },
    {
      label: 'Administração',
      entries: [
        { screen: 'administracao', label: 'Gestão mensal', icon: '▦' },
        { screen: 'alertas', label: 'Alertas administrativos', icon: '!' },
      ],
    },
    {
      label: 'Relatórios',
      entries: [{ screen: 'relatorio', label: 'Relatório', icon: '▥' }],
    },
    {
      label: 'Sistema',
      entries: [
        { screen: 'administradores', label: 'Administradores', icon: '◇' },
      ],
    },
    {
      label: 'Minha conta',
      entries: [{ screen: 'conta', label: 'Meu perfil', icon: '○' }],
    },
  ];
  const groups = entries
    .map((group) => ({
      ...group,
      entries: group.entries.filter((entry) =>
        canOpenScreen(entry.screen, canManage, hasMembership, isMaster),
      ),
    }))
    .filter((group) => group.entries.length);
  const activeGroup = groups.find((group) =>
    group.entries.some((entry) => entry.screen === screen),
  )?.label;
  useEffect(() => {
    if (activeGroup)
      setExpanded((current) => ({ ...current, [activeGroup]: true }));
  }, [activeGroup]);
  useEffect(() => {
    const panel = dialog.current;
    if (open && !panel?.open) panel?.showModal();
    if (!open && panel?.open) panel.close();
  }, [open]);
  return (
    <>
      <button
        ref={trigger}
        className="menu-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="main-menu"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">☰</span> Menu
      </button>
      <dialog
        ref={dialog}
        id="main-menu"
        className="grouped-menu"
        aria-labelledby="menu-heading"
        onCancel={() => setOpen(false)}
        onClose={() => {
          setOpen(false);
          trigger.current?.focus();
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const controls = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              'button, a[href], summary',
            ),
          ).filter((element) => element.getClientRects().length > 0);
          const first = controls[0],
            last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            setOpen(false);
        }}
      >
        <header className="menu-heading">
          <h2 id="menu-heading">Menu principal</h2>
          <button
            type="button"
            className="menu-close"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
            autoFocus
          >
            ×
          </button>
        </header>
        <p className="menu-brand">congregacaoprega</p>
        <p className="menu-congregation">
          {congregationName ?? 'Selecione uma congregação'}
        </p>
        <p className="menu-role">
          {isMaster
            ? 'Administrador master'
            : canManage
              ? 'Administrador local'
              : 'Publicador'}
        </p>
        <nav aria-label="Navegação principal">
          {groups.map((group) => (
            <details
              key={group.label}
              open={!!expanded[group.label]}
              onToggle={(event) => {
                const value = event.currentTarget.open;
                setExpanded((current) =>
                  current[group.label] === value
                    ? current
                    : { ...current, [group.label]: value },
                );
              }}
            >
              <summary>
                {group.label}
                <span className="menu-chevron" aria-hidden="true">
                  ⌄
                </span>
              </summary>
              <div className="menu-links">
                {group.entries.map((entry) => (
                  <a
                    key={entry.screen}
                    href={`#${entry.screen}`}
                    aria-current={screen === entry.screen ? 'page' : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      setOpen(false);
                      onNavigate(entry.screen);
                    }}
                  >
                    <MenuIcon icon={entry.icon} />
                    {entry.label}
                  </a>
                ))}
                {group.label === 'Minha conta' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onAppearance();
                      }}
                    >
                      <MenuIcon icon="◐" />
                      Aparência
                    </button>
                    <a href="/api/auth/logout">
                      <MenuIcon icon="↪" />
                      Sair
                    </a>
                  </>
                )}
              </div>
            </details>
          ))}
        </nav>
      </dialog>
    </>
  );
}
