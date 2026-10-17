# Fotos dos pontos — 20 MiB e exibição nas reservas

Continuação das melhorias de [UI-004](../requisitos/UI-004.md) em 17/10/2026,
com o fluxo de publicação de staging autorizado nesta conversa. Alteração no
[PR #60](https://github.com/AMeloNet/congregacaoprega/pull/60); correção somente
de formatação do teste no [PR #61](https://github.com/AMeloNet/congregacaoprega/pull/61).
Alvo imutável: `166c21a1f6e1947c0ffe3496a9ff02d9ea06d83e`.

## Critérios da publicação

- Quatro checks aprovados na main antes de publicar.
- Aplicar a migration `20261017000800_point_photo_twenty_mb` pelo job serializado
  e publicar o mesmo SHA no Render, preservando fotos existentes.
- Confirmar novos assets, saúde viva, prontidão PostgreSQL e autenticação das
  rotas de fotos. Não criar fotos/reservas persistentes para validar o deploy.

## Validação anterior

Teste local HTTP/PostgreSQL aprovado com PNG válido de exatamente 20 MiB,
rejeição de um byte acima e preservação do dado após rejeição, além de leitura
autorizada e CHECK de armazenamento. Teste web do limite exato/acima aprovado.
Jornadas de foto no card, criação e detalhes da reserva passaram em desktop e
celular. TypeScript API/web/banco, ESLint, build Vite e links da documentação
passaram. A correção de formatação foi verificada por `prettier --check .`.

Os quatro checks do [Verify da main](https://github.com/AMeloNet/congregacaoprega/actions/runs/39055293739)
passaram antes da publicação: estática/unitários/build, PostgreSQL/migrations,
Chromium e fumaça do contêiner. A primeira execução encontrou apenas formatação
no novo teste de navegador; a normalização foi incorporada antes deste SHA.

## Publicação

O [Deploy controlled staging #15](https://github.com/AMeloNet/congregacaoprega/actions/runs/39055507311)
foi acionado para o SHA imutável acima, com migration antes do deploy.

Os três jobs terminaram com sucesso. A migration
`20261017000800_point_photo_twenty_mb` foi aplicada às 14h51 de 17/10/2026
(America/Sao_Paulo), com confirmação `All migrations have been successfully applied`.
Nenhuma imagem existente foi removida ou regravada, e migrations incorporadas
foram preservadas.

O [deploy no Render](https://dashboard.render.com/web/srv-daqpsjmk1f9s73d233h0/deploys/dep-db9rb3ss728c73cosoe0)
confirmou `Deploy succeeded|Live` para o mesmo SHA, às 14h52 de 17/10/2026.

## Fumaça pública

Conferência após ativação em [staging](https://congregacaoprega-staging.onrender.com):

| Verificação | Resultado |
| --- | --- |
| Página inicial | 200 |
| `/assets/index-CYhz6Hcl.js` | 200; contém limite de 20 MB e foto do ponto |
| `/assets/index-mi85KOyl.css` | 200 |
| `/api/health/live` | 200, `status: ok` |
| `/api/health/ready` | 200, `status: ok`, PostgreSQL acessível |
| `/api/session` sem sessão | 200, `authenticated: false` |
| `/api/registration` sem sessão | 401 |
| GET da foto sem sessão, com UUID nulo | 401 |

A validação do arquivo real de 20 MiB e da foto no card/formulário/detalhes foi
executada com dados fictícios localmente e na CI. A fumaça pública não criou
fotos ou reservas persistentes e não substitui uma nova jornada autenticada manual.
Credenciais, Auth0 e configuração de entrega de e-mail não foram alterados.
As sessões em memória reiniciam com o deploy; pode ser necessário entrar novamente.
Este registro documental não exige nova publicação do aplicativo.
