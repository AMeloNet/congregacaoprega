# ADR-0002 — Identidade gerenciada no piloto

Status: **decisão do mantenedor para a etapa IDN-001** em 19/09/2026. A
configuração do serviço e a integração ainda não foram implementadas.
Relacionada a [IDN-001](../requisitos/IDN-001.md) e
[ADR-0001](0001-arquitetura-inicial.md).

## Contexto

O piloto começa gratuitamente com uma congregação e até 100 publicadores.
O acesso será por e-mail e senha, com verificação/ativação e recuperação por
e-mail. O sistema precisa permitir uma conta com vínculos e papéis separados
em várias congregações. Login válido não autoriza vínculo algum por si só.

## Alternativas

1. **Auth0 Free:** login hospedado e conexão de banco de usuários no provedor;
   integração OpenID Connect com a API. O plano consultado em 19/09/2026
   informa até 25 mil usuários ativos mensais, suficiente para o volume
   previsto, mas limites e condições precisam ser revalidados na configuração.
2. **Outro provedor OIDC gerenciado:** mantém a divisão entre autenticação e
   autorização local, exigindo nova avaliação de recursos, custo e operação.
3. **Identidade auto-hospedada:** dá mais controle, porém acrescenta manutenção
   de credenciais, atualização de segurança e recuperação operacional ao piloto.

## Decisão

Adotar **Auth0 Free** para autenticação do piloto, conforme escolha do
mantenedor. Usar aplicação do tipo Regular Web Application com Universal Login,
conexão de banco Auth0 para e-mail/senha e fluxo OIDC Authorization Code no
backend. A aplicação mantém congregações, vínculos e permissões no seu
PostgreSQL; não usa Organizations como fonte de autorização.

O backend troca o código e valida emissor, audiência, assinatura, expiração,
state e nonce. A sessão da aplicação usa cookie HttpOnly, Secure no ambiente
HTTPS, SameSite definido e proteção contra CSRF nas alterações. Tokens não
ficam em localStorage nem em URLs persistidas. O identificador estável do
provedor, não o e-mail, relaciona a conta externa aos vínculos locais. A
verificação de e-mail é exigida, mas não substitui o convite aceito.

A ativação e recuperação de senha são conduzidas pelo provedor. Os convites
de vínculo e o convite único master pertencem à aplicação e usam tokens
aleatórios de uso único, com somente um resumo criptográfico persistido. O
convite master vale 24 horas; sua reemissão controlada invalida o anterior.
Nenhum administrador padrão é criado. O procedimento de inicialização deve
falhar se já houver master ativo e registrar a operação sem gravar o token em
logs. Convites de ingresso seguem o prazo de sete dias de IDN-001.

Revogação e reativação de publicador gravam o evento e um aviso no sistema
na mesma transação. Um processador de mensagens persistentes tenta o e-mail
ao afetado em até uma hora, registra atraso e retoma falhas sem duplicar o
evento lógico. A revogação vale na próxima requisição, mesmo se o e-mail
falhar. Testes capturam os envios localmente e não usam destinatários reais.

## Consequências e limites

- A aplicação não armazena senhas, mas depende da disponibilidade do Auth0
  para novos logins e recuperação. Sessões existentes continuam sujeitas à
  política local de expiração e revogação.
- Cada ambiente precisa de configuração e segredos próprios. Registrar URLs
  de retorno e logout permitidas de forma restrita, sem curingas amplos.
- O provedor de e-mail integrado do Auth0 é destinado a testes básicos; a
  documentação informa limite de dez mensagens por minuto, descarte do excesso
  e ausência de garantia de entrega. Antes de uso com pessoas reais, configurar
  provedor externo de e-mail e validar ativação/recuperação. O envio de avisos
  da aplicação também depende de um serviço externo a escolher e medir.
- O mantenedor ainda não tem domínio para verificar o remetente. Resend Free
  permanece candidato, mas sua integração com Auth0 exige um domínio
  verificado. Até obtê-lo, a validação de e-mail é local ou limitada a
  destinatários de teste; não convidar os 100 publicadores como se o fluxo
  de entrega real estivesse pronto. O plano gratuito publicado informa
  100 e-mails por dia, exigindo escalonar convites ou revisar o serviço.
- O objetivo de e-mail em até uma hora não pode ser garantido por um servidor
  gratuito que suspende por inatividade. Medir atrasos no piloto e mudar a
  operação antes de uso que dependa desse prazo.
- A escolha de bibliotecas, versões e contratos de configuração exige revisão
  e testes na implementação. Esta ADR não comprova integração real.

## Verificação antes da entrega funcional

- Testar login válido, retorno inválido, expiração, logout, e-mail não
  verificado e ausência de vínculo com um provedor controlado.
- Comprovar isolamento, papéis distintos, convites de uso único, troca de
  e-mail, revogação imediata e concorrência em PostgreSQL descartável.
- Testar e-mails por captura local, falha, retentativa e limite de uma hora
  com relógio controlado; conferir configuração real do provedor em ambiente
  de homologação antes de convidar pessoas.
- Revisar a primeira migration real, criação de banco vazio, atualização,
  reaplicação, drift e recuperação conforme [plano de migrations](../banco/migrations.md).

## Fontes consultadas

- [Preços e recursos do Auth0 Free](https://auth0.com/pricing), consultados em
  19/09/2026.
- [Authorization Code para aplicação web](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow/add-login-auth-code-flow).
- [Universal Login](https://auth0.com/docs/authenticate/login/auth0-universal-login).
- [Verificação de e-mail](https://auth0.com/docs/manage-users/user-accounts/verify-emails).
- [Uso e limites do provedor integrado de e-mail](https://support.auth0.com/center/s/article/Emails-to-Gmail-from-Auth0-never-arrive).
- [Integração Auth0–Resend e domínio verificado](https://resend.com/changelog/auth0-integration).
- [Franquia gratuita do Resend](https://resend.com/pricing), consultada em
  19/09/2026.
