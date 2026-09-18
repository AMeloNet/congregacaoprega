# Cenários adicionais de reservas e programação

Status: **planejados e não executados**. Não há aplicação, runner, banco de testes,
gerador de relatório ou CI. Complementa a [estratégia](estrategia.md), preservando
os identificadores T-RES-01 a T-RES-24 já existentes.

Referências: [RES-001](../requisitos/RES-001.md),
[EQP-001](../requisitos/EQP-001.md) e [PRG-001](../requisitos/PRG-001.md).
Casos dependentes de decisão ainda pendente não podem ser tratados como critérios
fechados de implementação. Testes de avisos usam e-mail capturado localmente.

## Horários, participantes e convites

| Cenário | Requisito | Condição e resultado esperado | Camada planejada |
| --- | --- | --- | --- |
| T-RES-25 | RES-11 | Permitir à mesma pessoa 07:00–08:00 e 08:00–10:00; continuar recusando intervalos sobrepostos | Unitário e integração |
| T-RES-26 | RES-12 | No mesmo dia e fuso, permitir participação que complete oito horas e recusar a que exceda, tanto em criação quanto em aceite ou ingresso | Unitário e integração |
| T-RES-27 | RES-12 | Com sete horas confirmadas, duas solicitações simultâneas de uma hora em intervalos distintos não podem ambas produzir nove horas | Integração com transações independentes |
| T-RES-28 | RES-13, PRG-04 | Permitir 23:00–01:00 com alerta quando os dois dias comportarem o intervalo; recusar se parte estiver fora do horário permitido | Unitário, integração e navegador |
| T-RES-29 | RES-14 | Receber dois convites sobrepostos sem bloquear agenda; aceitar um e impedir aceite conflitante do outro; permitir sua recusa | Integração |
| T-RES-30 | RES-15 | Retirar convite pendente e convidar outra pessoa sem aumentar a ocupação; o convite retirado não pode ser aceito | Integração e navegador |
| T-RES-31 | RES-16 | Recusa/expiração abre a posição; em terceira posição, responsável pode bloqueá-la novamente se o mês permitir edição | Integração |
| T-RES-32 | RES-17, PRG-08 | Desistência autorizada de convidado confirmado avisa responsável e administradores designados em ambos os canais; limites de prazo dependem de P-09 | Integração; critério temporal pendente |
| T-RES-33 | RES-18 | Responsável não pode transferir sua função; administrador local autorizado pode trocá-lo, avisando antigos e novos envolvidos e preservando histórico | Integração e navegador |
| T-RES-34 | RES-19 | Reenvio antes do início reinicia 24 horas, limitado ao início; invalida o convite anterior e mantém uma única posição ocupada | Unitário e integração |
| T-RES-35 | RES-04, RES-20 | Convite às 08:30 para designação 08:00–10:00 vence às 10:00; no vencimento, impedir aceite e abrir a posição | Unitário e integração |
| T-RES-36 | RES-20 | Antes do bloqueio mensal, permitir ingresso/convite durante a designação se não houver conflito, excesso diário ou grupo cheio; não autorizar ingresso em designação encerrada | Integração e navegador |
| T-RES-37 | RES-15, RES-19 | Aceite concorrente com retirada/reenvio não produz participação baseada em convite invalidado nem duplica ocupação | Integração com transações independentes |
| T-RES-38 | RES-18 | Ajuste administrativo não permite sobreposição, excesso de três posições, excesso diário ou uso de recursos indisponíveis | Integração |
| T-RES-39 | RES-12 | Reserva 23:00–01:00 soma uma hora em cada data local; recusar se exceder oito horas em qualquer um dos dias | Unitário e integração |
| T-RES-40 | RES-12 | Ingresso às 08:30 em reserva 08:00–10:00 soma 1h30 ao dia, sem alterar o intervalo do grupo nem a alocação do equipamento | Unitário e integração |
| T-RES-41 | RES-04, RES-19 | Reenvio durante designação reinicia o prazo, limitado ao fim, e não permite aceite do convite anterior; envio/reenvio no fim não produz convite válido | Unitário e integração |
| T-RES-42 | RES-04 | Convite enviado exatamente no início segue a regra dos convites durante a atividade; convite anterior expira no início e não ganha extensão automática | Unitário e integração |

Saída após participação parcial depende de P-08. O estado final
dos outros convites após aceite depende de P-10. Esses pontos não ficam
implicitamente resolvidos pelos testes acima.

## Equipamentos e locais

| Cenário | Requisito | Condição e resultado esperado | Camada planejada |
| --- | --- | --- | --- |
| T-EQP-01 | EQP-01, EQP-02 | Cada grupo consome uma unidade do tipo permitido selecionado, sem exigir escolha da unidade física | Integração e navegador |
| T-EQP-02 | EQP-02 | Recusar tipo não permitido naquele local, inclusive se houver unidades livres desse tipo | Integração |
| T-EQP-03 | EQP-03, EQP-04 | Local novo com capacidade um não permite segundo grupo simultâneo mesmo com equipamentos sobrando | Integração |
| T-EQP-04 | EQP-03, EQP-04 | Local com capacidade dois aceita dois grupos com equipamentos disponíveis e recusa terceiro, inclusive se os tipos forem diferentes | Integração |
| T-EQP-05 | EQP-04 | Carrinho indisponível não pode ser substituído por quiosque/display livre para satisfazer reserva do tipo carrinho | Integração |
| T-EQP-06 | EQP-05, EQP-06 | Inativar unidade sem reservas existentes com observação opcional a exclui de novas reservas; reativar a torna elegível novamente | Integração |
| T-EQP-07 | EQP-04 | Solicitações concorrentes pelo último recurso do tipo ou última capacidade do local não podem todas ser aprovadas | Integração com transações independentes |
| T-EQP-08 | EQP-02, EQP-05 | Administrador de outra congregação não pode mudar tipos, capacidade ou estado do equipamento por identificador | Integração |

Inativação ou mudança de capacidade com reservas existentes exige decisão
específica de EQP-001 antes de definir o resultado final do teste.

## Programação, relatório e avisos

| Cenário | Requisito | Condição e resultado esperado | Camada planejada |
| --- | --- | --- | --- |
| T-PRG-01 | PRG-01 | Permitir preparar o mês seguinte antes, no dia 15 e depois dele; a meta não bloqueia operações | Integração e navegador |
| T-PRG-02 | PRG-02 | Congregação nova adota Brasília; administrador escolhe outro fuso; exibição e limites diários não dependem do fuso da máquina | Unitário, integração e navegador |
| T-PRG-03 | PRG-03 | Dia sem restrição permite horários nas 24 horas; dia com janela 07:00–10:00 permite reserva 08:00–10:00 e recusa 09:00–11:00 | Unitário e integração |
| T-PRG-04 | PRG-03 | Configurar determinados dias da semana não impõe essas restrições aos dias não configurados | Integração |
| T-PRG-05 | PRG-05 | Relatório “Testemunho Público” contém mês, dias da semana, locais, horários e respectivos publicadores; dados de outra congregação não aparecem | Integração e navegador |
| T-PRG-06 | PRG-05 | Relatório longo permanece legível e completo ao imprimir, sem cortar nomes/horários nem omitir designações na quebra de página | Verificação visual de impressão |
| T-PRG-07 | PRG-06 | Mês bloqueado impede todas as alterações dos publicadores na interface e API, inclusive aceite/recusa, ingresso, desistência, cancelamento e controle da terceira vaga | Integração e navegador |
| T-PRG-08 | PRG-06, PRG-07 | Reabertura permite ajustes do administrador, mantendo publicadores bloqueados; mudança gera histórico e aviso aos envolvidos | Integração e navegador |
| T-PRG-09 | PRG-06 | Tela aberta antes do bloqueio não permite salvar alteração de publicador depois dele; bloqueio é verificado no servidor | Integração e navegador |
| T-PRG-10 | PRG-06, RES-04 | Expiração de convite em mês bloqueado libera posição, mas não permite ingresso por publicador; mantém regra de alerta de grupo abaixo do mínimo | Integração |
| T-PRG-11 | PRG-08 | Avisos aparecem no sistema e no e-mail de captura; alertas administrativos seguem a seleção de um ou mais destinatários locais | Integração |
| T-PRG-12 | PRG-07, PRG-08 | Cancelamento/ajuste administrativo avisa envolvidos, inclusive participantes removidos; desistência avisa responsável e administradores designados | Integração |
| T-PRG-13 | PRG-06 | “Finalizar e imprimir” concorrente com alteração não gera relatório incompatível com o estado bloqueado | Integração com transações independentes |
| T-PRG-14 | PRG-06 | Bloquear/reabrir um mês não altera o estado de outro mês ou de outra congregação | Integração |
| T-PRG-15 | PRG-06 | “Finalizar e imprimir” bloqueia antes de abrir a impressão; cancelar o diálogo mantém mês bloqueado e versão emitida | Integração e navegador |
| T-PRG-16 | PRG-10 | Após ajuste administrativo, nova finalização emite nova versão com os ajustes, preservando histórico e bloqueio dos publicadores | Integração e verificação visual |
| T-PRG-17 | PRG-09 | Para evento após início do mês, aviso no sistema fica disponível imediatamente e e-mail é entregue à captura em até uma hora; controlar o relógio e verificar o limite | Integração |
| T-PRG-18 | PRG-09 | Falha temporária de e-mail não desfaz a mudança; retentativas não reiniciam a contagem de uma hora nem duplicam o evento lógico; atraso é detectado | Integração com falha controlada |
| T-PRG-19 | PRG-09 | Designações preparadas antecipadamente têm avisos entregues antes do início do mês no fuso da congregação | Integração com relógio controlado |

PM-04 a PM-06 ainda condicionam
virada de mês, horários locais excepcionais, alterações de configuração,
publicação e representação de convites pendentes no relatório.
