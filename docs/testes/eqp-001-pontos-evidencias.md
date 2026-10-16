# EQP-001 — Pontos de pregação

Validação local em 15/10/2026, PostgreSQL 18 descartável em localhost. Nenhuma alteração em staging.

Critérios definidos antes da implementação e confirmados pelo mantenedor: nome único na congregação, endereço separado e descrição opcionais; capacidade total inicial 1 e inteira positiva; ao menos um tipo permitido, compartilhando o enum do inventário, mesmo sem unidades cadastradas. Administrador local ativo com e-mail verificado pode cadastrar, listar e editar todos esses campos. Sem exclusão, inativação, programação ou reservas.

## Verificações

- `node node_modules/vitest/vitest.mjs run --project database-integration packages/database/src/points.integration.spec.ts packages/database/src/schema-verification.integration.spec.ts --maxWorkers=1 --no-file-parallelism`: 2 testes aprovados. Cobrem persistência, edição, duplicação, validações, capacidade padrão, tipos sem inventário, isolamento, perfil publicador, vínculo revogado e e-mail não verificado. Comparação do catálogo com histórico SQL e modelo Prisma aprovada.
- `node node_modules/vitest/vitest.mjs run --project web-unit apps/web/src/PointsPanel.spec.tsx --pool=vmForks --maxWorkers=1 --no-file-parallelism`: 1 teste aprovado, cobrindo cadastro, edição, CSRF e restrição de acesso.
- TypeScript de API e web, ESLint dos arquivos alterados, build Vite, formatação dos arquivos suportados e `node scripts/check-docs.mjs`: aprovados.

A primeira execução identificou que arrays de enum eram retornados como texto pelo driver; o SELECT agora converte para text[], mantendo o contrato JSON de lista. A comparação Prisma identificou diferença de nulidade do array; a migration usa CHECK explícito para impedir NULL, compatível com a representação do Prisma. Ambos os testes passaram após as correções.

O sandbox impediu a inicialização normal do teste web e do PostgreSQL; as execuções aprovadas ocorreram fora dele com autorização da ferramenta. Não foram utilizados dados reais. Não houve homologação visual manual em navegador nem aplicação da migration em banco persistente.

Contrato em [EQP-001](../requisitos/EQP-001.md). Migration nova: `20261015000200_create_preaching_points`.
