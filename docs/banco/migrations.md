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

Para a versão 7 proposta, a geração local usa o fluxo `migrate dev`, que requer
banco sombra descartável; aplicação em ambiente persistente usa `migrate deploy`.
Esses são nomes de operações da ferramenta, não scripts já existentes no projeto.
O cliente deve ser gerado explicitamente; não depender da geração automática
de versões anteriores. [Referência da versão 7](https://www.prisma.io/docs/cli/v7/migrate/dev).

`migrate diff` não deve ser usado como prova isolada quando a migration tiver
índices parciais ou restrições SQL sem representação no Prisma. Os testes de
integração verificam o histórico com `migrate status` e usam o catálogo do
PostgreSQL para detectar uma coluna divergente inserida intencionalmente,
além de testarem as restrições efetivas. [Limitação documentada](https://www.prisma.io/docs/cli/v7/migrate/diff).

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
