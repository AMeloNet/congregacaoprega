# Evidências TEC-001 — base técnica

Status: validações locais parciais em 19/09/2026; CI aguarda execução do PR.
Requisito: [TEC-001](../requisitos/TEC-001.md). Ambiente local: Windows,
Node 24.19.0, pnpm 11.19.0. Alvo de CI: Node 24.21.0 e PostgreSQL 18.6.
Docker e PostgreSQL não estão instalados neste Windows.

| Casos | Comando ou prova | Resultado local |
| --- | --- | --- |
| TEC-01 | `pnpm install --frozen-lockfile` | Aprovado, lockfile mantido; pnpm 12.4.2 proposto não executou no Windows, pnpm 11.19.0 foi fixado e documentado |
| TEC-02 | `pnpm format`, `pnpm lint`, `pnpm typecheck` | Aprovados; lint rejeitou arquivo temporário com variável não usada (exit 1) e voltou a passar após removê-lo |
| TEC-03, TEC-05 | `pnpm test:unit` | Testes API e interface passaram (4 testes). Antes da implementação, liveness deu 404, a página e botão estavam ausentes; depois passaram |
| TEC-04, TEC-09 | `pnpm test:e2e` | Chromium desktop e móvel: 2 testes aprovados; teclado, largura e erro 503 verificados |
| TEC-06–08 | `pnpm test:integration` | Não executado localmente: falta PostgreSQL/Docker. Fixtures e testes estão configurados para CI, ainda não comprovados |
| TEC-10 | `.github/workflows/verify.yml` | Configurado; falha e sucesso na CI ainda não comprovados |
| TEC-11 | `pnpm build` | API e interface compiladas; `docker build` e smoke test ainda não executados localmente |
| TEC-12 | `pnpm docs:check` | Detectou duas referências pendentes; corrigidas, repetição aprovada |

Ao terminar o PR, registrar resultados dos jobs e corrigir qualquer falha
antes de pedir revisão. Nenhuma prova com fixture substitui testes das
migrations reais que acompanhem mudanças de negócio.
