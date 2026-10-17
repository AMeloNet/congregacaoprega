# UI-004 — publicação das melhorias em staging

Publicação e migration autorizadas pelo mantenedor em 17/10/2026
(America/Sao_Paulo). Alvo imutável: `99ad110ce5a8c852b40fd859e6e34efe04662d91`,
incorporado à main pelo [PR #58](https://github.com/AMeloNet/congregacaoprega/pull/58).
Requisito: [UI-004](../requisitos/UI-004.md).

## Critérios anteriores à publicação

- Quatro checks aprovados para o SHA completo incorporado à main.
- Aplicar somente o histórico versionado pelo job serializado de staging.
- Acionar e confirmar o mesmo SHA no Render; verificar frontend/assets, saúde
  viva, prontidão PostgreSQL e autenticação das rotas novas.
- Usar somente consultas públicas de fumaça, sem criar cadastros, aprovações,
  fotos ou reservas persistentes para testar a publicação.

Os quatro checks do [Verify da main](https://github.com/AMeloNet/congregacaoprega/actions/runs/39026355197)
passaram: análise estática/build/unitários (59 testes em 22 arquivos),
PostgreSQL/migrations (30 testes em 25 arquivos), Chromium e fumaça do contêiner.

## Migration e acionamento

O [Deploy controlled staging #14](https://github.com/AMeloNet/congregacaoprega/actions/runs/39026929282)
validou o SHA e sua presença na main. O job de migration aplicou
`20261017000700_registration_point_photos` e confirmou
`All migrations have been successfully applied` às 07h59 de 17/10/2026.
Não houve reset, alteração de migration incorporada ou mudança manual de dados.

Os três jobs concluíram com sucesso. O Render recebeu o mesmo SHA e confirmou
`Deploy succeeded|Live` no [deploy](https://dashboard.render.com/web/srv-daqpsjmk1f9s73d233h0/deploys/dep-db9la1bncjis739p10f0),
com ativação às 08h00 de 17/10/2026.

## Resultado público

Conferência em [staging](https://congregacaoprega-staging.onrender.com), após
ativação da nova versão:

| Verificação | Resultado |
| --- | --- |
| Página inicial | 200 |
| `/assets/index-uuEaQx8L.js` | 200; contém cadastro, aprovação por código e foto |
| `/assets/index-mi85KOyl.css` | 200; contém categorias e cabeçalho fixo |
| `/api/health/live` | 200, `status: ok` |
| `/api/health/ready` | 200, `status: ok`, PostgreSQL acessível |
| `/api/session` sem sessão | 200, `authenticated: false` |
| `/api/registration` sem sessão | 401 |
| GET da foto de ponto sem sessão | 401 |
| GET de programação sem sessão | 401 |

As consultas protegidas usaram UUID nulo para verificar a autenticação, sem
expor dados de congregação. Nenhum cadastro, aprovação, foto ou reserva persistente
foi criado ou alterado para validar esta publicação. Credenciais, Auth0 e entrega
de e-mail não foram reconfigurados. A prévia estática não foi alterada.

A fumaça pública confirma disponibilidade, novos assets e barreira de autenticação.
Os fluxos autenticados foram validados com dados fictícios nos testes locais e na
CI; esta etapa não acrescentou jornada autenticada manual com dados persistentes.
Pode ser necessário entrar novamente porque o deploy reinicia as sessões em memória.
O registro documental posterior não exige nova publicação do aplicativo.
