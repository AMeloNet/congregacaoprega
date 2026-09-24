# PBL-002A — Preparação da publicação funcional e captura controlada

Status: **implementada localmente em 23/09/2026; CI e infraestrutura externa
pendentes**. Este é o primeiro incremento da [PBL-002](PBL-002.md) e preserva a
prévia [PBL-001](PBL-001.md) sem alterações. Evidências:
[PBL-002A](../testes/pbl-002a-evidencias.md).

## Objetivo e limites

Preparar um Web Service funcional separado para homologação e permitir que um
operador consulte mensagens fictícias mantidas na memória do único processo,
sem SMTP, provedor HTTP de e-mail, persistência do conteúdo ou uso de logs como
caixa de entrada.

Esta etapa não cria infraestrutura externa, não publica em produção e não
implementa reservas, equipamentos ou programação. PostgreSQL, Auth0 e Render
recebem somente configuração documentada; a criação de conta, segredo, chave,
recurso pago ou serviço externo exige intervenção do mantenedor.

## Decisão de segurança para a captura

Foram comparadas estas alternativas:

| Alternativa | Resultado |
| --- | --- |
| Logs do processo | Rejeitada: expõe conteúdo a leitores de logs e não oferece consumo ou expiração seguros |
| Shell/SSH no mesmo processo | Preferível em superfície, mas indisponível no Render Free e dependente de compute pago |
| Persistência no PostgreSQL ou serviço externo | Rejeitada nesta etapa: amplia retenção, migrations, segredos e recuperação |
| Troca de provedor por VM gratuita | Rejeitada para este incremento: acrescenta conta, operação de VM, firewall e TLS apenas para observar a captura |
| Rota operacional restrita na mesma origem | Adotada por autorização do mantenedor em 23/09/2026, com controles adicionais abaixo |

A proibição original de qualquer endpoint publicamente roteável é substituída,
somente em homologação, pela proibição de uma captura **publicamente
utilizável**. A rota operacional fica desabilitada fora de
`EMAIL_TRANSPORT=capture` e exige uma requisição autenticada, autorizada e
assinada por segredo exclusivo. Ela não usa a sessão comum nem o segredo de
bootstrap como credencial operacional.

Cada requisição inclui identificador aleatório, instante e assinatura HMAC do
método, caminho, instante e identificador. O servidor aceita uma janela curta,
consome o identificador uma única vez, compara a assinatura em tempo constante
e limita formato e tamanho das credenciais. Respostas de falha não distinguem segredo, assinatura,
identificador repetido ou mensagem inexistente.

A listagem retorna somente identificador opaco, destinatário mascarado,
template e instantes. O corpo e os parâmetros — inclusive links e tokens — só
saem na operação individual de consumo. Consumo ou expiração remove a mensagem
e impede nova leitura. Toda resposta usa `Cache-Control: no-store`.

## Dados fictícios e memória

A captura aceita somente destinatários nos domínios reservados `example.test`,
`example.invalid`, `example.com` e `example.org`. Outros endereços são
recusados antes de armazenar a mensagem. Esses domínios não autorizam dados de
pessoas reais.

Mensagens permanecem apenas na memória, expiram após quinze minutos e não são
gravadas no PostgreSQL. Reinício, suspensão ou novo deploy remove mensagens,
identificadores de requisição e sessões. Por isso o serviço deve permanecer com
uma única réplica. Um convite persistido cujo e-mail capturado foi perdido deve
ser revogado ou reemitido; o token antigo não pode ser recuperado do banco.

## Configuração

Além das variáveis da PBL-002, a aplicação exige:

| Nome | Regra |
| --- | --- |
| `CAPTURE_OPERATOR_SECRET` | segredo exclusivo com pelo menos 32 caracteres, distinto de `SESSION_SECRET` e `BOOTSTRAP_SECRET` |

A ausência da variável, segredo curto ou igualdade entre segredos impede a
inicialização sem imprimir valores. `EMAIL_TRANSPORT` diferente de `capture`
continua recusado antes de qualquer envio.

O cliente operacional lê o segredo somente do ambiente local, gera assinatura
e identificador novos para cada chamada e não imprime cabeçalhos. URLs, tokens
e conteúdo consumido não devem ser copiados para logs, Issues ou Pull Requests.

## Publicação preparada

- O artefato funcional continua sendo o `Dockerfile`: NestJS serve
  `apps/web/dist` e `/api/...` na mesma origem.
- CORS não é habilitado; nenhuma resposta inclui origem curinga ou credenciais
  para outra origem.
- O novo Render Web Service deve ter nome e URL diferentes de
  `congregacaoprega-preview`, uma réplica e deploy manual de SHA aprovado.
- PostgreSQL 18 gerenciado usa credenciais distintas para aplicação e migration.
  A conta da aplicação não recebe privilégios de DDL.
- `prisma migrate deploy` executa em job exclusivo e serializado antes da nova
  versão. Falha interrompe a promoção.
- Auth0 usa Regular Web Application e cadastra somente callback, logout e origem
  exatos da URL funcional.
- Nenhum recurso externo é criado por esta entrega sem a intervenção prevista.

## Critérios de aceitação

| ID | Resultado verificável |
| --- | --- |
| PBL2A-01 | Variável obrigatória ausente, segredo curto/reutilizado ou transporte diferente de `capture` impede inicialização sem revelar valores |
| PBL2A-02 | Captura recusa destinatário não fictício e nunca inicia conexão SMTP/HTTP |
| PBL2A-03 | Requisição ausente, adulterada, expirada ou repetida não consulta a captura e recebe resposta uniforme |
| PBL2A-04 | Operador com assinatura válida lista apenas metadados mascarados e consome uma mensagem individual uma única vez |
| PBL2A-05 | Listagens, respostas de erro e logs não contêm token, corpo, segredo ou cabeçalho operacional |
| PBL2A-06 | Mensagem expirada ou consumida não pode ser reutilizada; reinício cria captura vazia |
| PBL2A-07 | Frontend, API e rota operacional usam a mesma origem; CORS permanece desabilitado |
| PBL2A-08 | Artefatos descrevem Web Service separado, uma réplica, PostgreSQL 18 com papéis distintos, migration serializada e URLs Auth0 exatas |
| PBL2A-09 | Prévia UI-001 permanece no serviço e commit existentes, sem deploy ou alteração |
| PBL2A-10 | Regressões unitária, PostgreSQL/migrations, navegador e container permanecem aprovadas |

Os cenários executáveis e as evidências ficam em
[cenários PBL-002A](../testes/cenarios-pbl-002a.md).
