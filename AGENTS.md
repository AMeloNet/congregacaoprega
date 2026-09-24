# AGENTS.md — congregacaoprega

## Objetivo

Sistema web responsivo para organizar equipamentos, pontos, horários, participantes e designações de pregação em múltiplas congregações.

## Regras obrigatórias

- Leia esta instrução e a especificação relacionada antes de alterar o código.
- Preserve alterações existentes de outras pessoas.
- Implemente somente o escopo solicitado/autorizado.
- Antes de implementar uma funcionalidade, defina seus critérios de aceitação e testes.
- Para funcionalidades e correções, escreva ou ajuste os testes antes da implementação sempre que aplicável.
- Execute os testes afetados após a alteração e corrija falhas antes de concluir.
- Toda alteração de banco deve usar migration versionada. Nunca altere uma migration já incorporada à `main`.
- Valide permissões e entradas no servidor; não confie apenas na interface.
- Não inclua credenciais, tokens, `.env`, dados reais ou informações pessoais no código, testes ou commits.
- Atualize a documentação quando o comportamento, contrato ou configuração do sistema mudar.
- Mantenha mudanças pequenas e relacionadas ao objetivo da tarefa.

## Git

- Use branches curtas e específicas.
- Commits devem ser em inglês no formato `type(scope): summary`.
- Abra um Pull Request para mudanças concluídas.
- Não faça merge na `main`; o mantenedor decide o merge.
- Não reescreva histórico compartilhado.

## Quando houver dúvida

- Se faltar uma regra de negócio que possa alterar o resultado, pergunte antes de decidir.
- Para decisões técnicas rotineiras dentro do escopo, escolha uma solução razoável e prossiga.
- Não peça novamente uma autorização que já foi concedida.

## Conclusão

Antes de considerar uma tarefa concluída:

1. Código implementado conforme o escopo.
2. Testes relevantes executados e aprovados.
3. Migrations criadas/revisadas quando necessário.
4. Documentação atualizada quando necessário.
5. Nenhum segredo ou dado indevido incluído.
6. Informe no final o que foi alterado, os testes executados e eventuais pendências.

## Documentação detalhada

Consulte a documentação em `docs/` quando a tarefa envolver requisitos específicos, arquitetura, banco, testes, segurança ou operação.

Não carregue documentação que não seja relevante para a tarefa.
