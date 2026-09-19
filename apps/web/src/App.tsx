import { useState } from 'react';
import './styles.css';

export function App() {
  const [connection, setConnection] = useState<
    'idle' | 'checking' | 'online' | 'offline'
  >('idle');

  async function checkConnection(): Promise<void> {
    setConnection('checking');
    try {
      const response = await fetch('/api/health/ready', { cache: 'no-store' });
      setConnection(response.ok ? 'online' : 'offline');
    } catch {
      setConnection('offline');
    }
  }

  return (
    <main className="page">
      <section className="card" aria-labelledby="project-title">
        <p className="eyebrow">Testemunho Público</p>
        <h1 id="project-title">congregacaoprega</h1>
        <p className="status" role="status">
          Base técnica em preparação
        </p>
        <p>
          Estamos preparando os testes, o banco de dados e a estrutura inicial
          para organizar as designações.
        </p>
        <button
          type="button"
          onClick={() => void checkConnection()}
          disabled={connection === 'checking'}
        >
          Verificar conexão
        </button>
        <p role="status" aria-live="polite">
          {connection === 'checking' && 'Verificando conexão…'}
          {connection === 'online' && 'Servidor disponível.'}
          {connection === 'offline' &&
            'Sem conexão com o servidor. Tente novamente.'}
        </p>
      </section>
    </main>
  );
}
