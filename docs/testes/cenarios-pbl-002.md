# PBL-002 — Cenários da publicação funcional controlada

Status: **planejados em 23/09/2026; não executados**. Estes cenários definem as
provas exigidas antes de implementar ou configurar a
[PBL-002](../requisitos/PBL-002.md).

| Cenário | Critério | Nível | Resultado esperado |
| --- | --- | --- | --- |
| T-PBL2-01 | PBL2-01, PBL2-06 | Build e fumaça | A imagem do SHA aprovado inicia NestJS e serve `AccessApp`; publicar só `apps/web/dist` não satisfaz a etapa |
| T-PBL2-02 | PBL2-02 | Configuração automatizada | Cada variável obrigatória ausente ou URL inválida impede inicialização sem imprimir valor sensível |
| T-PBL2-03 | PBL2-02, PBL2-09 | Configuração automatizada | `EMAIL_TRANSPORT` diferente de `capture` é recusado antes de qualquer envio |
| T-PBL2-04 | PBL2-03 | Integração PostgreSQL | A credencial da aplicação lê/escreve tabelas permitidas, mas não cria, altera ou remove schema |
| T-PBL2-05 | PBL2-04 | Integração PostgreSQL | Job serializado cria banco vazio com todo o histórico e aprova status e drift |
| T-PBL2-06 | PBL2-04 | Integração PostgreSQL | Atualização desde a versão anterior preserva dados fictícios, constraints e auditoria; nova execução não reaplica migrations |
| T-PBL2-07 | PBL2-04, PBL2-10 | Integração PostgreSQL | Migration inválida ou concorrente falha e impede a promoção sem marcar estado manualmente |
| T-PBL2-08 | PBL2-05 | Fumaça | Processo sem banco aprova somente `/api/health/live`; `/api/health/ready` retorna indisponível sem detalhe da conexão |
| T-PBL2-09 | PBL2-05, PBL2-06 | Fumaça | Com banco atualizado, saúde pronta, raiz e `/api/session` respondem sob a mesma origem HTTPS |
| T-PBL2-10 | PBL2-07 | Navegador | Login e callback válidos criam sessão opaca; callback adulterado/repetido, emissor ou audiência incorretos são recusados |
| T-PBL2-11 | PBL2-07, PBL2-13 | Navegador | Logout revoga sessão; reinício encerra sessões em memória e a interface retorna ao estado não autenticado |
| T-PBL2-12 | PBL2-08 | Navegador e HTTP | Requisições relativas funcionam sem CORS; origem externa não recebe permissão curinga nem credenciais |
| T-PBL2-13 | PBL2-09 | Integração e segurança | Convite para endereço fictício aparece somente na captura autorizada; não há conexão SMTP/HTTP externa, token em log ou resposta útil sem assinatura operacional |
| T-PBL2-14 | PBL2-09, PBL2-13 | Operação | Reinício remove a captura em memória; o convite persistido pode ser revogado/reemitido sem recuperar o token antigo |
| T-PBL2-15 | PBL2-10 | Operação | Segredo inválido, Auth0 indisponível ou banco inacessível produz falha observável e bloqueia promoção sem reduzir validações |
| T-PBL2-16 | PBL2-11 | Recuperação | Rollback inicia a versão anterior compatível sem reverter migration; backup lógico restaura dados fictícios em banco descartável |
| T-PBL2-17 | PBL2-12 | Verificação pública | A URL PBL-001 continua servindo a UI-001 no commit `7873e0d` enquanto a etapa funcional usa serviço e URL separados |
| T-PBL2-18 | PBL2-14 | Revisão | Evidências, logs e banco usam apenas dados fictícios e não contêm credenciais, tokens ou dados pessoais |

## Ordem mínima de execução

1. Demonstrar que a infraestrutura de teste detecta configuração ausente,
   migration inválida, banco indisponível e origem não permitida.
2. Executar testes unitários e de integração em PostgreSQL 18 descartável.
3. Aplicar o histórico no banco gerenciado técnico pelo job serializado.
4. Publicar o SHA aprovado em URL separada e executar fumaça e navegador.
5. Ensaiar rollback da aplicação e restauração do banco, registrando tempos e
   limitações.

Os resultados devem registrar comando, SHA, ambiente, data e estado
**aprovado**, **falhou** ou **não executado**. Valores sensíveis devem ser
mascarados. Checks de CI não comprovam Auth0 real, limites do provedor,
reativação após suspensão ou restauração do banco gerenciado; essas verificações
precisam de evidência operacional própria.
