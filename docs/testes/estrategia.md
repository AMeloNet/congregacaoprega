# Estratégia e cenários de testes

Status: planejamento. Não há runner, suíte automatizada ou CI configurados.
Todos os cenários abaixo estão **não executados**. Referências:
[MVP-001](../requisitos/MVP-001.md) e [RES-001](../requisitos/RES-001.md).
Os cenários adicionais de horários, alterações no grupo, equipamentos e
programação mensal estão em [cenarios-programacao.md](cenarios-programacao.md).

## Implantação da base de testes

Antes da primeira funcionalidade, documentar o contrato da infraestrutura,
configurar as ferramentas escolhidas por ADR e demonstrar que uma falha
intencional é detectada pelo runner e pela CI. Corrigir a falha e comprovar
o resultado aprovado. Registrar os comandos reais e seus resultados.

Depois, para cada comportamento: escrever o teste, executar e observar a
falha pelo comportamento ausente, implementar e executar novamente os testes
afetados. Antes de entregar, executar regressão e verificações obrigatórias.
Falha de instalação ou ambiente não conta como a etapa de falha do TDD.

## Camadas

- Unitários: duração, sobreposição, expiração e transições do grupo.
- Integração: API, autorização, transações, constraints, concorrência e
  migrations em PostgreSQL real e descartável, compatível com o ambiente alvo.
- Ponta a ponta: jornadas de reserva, convite e cancelamento pelo navegador.
- Notificações: captura local ou substitutos controlados; nenhum envio a pessoas reais.

Controlar relógio e usar dados fictícios e independentes. Metas de cobertura,
comandos e checks obrigatórios serão definidos quando as ferramentas existirem.
Cobertura numérica não substitui os cenários de concorrência e autorização.

## Matriz de cenários de reservas

| Cenário | Requisito | Condição e resultado esperado | Camada planejada |
| --- | --- | --- | --- |
| T-RES-01 | RES-01, RES-09 | Cancelar grupo com responsável, confirmado e convite pendente libera todas as posições e recursos, preserva histórico e gera aviso a todos os envolvidos | Integração e navegador |
| T-RES-02 | RES-01, RES-09 | Aceite concorrente com cancelamento não deixa participação ativa em reserva cancelada; convite cancelado não pode ser reutilizado | Integração |
| T-RES-03 | RES-02 | Responsável e dois convites pendentes ocupam três posições; uma quarta pessoa não pode ingressar | Integração |
| T-RES-04 | RES-03 | Publicador elegível ocupa vaga aberta; posição ocupada por convite pendente não pode ser tomada | Integração e navegador |
| T-RES-05 | RES-04 | Convite enviado mais de 24 horas antes do início vence após 24 horas e abre a posição | Unitário e integração |
| T-RES-06 | RES-04 | Convite enviado menos de 24 horas antes do início vence no início da designação e abre a posição | Unitário e integração |
| T-RES-07 | RES-04 | No instante da expiração e depois dele, rejeitar aceite e liberar posição; processamento periódico atrasado não mantém vaga bloqueada | Unitário e integração |
| T-RES-08 | RES-05 | Com dois confirmados, o mínimo é atendido; havendo posição aberta, permitir terceiro sem permitir quarto | Integração |
| T-RES-09 | RES-05 | No início, um confirmado e convites ainda não aceitos resultam em reserva mantida, recursos ocupados e alerta ao administrador | Integração |
| T-RES-10 | RES-06 | Com dois carrinhos disponíveis, reservas em dois pontos consomem a capacidade; recusar um terceiro ponto no intervalo sobreposto | Integração |
| T-RES-11 | RES-06 | Carrinho cadastrado mas indisponível no intervalo não compõe a capacidade disponível | Integração |
| T-RES-12 | RES-06 | Duas solicitações simultâneas pelo último recurso não podem ambas consumi-lo | Integração |
| T-RES-13 | RES-07 | Participante de 08:00–10:00 não pode reservar ou ingressar em 09:00–11:00, ainda que em outro ponto | Unitário e integração |
| T-RES-14 | RES-07 | Aceites simultâneos para reservas sobrepostas não podem confirmar a mesma pessoa em ambas | Integração |
| T-RES-15 | RES-08 | Aceitar duração de uma e duas horas, com início e fim em horas cheias | Unitário e integração |
| T-RES-16 | RES-08 | Rejeitar zero, duração negativa, trinta ou noventa minutos, três horas e qualquer início/fim fora da hora cheia | Unitário e integração |
| T-RES-17 | RES-02, RES-03 | Dois ingressos simultâneos na última posição produzem apenas uma nova participação | Integração |
| T-RES-18 | RES-01, RES-02 | Repetir criação, ingresso ou cancelamento não duplica reserva, participação nem evento lógico de cancelamento | Integração |
| T-RES-19 | Permissões | Usuário de outra congregação não pode ler ou alterar reserva, entrar, ser convidado ou aceitar convite por identificador | Integração |
| T-RES-20 | Permissões, RES-18 | Outro publicador não pode aceitar convite em nome do destinatário ou cancelar a reserva como se fosse o responsável; o administrador autorizado pode cancelar conforme RES-18 | Integração |
| T-RES-21 | RES-10 | Responsável bloqueia terceira posição vazia; ingresso espontâneo é recusado na interface e na API; grupo com dois confirmados continua atendendo ao mínimo | Integração e navegador |
| T-RES-22 | RES-10 | Responsável reabre terceira posição vazia; um publicador elegível pode ingressar | Integração e navegador |
| T-RES-23 | RES-10 | Outro publicador não pode mudar a escolha do responsável; bloqueio não remove participante ou convite existente | Integração |
| T-RES-24 | RES-10 | Bloqueio e ingresso concorrentes não deixam um participante na posição marcada como vazia e bloqueada; somente uma transição compatível pode ocorrer | Integração |

T-RES-10 usa o cenário de um grupo por ponto e um carrinho por grupo; capacidade
maior e outros tipos estão nos cenários T-EQP. As ações de publicadores desta
matriz pressupõem mês liberado para edição; T-PRG valida o bloqueio mensal,
que prevalece mesmo em vaga aberta ou durante reabertura administrativa.

## Testes de migrations

Conforme o [plano de migrations](../banco/migrations.md), validar banco vazio,
atualização com dados representativos, reaplicação do executor, divergências
de schema, constraints, isolamento e recuperação. Executar a aplicação contra
o banco atualizado. Simular concorrência com conexões/transações independentes,
sem substituir o banco real por mocks.

## Evidências e revisão documental

Cada entrega deve registrar requisito, comando real, ambiente, resultado e
limitação. Distinguir aprovado, falhou e não executado. Nunca declarar os
cenários desta matriz aprovados apenas porque foram documentados.

Para mudanças somente de documentação, revisar conteúdo, consistência entre
requisitos e cenários, Markdown, referências e exemplos. Não criar testes
funcionais artificiais para validar textos.
