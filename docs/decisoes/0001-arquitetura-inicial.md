# ADR-0001 — Arquitetura inicial

Status: **proposta, ainda não aprovada**.

Relacionada a [MVP-001](../requisitos/MVP-001.md).

## Contexto

O sistema precisa funcionar no navegador, separar dados de congregações e
preservar disponibilidade e capacidade mesmo com reservas simultâneas.
Ainda não existem código de aplicação ou ferramentas configuradas.

## Alternativas

1. Aplicação com módulos de negócio em um único backend e banco relacional.
2. Serviços independentes por domínio, com maior complexidade de operação e
   coordenação de alterações que envolvem reservas e recursos.
3. Backend fornecido como serviço, sujeito à avaliação das garantias de
   autorização, transações, migrations e dependência do fornecedor.

## Decisão proposta

Adotar inicialmente um backend único organizado em módulos, mantendo regras
de negócio separadas de persistência e apresentação. Avaliar a arquitetura
de referência já discutida: TypeScript, React, NestJS, PostgreSQL, Prisma,
OpenID Connect, Docker e recursos de PWA.

Esta ADR não instala componentes nem confirma sua compatibilidade, versões,
licenças ou funcionalidades atuais. A seleção definitiva depende da revisão
das documentações oficiais e de ADRs aceitos antes da configuração.

## Consequências esperadas

- Transações de reserva podem ser coordenadas em um banco relacional.
- Autorização e isolamento por congregação devem existir no servidor e ser
  protegidos por testes, independentemente dos filtros da interface.
- Regras de concorrência exigem restrições e operações de banco verificadas;
  a escolha de um ORM, por si só, não assegura disponibilidade consistente.
- Notificações exigem tratamento de falhas e retentativas sem duplicar efeitos.
- PWA precisa de escopo próprio; cache local não deve autorizar uma reserva
  sem a confirmação do servidor sobre disponibilidade atual.

## Condições para aprovação e implementação

- Definir versões compatíveis de runtime, framework, banco e ferramentas.
- Escolher provedor de identidade e política de associação à congregação.
- Escolher a autoridade do histórico de migrations; Prisma é uma opção em
  avaliação, e não uma decisão já tomada.
- Definir infraestrutura de testes unitários, integração, navegador e CI.
- Documentar os comandos reais no guia de contribuição quando configurados.
- Verificar licenças e requisitos de operação das dependências selecionadas.
