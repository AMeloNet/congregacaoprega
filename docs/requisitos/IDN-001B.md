# IDN-001B — Convites de acesso e trilha de auditoria

Status: **migration implementada após a falha TDD confirmada; aguardando
validação final da CI**. Relacionado a [IDN-001](IDN-001.md),
[IDN-001A](IDN-001A.md), [ADR-0002](../decisoes/0002-identidade-gerenciada.md)
e aos cenários T-IDN-14, T-IDN-15, T-IDN-16, T-IDN-18, T-IDN-19, T-IDN-21,
T-IDN-22, T-IDN-24 e T-IDN-25.

## Objetivo e limites

Criar o modelo versionado que permitirá convidar alguém para uma congregação,
iniciar o primeiro administrador master e registrar alterações de vínculos e
papéis. A migration não envia e-mail, não cria token em texto aberto, não aceita
convite, não altera vínculo nem autoriza requisições. Esses comportamentos serão
implementados sobre esta estrutura em incrementos posteriores.

## Modelo proposto

| Entidade | Campos e invariantes |
| --- | --- |
| `AccessInvitation` | ID; tipo `MEMBERSHIP` ou `MASTER_BOOTSTRAP`; destinatário e sua forma normalizada; resumo criptográfico único do token; estado; expiração; datas de conclusão e invalidação; criador; congregação e papel solicitados quando o tipo for de vínculo |
| `IdentityAuditEvent` | ID; tipo de evento; resultado; autor opcional; conta afetada, congregação, convite e vínculo relacionados quando existentes; instante de criação |

O token de convite existe somente durante a emissão e o consumo; o banco guarda
somente um resumo criptográfico. Um convite pendente de vínculo precisa de
congregação e papel. Um convite de inicialização master não tem congregação nem
papel local. A normalização do destinatário usa letras minúsculas e evita dois
convites pendentes para o mesmo destinatário na mesma congregação. A reemissão
invalida o pendente anterior antes de criar o novo.

Convites pendentes não são associações. A autorização continuará consultando
somente `Membership` ativa. Eventos de auditoria registram identificadores e
resultado, sem token, senha, URL de retorno ou conteúdo de e-mail.

## Critérios e provas antes da implementação

| ID | Resultado esperado e prova automatizada |
| --- | --- |
| IDN-B01 | Banco PostgreSQL descartável aplica a segunda migration e cria os enums, convites e eventos de auditoria |
| IDN-B02 | Convite de vínculo pendente exige congregação, papel local permitido, destinatário normalizado e resumo de token único; referências inexistentes e valores inválidos falham no banco |
| IDN-B03 | Só existe um convite de vínculo pendente por congregação e destinatário normalizado; após invalidar o anterior, um reenvio pode ser inserido; concorrência não cria dois pendentes |
| IDN-B04 | Só existe uma inicialização master pendente; ela não admite congregação ou papel local; ao invalidá-la, pode ser reemitida |
| IDN-B05 | Evento de auditoria referencia autor, pessoa afetada, congregação, convite e vínculo existentes, preservando o evento e sem campo para o token em texto aberto |
| IDN-B06 | O histórico aplica em banco vazio e sobre IDN-001A com dados fictícios preservados; reaplicação não duplica migrations e drift intencional é detectado |

Os testes de integração foram escritos antes da migration e falharam na CI com
PostgreSQL 18 por falta de `access_invitation` (`42P01`). Com a migration
aditiva, devem passar no mesmo ambiente. O banco de teste termina em `_test` e
é descartado em cada caso.

## Migration e recuperação

A migration `20260920013000_create_access_invitations_and_audit` só adiciona
tabelas, enums, índices e restrições; não remove ou transforma dados existentes.
A versão anterior suportada é IDN-001A. Antes de ser incorporada, o rascunho
pode ser ajustado e revalidado em banco descartável. Depois de incorporada ou
aplicada em ambiente compartilhado, correções exigem nova migration. Não usar
reset em banco persistente.
