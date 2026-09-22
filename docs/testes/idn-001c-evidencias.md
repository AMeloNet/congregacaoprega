# Evidências da IDN-001C

Status: **implementação e verificações locais concluídas em 22/09/2026;
PostgreSQL 18 e container aguardam CI do Pull Request**. Requisito:
[IDN-001C](../requisitos/IDN-001C.md).

## Ciclo TDD observado

Os primeiros testes foram escritos depois da especificação e antes dos módulos
funcionais. A execução inicial de Vitest em 21/09/2026 encontrou três suítes
com falha e sete testes anteriores aprovados. As falhas foram ausência de
`AuthService`, `IdentityService` e `AccessApp`, portanto comportamento ausente,
não erro de banco ou instalação.

Incrementos posteriores começaram com falhas específicas para revogação de
convite, consulta isolada de vínculos, controles reais de convite, convite de
administrador pelo master e revogação visual de publicador. As mensagens foram,
respectivamente, métodos/controles inexistentes. Depois de cada implementação,
as suítes afetadas foram repetidas.

## Verificações locais

| Comando | Resultado local |
| --- | --- |
| `pnpm docs:check` | aprovado; links Markdown locais válidos |
| `pnpm format` | aprovado depois da formatação versionada |
| `pnpm lint` | aprovado, sem avisos |
| `pnpm typecheck` | aprovado nos pacotes API, web e database |
| `pnpm db:validate` | aprovado; schema Prisma válido |
| `pnpm build` | aprovado; NestJS e Vite geraram os artefatos |
| `pnpm test:unit` | aprovado; 28 testes em sete arquivos na regressão final |
| `pnpm test:e2e` | aprovado; seis testes, desktop e Pixel 7 |
| `pnpm test:integration` | **não executável localmente**: `TEST_DATABASE_URL` ausente e Docker não instalado; a proteção recusou o alvo antes de acessar dados |

O job `PostgreSQL and migration fixtures` da CI usa PostgreSQL
18.6 descartável e é a evidência obrigatória para os dois novos casos de fluxo
funcional e concorrência. O job de container comprova configuração obrigatória
e o endpoint de processo vivo.

## Cobertura funcional entregue

- Authorization Code com state, nonce, PKCE, validação RS256/JWKS, emissor,
  audiência e expiração; callback de uso único e sessão opaca revogável.
- Bootstrap master único de 24 horas, token em SHA-256 no banco e resposta HTTP
  sem token; convite master aparece apenas na captura controlada.
- Convites de sete dias, destinatário verificado, recusa, expiração, revogação,
  reenvio com invalidação do anterior e consumo concorrente transacional.
- Separação entre master global, administrador local e publicador por
  congregação; seleção de vínculo não concede autorização.
- Consulta isolada, revogação e reativação de publicador; alteração e auditoria
  ocorrem na mesma transação PostgreSQL. Último administrador local não pode ser
  removido sem substituto.
- Interface em português para login, recuperação pelo Universal Login,
  e-mail não verificado, ausência de vínculo, congregação ativa, aceite/recusa,
  convites administrativos e administração de publicadores.
- Captura de e-mail sem rede. Nenhum transporte externo ou destinatário real é
  usado por código, testes ou documentação.

## Limitações e validação externa pendente

Não foram fornecidas credenciais, tenant Auth0, domínio de remetente ou banco
PostgreSQL local. Assim, não houve login contra Auth0 real, ativação/recuperação
real, entrega externa de e-mail nem execução local dos testes PostgreSQL. A CI
valida banco e concorrência sem segredos; a configuração Auth0 de homologação e
um transporte externo exigem etapa operacional e não autorizam pessoas reais
até a validação documentada.

Sessões e captura de e-mail desta etapa ficam na memória do processo; reinício
encerra sessões e remove mensagens capturadas. Isso é adequado ao teste local e
impede envio acidental, mas múltiplas réplicas e retentativa persistente de
e-mail exigem armazenamento compartilhado antes do piloto real. A criação da
primeira congregação também permanece uma pré-condição provisionada: a regra de
quem pode criar congregações ainda não foi definida e não foi inventada nesta
etapa.
