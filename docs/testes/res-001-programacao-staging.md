# Reservas e programação — publicação em staging

Publicação autorizada pelo mantenedor em 16/10/2026 (America/Sao_Paulo).
Alvo imutável: `aba36ab3a9dd31a3767064091e8ec04f149b74b0`, incorporado à main.
Contém os incrementos dos PRs #48–53 e a correção de testes do
[PR #54](https://github.com/AMeloNet/congregacaoprega/pull/54).

## Critérios e verificação anterior à publicação

- Quatro checks do SHA aprovados antes de executar o workflow de staging.
- Migrations versionadas aplicadas serialmente antes do deploy do mesmo SHA.
- Conferir commit ativo no Render, frontend/assets pela mesma origem, saúde da
  aplicação/banco e autenticação das rotas novas. Não criar/cancelar reservas ou
  emitir relatórios no banco persistente apenas para testar a publicação.
- Manter captura de e-mail; não configurar ou habilitar entrega real pelo Resend.

A CI anterior identificou formatação de `tests/e2e/ui-001.spec.ts` e uma jornada
obsoleta que procurava controles de perfis fictícios em páginas autenticadas.
O PR #54 substituiu essa jornada por sessões controladas de publicador e
administrador, requisição de reabertura com CSRF e confirmação de bloqueio do
publicador após a reabertura. O comportamento de produção não foi alterado.
O teste representativo passou em desktop e celular; a primeira execução local
desktop ultrapassou o tempo da asserção durante compilação inicial do Vite e
passou na repetição. Formatação do repositório e ESLint do arquivo passaram.

Os quatro checks do [Verify da main](https://github.com/AMeloNet/congregacaoprega/actions/runs/38995600497)
passaram antes do deploy:

- análise estática, build e unitários: 58 testes em 21 arquivos;
- PostgreSQL/migrations: 29 testes em 24 arquivos;
- Chromium desktop/celular: 16 testes;
- fumaça do contêiner: aprovada.

## Migrations e acionamento

O [Deploy controlled staging #12](https://github.com/AMeloNet/congregacaoprega/actions/runs/38995755375)
validou o SHA, aplicou as seis migrations abaixo e acionou o Render para o mesmo
commit. Os três jobs concluíram com sucesso.

1. `20261017000100_reservation_management_history`
2. `20261017000200_reservation_invitations_notices`
3. `20261017000300_reservation_exits_attendance`
4. `20261017000400_reservation_creator_publisher_names`
5. `20261017000500_monthly_report_versions`
6. `20261017000600_schedule_email_delivery`

Nenhuma migration incorporada foi modificada. Não houve reset ou alteração manual
de dados. A prévia estática permanece separada do serviço de staging.

## Resultado público

O Render confirmou o mesmo SHA como último commit publicado com sucesso e ativo
no [deploy](https://dashboard.render.com/web/srv-daqpsjmk1f9s73d233h0/deploys/dep-db9dvqm7bikc73fm7km0).
Conferência pública em [staging](https://congregacaoprega-staging.onrender.com):

| Verificação | Resultado |
| --- | --- |
| Página inicial | 200 |
| `/assets/index-DiqztyRL.js` | 200, contém os controles de reimpressão de versão |
| `/assets/index-B9VqrKD9.css` | 200 |
| `/api/health/live` | 200, `status: ok` |
| `/api/health/ready` | 200, `status: ok`, PostgreSQL acessível |
| `/api/session` sem sessão | 200, `authenticated: false` |
| GET de programação sem sessão | 401 |
| GET da caixa de convites/avisos sem sessão | 401 |
| GET da prévia do relatório sem sessão | 401 |
| POST `/api/schedule-email/webhook` em captura | 404, integração externa desativada |

As rotas protegidas foram consultadas com UUID nulo apenas para confirmar
autenticação. Nenhum dado de congregação foi exposto. Não foram alteradas
credenciais, configuração Auth0 ou variáveis de envio. Resend continua dependendo
de configuração e liberação operacional próprias, conforme
[procedimento dos avisos](../operacao/avisos-resend.md).

A fumaça pública não substitui uma jornada autenticada completa. Reservas,
convites, alterações de participantes, recorrência e impressão foram validados
com dados fictícios nos testes locais e na CI, sem ações manuais em reservas
persistentes nesta publicação. Pode ser necessário entrar novamente após o
deploy, pois as sessões ainda ficam em memória.
