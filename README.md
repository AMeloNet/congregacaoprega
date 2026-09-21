# congregacaoprega

Sistema web responsivo para organizar equipamentos, pontos, horários, participantes
e designações de pregação em múltiplas congregações, com isolamento dos dados
de cada congregação.

## Estado do projeto

A base técnica TEC-001 foi incorporada à `main` no PR #5. Ela contém uma página
de estado, API mínima, ferramentas de teste, estrutura Prisma e workflow de CI.
O PR #7, de `codex/identity-core` para `codex/identity-scope`, reúne as duas
migrations de identidade, congregações, vínculos, convites de acesso e auditoria
(IDN-001A/B), incluindo o PR #8 já incorporado nessa branch. A incorporação à
`main` continua pendente. Login, sessões, autorização HTTP, aceite de convites,
envio de e-mail, cadastros de recursos e reservas ainda não foram implementados.
Os testes atuais comprovam a estrutura de dados; os fluxos funcionais de
IDN-001 continuam pendentes.

## Documentação

- [Regras de colaboração e desenvolvimento](AGENTS.md).
- [Escopo do MVP e próximos passos](docs/requisitos/MVP-001.md).
- [Regras e critérios de aceitação das reservas](docs/requisitos/RES-001.md).
- [Tipos de equipamento e capacidade dos locais](docs/requisitos/EQP-001.md).
- [Programação mensal e relatório Testemunho Público](docs/requisitos/PRG-001.md).
- [Proposta de arquitetura](docs/decisoes/0001-arquitetura-inicial.md).
- [Versões propostas](docs/arquitetura/versoes-propostas.md).
- [Escopo da primeira etapa técnica](docs/requisitos/TEC-001.md).
- [Proposta de identidade e associação à congregação](docs/requisitos/IDN-001.md).
- [Decisão de identidade gerenciada para o piloto](docs/decisoes/0002-identidade-gerenciada.md).
- [Cenários de testes de identidade](docs/testes/cenarios-identidade.md).
- [Hospedagem gerenciada e estimativa de custos](docs/operacao/hospedagem-proposta.md).
- [Estratégia e cenários de testes](docs/testes/estrategia.md).
- [Cenários de horários, equipamentos e programação mensal](docs/testes/cenarios-programacao.md).
- [Plano de controle das migrations](docs/banco/migrations.md).
- [Guia de instalação e testes](CONTRIBUTING.md).
- [Evidências da base técnica](docs/testes/tec-001-evidencias.md).
- [Revisão e evidências de IDN-001A/B no PR #7](docs/testes/idn-001-revisao-pr7.md).

## Como o desenvolvimento será feito

Preferências confirmadas: avaliar hospedagem gerenciada, login por e-mail e
senha com ativação/recuperação por e-mail e conexão obrigatória na primeira
versão. O piloto terá uma congregação e até 100 publicadores em serviços
gratuitos. Os fornecedores de hospedagem, identidade e e-mail ainda estão em
avaliação; a base de desenvolvimento já está configurada.

1. O mantenedor revisa o escopo e os critérios de cada etapa.
2. Documentamos o comportamento e escrevemos os testes antes de implementá-lo.
3. Executamos os testes para demonstrar a falha pelo comportamento ausente.
4. Implementamos e executamos novamente os testes pertinentes.
5. Enviamos documentação, código, migrations e evidências em um Pull Request.
6. O mantenedor decide a incorporação à `main` e a liberação para produção.

Os comandos de instalação, execução e atualização da base inicial estão em
[CONTRIBUTING.md](CONTRIBUTING.md). As verificações que dependem de PostgreSQL
real ou contêiner serão comprovadas pela CI antes da incorporação.

## Licença

Licenciado sob a [GNU AGPL versão 3](LICENSE), identificador
`AGPL-3.0-only`. Versões modificadas oferecidas pela rede devem disponibilizar
o código-fonte correspondente aos usuários, conforme os termos da licença.
O uso comercial é permitido. A licença do código não autoriza divulgar dados
pessoais dos usuários.
