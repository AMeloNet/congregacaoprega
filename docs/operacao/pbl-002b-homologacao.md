# PBL-002B — Homologação mínima da infraestrutura

## Escopo e critérios

Esta homologação valida somente a publicação técnica da aplicação: URL HTTPS, mesma origem para frontend e API, inicialização do processo, migrations versionadas, conexão PostgreSQL e endpoints de saúde. Não valida a jornada Auth0, funcionalidades de negócio ou produção.

Critérios verificados:

- artefato imutável: SHA `ccc788e935b0e1202e72015f33846ca14108bc57`;
- serviço separado da prévia UI-001, com uma única réplica;
- `live` 200, `ready` 200 com banco disponível e `session` sem autenticação sem erro interno;
- migrations executadas pelo workflow com credencial própria;
- papel de aplicação sem privilégio `CREATE` no schema `public`;
- ausência de segredos nas evidências e nos arquivos versionados.

## Recursos

- Render Web Service: `congregacaoprega-staging` (Free), Dockerfile existente, health check `/api/health/live`, deploy automático desativado.
- PostgreSQL 18 gerenciado no Neon Free, projeto `congregacaoprega-staging`, região AWS us-east-2.
- Papéis separados: `staging_migrator` para migrations e `staging_runtime` para a aplicação.
- Workflow manual: `.github/workflows/deploy-staging.yml`, ambiente GitHub `staging`.

As URLs, senhas, hooks e demais valores secretos permanecem exclusivamente nos provedores. Nenhum valor secreto é registrado neste documento.

## Evidências

Workflow concluído com sucesso: [Deploy controlled staging](https://github.com/AMeloNet/congregacaoprega/actions/runs/36089281715).

URL pública: https://congregacaoprega-staging.onrender.com

Resultados de fumaça pela URL pública:

| Verificação | Resultado |
| --- | --- |
| `GET /` | 200; HTML e assets pela mesma origem |
| `GET /api/health/live` | 200; `{"status":"ok"}` |
| `GET /api/health/ready` com PostgreSQL acessível | 200; `{"status":"ok"}` |
| `GET /api/session` sem autenticação | 200; `{"authenticated":false}` |

Durante a validação, a conexão foi invalidada temporariamente. O serviço permaneceu sem prontidão (`ready` indisponível) e não revelou URL, usuário ou senha. A conexão válida foi restaurada e o endpoint voltou a 200.

No Neon, a verificação de privilégios retornou `CONNECT = true` e `CREATE no schema public = false` para `staging_runtime`. As migrations foram aplicadas pelo job serializado do workflow; não foi usado `db push`, reset ou alteração de migration incorporada.

## Testes e integridade

- CI do SHA publicado: checks de lint, typecheck, build, unit, E2E Chromium, PostgreSQL/migrations e container aprovados.
- Checks locais afetados: `docs:check`, `format`, `lint`, `typecheck`, `db:validate`, `build`, testes unitários e E2E aprovados antes da publicação.
- Prévia UI-001 preservada em https://congregacaoprega-preview.onrender.com/; não foi alterada.

## Limitações e pendências

- Login, bootstrap, convites e captura de e-mail não são critérios desta homologação. `EMAIL_TRANSPORT=capture` permanece ativo e não há envio de mensagens pela rede.
- Auth0 usa configuração de teste apenas para permitir inicialização; a jornada real não foi homologada.
- Render Free pode suspender o serviço; sessões e captura permanecem em memória, portanto a aplicação fica restrita a uma réplica.
- Backup, restauração e observabilidade de produção não foram validados.
- As credenciais e o hook usados durante a configuração devem ser rotacionados antes de qualquer uso além desta homologação, pois foram manipulados no procedimento operacional. Nenhum desses valores deve ser reutilizado em produção.
