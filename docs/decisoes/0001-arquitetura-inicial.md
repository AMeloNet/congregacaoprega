# ADR-0001 — Arquitetura inicial

Status: **proposta, ainda não aprovada**.

Relacionada a [MVP-001](../requisitos/MVP-001.md) e
[TEC-001 — Base técnica](../requisitos/TEC-001.md).

## Contexto

O sistema precisa funcionar no navegador, separar dados de congregações e
preservar disponibilidade e capacidade mesmo com reservas simultâneas.
Ainda não existem código de aplicação ou ferramentas configuradas.

O mantenedor confirmou: avaliar hospedagem gerenciada, entrar por e-mail e
senha com ativação/recuperação por e-mail e exigir internet para consultar
ou alterar na primeira versão. O piloto começa sem custo de hospedagem, com
uma congregação e até 100 publicadores. Essas preferências estão aprovadas;
as escolhas de ferramentas e fornecedores abaixo continuam sendo propostas.

## Alternativas

1. Aplicação com módulos de negócio em um único backend e banco relacional.
2. Serviços independentes por domínio, com maior complexidade de operação e
   coordenação de alterações que envolvem reservas e recursos.
3. Backend fornecido como serviço, sujeito à avaliação das garantias de
   autorização, transações, migrations e dependência do fornecedor.

## Decisão proposta

### Organização

Adotar um backend único em NestJS, organizado em módulos, e interface React
responsiva. Usar TypeScript nas duas partes e PostgreSQL para persistência.
As versões propostas e suas fontes estão no
[registro de versões](../arquitetura/versoes-propostas.md).

Organização prevista, ainda não criada:

```text
apps/web/                 interface React
apps/api/                 API e sessão do navegador
packages/database/       schema, cliente Prisma e migrations SQL
packages/contracts/      contratos de comunicação quando necessários
tests/e2e/               jornadas no navegador
tests/migration-fixtures/ históricos fictícios para testar a ferramenta
docs/                    requisitos, decisões e operação
```

Usar pnpm workspaces e um lockfile. Evitar gerador de monorepo adicional nesta
etapa. Módulos previstos: identidade/associações, congregações, equipamentos,
locais, programação, reservas, convites, notificações e auditoria.

### Comunicação e segurança

Propor API HTTP com contratos documentados e validação no servidor. O backend
serve a interface compilada e a API sob a mesma origem na implantação inicial.
Durante desenvolvimento, o servidor da interface encaminha chamadas à API.

O navegador não acessa o PostgreSQL. Toda operação verifica identidade,
associação à congregação e permissão. Usar chaves e restrições coerentes com
essa associação, com testes contra leitura/escrita entre congregações.
Não depender apenas de um filtro automático do ORM para o isolamento.

### Autenticação proposta

Usar provedor de identidade gerenciado, com **Auth0 como candidato**, login
hospedado por e-mail/senha e fluxo OpenID Connect Authorization Code. A
aplicação não implementa armazenamento de senhas. Ativação, verificação de
e-mail e recuperação devem compor a especificação de identidade da etapa seguinte.

Propor troca de código no backend e sessão em cookie HttpOnly e Secure, com
política SameSite, proteção contra CSRF, validação de state/nonce e expiração.
Biblioteca e configurações exatas serão selecionadas na etapa de identidade.
Não manter tokens de autenticação em armazenamento persistente do navegador.

O identificador externo de usuário se relaciona às associações e permissões
mantidas no banco da aplicação. Não mapear automaticamente cada congregação
para uma Organization comercial do provedor. Login e e-mail verificado não
autorizam ingresso em uma congregação. A política de cadastro e aprovação
continua pendente de especificação.

Fonte do fluxo: [Authorization Code no Auth0](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow/add-login-auth-code-flow).
Alternativas: outro provedor compatível com OIDC ou identidade auto-hospedada;
esta última amplia a operação que o mantenedor precisa administrar.

### Banco e migrations

Propor Prisma ORM e **Prisma Migrate 7.10.0** como única autoridade do histórico
SQL, com revisão de cada migration. Usar driver PostgreSQL e versões alinhadas
de CLI, cliente e adaptador. Recursos não expressos no modelo Prisma podem
exigir SQL explícito e validações complementares de catálogo do PostgreSQL.

Disputas por capacidade, limite diário, impressão e aceite/cancelamento devem
ser resolvidas por transações e mecanismos de concorrência no banco. A escolha
entre locks e restrições será documentada e testada nas funcionalidades.

### Notificações e disponibilidade

Propor uma caixa de saída persistente de eventos, gravada na mesma transação
da alteração de negócio. Um processador com retentativas e controle de
concorrência entrega os avisos, mede atrasos e mantém histórico. Inicialmente
pode executar no mesmo serviço sempre ativo; separar em worker exige rever
dimensionamento e custo. Não depender de memória ou de uma chamada HTTP aberta
para manter o envio pendente.

Usar substituto local de e-mail nos testes. Resend é candidato para o envio
real e para o SMTP do provedor de identidade, sujeito aos limites de volume.

### Internet e interface

A primeira versão exige conexão para consultas e alterações. Exibir estado
de indisponibilidade de rede sem tratar dados antigos como disponibilidade
confirmada. Não incluir cache offline de programação, sincronização posterior
de reservas ou service worker de dados nesta etapa. A interface responsiva
atende navegador móvel; instalação como PWA pode ser avaliada em etapa própria.

### Entrega e implantação

Propor Docker para a aplicação e PostgreSQL descartável no desenvolvimento e
nos testes. A produção usa PostgreSQL gerenciado, separado do contêiner da API.
Fixar imagens por versão e digest na implementação, sem tags flutuantes.

Para o piloto, avaliar serviço web gratuito no Render e PostgreSQL 18 gratuito
no Neon. O serviço e o banco podem suspender computação por inatividade; isso
precisa aparecer como limitação mensurável, sem alterar os contratos da
aplicação ou o histórico de migrations. Não usar o PostgreSQL gratuito do
Render como banco persistente do piloto, pois ele expira após 30 dias.

Propor GitHub Actions com instalação reproduzível, documentação, formatação,
análise estática, tipos, build, testes unitários, integração, migrations e
navegador. Contribuições externas executam sem credenciais de produção.

CI validada não autoriza implantação em produção. Promover o mesmo artefato,
executando migrations por job serializado com credenciais próprias antes da
promoção compatível. Produção tem liberação explícita do mantenedor.

## Consequências esperadas

- Transações de reserva podem ser coordenadas em um banco relacional.
- Autorização e isolamento por congregação devem existir no servidor e ser
  protegidos por testes, independentemente dos filtros da interface.
- Regras de concorrência exigem restrições e operações de banco verificadas;
  a escolha de um ORM, por si só, não assegura disponibilidade consistente.
- Notificações exigem tratamento de falhas e retentativas sem duplicar efeitos.
- Hospedagem e identidade gerenciadas reduzem tarefas de infraestrutura, mas
  introduzem custos, limites e dependência de fornecedores.
- Nenhum pacote foi instalado; compatibilidade publicada não substitui a
  prova de instalação, build e testes em TEC-001.

## Condições para aprovação e implementação

- Revisar esta ADR, as versões propostas e os critérios de TEC-001.
- Confirmar orçamento, volume inicial e serviços em
  [hospedagem proposta](../operacao/hospedagem-proposta.md) antes de contratação.
- Detalhar identidade e associação à congregação antes de configurar login real.
- Documentar os comandos reais no guia de contribuição quando configurados.
- Verificar licenças e requisitos de operação das dependências selecionadas.
