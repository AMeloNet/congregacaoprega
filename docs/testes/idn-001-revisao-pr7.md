# IDN-001 — Correções da revisão do PR #7

Status: **correções autorizadas; validação em andamento**.
Escopo: IDN-A06, IDN-B02 e IDN-B06. Não altera regras de acesso,
migrations já versionadas nem integra autenticação ou envio de e-mail.

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

Os comandos, commits e resultados serão registrados após execução. Uma falha
por falta de PostgreSQL local não será registrada como falha TDD do comportamento.
