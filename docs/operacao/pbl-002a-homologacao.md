# Operação da homologação PBL-002A

Status: **artefatos preparados; nenhum Web Service, banco ou tenant foi criado**.
Requisito: [PBL-002A](../requisitos/PBL-002A.md).

## Recursos separados

O arquivo [`render-functional.yaml`](../../render-functional.yaml) descreve um
Web Service `congregacaoprega-staging`, separado do Static Site
`congregacaoprega-preview`. O Blueprint funcional usa Docker, uma réplica,
plano gratuito, saúde viva e deploy automático desligado. Não aplique esse
arquivo sobre o Blueprint da prévia e não altere o serviço existente.

Ao criar manualmente o Blueprint funcional, confirmar que nenhuma forma de
pagamento é exigida e preencher os valores `sync: false` diretamente no cofre
do Render. Não copiar valores para terminal registrado, Issue ou PR. O plano
gratuito não oferece pre-deploy command, Shell ou SSH; por isso migrations e
deploy ficam serializados pelo workflow manual do GitHub.

## PostgreSQL 18 e privilégios

Criar um projeto Neon gratuito, vazio e exclusivamente fictício somente quando
o acesso do mantenedor estiver disponível. Selecionar PostgreSQL 18 e manter
duas credenciais:

- `STAGING_MIGRATION_DATABASE_URL`: conta técnica com `CONNECT`, `USAGE` e
  autoridade para criar/alterar os objetos do schema da aplicação;
- `DATABASE_URL`: conta usada pelo Web Service, com `CONNECT`, `USAGE`, DML nas
  tabelas e uso das sequências necessárias, sem `CREATE` no schema e sem
  propriedade dos objetos.

O operador deve verificar os privilégios em uma sessão administrativa sem
imprimir URLs. A conta da aplicação precisa aprovar `SELECT 1` e operações da
API, mas uma tentativa descartável de `CREATE TABLE` deve falhar. Configurar
privilégios padrão da conta de migration para que tabelas e sequências futuras
continuem acessíveis à aplicação sem conceder DDL.

Não há migration nova na PBL-002A: o job aplica exatamente o histórico
IDN-001A/B. Reverter a aplicação não reverte o banco. Falha exige correção por
novo artefato ou restauração ensaiada; não usar `db push`, reset ou marcação
manual de migration.

## Job serializado e promoção

O workflow `Deploy controlled staging` é exclusivamente manual, usa o ambiente
protegido `staging` e aceita somente SHA completo já ancestral de `origin/main`.
A concorrência não cancela uma migration em andamento. Ele executa, nesta
ordem:

1. checkout do SHA imutável;
2. `prisma migrate deploy` com `STAGING_MIGRATION_DATABASE_URL`;
3. acionamento do deploy hook do serviço funcional com o mesmo SHA.

Criar no ambiente GitHub `staging`, por intervenção do mantenedor, os segredos
`STAGING_MIGRATION_DATABASE_URL` e `STAGING_RENDER_DEPLOY_HOOK_URL`. Restringir
quem pode disparar o ambiente. O workflow não deve ser executado antes de os
quatro checks obrigatórios do commit passarem.

## Auth0 e mesma origem

Depois de conhecida a URL funcional exata, configurar uma Regular Web
Application separada para homologação:

```text
APP_BASE_URL=https://congregacaoprega-staging.onrender.com
AUTH0_CALLBACK_URL=https://congregacaoprega-staging.onrender.com/api/auth/callback
AUTH0_LOGOUT_URL=https://congregacaoprega-staging.onrender.com/
```

Cadastrar somente esses valores exatos no Auth0, sem curingas. NestJS serve o
frontend e `/api/...` no mesmo host; CORS permanece desabilitado. Não reutilizar
cliente ou segredo de outro ambiente.

## Consulta da captura

Definir localmente `APP_BASE_URL` e `CAPTURE_OPERATOR_SECRET` por mecanismo que
não grave histórico. Nunca passar o segredo como argumento. Com dados
exclusivamente fictícios:

```sh
pnpm capture list
pnpm capture consume <identificador-opaco>
```

`list` mostra somente metadados mascarados. `consume` revela o conteúdo uma vez
e, portanto, sua saída deve permanecer no terminal autorizado — não em logs ou
evidências. Requisições usam assinatura HMAC, instante e identificador únicos;
repetição, adulteração e expiração recebem a mesma resposta não reveladora.

Mensagens expiram em quinze minutos. Reinício, suspensão ou deploy limpa a
captura e encerra sessões. Se uma mensagem for perdida, revogar ou reemitir o
convite persistido; o token anterior não é recuperável. Manter uma réplica.

## Intervenções ainda necessárias

- criar o Neon e seus papéis;
- criar o tenant/aplicação Auth0 e dados de teste fictícios;
- aplicar o Blueprint funcional sem tocar na prévia;
- cadastrar segredos nos cofres Render/GitHub;
- executar migrations, deploy, fumaça, login real, rollback e restauração.

Cada ação deve registrar apenas SHA, horário, comando sem valor sensível,
resultado e consumo de franquia. Até essas provas existirem, o ambiente
funcional permanece **preparado, não publicado**.
