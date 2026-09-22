# Cenários de identidade e associação

Status: **IDN-001A/B executados; cenários funcionais implementados na
IDN-001C e aguardando a CI do Pull Request**.
Requisito: [IDN-001](../requisitos/IDN-001.md). O provedor de identidade
precisa ter um substituto controlado nos testes; integração com serviço real
será validada separadamente, sem enviar e-mail a pessoas reais.

| Cenário | Critério | Condição e resultado esperado | Camada planejada |
| --- | --- | --- | --- |
| T-IDN-01 | IDN-01 | Pessoa ativa e com e-mail verificado entra e acessa somente sua associação ativa | Integração e navegador |
| T-IDN-02 | IDN-01, IDN-03 | E-mail não verificado não acessa; identidade sem vínculo não acessa rotas da congregação | Integração e navegador |
| T-IDN-03 | IDN-02 | Retorno OIDC com state/nonce incorreto, assinatura inválida, código expirado ou repetido não cria sessão | Integração |
| T-IDN-04 | IDN-02 | Logout, sessão expirada e cookie alterado impedem nova requisição protegida | Integração e navegador |
| T-IDN-05 | IDN-03, IDN-04 | Publicador não concede papel a si mesmo nem acessa vínculo de outra pessoa por ID | Integração |
| T-IDN-06 | IDN-04 | Administrador local não lê nem altera vínculos de outra congregação por ID; erro não revela dados de outro tenant | Integração |
| T-IDN-07 | IDN-03, IDN-04 | Manipular congregação em URL, corpo ou cabeçalho não muda o vínculo autorizado | Integração |
| T-IDN-08 | IDN-05 | Revogar vínculo ou reduzir papel interrompe a próxima ação sem exigir novo login; histórico registra o autor | Integração |
| T-IDN-09 | IDN-06 | Chaves e restrições impedem vínculos duplicados e referências inconsistentes; concorrência não cria dois vínculos ativos equivalentes | PostgreSQL real |
| T-IDN-10 | IDN-06 | Histórico real cria banco vazio e atualiza versão anterior com dados fictícios preservados; nova execução não reaplica migration | PostgreSQL real |
| T-IDN-11 | IDN-06 | Drift intencional é detectado e falha de migration interrompe a atualização sem falsa conclusão | PostgreSQL real |
| T-IDN-12 | IDN-07 | Interface comunica ausência de associação e indisponibilidade, funciona por teclado e em tela móvel | Navegador |
| T-IDN-13 | IDN-08 | Erros e logs não expõem segredo, código OIDC, token ou URL de banco | Integração |
| T-IDN-14 | IDN-09 | Administrador local convida por e-mail; só o destinatário autenticado e verificado aceita | Integração e navegador |
| T-IDN-15 | IDN-09 | Convite recusado, revogado ou aceito não permite novo aceite; requisições concorrentes não criam vínculos duplicados | Integração com PostgreSQL |
| T-IDN-16 | IDN-10 | Convite inicial controlado cria o primeiro administrador local, sem conta administrativa padrão; operação deixa trilha | Integração e operação |
| T-IDN-17 | IDN-11 | Pessoa com papéis distintos em duas congregações troca a ativa; nenhum endpoint usa o papel ou os dados da outra | Integração e navegador |
| T-IDN-18 | IDN-12 | Local não concede papel administrativo; master pode conceder e revogar, mas não remove o último local ativo sem substituto | Integração com PostgreSQL |
| T-IDN-19 | IDN-13 | Convite de inicialização ao mantenedor cria o primeiro master uma só vez; nova execução sem autorização não cria outro | Integração e operação |
| T-IDN-20 | IDN-14 | Convite é aceito antes de sete dias e recusado no instante da expiração; processamento atrasado não mantém acesso pendente | Unitário e integração |
| T-IDN-21 | IDN-14 | Reenvio cria novo prazo, invalida o convite anterior e não duplica o vínculo; troca de e-mail exige novo convite | Integração |
| T-IDN-22 | IDN-15 | Local revoga e reativa publicador da própria congregação; acesso muda na próxima requisição, histórico e aviso são gerados | Integração e navegador |
| T-IDN-23 | IDN-15 | Local não revoga nem reativa publicador de outra congregação por ID | Integração |
| T-IDN-24 | IDN-13 | Convite master expira em 24 horas; reemissão controlada invalida o anterior e nenhuma execução cria segundo master por acidente | Integração e operação |
| T-IDN-25 | IDN-15 | Alteração de vínculo gera registro imediato e aviso por e-mail em até uma hora; falha de envio não restaura o acesso nem duplica o evento | Integração com relógio e envio controlados |

Detalhar o procedimento de inicialização master e o serviço de e-mail antes
dos testes executáveis e do código; acrescentar os casos específicos de falha.
Cada teste automatizado deve falhar pelo comportamento ausente antes da
implementação e passar depois. A CI deve executar regressão e migrations
reais antes de um PR funcional ser considerado pronto.

## Matriz executável da IDN-001C

| Suíte | Cenários cobertos |
| --- | --- |
| `apps/api/src/auth/*.spec.ts` | T-IDN-01 a 04 e 13: OIDC controlado, sessão, CSRF, logout e dados sensíveis |
| `apps/api/src/identity/*.spec.ts` | T-IDN-02, 05 a 08 e 14 a 25: autorização, convites, papéis, isolamento, relógio e e-mail capturado |
| `packages/database/src/*.integration.spec.ts` | T-IDN-09 a 11, 15, 18, 21 a 25: migrations, constraints e transações em PostgreSQL 18 |
| `apps/web/src/*.spec.tsx` | T-IDN-01, 02, 04, 12, 14, 17 e 22: estados e jornadas responsivas em português |
| `tests/e2e/ui-001.spec.ts` | sessão controlada, teclado, tela móvel e integração da identidade com o protótipo |

O Auth0 real não é chamado na CI. A validação do tenant de homologação é uma
verificação operacional separada e não autoriza e-mail para pessoas reais.
