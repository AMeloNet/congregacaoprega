# Evidências TEC-001 — base técnica

Status: validações locais e quatro jobs da CI aprovados em 19/09/2026 no
[PR #5](https://github.com/AMeloNet/congregacaoprega/pull/5),
[execução Verify](https://github.com/AMeloNet/congregacaoprega/actions/runs/35458499775).
Requisito: [TEC-001](../requisitos/TEC-001.md). Ambiente local: Windows,
Node 24.19.0, pnpm 11.19.0. Alvo de CI: Node 24.21.0 e PostgreSQL 18.6.
Docker e PostgreSQL não estão instalados neste Windows.

| Casos | Comando ou prova | Resultado local |
| --- | --- | --- |
| TEC-01 | `pnpm install --frozen-lockfile` | Aprovado, lockfile mantido; pnpm 12.4.2 proposto não executou no Windows, pnpm 11.19.0 foi fixado e documentado |
| TEC-02 | `pnpm format`, `pnpm lint`, `pnpm typecheck` | Aprovados; lint rejeitou arquivo temporário com variável não usada (exit 1) e voltou a passar após removê-lo |
| TEC-03, TEC-05 | `pnpm test:unit` | Testes API e interface passaram (4 testes). Antes da implementação, liveness deu 404, a página e botão estavam ausentes; depois passaram |
| TEC-04, TEC-09 | `pnpm test:e2e` | Chromium desktop e móvel: 2 testes aprovados; teclado, largura e erro 503 verificados |
| TEC-06–08 | `pnpm test:integration` | Não executado localmente: falta PostgreSQL/Docker. [Job PostgreSQL e migrations](https://github.com/AMeloNet/congregacaoprega/actions/runs/35458499775/job/105937959707) aprovado em PostgreSQL 18 descartável |
| TEC-10 | `.github/workflows/verify.yml` | Quatro jobs aprovados na CI. Falha deliberada demonstrada localmente no lint; bloqueio por check exigido ainda depende de ativar a proteção da `main` após verificação de identidade do GitHub |
| TEC-11 | `pnpm build` | API e interface compiladas; [job do contêiner](https://github.com/AMeloNet/congregacaoprega/actions/runs/35458499775/job/105937959769) aprovado, incluindo ausência de configuração e assets servidos pela API |
| TEC-12 | `pnpm docs:check` | Detectou duas referências pendentes; corrigidas, repetição aprovada |

O [job estático](https://github.com/AMeloNet/congregacaoprega/actions/runs/35458499775/job/105937959838)
e o [job Chromium](https://github.com/AMeloNet/congregacaoprega/actions/runs/35458499775/job/105937959781)
também passaram. Nenhuma prova com fixture substitui testes das migrations reais
que acompanhem mudanças de negócio. A regra de proteção foi preparada com PR
obrigatório, quatro checks e sem aprovação impossível para mantenedor único;
o GitHub solicitou confirmação de identidade por e-mail ao salvar. Não declarar
essa regra ativa antes de confirmar a criação no painel do repositório.
