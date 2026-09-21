# UI-001 — Cenários do protótipo

Status: **executados localmente em 21/09/2026**. Referência:
[UI-001](../requisitos/UI-001.md).

| Cenário | Critério | Resultado esperado |
| --- | --- | --- |
| T-UI-01 | UI-01, UI-02 | Navegar por início, programação, reserva, detalhe, convites, administração, recursos e relatório; voltar e recarregar mantêm rota válida e identificação da demonstração |
| T-UI-02 | UI-03, UI-04 | Criar reserva fictícia em local/horário/tipo permitido mostra detalhe e três posições; tentar horário indisponível não cria reserva |
| T-UI-03 | UI-03, UI-04 | Aceitar convite pendente confirma pessoa; recusar libera posição; expirado explica impedimento |
| T-UI-04 | UI-03, UI-04 | Responsável bloqueia/reabre terceira vaga vazia; grupo cheio impede ingresso; cancelamento simulado atualiza estado |
| T-UI-05 | UI-03, UI-04 | Finalizar cria versão e bloqueia ações do publicador; reabertura mantém bloqueio do publicador; nova finalização cria outra versão; restauração repõe estado inicial |
| T-UI-06 | UI-05 | Navegação e ações por teclado, sem rolagem horizontal em celular e computador; relatório imprimível sem cortar informação essencial |
| T-UI-07 | UI-02 | Protótipo não requisita endpoints de negócio, não oferece senha nem dispara e-mail |

Testes de componente cobrem transições e mensagens. Testes de navegador cobrem
as jornadas e a apresentação em Chromium desktop/celular. A comprovação de
concorrência, permissões no servidor e persistência pertence às etapas funcionais.

## Evidências da implementação

Ambiente local: Windows, Node `24.19.0`, pnpm `11.19.0` e Chromium fornecido pelo
Playwright `1.63.0`. A versão alvo de Node do projeto permanece `24.21.0` e será
usada pela CI.

Antes da implementação, os quatro testes de componente falharam porque a página
da base técnica ainda não oferecia identificação da demonstração, navegação,
criação simulada, convites ou troca de perfil. Depois da implementação e do
rebase sobre `main`, foram obtidos estes resultados:

| Comando | Resultado local |
| --- | --- |
| `pnpm docs:check` | Aprovado; links Markdown locais válidos |
| `pnpm format` | Aprovado; arquivos no padrão Prettier |
| `pnpm lint` | Aprovado; nenhum aviso ou erro |
| `pnpm typecheck` | Aprovado nos projetos API, web e database |
| `pnpm db:validate` | Aprovado; schema Prisma válido e sem alteração da UI-001 |
| `pnpm build` | Aprovado nos projetos API e web |
| `pnpm test:unit` | Aprovado; 2 arquivos e 7 testes |
| `pnpm test:e2e` | Aprovado; 6 testes, sendo as 3 jornadas em Chromium desktop e celular |
| `git diff --check origin/main...HEAD` | Aprovado; nenhum erro de espaço em branco |

Os testes E2E verificaram navegação e recarga por rota, teclado, ausência de
rolagem horizontal, ausência de chamadas a `/api/`, reserva e convite
simulados, bloqueio mensal e apresentação em modo de impressão. Também houve
inspeção visual local das páginas inicial e de relatório em desktop e da página
inicial em celular.

`pnpm test:integration` não foi executado localmente: a UI-001 não altera API,
persistência, schema ou migrations e o ambiente não recebeu uma
`TEST_DATABASE_URL`. A suíte de integração existente permanece como verificação
da CI sobre PostgreSQL descartável.
