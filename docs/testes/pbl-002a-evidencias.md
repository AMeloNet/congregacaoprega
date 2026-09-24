# Evidências da PBL-002A

Status: **implementação local concluída em 23/09/2026; CI e infraestrutura
externa pendentes**. Requisito: [PBL-002A](../requisitos/PBL-002A.md).

## Auditoria anterior à mudança

- `origin/main` foi atualizado e confirmado em
  `9126ce7d8bd4f901f4c455811c0b530093d11e37`.
- A `main` local permaneceu em `26b146a`, sem reset ou reescrita.
- O GitHub mostrava somente o PR #15 aberto.
- O painel Render mostrava um único serviço ativo,
  `congregacaoprega-preview`, do tipo Static Site, com último deploy `Live` no
  commit `7873e0d385e9844c22560b8263454821eb1aeacd`.
- A URL pública exibia “Protótipo UI-001” e o aviso de dados fictícios. Nenhum
  deploy, edição ou criação de recurso foi acionado.

A branch `codex/pbl-002a-controlled-capture` foi criada diretamente de
`origin/main`. O PR #15 e a branch local `main` permaneceram intactos.

## Decisão e ciclo TDD

A comparação entre logs, Shell/SSH, persistência, troca de provedor e rota
operacional foi registrada antes da implementação. Shell/SSH no Render Free é
indisponível; o mantenedor autorizou a exceção restrita para uma rota assinada
na mesma origem.

Depois da especificação, os testes foram adicionados antes dos módulos. A
primeira execução de `pnpm test:unit` apresentou duas suítes sem carregar por
ausência de `CaptureAccessService` e `CaptureController`, além de cinco falhas
nos contratos ainda inexistentes de configuração e captura. Não foi erro de
banco ou dependência. Um incremento posterior para URLs Auth0 de mesma origem
falhou em um de quatro testes antes da validação correspondente ser adicionada.

Após cada correção, a suíte afetada foi repetida. A regressão final unitária
aprovou 11 arquivos e 43 testes.

## Verificações locais

Ambiente local: Windows, Node 24.19.0 e pnpm 11.19.0. A CI permanece como
autoridade para Node 24.21.0, PostgreSQL 18.6 e container Linux.

| Comando/verificação | Resultado |
| --- | --- |
| `pnpm docs:check` | aprovado; links Markdown locais válidos |
| `pnpm format` | aprovado depois da formatação versionada |
| `pnpm lint` | aprovado, sem avisos |
| `pnpm typecheck` | aprovado nos pacotes API, web e database |
| `pnpm db:validate` | aprovado; schema Prisma 7.10.0 válido |
| `pnpm build` | aprovado; NestJS e Vite geraram artefatos |
| `node node_modules/vitest/vitest.mjs run --project api-unit --project web-unit --maxWorkers=1 --no-file-parallelism` | aprovado; 43 testes em 11 arquivos |
| `pnpm test:e2e` | aprovado; dez testes em Chromium desktop e Pixel 7 |
| fumaça local da API compilada | aprovado; cliente HMAC listou captura vazia, chamada sem assinatura recebeu 404 e `Origin` externo não recebeu cabeçalhos CORS |
| `pnpm test:integration` | não executável localmente; os 12 testes recusaram iniciar porque `TEST_DATABASE_URL` está ausente |
| `docker version` | não executável localmente; Docker não está instalado |

O teste local de API usou somente placeholders e banco inacessível fictício;
não houve conexão PostgreSQL, Auth0, SMTP ou HTTP de e-mail. A validação do
Blueprint pelo Render CLI não foi executada porque a ferramenta não está
instalada; Prettier validou a sintaxe YAML e a aplicação real permanece
pendente de revisão no painel.

## Cobertura entregue

- Captura em memória limitada a domínios reservados, com validação anterior à
  persistência do convite.
- Metadados mascarados, corpo sensível apenas no consumo individual, TTL de
  quinze minutos e consumo único.
- HMAC-SHA256 sobre método, caminho, instante e identificador; janela de dois
  minutos, anti-replay, formatos limitados e comparação em tempo constante.
- Falhas de autenticação, repetição e mensagem ausente usam a mesma resposta
  404 e `Cache-Control: no-store`.
- Segredo operacional obrigatório, independente e com tamanho mínimo; erros de
  configuração mostram nomes, não valores.
- URLs Auth0 canônicas e de mesma origem em produção; CORS continua desabilitado.
- Cliente operacional lê segredo do ambiente e não o aceita como argumento.
- Blueprint funcional separado, gratuito, com uma réplica e auto-deploy
  desligado.
- Workflow manual serializa `prisma migrate deploy` e só então solicita deploy
  do mesmo SHA por hook secreto.

## Banco, recuperação e limitações

Não houve alteração de schema ou migration. O histórico IDN-001A/B permanece
imutável. A conta de migration e a conta da aplicação serão distintas; a
configuração e a prova de ausência de DDL da aplicação dependem do Neon técnico
ainda não criado.

Reinício, suspensão ou deploy encerra sessões e apaga a captura. Convites
persistidos permanecem no PostgreSQL e precisam ser revogados ou reemitidos; o
token antigo não pode ser recuperado. Uma única réplica continua obrigatória.

Permanecem pendentes a CI do Pull Request, criação/configuração de Neon, Auth0 e
Render, aplicação real das migrations, login real, rollback e restauração. Não
há publicação funcional nem autorização para produção ou dados pessoais.
