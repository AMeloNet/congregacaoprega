# PBL-001 — Evidências da publicação da prévia UI-001

Data: 21/09/2026.
Requisito: [PBL-001](../requisitos/PBL-001.md).
Pull Request: [#11](https://github.com/AMeloNet/congregacaoprega/pull/11).

## Artefato publicado

- URL: [congregacaoprega-preview.onrender.com](https://congregacaoprega-preview.onrender.com/).
- Serviço: Static Site gratuito `congregacaoprega-preview`, gerenciado pelo
  Blueprint `render.yaml`.
- Commit publicado: `7873e0d385e9844c22560b8263454821eb1aeacd`.
- O painel do Render apresentou o deploy como `Live`, originado da branch
  `main`, com duração registrada de 26,2 segundos.

## Verificações locais antes do PR #11

| Comando | Resultado |
| --- | --- |
| `pnpm docs:check` | Aprovado; referências Markdown locais válidas |
| `pnpm format` | Aprovado |
| `pnpm lint` | Aprovado |
| `pnpm typecheck` | Aprovado após repetir fora do ambiente restrito que retornou `spawn EPERM` |
| `pnpm build` | Aprovado; `apps/web/dist` gerado |
| `pnpm test:unit` | 2 arquivos e 7 testes aprovados |
| `pnpm test:e2e` | 6 testes Chromium aprovados em desktop e celular |
| `git diff --check` | Aprovado |

## CI e validação pública

A execução da CI da `main`
[`35650126737`](https://github.com/AMeloNet/congregacaoprega/actions/runs/35650126737)
aprovou os quatro jobs: verificações estáticas e testes unitários, PostgreSQL e
migrations, Chromium e teste de fumaça do container.

Na URL pública foram verificados:

- carregamento do protótipo sem login, segredo, banco ou serviço de e-mail;
- aviso visível de demonstração com dados fictícios;
- navegação para `#programacao` e preservação da rota após recarregar;
- ausência de rolagem horizontal nas larguras observadas de computador e
  celular; na largura móvel, `scrollWidth` e `clientWidth` foram ambos 375 px;
- ausência de mensagens de erro no console durante a verificação.

Essas evidências validam PBL-01 a PBL-04 para a prévia visual. Elas não validam
autenticação, autorização, API, persistência, envio de e-mail, migrations em
ambiente persistente ou implantação do piloto operacional.
