# ADR-0003 — Reserva mínima para programação recorrente

Status: implementação incremental autorizada para sustentar PRG-001 e RES-001.

A programação mensal não possuía reservas reais. A recorrência precisa consumir
capacidade e agenda persistidas, não copiar exemplos da interface. Este incremento
registra somente o responsável, que ocupa a primeira das três posições. Convites,
ingresso, desistência, troca de responsável, cancelamento e avisos não são implementados
por este contrato. O grupo fica explicitamente em formação.

Persistir reserva com congregação, ponto, responsável, tipo de equipamento, data e
hora locais, duração, instantes UTC, terceira posição aberta/bloqueada e chave de
requisição. FKs preservam referências; CHECKs limitam hora, duração e intervalo;
índice único impede duplicação de uma requisição. O servidor valida a associação
do ponto à congregação, elegibilidade e todas as restrições de domínio.

A transação obtém bloqueio de associação/conta, advisory lock do responsável
(também entre congregações) e bloqueio da congregação, nesta ordem. Finalização,
recursos e horários compartilham o bloqueio da congregação. Medir pico de reservas
simultâneas em cada início dentro do intervalo, nunca somar indiscriminadamente
reservas adjacentes. Usar intervalos semiabertos e revalidar oito horas por data
local, incluindo a divisão na meia-noite.

Resolver instantes por comparação dos offsets ao redor da data e round-trip do
horário civil. Rejeitar horário inexistente/ambíguo e intervalos que atravessem
mudança de offset, exigindo escolha explícita de outro horário neste incremento.
Nenhuma conversão silenciosa de horário. Reservas só começam no futuro.

Mudanças de capacidade/tipos/inativação que prejudiquem reservas vigentes são
recusadas com conflito. Horários de dias com designações e fuso de congregação
com designações seguem PM-05; gravações usam o mesmo bloqueio transacional.
Sem cancelamento ou remanejamento silencioso.

Migration aditiva `20261016000400_create_reservation_core`: sem transformação de
dados. Reverter código preserva reservas; falha de aplicação interrompe promoção
e exige diagnóstico de catálogo/histórico. Não há publicação em staging.

A recorrência semanal posterior usa a reserva original como modelo imutável
e primeira ocorrência, sem duplicá-la. Cada data tem resultado persistido e
histórico de tentativas. A execução periódica usa permissão de publicador,
inclusive quando a série foi ativada por administrador; reabertura exige ação
administrativa explícita. Encerrar o modelo preserva todas as reservas existentes.
Contrato, periodicidade e tratamento de pendências estão em PRG-001.
