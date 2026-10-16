# Plano de controle das migrations

Status: Prisma Migrate 7.10.0 configurado. A primeira migration real,
`20260919223000_create_identity_core`, cria contas externas, congregações e
vínculos locais conforme [IDN-001A](../requisitos/IDN-001A.md). A segunda,
`20260920013000_create_access_invitations_and_audit`, acrescenta convites de
acesso e auditoria conforme [IDN-001B](../requisitos/IDN-001B.md). O histórico fictício de
`tests/migration-fixtures/` só pode ser aplicado a bancos descartáveis `_test`.
A política obrigatória está no [AGENTS.md](../../AGENTS.md).

## Antes da primeira migration

1. Aprovar por ADR a ferramenta que será a autoridade do histórico, sua versão
   e a versão principal do PostgreSQL.
2. Definir diretório, formato, identificadores únicos e nomes em inglês.
3. Documentar os comandos reais de geração local, revisão, aplicação e consulta
   do histórico, além da verificação de divergência entre schema e modelo.
4. Preparar bancos descartáveis e dados fictícios para criação e atualização.
5. Demonstrar que a validação detecta falhas e interrompe a promoção.

Comandos executáveis estão em [CONTRIBUTING.md](../../CONTRIBUTING.md). Prisma
Migrate 7.10.0 é a autoridade do histórico, com SQL em
`packages/database/prisma/migrations/<timestamp>_<name>/migration.sql`.
O histórico real começa com IDN-001A. Não há dados reais a transformar na
versão anterior, que possuía apenas um schema vazio.

Na versão 7, a geração local usa o fluxo `migrate dev`, que requer
banco sombra descartável; aplicação em ambiente persistente usa `migrate deploy`.
Os scripts `db:migrate:*` do pacote de banco expõem essas operações.
O cliente deve ser gerado explicitamente; não depender da geração automática
de versões anteriores. [Referência da versão 7](https://www.prisma.io/docs/cli/v7/migrate/dev).

`migrate diff` não deve ser usado como prova isolada quando a migration tiver
índices parciais ou restrições SQL sem representação no Prisma. Os testes de
integração comparam o catálogo completo dos objetos usados nesta etapa com
outro banco descartável criado pelo histórico real. Uma segunda referência,
criada pelo SQL de `migrate diff --from-empty --to-schema`, compara os objetos
representados no modelo Prisma; apenas CHECKs e índices parciais são excluídos
dessa segunda comparação. Eles continuam obrigatórios na comparação com o SQL.
Mutações controladas devem comprovar a detecção de divergências de colunas,
defaults, enums, CHECKs, índices parciais e views. `migrate status` verifica o
histórico de aplicação, não substitui a comparação de schema.
[Limitação documentada](https://www.prisma.io/docs/cli/v7/migrate/diff).
Contrato, limites e resultados: [revisão do PR #7](../testes/idn-001-revisao-pr7.md).

O índice de congregação/destinatário em `AccessInvitation` usa `map` explícito
para o nome físico truncado pelo PostgreSQL ao aplicar a segunda migration.
Esse mapeamento reconcilia o modelo com o banco existente; não renomeia nem
recria o índice, e o histórico SQL permanece intacto.

## Entrega de cada alteração

A migration deve acompanhar o modelo e o requisito que a motivou, incluindo
restrições, índices, permissões ou transformação de dados obrigatória. O PR
explica finalidade, SQL efetivo, compatibilidade, volume estimado, bloqueios,
transações e recuperação de falhas parciais.

Migrations incorporadas à `main`, publicadas ou aplicadas em ambientes
persistentes não podem ser editadas, excluídas ou reordenadas. Correções são
novas migrations. Dados fictícios de demonstração ficam separados.

## Matriz de validação antes da promoção

| ID | Validação | Evidência esperada |
| --- | --- | --- |
| T-MIG-01 | Aplicar todo o histórico em banco vazio | Schema final criado e testes de integração aprovados |
| T-MIG-02 | Atualizar a versão anterior suportada com dados fictícios representativos | Dados preservados ou transformados conforme requisito; relações e constraints corretas |
| T-MIG-03 | Executar novamente o aplicador | Nenhuma migration concluída reaplicada |
| T-MIG-04 | Verificar divergências entre banco, modelo e histórico | Divergência intencional em banco descartável detectada; estado esperado sem divergência |
| T-MIG-05 | Executar testes de integridade, isolamento e concorrência no banco atualizado | Nenhum acesso entre congregações ou violação das capacidades |
| T-MIG-06 | Exercitar o procedimento de recuperação aplicável | Restauração ou correção validada, com limites e possíveis perdas documentados |

As fixtures demonstram somente o aplicador; o histórico real exige essas provas
na respectiva entrega. Resultados desta etapa estão no
[registro TEC-001](../testes/tec-001-evidencias.md).

## Aplicação e recuperação

Homologação e produção recebem os mesmos artefatos revisados e testados, por
um job exclusivo e serializado por ambiente, com credenciais próprias.
A aplicação usa conta de privilégio mínimo. Nunca registrar segredos em logs.

Não sincronizar schema diretamente nem gerar migrations ou resetar bancos em
ambientes persistentes. Falha interrompe a promoção e exige diagnóstico antes
de qualquer conciliação manual do histórico.

Preferir adicionar estruturas, migrar dados e remover estruturas antigas em
etapas compatíveis. Reverter o código não reverte o banco. Mudanças destrutivas
exigem autorização para o ambiente afetado, cópia recuperável e procedimento
de recuperação testado. Testar restauração periodicamente; apenas ter um
arquivo de backup não comprova recuperação.

## Inventário EQP-001

`20261015000100_create_equipment` cria `equipment`, `equipment_state_history` e `equipment_type`. É aditiva, sem transformação de dados anteriores; volume inicial zero. Cria CHECKs de comprimento e índice único de expressão `(congregation_id, lower(name))`, não representado pelo Prisma; revisar pelo SQL. Os bloqueios limitam-se às novas estruturas e às referências das FKs. Aplicar por `migrate deploy` no job serializado; falha parcial interrompe promoção e exige diagnóstico antes de conciliar histórico. Reverter código preserva as tabelas e o histórico, sem exclusão automática.

## Horários semanais PRG-001

O modelo por ponto abaixo substitui o uso das restrições globais descritas
nesta seção; o histórico antigo é preservado.

`20261016000100_create_weekly_hours` acrescenta `congregation.weekly_hours_version`
(padrão zero), `weekly_hours_day` e `weekly_hours_history`. Preserva o fuso já
existente e os demais cadastros; ausência de linhas significa 24 horas disponíveis
em cada dia. As tabelas novas começam vazias. CHECKs SQL restringem dia, modo e
formato geral dos intervalos JSON; a API valida cada intervalo e sobreposição.
O modelo Prisma acompanha tabelas, coluna, chaves e índice do histórico.

A coluna com default constante requer breve bloqueio DDL de `congregation`;
as FKs também referenciam contas existentes. O salvamento da semana serializa
pela linha da congregação e grava histórico na mesma transação. Aplicar somente
por `migrate deploy` no job serializado autorizado; esta entrega aplica apenas
em banco descartável, sem staging. Em falha, interromper promoção e diagnosticar
o histórico antes de conciliar. Reverter o código preserva configuração e
histórico; não remover tabelas ou coluna automaticamente.

## Horários semanais por ponto

`20261016000200_create_point_weekly_hours` adiciona versão de edição em
`preaching_point` e cria `point_weekly_hours_day` e
`point_weekly_hours_history`, com FKs para ponto e autor, CHECKs de dia/modo/array
e índice do histórico por ponto/data. O modelo Prisma acompanha a migration.
A congregação do ponto é validada no servidor antes de qualquer leitura ou
escrita. O fuso permanece em `congregation` e sua versão compartilhada protege
alterações concorrentes, inclusive entre pontos diferentes.

Conforme decisão explícita do mantenedor, não há cópia dos horários globais.
As tabelas novas começam vazias, e pontos existentes e novos oferecem 24 horas
em cada dia até receberem configuração própria. Os registros e histórico globais
são preservados, porém deixam de ser usados pela API e interface atuais.

Migration aditiva, sem transformação ou remoção de dados. A coluna com default
constante requer breve bloqueio DDL em `preaching_point`; FKs também referenciam
contas. Aplicar por `migrate deploy` serializado, após validação em PostgreSQL
descartável. Falha interrompe promoção e exige diagnóstico antes de conciliar
histórico. Não editar migrations anteriores. Reverter código não remove novas
estruturas; voltar à versão global reexibiria horários históricos e exige revisão
operacional antes de eventual rollback. Esta entrega não aplica a migration em
staging automaticamente.
