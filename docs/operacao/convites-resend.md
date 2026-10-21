# Convites de acesso — transporte Resend preparado

Os convites de administrador local e publicador usam uma fila persistida. O
modo padrão continua `capture`, inclusive em desenvolvimento e testes, sem
chamada externa. Capturas já concluídas nunca são convertidas em e-mails reais.
O bootstrap master e os e-mails do Auth0 (verificação e recuperação de senha)
ficam fora deste transporte.

## Critérios operacionais

- A criação do convite, a invalidação do anterior e o registro da fila ocorrem
  na mesma transação. O convite anterior permanece inválido mesmo se um envio
  anterior já tiver sido aceito pelo provedor.
- O envelope privado é criado antes da chamada externa. Cada tentativa usa o
  mesmo corpo e a chave `access-invitation/<id>` por até 23 horas; o Resend
  fornece a idempotência de 24 horas.
- Falhas transitórias são reprocessadas após 30 segundos, com espera crescente
  até 15 minutos. Após a janela segura, ou se o transporte mudar, o envio fica
  como falho para revisão; não há reenvio automático inseguro.
- Administradores autorizados podem consultar o estado do convite pela API de
  convites da própria congregação. A resposta expõe somente estado, tentativas
  e mensagem segura de falha — nunca token, link, envelope, chave ou segredo.

## Configuração futura

Em um ambiente protegido e somente após autorização específica, verificar o
domínio e o remetente no Resend e configurar:

| Variável | Valor |
| --- | --- |
| `INVITATION_EMAIL_TRANSPORT` | `resend` (padrão `capture`) |
| `RESEND_API_KEY` | chave com permissão de envio no domínio verificado |
| `INVITATION_EMAIL_FROM` | remetente simples no domínio verificado |

`EMAIL_TRANSPORT` deve continuar `capture`: ele cobre a captura interna e não
altera Auth0. Os avisos de programação continuam controlados separadamente por
`SCHEDULE_EMAIL_TRANSPORT` e não são ativados por essa configuração.

No Render, o worker só avança a fila enquanto o processo da API está ativo. Se
o serviço estiver suspenso, os e-mails pendentes aguardam até o próximo
despertar; atrasos próximos ou acima da janela de 23 horas exigem conciliação
no Resend antes de qualquer reenvio manual.
