# IDN-001C — Fluxos funcionais de identidade e acesso

Status: **especificada; testes escritos antes da implementação**. Relacionada
a [IDN-001](IDN-001.md),
[IDN-001A](IDN-001A.md), [IDN-001B](IDN-001B.md),
[ADR-0002](../decisoes/0002-identidade-gerenciada.md) e aos
[cenários T-IDN](../testes/cenarios-identidade.md).

## Objetivo e limites

Transformar a estrutura de dados e o protótipo existentes em uma aplicação
funcional para autenticação, sessão, autorização e administração de acesso. A
autenticação usa Auth0 Free por Authorization Code; senhas, ativação de e-mail
e recuperação permanecem hospedadas no Auth0. Vínculos, papéis, convites e
auditoria continuam sob autoridade da aplicação.

Esta etapa não implementa reservas, equipamentos, programação, designações ou
publicação em produção. Os painéis correspondentes da UI-001 permanecem
demonstrativos e não devem ser apresentados como dados persistidos.

## Contrato funcional

### Autenticação e sessão

- `GET /api/auth/login` cria `state`, `nonce` e PKCE, mantém somente seus
  resumos em cookie temporário assinado e redireciona ao Universal Login.
- `GET /api/auth/callback` aceita uma única resposta íntegra, troca o código no
  endpoint configurado, valida assinatura, emissor, audiência, expiração e
  nonce do ID token e cria ou atualiza a conta pelo par estável `iss`/`sub`.
- A sessão contém somente um identificador opaco aleatório. Seu resumo e
  expiração ficam no servidor; o cookie é HttpOnly, SameSite=Lax, Path=/ e
  Secure fora do desenvolvimento local. Logout revoga a sessão antes do
  redirecionamento permitido.
- Alterações usam um token CSRF associado à sessão e enviado no cabeçalho
  `x-csrf-token`. O servidor consulta a conta e os vínculos ativos em cada
  requisição; a sessão não congela papéis.
- `GET /api/session` devolve o estado autenticado, e-mail verificado, papel
  master, vínculos ativos e congregação ativa. `PUT /api/session/congregation`
  só aceita uma congregação que conste nos vínculos ativos da própria conta.
- Ativação e recuperação usam URLs configuradas do Universal Login/Auth0; a
  aplicação não recebe, grava ou envia senhas.

### Convites e vínculos

- `POST /api/bootstrap/master` é uma operação de inicialização protegida por
  segredo operacional. Cria ou reemite um convite master de 24 horas somente
  enquanto não existir conta master. O token aleatório aparece uma única vez
  na mensagem capturada; só seu SHA-256 é persistido.
- `POST /api/invitations/:token/accept` e `.../decline` exigem pessoa
  autenticada, e-mail verificado, destinatário correspondente e convite
  pendente ainda válido. A mudança do convite e a criação/atualização do
  vínculo ou papel master ocorrem na mesma transação.
- Master usa `POST /api/congregations/:id/invitations/admin` para convidar o
  primeiro ou outro administrador local e `PATCH /api/memberships/:id/role`
  para alterar papel. O último administrador local ativo não pode ser
  rebaixado sem substituto.
- Administrador local usa `POST /api/congregations/:id/invitations/publisher`,
  consulta vínculos da própria congregação e usa
  `POST /api/memberships/:id/revoke` ou `.../reactivate` apenas para
  publicadores locais. Ele não concede papel administrativo.
- Reenvio invalida o convite pendente anterior como `SUPERSEDED` e cria token
  e prazo novos sem duplicar vínculo. Revogar convite usa estado `REVOKED`.
  Convites vencidos são marcados `EXPIRED` ao serem consultados ou usados.
- Revogação e reativação mudam a autorização na próxima requisição, registram
  auditoria e enfileiram aviso transacional. Falha de captura/envio nunca
  desfaz a mudança do vínculo.

### E-mail controlado

`EMAIL_TRANSPORT=capture` é o único transporte permitido em teste e
desenvolvimento local. Ele mantém mensagens em memória, expostas apenas em
testes por uma interface interna, sem rede e sem destinatários reais. Um
transporte externo não faz parte desta entrega e a API recusa iniciá-lo sem
implementação explícita.

## Respostas e segurança

Rotas protegidas usam `401` para sessão ausente/inválida, `403` para identidade
sem permissão ou e-mail não verificado, `404` quando revelar a existência de
um recurso de outra congregação violaria isolamento, `409` para conflito de
estado e `410` para convite expirado. Respostas públicas usam códigos estáveis
e mensagens em português, sem token, segredo, URL de banco ou detalhe do
provedor. Entradas de e-mail são normalizadas em minúsculas.

## Configuração

| Variável | Finalidade |
| --- | --- |
| `AUTH0_ISSUER` | emissor HTTPS exato, com barra final |
| `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` | aplicação Regular Web Application |
| `AUTH0_AUDIENCE` | audiência esperada pelo backend |
| `AUTH0_CALLBACK_URL` / `AUTH0_LOGOUT_URL` | URLs previamente permitidas no tenant |
| `SESSION_SECRET` | segredo de no mínimo 32 bytes para cookies e sessão |
| `BOOTSTRAP_SECRET` | segredo operacional separado para emitir convite master |
| `EMAIL_TRANSPORT` | `capture` nesta etapa |
| `APP_BASE_URL` | origem usada nos links de convite |

Segredos ficam fora do Git. Cada ambiente usa cliente Auth0, URLs e chaves
próprios. Logs registram apenas tipo da operação, resultado e identificadores
internos necessários à auditoria.

## Critérios de aceitação e provas

| ID | Resultado verificável |
| --- | --- |
| IDN-C01 | Login gera parâmetros anti-replay; callback inválido ou repetido não cria sessão e callback válido cria sessão opaca |
| IDN-C02 | Sessão expirada, logout, cookie adulterado, e-mail não verificado e falta de vínculo bloqueiam rotas correspondentes |
| IDN-C03 | Master bootstrap é único, dura 24 h, pode ser reemitido antes do aceite e não cria conta padrão |
| IDN-C04 | Master convida administrador local; local convida somente publicador da própria congregação |
| IDN-C05 | Só o destinatário verificado aceita convite pendente dentro do prazo; recusa, revogação, expiração e reuso são negados |
| IDN-C06 | Reenvio invalida o token anterior, renova o prazo e não duplica vínculo |
| IDN-C07 | Papéis e vínculos de duas congregações permanecem separados em consulta, seleção e alteração por ID |
| IDN-C08 | Master altera papel local e não remove o último administrador ativo; local não altera papel administrativo |
| IDN-C09 | Local revoga e reativa publicador próprio; efeito é imediato e outra congregação responde sem revelar o recurso |
| IDN-C10 | Convites e alterações produzem auditoria e mensagens na captura controlada sem expor token em banco ou log |
| IDN-C11 | Interface em português carrega sessão, inicia login/logout, seleciona vínculo e opera convites com estados de carregamento, erro e vazio |
| IDN-C12 | Documentação descreve configuração, operação, recuperação e limitações do Auth0/e-mail; regressão obrigatória passa |

Os testes unitários usam relógio, provedor OIDC, repositório e e-mail
controlados. Os testes de integração aplicam as migrations reais em PostgreSQL
18 descartável e exercitam transações e isolamento. O navegador usa respostas
controladas da API, sem Auth0 ou e-mail externos. Antes da implementação, a
nova suíte deve falhar por ausência dos contratos, não por ambiente.

## Dados, compatibilidade e recuperação

IDN-001C usa sem alteração as migrations IDN-001A/B. Nenhuma sincronização
direta de schema é autorizada. A implantação aplica o histórico existente em
job exclusivo antes de iniciar a API. A mudança de aplicação é compatível com
o banco anterior porque só passa a consumir tabelas já publicadas.

Em falha, reverter a aplicação não reverte o banco. Convites emitidos podem ser
revogados e sessões locais, reiniciadas. Alterações de vínculo permanecem
auditáveis; correções de dados exigem procedimento específico e nunca reset em
ambiente persistente. O piloto com pessoas reais continua bloqueado até haver
domínio/remetente verificado e validação do transporte externo de e-mail.

A criação da primeira congregação é uma pré-condição provisionada. Esta etapa
não cria um endpoint porque ainda não há regra aprovada sobre quem cria,
altera ou desativa congregações; os testes usam congregações fictícias já
existentes.
