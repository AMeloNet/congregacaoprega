# Primeira congregação fictícia no staging

A especificação [IDN-001C](../requisitos/IDN-001C.md) exige que a primeira
congregação seja provisionada antes de o master convidar administradores locais.
Não há endpoint de criação de congregações. Esta migração de dados é exclusiva
do ambiente de homologação e não integra o histórico Prisma compartilhado com
outros ambientes.

## Critérios

- O banco precisa ser exatamente `congregacaoprega_staging` no projeto Neon
  `congregacaoprega-staging`.
- Se a tabela `congregation` estiver vazia, cria apenas `Congregação
  Homologação`, com fuso `America/Sao_Paulo`.
- Executar novamente não duplica o registro. Se houver dados diferentes, a
  transação falha sem alterá-los.

## Execução

1. No Neon, confirme o projeto `congregacaoprega-staging` e a branch utilizada
   pelo Render. O rótulo `production` dessa branch é interno ao projeto de
   staging; não identifica o ambiente de produção da aplicação.
2. No SQL Editor, confirme que `SELECT current_database();` devolve
   `congregacaoprega_staging` e que `SELECT name, timezone FROM
   public.congregation;` não retorna linhas.
3. Execute o conteúdo **integral** de
   [20261001000100_first_congregation.sql](../../scripts/staging-migrations/20261001000100_first_congregation.sql)
   como uma única operação. Não substitua o nome do banco nem remova as
   verificações ou a transação.
4. Confira que a consulta final retorna uma única linha com o nome e o fuso
   acima. Recarregue `/` no staging; o menu do master deverá apresentar essa
   congregação.

Não use dados reais, não copie URLs de conexão nem execute essa migração em
outro projeto. Se houver outra congregação ou algum erro, pare e investigue;
não apague linhas para forçar a execução. Uma reversão de dados, caso se torne
necessária, exige um procedimento próprio que considere convites e vínculos.
