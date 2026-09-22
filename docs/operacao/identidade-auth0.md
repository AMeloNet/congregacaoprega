# Operação de identidade com Auth0

Status: **implementação IDN-001C preparada para configuração; tenant real e
transporte externo não validados**. Relacionada a
[IDN-001C](../requisitos/IDN-001C.md) e à
[ADR-0002](../decisoes/0002-identidade-gerenciada.md).

## Configuração do tenant

Crie uma aplicação Auth0 do tipo **Regular Web Application** e uma conexão de
banco com login por e-mail e senha, verificação de e-mail e recuperação de
senha. Cadastre URLs exatas por ambiente, sem curingas amplos:

- callback: valor de `AUTH0_CALLBACK_URL`;
- logout: valor de `AUTH0_LOGOUT_URL`;
- origem da aplicação: valor de `APP_BASE_URL`.

Use o domínio HTTPS do tenant com barra final em `AUTH0_ISSUER`. Configure
`AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET` e a audiência da API fora do Git. Gere
`SESSION_SECRET` e `BOOTSTRAP_SECRET` distintos, aleatórios e com pelo menos 32
caracteres. O arquivo [`.env.example`](../../.env.example) contém apenas
placeholders.

A API valida ID tokens RS256 com a JWKS do emissor, `iss`, `aud`, `exp` e
`nonce`. O fluxo também usa `state` e PKCE. O navegador recebe somente cookies
opacos HttpOnly; não copie tokens para `localStorage`, logs ou URLs de suporte.

## Inicialização controlada

1. Aplique as migrations IDN-001A/B em um banco vazio ou na versão anterior
   suportada e verifique o status.
2. Inicie a API com `EMAIL_TRANSPORT=capture`. Outro valor é recusado nesta
   etapa para impedir envio externo acidental.
3. Em canal administrativo local, faça `POST /api/bootstrap/master` com o
   e-mail fictício/de teste no corpo e `x-bootstrap-secret`. A resposta contém
   apenas ID e expiração; o token aparece somente na captura de e-mail em
   memória e expira em 24 horas.
4. Entre pelo Auth0 com exatamente o destinatário verificado e aceite o link.
   Nova emissão invalida a pendente anterior. Depois do primeiro aceite, a API
   recusa nova inicialização enquanto existir master.
5. O master seleciona uma congregação e convida o primeiro administrador
   local. O administrador local pode então convidar publicadores.

Não inclua o segredo ou o token em histórico de shell, Issue, PR, log ou
evidência. A captura em memória se perde ao reiniciar a API e existe somente
para desenvolvimento/teste. Uma interface administrativa restrita para ler a
captura não é exposta por HTTP.

## Rotação e incidentes

- Rotacionar `AUTH0_CLIENT_SECRET` exige atualizar o ambiente e reiniciar a
  aplicação; validar login antes de revogar definitivamente o segredo antigo.
- Rotacionar `SESSION_SECRET` encerra todas as sessões locais. Reiniciar o
  processo também encerra sessões porque o armazenamento desta etapa é em
  memória. Isso é seguro, porém não serve para múltiplas réplicas sem um
  armazenamento compartilhado em etapa futura.
- Rotacionar `BOOTSTRAP_SECRET` não invalida tokens já emitidos; revogue ou
  reemita o convite pendente quando houver suspeita de exposição.
- Em suspeita de token de convite exposto, revogue o convite por ID e emita
  outro. O banco contém somente SHA-256 do token.
- Revogação de vínculo vale na próxima requisição porque a autorização consulta
  PostgreSQL. A notificação capturada pode falhar sem restaurar o acesso.

## Recuperação e limites

Reverter a aplicação não reverte o banco. As migrations usadas são aditivas e
já publicadas; não as edite. Em falha operacional, restaure a versão anterior
da aplicação, encerre sessões, revogue convites pendentes afetados e preserve a
auditoria. Correções de dados exigem nova migration ou procedimento revisado,
nunca reset de banco persistente.

Ativação e recuperação são responsabilidade do Auth0 e precisam de validação
manual no tenant de homologação. A CI usa substitutos controlados e não prova
entrega externa. O piloto com pessoas reais permanece bloqueado até configurar
domínio/remetente verificável, transporte externo, retentativa persistente e
medição do prazo de uma hora. A captura atual comprova conteúdo e destinatário
sem usar rede, não entrega de e-mail.
