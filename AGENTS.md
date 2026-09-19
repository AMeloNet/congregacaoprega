# AGENTS.md — congregacaoprega

## 1. Objetivo e escopo

Repositório: https://github.com/AMeloNet/congregacaoprega

Sistema web responsivo para organizar equipamentos, pontos, horários,
participantes e designações de pregação em múltiplas congregações (tenants).

Estas instruções orientam agentes e colaboradores em todo o repositório.
Regras específicas de um módulo devem complementar esta base e indicar seu
escopo. Mudanças destas regras também devem ser documentadas e revisadas.

Princípios obrigatórios definidos pelo mantenedor:

- Documentar o comportamento esperado antes de desenvolver.
- Escrever e executar os testes antes de implementar o comportamento.
- Executar novamente os testes depois de cada desenvolvimento ou correção.
- Controlar toda alteração de banco por migrations versionadas.
- Entregar evidências verificáveis do trabalho realizado.

## 2. Estado inicial e decisões

O projeto concluiu a base técnica TEC-001 no PR #5: há uma interface e API
mínimas, Vitest, Playwright, Prisma sem modelos de negócio e workflow de CI. A
etapa de identidade IDN-001 teve seu escopo aprovado e ainda não começou. Não há
autenticação, reservas, migration real ou implantação. Não apresentar
verificações planejadas como existentes ou executadas; consultar o registro
de evidências em `docs/testes/tec-001-evidencias.md`.

A arquitetura inicial aprovada em ADR-0001 é TypeScript, React, NestJS,
PostgreSQL, Prisma e Docker; identidade via OpenID Connect e eventual PWA
dependem de etapas próprias. Versões usadas constam do registro arquitetural.
A licença é GNU AGPL versão 3 (`AGPL-3.0-only`), conforme `LICENSE`.

Preferências confirmadas pelo mantenedor:

- Documentação, comunicação, Issues e descrições de Pull Requests em português.
  Código, identificadores de banco, nomes de migrations e commits em inglês.
  A interface inicial deve usar português do Brasil.
- Avaliar hospedagem gerenciada. O acesso será por e-mail e senha, com ativação
  e recuperação por e-mail. A primeira versão exige internet para consultar
  e alterar dados; não terá consulta offline da programação.
- O piloto começa em serviços gratuitos, com uma congregação e até 100
  publicadores, para validar o fluxo completo. Limites gratuitos devem ser
  medidos e documentados; uso piloto não equivale a aprovação para produção.
- O mantenedor revisa o escopo e os critérios de uma etapa. Dentro da etapa
  autorizada, implementar as funcionalidades seguindo documentação e TDD,
  sem solicitar nova aprovação para cada incremento.
- Agentes podem criar branches, enviar commits e abrir Pull Requests das
  mudanças autorizadas e verificadas. O mantenedor decide a incorporação à
  `main`; agentes não devem fazer merge ou habilitar merge automático.
- Ampliações relevantes de escopo devem ser apresentadas antes da implementação.

## 3. Fluxo de trabalho por mudança

1. Ler estas instruções, a especificação relacionada e o estado dos arquivos.
   Preservar trabalho existente e alterações de outras pessoas.
2. Associar a mudança a uma Issue ou especificação identificada. Registrar
   objetivo, escopo, critérios de aceitação e impactos em dados e permissões.
3. Escrever os cenários de teste e, para comportamento executável, os testes
   automatizados antes da implementação. Executá-los e confirmar uma falha
   pelo comportamento ausente, distinguindo-a de um erro de ambiente.
4. Implementar a menor mudança completa que atenda aos critérios definidos.
5. Executar os testes afetados após cada incremento. Antes da entrega,
   executar também a suíte de regressão e as verificações obrigatórias
   pertinentes ao escopo.
6. Atualizar documentação, contratos, instruções de operação e migrations
   afetados. Revisar o diff para detectar arquivos ou dados indevidos.
7. Entregar o resultado com os comandos executados, resultados e limitações.

Para defeitos, começar por um teste que reproduza o problema. Refatorações
devem preservar o comportamento e ter testes que o protejam.

Mudanças somente de documentação exigem revisão de conteúdo, Markdown,
referências e exemplos. Configuração e infraestrutura exigem validação de
sintaxe e do comportamento relevante. Não criar testes funcionais artificiais
para alterações de texto. Na implantação inicial da infraestrutura de testes,
documentar primeiro seu contrato e demonstrar que ela detecta falhas antes de
usá-la para validar funcionalidades.

Perguntar quando faltar uma regra de negócio que altere o resultado esperado.
Continuar as partes independentes já autorizadas e resolver escolhas técnicas
rotineiras dentro do escopo. Não repetir pedidos de autorização já atendidos.

## 4. Documentação

- Manter documentação no Git, junto da versão do código a que se refere.
- Documentar cada funcionalidade com identificador, atores, permissões,
  pré-condições, fluxo, erros, critérios de aceitação e cenários de teste.
- Relacionar requisitos, testes, migrations e Pull Requests por identificador.
- Registrar decisões de arquitetura em ADRs com contexto, alternativas,
  decisão, consequências e status. Identificar propostas como propostas.
- Documentar contratos da API, modelo de dados, variáveis de ambiente,
  instalação, testes, atualização, backup e recuperação à medida que existirem.
- Exemplos devem usar dados fictícios e comandos reproduzíveis.
- Não usar comentários para repetir o código; explicar regras e decisões
  que não sejam evidentes na implementação.

Organização prevista, a ser criada conforme as entregas:

| Local | Conteúdo |
| --- | --- |
| `README.md` | Apresentação, estado do projeto e início rápido |
| `CONTRIBUTING.md` | Preparação do ambiente, comandos e colaboração |
| `SECURITY.md` | Relato de vulnerabilidades e política de segurança |
| `docs/requisitos/` | Regras de negócio e critérios de aceitação |
| `docs/decisoes/` | ADRs |
| `docs/arquitetura/` | Componentes, contratos e diagramas |
| `docs/banco/` | Modelo, migrations e procedimentos de dados |
| `docs/testes/` | Estratégia, cenários e instruções de execução |
| `docs/operacao/` | Instalação, publicação, backup e recuperação |

## 5. Padrões de implementação

- Separar regras de negócio, persistência e apresentação. Validar permissões
  e entradas no servidor, inclusive quando a interface já fizer validações.
- Manter tipos explícitos nos contratos e tratamento consistente de erros.
- Adicionar dependências somente com necessidade justificada e compatibilidade
  de versão, manutenção e licença verificadas.
- Fixar as versões de runtime e ferramentas; versionar o lockfile. Usar
  instalação reproduzível em CI e evitar versões flutuantes em publicações.
- Definir formatação e análise estática em configuração versionada.
- Manter mudanças pequenas e coesas; evitar reformatações e alterações alheias
  ao objetivo do Pull Request.
- Projetar telas responsivas, com rótulos, navegação por teclado, mensagens
  compreensíveis e estados de carregamento, erro e ausência de dados.
- Documentar a política de datas, intervalos e fuso horário. Testar limites
  e sobreposições; não depender do fuso da máquina de execução.

## 6. Testes e evidências

- Usar testes unitários para regras isoladas, testes de integração para API e
  persistência e testes de ponta a ponta para jornadas críticas no navegador.
- Usar PostgreSQL real e descartável nos testes de integração e migrations,
  com a mesma versão principal e extensões necessárias ao ambiente alvo.
  Mocks não substituem testes de transações, restrições ou concorrência.
- Manter testes independentes, determinísticos e com dados fictícios.
  Controlar relógio e aleatoriedade quando necessário. Não usar produção.
- Usar captura local ou substitutos controlados para e-mail e outros efeitos
  externos; testes não devem enviar mensagens a pessoas reais.
- Relacionar critérios de aceitação a testes de sucesso, falha e limites.
- Medir cobertura quando a infraestrutura existir; definir metas em
  `docs/testes/` e na configuração de CI. Percentual isolado não comprova
  que regras críticas ou condições de concorrência estão protegidas.
- Não desativar testes, reduzir exigências ou alterar expectativas corretas
  apenas para contornar uma falha. Investigar testes intermitentes.
- Após alterações para corrigir falhas, executar novamente os testes afetados.
- Registrar comandos, resultados e ambiente relevante. Distinguir aprovado,
  falhou e não executado; explicar bloqueios e não declarar uma entrega
  validada quando verificações obrigatórias não foram executadas.

Cenários críticos a detalhar e testar antes das respectivas funcionalidades:

- Isolamento entre congregações, incluindo leitura e escrita por identificador.
- Permissões de administrador master, administrador local e publicador.
- Disputa simultânea pelo mesmo equipamento e por capacidade de um ponto.
- Sobreposição de intervalos e indisponibilidade por reserva externa.
- Limite de três participantes e convites apenas para membros elegíveis da
  mesma congregação; aceite realizado pelo próprio convidado autenticado.
- Publicação mensal, horários indisponíveis e períodos ainda em rascunho.
- Desistências e cancelamentos com histórico e liberação correta dos recursos.
- Reenvio ou duplicidade de uma requisição sem criar reservas duplicadas.

As especificações devem resolver antes da implementação situações como
expiração de convites e desistência do responsável quando há convidados.
Não inventar essas decisões no código.

## 7. Banco de dados e migrations

### Histórico e revisão

- Toda alteração de estrutura, restrição, índice, permissão de banco ou dado
  obrigatório da aplicação deve ter migration versionada e rastreável.
- Escolher uma ferramenta como autoridade do histórico. Documentar sua versão,
  formato de arquivos e comandos antes da primeira migration.
- Versionar juntos o modelo e todos os artefatos exigidos pela ferramenta.
  Revisar o SQL e as operações efetivas, inclusive código gerado.
- Usar identificador único e nome descritivo. Explicar finalidade, impacto,
  pré-condições, compatibilidade e recuperação no respectivo Pull Request.
- Não editar, excluir ou reordenar migrations incorporadas à `main`,
  publicadas ou aplicadas em ambientes compartilhados/persistentes.
  Corrigir por uma nova migration. Rascunhos locais podem ser ajustados antes
  dessa consolidação, com nova validação em banco descartável.
- Reconciliar migrations concorrentes na branch com o histórico atualizado
  antes de incorporar a mudança; não reescrever o histórico já consolidado.
- Separar dados fictícios de demonstração das mudanças obrigatórias de dados.
  Scripts de transformação devem ter execução rastreável e estratégia segura
  de retomada; usar lotes quando o volume exigir.

### Validação e aplicação

- Testar tanto a criação do banco vazio com todo o histórico quanto a
  atualização a partir da versão anterior suportada, com dados representativos.
- Verificar preservação de dados, constraints, relações e isolamento entre
  congregações. Executar os testes da aplicação sobre o banco atualizado.
- Verificar que nova execução do aplicador não reaplica migrations concluídas.
  Isso não significa tornar cada comando DDL individualmente repetível.
- Verificar divergências entre banco, modelo e histórico (schema drift).
  Não considerar a simples aplicação de migrations pendentes uma prova de
  ausência dessas divergências.
- Promover para homologação e produção os mesmos artefatos revisados e testados.
- Aplicar migrations em um job exclusivo e serializado por ambiente, com
  credenciais próprias. A conta normal da aplicação deve ter privilégio mínimo.
- Não usar sincronização direta de schema, geração automática de migrations
  ou reset de banco em homologação e produção. Resets locais devem se limitar
  a bancos descartáveis explicitamente identificados e sem dados reais.
- Validar o ambiente alvo antes de operações de dados. Segredos e URLs com
  credenciais não devem aparecer em comandos registrados ou logs.
- Uma falha interrompe a promoção. Não marcar uma migration como aplicada
  manualmente sem diagnóstico, conciliação e registro do procedimento.

### Compatibilidade e recuperação

- Preferir expandir, migrar os dados e só depois remover estruturas antigas,
  em versões separadas quando necessário. Considerar aplicações antigas ainda
  em execução durante a atualização.
- Planejar transações, bloqueios e duração de operações. Documentar operações
  que não possam executar na mesma transação e como recuperar falhas parciais.
- Mudanças destrutivas exigem impacto documentado, cópia recuperável dos dados,
  procedimento de recuperação testado e autorização do mantenedor para o
  ambiente afetado, respeitando autorizações específicas já existentes.
- Reverter a aplicação não reverte o banco. Usar correção por nova migration
  ou restauração conforme o plano; avaliar perda de dados posteriores ao backup.
- Testar restauração periodicamente e registrar o resultado. A existência de
  um arquivo de backup, sozinha, não comprova que seja recuperável.

## 8. Segurança e dados

- Não versionar credenciais, tokens, arquivos `.env`, backups, cadastros reais
  ou documentos com dados pessoais. Exemplos devem conter somente placeholders.
- Derivar o acesso ao tenant da identidade autenticada e de sua associação
  autorizada; não confiar apenas em um `tenant_id` enviado pelo cliente.
- Aplicar integridade e controle de concorrência no banco e no servidor.
  Disponibilidade exibida na interface não garante uma reserva.
- Usar ativação de conta com link de duração limitada; não enviar senhas em
  texto aberto por e-mail. Documentar a integração de identidade escolhida.
- Coletar apenas dados necessários, definir quem pode consultá-los e documentar
  sua retenção. Evitar dados pessoais e segredos em logs e relatórios de teste.
- Registrar eventos de auditoria com acesso restrito e política de retenção.
- Executar CI de contribuições externas sem segredos de produção nem acesso
  à rede do banco real. Conceder permissões mínimas aos workflows.

## 9. Git, revisão e automação

- Trabalhar em branches curtas e coesas, por exemplo `docs/project-rules`,
  `feat/booking` e `fix/booking-conflict`.
- Escrever mensagens de commit em inglês no formato `type(scope): summary`,
  com tipos como `docs`, `test`, `feat`, `fix`, `refactor`, `ci` e `chore`.
- Enviar a branch e abrir o Pull Request quando a mudança autorizada estiver
  pronta e verificada. A decisão de merge pertence ao mantenedor.
- Identificar cada Pull Request com problema, resultado, requisito relacionado,
  documentação, testes executados e impacto no banco/recuperação.
- Falhas esperadas durante TDD podem existir na branch e no PR em rascunho.
  A versão final submetida para incorporação deve passar nos checks exigidos.
- Proteger `main` com Pull Requests e checks obrigatórios quando a base de CI
  existir. Não contornar essas proteções ou reescrever histórico compartilhado.
- Revisão por outro mantenedor será exigida quando houver alguém disponível
  para esse papel; não configurar exigência impossível para mantenedor único.
- Alterações nos workflows, políticas e verificações também exigem revisão.
  Um checkbox marcado não substitui a execução dos checks.
- Separar desenvolvimento, testes, homologação e produção. Publicação em
  produção depende de liberação explícita do mantenedor para a entrega.
- Identificar releases e seus artefatos de forma imutável, associando código,
  migrations, notas de versão e evidências de validação.

## 10. Comandos e inicialização do projeto

Os comandos reais da base técnica estão em [CONTRIBUTING.md](CONTRIBUTING.md).
Verificar os resultados de cada execução; a presença do comando não constitui
evidência de sucesso. Migrations reais só começarão com a primeira mudança de
dados de uma funcionalidade aprovada.

Ao configurar as ferramentas, registrar os comandos reais no guia de
contribuição e referenciá-los aqui para:

- Instalação reproduzível e execução local.
- Formatação, análise estática, tipos e build.
- Testes unitários, de integração, E2E e cobertura.
- Validação de documentação e configuração.
- Planejamento, revisão, aplicação e verificação de migrations por ambiente.
- Inicialização de dados fictícios e restauração de backup.

Antes de implementar a primeira funcionalidade, disponibilizar a estrutura
mínima que permita escrever, executar e comprovar seus testes. Inicialmente,
documentação pode ser verificada por leitura e validações locais, registrando
explicitamente que ainda não há pipeline automático.

## 11. Critérios de conclusão

Uma entrega só pode ser declarada concluída quando:

- Os critérios de aceitação definidos foram atendidos.
- Documentação e testes correspondem ao comportamento entregue.
- As verificações obrigatórias pertinentes ao escopo foram executadas e passaram.
- Mudanças de banco incluem migrations revisadas, testes e plano de recuperação.
- Não há arquivos indevidos, dados reais ou segredos na alteração.
- O resumo final informa arquivos alterados, validações e pendências reais.

Preparação local, envio ao GitHub, incorporação à `main` e publicação em
produção são estados diferentes. Informar exatamente qual foi alcançado.
