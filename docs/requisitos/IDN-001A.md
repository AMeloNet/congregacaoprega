# IDN-001A — Estrutura inicial de identidade e congregações

Status: **incremento dentro do escopo IDN-001 aprovado; ainda sem implementação**.
Relacionado a [IDN-001](IDN-001.md),
[ADR-0002](../decisoes/0002-identidade-gerenciada.md) e ao
[plano de migrations](../banco/migrations.md).

## Objetivo e limites

Criar a primeira migration real da aplicação para representar identidade
externa estável, congregação e associação com papel local. O modelo deve
suportar uma conta associada a várias congregações com papel independente.
O papel master é global e não decorre de nenhuma associação local.

Este incremento entrega apenas estrutura e integridade de dados. Não cria
contas reais, login, convite, autorização HTTP ou envio de e-mail. Esses
comportamentos seguem para os incrementos seguintes de IDN-001. A estrutura
da migration deve permitir adicioná-los sem trocar identificadores existentes.

## Modelo proposto

| Entidade | Campos e invariantes |
| --- | --- |
| `IdentityAccount` | ID interno; emissor e identificador estável do provedor, únicos em conjunto; e-mail de contato atual; indicador de e-mail verificado; papel master global; datas de criação e atualização |
| `Congregation` | ID, nome, fuso IANA padrão `America/Sao_Paulo`, data de criação |
| `Membership` | ID, conta, congregação, papel `PUBLISHER` ou `LOCAL_ADMIN`, estado `ACTIVE` ou `REVOKED`, datas de criação e revogação; uma associação por par conta/congregação |

O e-mail pode mudar sem alterar a identidade nem mover associações. E-mail
verificado não cria vínculo. Revogação preserva a linha para possível
reativação; estado e data de revogação devem ser coerentes. O vínculo da conta
com cada congregação precisa de chaves estrangeiras e restrição de unicidade
no banco, não apenas validação na aplicação. Nenhum dado real integra testes
ou migration.

## Critérios e provas antes da implementação

| ID | Resultado e teste planejado |
| --- | --- |
| IDN-A01 | Aplicar histórico real em banco PostgreSQL 18 descartável e consultar as três tabelas |
| IDN-A02 | Uma conta tem papel local diferente em duas congregações; consulta por conta e congregação retorna apenas o papel correspondente |
| IDN-A03 | Inserção duplicada para conta/congregação e referências inexistentes falham por restrição do banco, inclusive em requisições concorrentes |
| IDN-A04 | Papel e estado só admitem valores previstos; estado revogado exige instante de revogação e ativo não o admite |
| IDN-A05 | Troca de e-mail da conta mantém o mesmo identificador externo e as associações; conta com e-mail verificado sem vínculo segue sem associação |
| IDN-A06 | A versão anterior não tem tabelas de negócio: aplicar em banco vazio e reaplicar depois de inserir dados fictícios preserva os registros, não reexecuta a migration e detecta drift intencional |

Escrever os testes automatizados antes do SQL e do schema. A execução inicial
deve falhar por falta das tabelas, não por falha de ambiente. Depois de criar
o modelo e a migration, executar novamente os testes afetados, o histórico
completo e os checks obrigatórios. Revisar o SQL gerado, as constraints que
Prisma não representa e a estratégia de recuperação no PR. O banco de teste
termina em `_test` e é descartado após cada caso.
