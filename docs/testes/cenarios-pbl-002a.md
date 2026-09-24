# PBL-002A — Cenários da captura controlada

Status: **cenários automatizados locais executados em 23/09/2026; PostgreSQL,
container, CI e homologação externa pendentes**. Requisito:
[PBL-002A](../requisitos/PBL-002A.md). Evidências:
[registro PBL-002A](pbl-002a-evidencias.md).

| Cenário | Critério | Nível | Resultado esperado |
| --- | --- | --- | --- |
| T-PBL2A-01 | PBL2A-01 | Unidade | Cada variável obrigatória ausente impede a inicialização e o erro contém somente nomes |
| T-PBL2A-02 | PBL2A-01 | Unidade | Transporte diferente de `capture`, segredo curto ou segredo reutilizado é recusado |
| T-PBL2A-03 | PBL2A-02 | Unidade | Somente domínio reservado de teste entra na memória; nenhum cliente SMTP/HTTP é chamado |
| T-PBL2A-04 | PBL2A-03 | HTTP | Ausência ou alteração de assinatura, instante vencido e identificador repetido retornam a mesma negação |
| T-PBL2A-05 | PBL2A-04, PBL2A-05 | HTTP | Listagem assinada mascara destinatário e omite parâmetros, link e token |
| T-PBL2A-06 | PBL2A-04, PBL2A-06 | HTTP | Consumo assinado devolve a mensagem uma vez; repetição e expiração não devolvem conteúdo |
| T-PBL2A-07 | PBL2A-05 | Unidade e HTTP | Segredo, assinatura e token não aparecem em erros, listagens ou saída de log capturada |
| T-PBL2A-08 | PBL2A-06 | Unidade | Nova instância da captura começa vazia, representando reinício do processo |
| T-PBL2A-09 | PBL2A-07 | Container e HTTP | Raiz e `/api/session` continuam na mesma origem; resposta não inclui CORS curinga ou credenciais externas |
| T-PBL2A-10 | PBL2A-08 | Revisão | Blueprint funcional separado declara uma réplica, deploy manual e variáveis sem valores reais |
| T-PBL2A-11 | PBL2A-08 | Integração PostgreSQL | Papéis de aplicação e migration são distintos; aplicação não executa DDL e migration é serializada |
| T-PBL2A-12 | PBL2A-09 | Verificação pública | `congregacaoprega-preview` permanece `Live` no commit `7873e0d` e exibe UI-001 |
| T-PBL2A-13 | PBL2A-10 | Regressão | Verificações estáticas, unitários, PostgreSQL 18, migrations, Chromium e container são aprovados |

## Evidência TDD

A primeira execução deve falhar pela ausência dos contratos de configuração,
autenticação operacional, expiração, consumo e filtragem de destinatários. A
falha e a regressão final serão registradas em arquivo de evidências sem copiar
segredos, assinaturas ou mensagens capturadas.
