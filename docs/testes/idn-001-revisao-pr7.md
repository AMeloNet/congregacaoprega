# IDN-001 — Correções da revisão do PR #7

Status: **correções verificadas no commit `7a547ee` e incorporadas a
`codex/identity-scope` pelo PR #7**. Este registro acompanha o PR #6 para
`main`.
Escopo: IDN-A06, IDN-B02 e IDN-B06. Não altera regras de acesso,
migrations já versionadas nem integra autenticação ou envio de e-mail.
O modelo Prisma deve mapear os nomes físicos existentes, inclusive nomes
truncados pelo PostgreSQL, sem recriar índices nem ignorar sua divergência.

## Contrato da verificação

1. Aplicar somente a migration IDN-001A, copiada do histórico real para uma
   pasta temporária. Confirmar que IDN-001B ainda não foi aplicada, inserir
   contas, congregações e vínculos fictícios com papéis e estados distintos,
   aplicar o histórico completo e comparar todos os registros anteriores.
   Executar as restrições de identidade e convite no banco atualizado e
   verificar que a reaplicação preserva também os registros de migrations.
2. Comparar o catálogo do banco testado com outro banco descartável criado
   pelo histórico real. A comparação inclui tabelas, colunas, tipos, valores
   padrão, nulabilidade, enums, constraints, índices, views e triggers.
   Comparar também com um banco criado pelo SQL gerado do schema Prisma,
   excetuando apenas CHECKs e índices parciais nessa segunda comparação.
   Esses objetos continuam obrigatórios na comparação com o histórico SQL.
3. Demonstrar a detecção de uma coluna inesperada, mudança de coluna,
   remoção/alteração de CHECK e remoção/alteração de índice parcial. Cada
   mutação ocorre somente no banco descartável e deve fazer a mesma
   verificação rejeitar o schema; rollback restaura a referência válida.
   Verificar também divergência intencional do modelo Prisma.
4. Testar normalização incorreta com congregação válida, e ausência de
   congregação com e-mail corretamente normalizado. Conferir código e nome
   da constraint PostgreSQL em cada falha. Remover temporariamente cada
   constraint no banco de teste deve demonstrar que a asserção deixa de passar.

Os bancos terminam em `_test`; não há dados reais nem URLs registradas em logs.
A comparação cobre os objetos usados nesta etapa. Privilégios, políticas RLS,
funções e extensões exigirão verificações próprias quando forem introduzidos.
Não usar estas fixtures para aplicar alterações em ambientes persistentes.

## Evidências

- `f903e03`: [execução TDD](https://github.com/AMeloNet/congregacaoprega/actions/runs/35548353360).
  PostgreSQL: oito testes passaram e um falhou por `Schema comparison is not
  implemented`, após criar as referências pelo histórico e modelo reais.
  Upgrade populado e normalização já passaram. Chromium e contêiner passaram.
  O job estático também falhou por `no-unsafe-finally`; essa falha de lint é
  independente da evidência TDD e foi corrigida movendo a validação do caminho
  temporário para antes do bloco `try/finally`.
- `6adc9d2`: [primeira comparação completa](https://github.com/AMeloNet/congregacaoprega/actions/runs/35548726576).
  A CI detectou divergência real de nome no índice de destinatário/congregação:
  o PostgreSQL truncou o identificador SQL para 63 bytes, terminando em
  `recipient_email_normalized_id`; o nome inferido pelo Prisma terminava em
  `recipient_email_normalize_idx`. Dois testes falharam nessa comparação e
  sete passaram. Os outros três jobs passaram. A correção explicita
  `map` no modelo com o nome físico já existente; não há alteração estrutural
  no banco nem necessidade de nova migration para esse mapeamento.
- `7a547ee`: [validação após a correção do mapeamento](https://github.com/AMeloNet/congregacaoprega/actions/runs/35548964391).
  Os quatro jobs passaram: verificações estáticas/unitárias, PostgreSQL,
  Chromium e contêiner. Nove testes de integração passaram, incluindo o
  upgrade populado, as duas restrições isoladas de convite e a comparação
  completa de schema. As 12 mutações independentes do catálogo foram
  rejeitadas; rollback restaurou o estado válido após cada uma. A divergência
  intencional da referência Prisma também foi rejeitada. Dois testes E2E
  passaram. CI em Ubuntu 24.04, Node 24.21.0, pnpm 11.19.0 e PostgreSQL 18.6.

## Verificações locais e limites

Windows, Node 24.19.0 e pnpm 11.19.0:

| Comando | Resultado |
| --- | --- |
| `pnpm docs:check` | Aprovado; links Markdown locais válidos, com revisão manual de conteúdo |
| `pnpm format` | Aprovado |
| `pnpm lint` | Aprovado após corrigir `no-unsafe-finally` |
| `pnpm typecheck` | Aprovado nos três pacotes |
| `pnpm db:validate` | Aprovado, inclusive após o `map` do índice |
| `pnpm build` | Aprovado para API e interface |
| `pnpm test:unit` | Quatro testes aprovados |
| `git diff --check` | Aprovado |

Não há PostgreSQL/Docker configurado localmente. Integração, E2E e contêiner
foram executados na CI citada acima; não são apresentados como testes locais.
O sandbox bloqueou alguns processos locais com `EPERM`; as verificações foram
reexecutadas fora dele e passaram. Essa limitação de ambiente não é falha TDD.

As duas migrations existentes foram preservadas byte a byte. O único ajuste
no modelo é o mapeamento do nome físico do índice; não muda estruturas nem
dados no PostgreSQL. A verificação não usou novas dependências, e-mails,
dados reais nem aplicação de migrations em ambiente persistente. Não houve
implantação.

O histórico real já é testado em banco vazio e atualizado. Os fluxos de
autenticação/autorização e os testes T-IDN funcionais permanecem pendentes.
Esta evidência não comprova backup/restauração de ambiente persistente nem
prontidão para produção.

## Continuidade após o merge do PR #6

O [push na `main` do commit `5c391f4`](https://github.com/AMeloNet/congregacaoprega/actions/runs/35550257095)
falhou no job PostgreSQL apesar de 9 testes aprovados. O Vitest registrou uma
exceção não tratada `57P01` (`terminating connection due to administrator
command`) durante a remoção de um banco `invitation_*_test`. O helper usa
`DROP DATABASE ... WITH (FORCE)` depois de `pool.end()`: uma conexão pode ainda
estar terminando quando o banco é removido à força. Os demais três jobs passaram.

Correção FIX-IDN-TEST-01: a remoção de cada banco descartável deve aguardar o
encerramento normal de todas as conexões, inclusive de outro pool que tenha
usado o mesmo banco. A limpeza não pode usar `FORCE` nem matar conexões. Um
teste de integração mantém uma conexão externa por tempo controlado e comprova
que o helper só conclui após essa conexão terminar. Após a correção, executar
os testes afetados e os quatro jobs da CI antes de incorporar o reparo à `main`.
