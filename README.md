# congregacaoprega

Sistema web responsivo para organizar equipamentos, pontos, horários, participantes
e designações de pregação em múltiplas congregações, com isolamento dos dados
de cada congregação.

## Estado do projeto

O projeto está na etapa de documentação e definição das regras de negócio.
Ainda não há aplicação, banco configurado, testes automatizados ou pipeline
de integração contínua (CI). Os cenários documentados ainda não foram executados.

## Documentação

- [Regras de colaboração e desenvolvimento](AGENTS.md).
- [Escopo do MVP e próximos passos](docs/requisitos/MVP-001.md).
- [Regras e critérios de aceitação das reservas](docs/requisitos/RES-001.md).
- [Tipos de equipamento e capacidade dos locais](docs/requisitos/EQP-001.md).
- [Programação mensal e relatório Testemunho Público](docs/requisitos/PRG-001.md).
- [Proposta de arquitetura](docs/decisoes/0001-arquitetura-inicial.md).
- [Versões propostas](docs/arquitetura/versoes-propostas.md).
- [Escopo da primeira etapa técnica](docs/requisitos/TEC-001.md).
- [Hospedagem gerenciada e estimativa de custos](docs/operacao/hospedagem-proposta.md).
- [Estratégia e cenários de testes](docs/testes/estrategia.md).
- [Cenários de horários, equipamentos e programação mensal](docs/testes/cenarios-programacao.md).
- [Plano de controle das migrations](docs/banco/migrations.md).

## Como o desenvolvimento será feito

Preferências confirmadas: avaliar hospedagem gerenciada, login por e-mail e
senha com ativação/recuperação por e-mail e conexão obrigatória na primeira
versão. O piloto terá uma congregação e até 100 publicadores em serviços
gratuitos. Ferramentas e fornecedores ainda estão em proposta para revisão.

1. O mantenedor revisa o escopo e os critérios de cada etapa.
2. Documentamos o comportamento e escrevemos os testes antes de implementá-lo.
3. Executamos os testes para demonstrar a falha pelo comportamento ausente.
4. Implementamos e executamos novamente os testes pertinentes.
5. Enviamos documentação, código, migrations e evidências em um Pull Request.
6. O mantenedor decide a incorporação à `main` e a liberação para produção.

O primeiro desenvolvimento será precedido pela instalação e validação da
infraestrutura de testes. Comandos de instalação, execução e atualização
serão publicados quando as ferramentas estiverem configuradas.

## Licença

Licenciado sob a [GNU AGPL versão 3](LICENSE), identificador
`AGPL-3.0-only`. Versões modificadas oferecidas pela rede devem disponibilizar
o código-fonte correspondente aos usuários, conforme os termos da licença.
O uso comercial é permitido. A licença do código não autoriza divulgar dados
pessoais dos usuários.
