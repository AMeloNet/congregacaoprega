import { useEffect, useState, type FormEvent } from 'react';
import type { EquipmentContext } from './EquipmentPanel.js';

export function RegistrationPanel({
  csrfToken,
  email,
}: {
  csrfToken: string;
  email: string;
}) {
  const [name, setName] = useState(''),
    [phone, setPhone] = useState(''),
    [code, setCode] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/registration', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Não foi possível consultar seu cadastro.');
        const data = await response.json();
        if (!controller.signal.aborted && data) {
          setName(data.displayName);
          setPhone(data.phone);
          setCode(data.code);
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError((failure as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/registration', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ displayName: name, phone }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message ?? 'Não foi possível salvar seu cadastro.',
        );
      setCode(result.code);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Cadastro para aprovação">
      <h2>Seu cadastro</h2>
      <p>E-mail verificado: {email}</p>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status">Carregando cadastro…</p>
      ) : (
        <>
          {code && (
            <div className="info-callout">
              <p>Envie este código ao administrador da sua congregação:</p>
              <strong className="registration-code">{code}</strong>
              <p>
                O código identifica seu cadastro. Seu acesso à congregação
                depende da aprovação do administrador.
              </p>
              <button
                type="button"
                className="button outline"
                onClick={() => window.location.reload()}
              >
                Verificar liberação
              </button>
            </div>
          )}
          <details open={!code}>
            <summary>{code ? 'Editar cadastro' : 'Concluir cadastro'}</summary>
            <form onSubmit={(event) => void save(event)}>
              <fieldset disabled={busy}>
                <label htmlFor="registration-name">Nome completo</label>
                <input
                  id="registration-name"
                  required
                  maxLength={120}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
                <label htmlFor="registration-phone">Telefone</label>
                <input
                  id="registration-phone"
                  type="tel"
                  required
                  minLength={8}
                  maxLength={30}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
                <button className="button">
                  {busy
                    ? 'Salvando…'
                    : code
                      ? 'Salvar cadastro'
                      : 'Gerar meu código'}
                </button>
              </fieldset>
            </form>
          </details>
        </>
      )}
    </section>
  );
}

export function ApproveCodePanel({
  context,
  onApproved,
}: {
  context: EquipmentContext;
  onApproved: () => void;
}) {
  const [code, setCode] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function approve(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(
        `/api/congregations/${encodeURIComponent(context.congregationId)}/approve-code`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': context.csrfToken,
          },
          body: JSON.stringify({ code }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message ?? 'Não foi possível liberar o acesso.');
      setMessage(`Acesso liberado para ${result.displayName}.`);
      setCode('');
      onApproved();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="panel">
      <summary>Adicionar publicador pelo código</summary>
      <form onSubmit={(event) => void approve(event)}>
        <label htmlFor="approval-code">Código do publicador</label>
        <input
          id="approval-code"
          required
          minLength={10}
          maxLength={10}
          pattern="[A-Za-z0-9]{10}"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
        />
        <button className="button" disabled={busy}>
          {busy ? 'Liberando…' : 'Liberar acesso'}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
