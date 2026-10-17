# UI-003 — publicação do menu em staging

Publicação autorizada pelo mantenedor em 17/10/2026 (America/Sao_Paulo).
Alvo imutável: `4256b5772e4cf263ad8ea5ece9171a898510cde7`, incorporado à main
pelo [PR #56](https://github.com/AMeloNet/congregacaoprega/pull/56).
Requisito: [UI-003](../requisitos/UI-003.md).

## Critérios e verificação anterior à publicação

- Publicar o SHA aprovado após os quatro checks da main.
- Conferir o mesmo SHA ativo no Render e os novos assets na origem pública.
- Verificar saúde viva, acesso ao PostgreSQL e proteção das APIs sem sessão.
- Preservar configurações de autenticação e captura de e-mail; não criar ou
  alterar reservas persistentes para testar a publicação.

Os quatro checks do [Verify da main](https://github.com/AMeloNet/congregacaoprega/actions/runs/38998358838)
passaram antes do acionamento:

- análise estática, build e unitários: 58 testes em 21 arquivos;
- PostgreSQL/migrations: 29 testes em 24 arquivos;
- Chromium desktop/celular: 18 testes, incluindo menu por perfil e troca de
  congregação;
- fumaça do contêiner: aprovada.

## Publicação

O [Deploy controlled staging #13](https://github.com/AMeloNet/congregacaoprega/actions/runs/38998528530)
validou o SHA completo aprovado, concluiu os três jobs e acionou o Render com
o mesmo commit. O banco respondeu `No pending migrations to apply`.
Esta alteração de navegação não introduz migrations nem altera contratos da API.

## Resultado público

O [deploy no Render](https://dashboard.render.com/web/srv-daqpsjmk1f9s73d233h0/deploys/dep-db9ek4rrjlhs73ehhgn0)
confirmou `Deploy succeeded|Live`, duração de 1m34s e o mesmo SHA como último
commit publicado com sucesso. Conferência em 17/10/2026, aproximadamente 00h25
(America/Sao_Paulo), no [staging](https://congregacaoprega-staging.onrender.com):

| Verificação | Resultado |
| --- | --- |
| Página inicial | 200 |
| `/assets/index-DiskPhR8.js` | 200, contém Menu principal, Minha conta, Cadastros e Administradores |
| `/assets/index-k-e3exwn.css` | 200, contém estilos do menu agrupado |
| `/api/health/live` | 200, `status: ok` |
| `/api/health/ready` | 200, `status: ok`, PostgreSQL acessível |
| `/api/session` sem sessão | 200, `authenticated: false` |
| GET de programação sem sessão | 401 |
| GET de equipamentos sem sessão | 401 |

As rotas protegidas usaram UUID nulo para conferir autenticação, sem expor dados
de congregação. Nenhuma reserva persistente foi criada ou alterada; credenciais,
Auth0 e configuração de entrega de e-mail foram preservados.

A fumaça pública confirma a versão servida, disponibilidade e barreira de
autenticação. Os comportamentos autenticados de administrador/publicador, grupos,
teclado, temas e mudança de congregação foram validados com fixtures nos testes
locais e na CI; não houve nova jornada autenticada manual no banco de staging.
Pode ser necessário entrar novamente após o deploy, pois as sessões ficam em
memória. O registro documental posterior não exige nova publicação do aplicativo.
