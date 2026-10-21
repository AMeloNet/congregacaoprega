# Avisos da programação — transporte Resend preparado

Status: implementação e testes locais, sem habilitar entrega real nem publicar
em staging. O mantenedor autorizou preparar Resend e manter captura até
configuração e liberação específicas. `EMAIL_TRANSPORT=capture` continua para a
captura interna e os e-mails de identidade hospedados no Auth0; os convites de
administrador local e publicador têm fila Resend separada, documentada em
[`convites-resend.md`](convites-resend.md). Esta integração abrange somente
avisos de reservas e programação. A caixa de avisos interna persiste
independentemente do transporte.

## Critérios de aceitação

- Ausência de configuração mantém captura, sem chamadas externas. Segredos
  preenchidos isoladamente não ativam envio.
- Tentativas externas mantêm identificador, destinatário, remetente e conteúdo;
  falhas e reinícios não geram um novo envio para o mesmo aviso.
- Aceitação pelo provedor não comprova entrega. Somente evento assinado de entrega
  preenche `delivered_at`; isso comprova aceite pelo servidor destinatário, sem
  afirmar leitura ou chegada à caixa principal.
- Webhooks sem assinatura, adulterados ou fora da tolerância são rejeitados antes
  de gravar dados. Repetições não duplicam eventos; eventos antecipados aguardam
  correlação, e ordem de chegada não apaga entrega nem falha definitiva.
- Falha definitiva, mudança de transporte e fim da janela segura interrompem
  reenvio automático, com aviso explícito aos administradores. Capturas antigas
  nunca são convertidas automaticamente em mensagens reais.

## Configuração futura

Após liberação do mantenedor, configurar no ambiente protegido:

| Variável | Valor |
| --- | --- |
| `SCHEDULE_EMAIL_TRANSPORT` | `resend` (padrão `capture`) |
| `RESEND_API_KEY` | Chave com permissão de envio do domínio adotado |
| `SCHEDULE_EMAIL_FROM` | Endereço simples do remetente no domínio verificado |
| `RESEND_WEBHOOK_SECRET` | Segredo `whsec_…` do endpoint |

O servidor recusa inicialização em Resend se a configuração estiver incompleta
ou o remetente/segredo forem inválidos. Não alterar `EMAIL_TRANSPORT` de identidade.
Não incluir valores reais em exemplos, commits, logs ou capturas de tela.

Verificar o domínio/remetente no Resend e cadastrar endpoint HTTPS
`/api/schedule-email/webhook`, incluindo `email.sent`, `email.delivered`,
`email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed` e
`email.suppressed`. O endpoint retorna 404 em captura; em Resend autentica pelos
headers Svix sobre o corpo original, com tolerância de cinco minutos. Não usa
sessão ou CSRF, que continuam obrigatórios nas ações autenticadas do sistema.
O parser HTTP mantém o limite padrão de corpo do Nest/Express.

Antes de ativar, revisar a fila de avisos pendentes: avisos ainda não tentados
usarão o novo transporte. Capturas concluídas não são reenviadas. Tentativas
anteriores em captura permanecem identificadas e não migram para Resend.

## Entrega, falhas e recuperação

O worker processa a fila a cada 30 segundos enquanto a aplicação estiver ativa.
Uma concessão persistida de um minuto evita trabalho simultâneo no mesmo aviso;
o pedido HTTP tem timeout de dez segundos. O envelope privado e o primeiro
instante de tentativa são gravados antes da chamada externa. A chave é
`schedule-notice/<id>`, com o mesmo corpo em todas as tentativas, mesmo após
alteração do endereço cadastrado ou do remetente configurado.

Retentativas têm espera crescente de 30 segundos a 15 minutos. O Resend mantém
idempotência por 24 horas; o sistema interrompe tentativas após 23 horas desde
a primeira, reservando margem para processamento. Em resultado incerto além
desse prazo, verificar o identificador no provedor antes de qualquer intervenção.
Não limpar timestamp/envelope, trocar chave nem recolocar a fila manualmente sem
essa conciliação, pois isso poderia enviar novamente uma mensagem já aceita.

Eventos são persistidos somente com ID, ID do provedor, tipo e instantes, sem
corpo original, destinatários ou mensagens de erro do provedor. Eventos que
chegam antes da resposta de envio são conciliados após a resposta ou no próximo
ciclo. Falha definitiva/reclamação não é apagada por aceitação ou entrega tardia;
o instante de entrega, quando existente, permanece como histórico. Falhas
permanentes não têm reenvio automático. Eventos alheios são ignorados sem
modificar avisos. A fila possui envelope privado com endereço e conteúdo;
restringir acesso ao banco e backups, como os demais dados de conta.

A tela administrativa mostra falhas, interrupção de reenvios e avisos sem
entrega confirmada após uma hora. A captura não satisfaz entrega externa. Serviço
suspenso ou indisponibilidade do provedor podem ultrapassar o prazo; isso exige
tratamento operacional, sem cancelar reservas ou esconder atrasos. Não houve
ensaio de entrega real nesta etapa.

Migration aditiva: `20261017000600_schedule_email_delivery`. Não editar migrations
incorporadas; aplicar por promoção serializada. Reverter código não remove a fila
nem os eventos. Versões antigas só entendem captura e não devem processar avisos
Resend pendentes sem revisão operacional.

Teste representativo: `packages/database/src/schedule-email.integration.spec.ts`,
com HTTP e PostgreSQL reais, provedor simulado e assinaturas de teste. Verifica
resposta perdida, envelope estável, concorrência, retorno antecipado, repetição,
adulteração, expiração da assinatura, aceitação/entrega, falha definitiva, captura
e interrupção segura. A verificação de schema acompanha o histórico e o Prisma.

Referências técnicas oficiais:
[API de envio](https://resend.com/docs/api-reference/emails/send-email),
[idempotência](https://resend.com/docs/dashboard/emails/idempotency-keys),
[eventos](https://resend.com/docs/webhooks/event-types),
[verificação de webhooks](https://resend.com/docs/webhooks/verify-webhooks-requests)
e [assinatura Svix](https://docs.svix.com/receiving/verifying-payloads/how-manual).
