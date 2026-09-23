# UI-002 — Cenários de temas e cores

Status: executados localmente em 22/09/2026. Referência:
[UI-002](../requisitos/UI-002.md).

| Cenário | Critério | Resultado esperado |
| --- | --- | --- |
| T-UI2-01 | UI2-01 | Sem preferência armazenada, a raiz da página usa tema claro e paleta roxa. |
| T-UI2-02 | UI2-02, UI2-05 | Pelo painel acessível, selecionar claro, escuro e sistema atualiza a raiz; sistema acompanha mudança da preferência do dispositivo. |
| T-UI2-03 | UI2-03, UI2-05 | Cada paleta pode ser selecionada por teclado e comunica a seleção; foco continua visível. |
| T-UI2-04 | UI2-04 | Cor e tema escolhidos permanecem após desmontar, montar e recarregar a página. |
| T-UI2-05 | UI2-06 | No modo de impressão, conteúdo usa papel claro e texto escuro mesmo que a tela esteja escura. |
| T-UI2-06 | UI2-07 | A revisão do diff confirma que a etapa não introduz cliente de API, migration ou dado real. |

Os testes de componente devem começar falhando porque a UI-001 não contém o
painel, atributos de tema ou persistência. Os testes E2E cobrem a persistência
no navegador e a interação real em Chromium desktop e celular.

## Evidências

Os cenários e os testes foram escritos antes da implementação. A primeira
tentativa local de iniciar Vitest no ambiente isolado foi bloqueada antes da
coleta pelo erro `spawn EPERM` do Vite; portanto, ela não é evidência de falha
funcional esperada. A execução fora desse isolamento permitiu validar a entrega
após a implementação.

| Comando | Resultado local |
| --- | --- |
| `pnpm docs:check` | Aprovado; links Markdown locais válidos. |
| `pnpm format:write` | Aprovado; arquivos formatados com Prettier. |
| `pnpm lint` | Aprovado; nenhum aviso ou erro. |
| `pnpm typecheck` | Aprovado nos projetos API, web e database. |
| `pnpm build` | Aprovado nos projetos API e web. |
| `pnpm exec vitest run --project web-unit --reporter=verbose --maxWorkers=1 --no-file-parallelism` | Aprovado; 8 testes, incluindo os 3 cenários unitários da UI-002. |
| `pnpm test:e2e` | Aprovado; 10 jornadas em Chromium desktop e celular, incluindo persistência e modo do sistema. |

Não houve alteração de schema, migration ou API, portanto `pnpm test:integration`
não foi executado localmente. A CI continuará a executá-lo em PostgreSQL
descartável para o repositório.
