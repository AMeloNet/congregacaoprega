# Ensaio de recuperação PBL-002 em staging

Escopo: somente o Web Service `congregacaoprega-staging` e o banco Neon
`congregacaoprega_staging`. Não usar produção, dados reais, reset de banco ou
reversão de migrations. Registrar horário, SHA, resultado e duração dos ensaios
sem copiar conexão, e-mail, token ou conteúdo do dump.

## Backup lógico e restauração descartável

O workflow manual
[`Verify staging backup and restore`](../../.github/workflows/verify-staging-recovery.yml)
usa o ambiente protegido `staging` e a mesma credencial técnica de migration
do deploy controlado. Ele compartilha o grupo de concorrência desse deploy.
Antes do dump, [a verificação](../../scripts/staging-recovery/preflight.sql)
exige o banco exato, ao menos uma congregação e apenas e-mails de domínios
fictícios nas contas e nos convites. Uma falha interrompe o procedimento sem
produzir backup.

`pg_dump` 18 cria um arquivo lógico de formato customizado, incluindo schema
`public` e dados. O arquivo permanece apenas no diretório temporário do runner;
não é publicado como artefato nem impresso no log. `pg_restore` executa em uma
única transação num contêiner PostgreSQL 18 isolado, sem porta publicada. A
[verificação restaurada](../../scripts/staging-recovery/verify-restored.sql)
confere o histórico Prisma, a congregação fictícia, master, administrador local
ativo e convites aceitos. O contêiner é removido ao fim, e o runner é
descartável. Este ensaio comprova **restaurabilidade**, não constitui política
de retenção de backups nem restaura o banco Neon original.

Após incorporar e aprovar o workflow na `main`, iniciá-lo manualmente nessa
branch. Registrar o link da execução, SHA e conclusão de cada passo. Se a
pré-verificação apontar e-mail não fictício, não prosseguir com o dump: definir
uma correção de dados específica e revisada antes de repetir o ensaio.

## Rollback da aplicação

Usar o workflow existente
[`Deploy controlled staging`](../../.github/workflows/deploy-staging.yml).
O rollback proposto é do SHA funcional `0f708463ca61210878ac54d5b9b152ceac4fa0ff`
para o SHA anterior compatível `b2a439358461e5401e0aa29d1f0d460c5313385b`.
Não há diferença de migrations Prisma entre esses SHAs. O alvo anterior pode
voltar a apresentar o problema de entrada por convite; por isso o ensaio é
temporário e não deve criar novos convites.

1. Concluir primeiro o ensaio de backup e restauração acima.
2. Registrar o SHA servido pelo Render, a saúde `/api/health/live` e
   `/api/health/ready` e o estado da `main` antes da mudança.
3. Disparar `Deploy controlled staging` com o SHA anterior completo. Aguardar
   seus jobs e o Render indicarem `Live` nesse SHA; confirmar saúde e acesso à
   raiz sem criar ou alterar dados.
4. Disparar o mesmo workflow com o SHA funcional completo. Aguardar `Live`
   nesse SHA e repetir a fumaça. Verificar que a congregação e os vínculos
   continuam presentes. Não executar rollback de banco.
5. Registrar horários, duração, resultado e limitações. Se a versão anterior
   falhar, restaurar imediatamente o SHA funcional e registrar a falha; não
   prolongar o teste para tentar corrigir dados.

O sucesso do hook GitHub sozinho não prova que o Render concluiu o deploy:
observar o estado `Live` e as duas rotas de saúde em cada direção.
