import { type FormEvent, useEffect, useState } from 'react';
import { App } from './App.js';

type Membership = {
  congregationId: string;
  congregationName: string;
  role: 'PUBLISHER' | 'LOCAL_ADMIN';
};
type ManagedMembership = {
  id: string;
  email: string;
  role: 'PUBLISHER' | 'LOCAL_ADMIN';
  status: 'ACTIVE' | 'REVOKED';
};
type Session = {
  authenticated: boolean;
  email?: string;
  emailVerified?: boolean;
  isMaster?: boolean;
  csrfToken?: string;
  activeCongregationId?: string;
  memberships?: Membership[];
  adminCongregations?: Array<{ id: string; name: string }>;
};

function roleLabel(role: Membership['role']): string {
  return role === 'LOCAL_ADMIN' ? 'Administrador local' : 'Publicador';
}

function tokenFromPath(): string | undefined {
  const match = window.location.pathname.match(/^\/convites\/([^/]+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export function AccessApp({
  invitationToken = tokenFromPath(),
}: {
  invitationToken?: string;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const [active, setActive] = useState('');
  const [publisherEmail, setPublisherEmail] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminCongregation, setAdminCongregation] = useState('');
  const [message, setMessage] = useState('');
  const [managedMemberships, setManagedMemberships] = useState<
    ManagedMembership[]
  >([]);

  useEffect(() => {
    let mounted = true;
    void fetch('/api/session')
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Não foi possível consultar sua sessão.');
        return (await response.json()) as Session;
      })
      .then((value) => {
        if (!mounted) return;
        setSession(value);
        setActive(
          value.activeCongregationId ??
            value.memberships?.[0]?.congregationId ??
            '',
        );
        setAdminCongregation(value.adminCongregations?.[0]?.id ?? '');
      })
      .catch(
        () =>
          mounted &&
          setError('Não foi possível conectar ao servidor. Tente novamente.'),
      );
    return () => {
      mounted = false;
    };
  }, []);

  if (error && !session)
    return (
      <p className="feedback error" role="alert">
        {error}
      </p>
    );
  if (!session) return <p role="status">Carregando acesso…</p>;
  if (!session.authenticated) {
    return (
      <main className="access-page">
        <section className="panel access-card">
          <p className="eyebrow">CONGREGAÇÃOPREGA</p>
          <h1>Acesse sua congregação</h1>
          <p>
            Use sua conta por e-mail. A senha permanece protegida pelo Auth0.
          </p>
          <a className="button" href="/api/auth/login">
            Entrar com e-mail
          </a>
          <a className="text-button" href="/api/auth/recover">
            Recuperar senha
          </a>
        </section>
      </main>
    );
  }
  if (!session.emailVerified) {
    return (
      <main className="access-page">
        <section className="panel access-card">
          <h1>Confirme seu e-mail</h1>
          <p role="alert">
            Confirme seu e-mail no link enviado pelo Auth0 antes de continuar.
          </p>
          <a className="button" href="/api/auth/logout">
            Sair
          </a>
        </section>
      </main>
    );
  }
  const memberships = session.memberships ?? [];
  if (memberships.length === 0 && !session.isMaster) {
    return (
      <main className="access-page">
        <section className="panel access-card">
          <h1>Conta sem congregação</h1>
          <p role="status">
            Você ainda não possui vínculo ativo. Abra o convite recebido ou fale
            com um administrador local.
          </p>
          <a className="button outline" href="/api/auth/logout">
            Sair
          </a>
        </section>
      </main>
    );
  }
  const selected = memberships.find((item) => item.congregationId === active);

  async function invitationAction(action: 'accept' | 'decline'): Promise<void> {
    setError('');
    const response = await fetch(
      `/api/invitations/${encodeURIComponent(invitationToken!)}/${action}`,
      { method: 'POST', headers: { 'x-csrf-token': session!.csrfToken ?? '' } },
    );
    if (!response.ok) {
      setError('O convite não está disponível ou não pertence a esta conta.');
      return;
    }
    setMessage(action === 'accept' ? 'Convite aceito.' : 'Convite recusado.');
  }

  async function invitePublisher(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setError('');
    const response = await fetch(
      `/api/congregations/${encodeURIComponent(active)}/invitations/publisher`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': session!.csrfToken ?? '',
        },
        body: JSON.stringify({ email: publisherEmail }),
      },
    );
    if (!response.ok) {
      setError(
        'Não foi possível enviar o convite. Confira o endereço e tente novamente.',
      );
      return;
    }
    setPublisherEmail('');
    setMessage('Convite de publicador registrado na captura controlada.');
  }

  async function inviteAdministrator(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setError('');
    const response = await fetch(
      `/api/congregations/${encodeURIComponent(adminCongregation)}/invitations/admin`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': session!.csrfToken ?? '',
        },
        body: JSON.stringify({ email: adminEmail }),
      },
    );
    if (!response.ok) {
      setError('Não foi possível convidar o administrador local.');
      return;
    }
    setAdminEmail('');
    setMessage(
      'Convite de administrador local registrado na captura controlada.',
    );
  }

  async function loadMemberships(): Promise<void> {
    setError('');
    const response = await fetch(
      `/api/congregations/${encodeURIComponent(active)}/memberships`,
    );
    if (!response.ok) {
      setError('Não foi possível consultar os vínculos desta congregação.');
      return;
    }
    setManagedMemberships((await response.json()) as ManagedMembership[]);
  }

  async function changeManagedMembership(
    membership: ManagedMembership,
  ): Promise<void> {
    const action = membership.status === 'ACTIVE' ? 'revoke' : 'reactivate';
    const response = await fetch(
      `/api/memberships/${encodeURIComponent(membership.id)}/${action}`,
      {
        method: 'POST',
        headers: { 'x-csrf-token': session!.csrfToken ?? '' },
      },
    );
    if (!response.ok) {
      setError('Não foi possível alterar esse vínculo.');
      return;
    }
    setManagedMemberships((current) =>
      current.map((item) =>
        item.id === membership.id
          ? {
              ...item,
              status: item.status === 'ACTIVE' ? 'REVOKED' : 'ACTIVE',
            }
          : item,
      ),
    );
    setMessage(
      membership.status === 'ACTIVE'
        ? 'Vínculo revogado imediatamente.'
        : 'Vínculo reativado.',
    );
  }

  async function selectCongregation(congregationId: string): Promise<void> {
    setError('');
    const response = await fetch('/api/session/congregation', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': session!.csrfToken ?? '',
      },
      body: JSON.stringify({ congregationId }),
    });
    if (!response.ok) {
      setError('Não foi possível selecionar essa congregação.');
      return;
    }
    setActive(congregationId);
  }

  return (
    <>
      <div className="identity-bar">
        {memberships.length > 0 && (
          <>
            <label htmlFor="active-congregation">Congregação ativa</label>
            <select
              id="active-congregation"
              value={active}
              onChange={(event) => void selectCongregation(event.target.value)}
            >
              {memberships.map((membership) => (
                <option
                  key={membership.congregationId}
                  value={membership.congregationId}
                >
                  {membership.congregationName}
                </option>
              ))}
            </select>
          </>
        )}
        <strong>
          {session.isMaster
            ? 'Administrador master'
            : selected
              ? roleLabel(selected.role)
              : ''}
        </strong>
        <a href="/api/auth/logout">Sair</a>
      </div>
      {(invitationToken ||
        selected?.role === 'LOCAL_ADMIN' ||
        session.isMaster) && (
        <section className="identity-actions" aria-label="Acesso e convites">
          {message && (
            <p className="feedback success" role="status">
              {message}
            </p>
          )}
          {error && (
            <p className="feedback error" role="alert">
              {error}
            </p>
          )}
          {invitationToken && (
            <div className="panel compact-panel">
              <h2>Convite de acesso</h2>
              <p>
                Aceite somente se reconhecer a congregação e o destinatário.
              </p>
              <div className="panel-actions">
                <button
                  className="button"
                  type="button"
                  onClick={() => void invitationAction('accept')}
                >
                  Aceitar convite
                </button>
                <button
                  className="button outline"
                  type="button"
                  onClick={() => void invitationAction('decline')}
                >
                  Recusar convite
                </button>
              </div>
            </div>
          )}
          {selected?.role === 'LOCAL_ADMIN' && (
            <>
              <form
                className="panel compact-panel"
                onSubmit={(event) => void invitePublisher(event)}
              >
                <h2>Convidar publicador</h2>
                <label htmlFor="publisher-email">
                  E-mail do novo publicador
                </label>
                <input
                  id="publisher-email"
                  type="email"
                  required
                  value={publisherEmail}
                  onChange={(event) => setPublisherEmail(event.target.value)}
                />
                <button className="button" type="submit">
                  Enviar convite
                </button>
              </form>
              <div className="panel compact-panel">
                <h2>Vínculos da congregação</h2>
                <button
                  className="button outline"
                  type="button"
                  onClick={() => void loadMemberships()}
                >
                  Consultar vínculos
                </button>
                {managedMemberships.length === 0 ? (
                  <p>Nenhum vínculo carregado.</p>
                ) : (
                  <ul className="membership-list">
                    {managedMemberships.map((membership) => (
                      <li key={membership.id}>
                        <span>
                          <strong>{membership.email}</strong>{' '}
                          <span>
                            {membership.status === 'ACTIVE'
                              ? 'Ativo'
                              : 'Revogado'}
                          </span>
                        </span>
                        {membership.role === 'PUBLISHER' && (
                          <button
                            className="text-button"
                            type="button"
                            onClick={() =>
                              void changeManagedMembership(membership)
                            }
                            aria-label={`${
                              membership.status === 'ACTIVE'
                                ? 'Revogar'
                                : 'Reativar'
                            } ${membership.email}`}
                          >
                            {membership.status === 'ACTIVE'
                              ? 'Revogar'
                              : 'Reativar'}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
          {session.isMaster && (
            <form
              className="panel compact-panel"
              onSubmit={(event) => void inviteAdministrator(event)}
            >
              <h2>Convidar administrador local</h2>
              <label htmlFor="admin-congregation">
                Congregação para administrar
              </label>
              <select
                id="admin-congregation"
                required
                value={adminCongregation}
                onChange={(event) => setAdminCongregation(event.target.value)}
              >
                {(session.adminCongregations ?? []).map((congregation) => (
                  <option key={congregation.id} value={congregation.id}>
                    {congregation.name}
                  </option>
                ))}
              </select>
              <label htmlFor="admin-email">E-mail do administrador local</label>
              <input
                id="admin-email"
                type="email"
                required
                value={adminEmail}
                onChange={(event) => setAdminEmail(event.target.value)}
              />
              <button className="button" type="submit">
                Enviar convite de administrador
              </button>
            </form>
          )}
        </section>
      )}
      <App />
    </>
  );
}
