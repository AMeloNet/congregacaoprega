# Plano de controle das migrations

Status: estratégia inicial. Não há banco, schema, ferramenta instalada ou
migration executável. A política obrigatória está no [AGENTS.md](../../AGENTS.md).

## Antes da primeira migration

1. Aprovar por ADR a ferramenta que será a autoridade do histórico, sua versão
   e a versão principal do PostgreSQL.
2. Definir diretório, formato, identificadores únicos e nomes em inglês.
3. Documentar os comandos reais de geração local, revisão, aplicação e consulta
   do histórico, além da verificação de divergência entre schema e modelo.
4. Preparar bancos descartáveis e dados fictícios para criação e atualização.
5. Demonstrar que a validação detecta falhas e interrompe a promoção.

Não há comandos executáveis configurados nesta etapa. A proposta é Prisma
Migrate 7.10.0, ainda sujeita à aprovação de
[ADR-0001](../decisoes/0001-arquitetura-inicial.md) e à prova de
[TEC-001](../requisitos/TEC-001.md).

Para a versão 7 proposta, a geração local usa o fluxo `migrate dev`, que requer
banco sombra descartável; aplicação em ambiente persistente usa `migrate deploy`.
Esses são nomes de operações da ferramenta, não scripts já existentes no projeto.
O cliente deve ser gerado explicitamente; não depender da geração automática
de versões anteriores. [Referência da versão 7](https://www.prisma.io/docs/cli/v7/migrate/dev).

`migrate diff` só compara recursos representáveis pelo Prisma; não comprova
sozinho a ausência de alterações em triggers, views e outros objetos SQL.
Complementar com verificações do catálogo e testes das restrições que usarmos.
[Limitação documentada](https://www.prisma.io/docs/cli/v7/migrate/diff).

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

Todos os itens estão **não executados**. A existência do plano não constitui
evidência de um banco validado.

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
