# Proposta de hospedagem gerenciada

Status: **avaliação para revisão; nenhum serviço contratado ou configurado**.
Preços consultados em 18/09/2026, em dólares dos EUA, sujeitos a mudança.
Relacionada a [ADR-0001](../decisoes/0001-arquitetura-inicial.md).

## Preferências confirmadas

- Avaliar hospedagem gerenciada.
- Login por e-mail e senha, com ativação e recuperação por e-mail.
- Internet obrigatória para consultas e alterações na primeira versão.
- Iniciar sem custo de hospedagem para validar o fluxo completo.
- Piloto com uma congregação e até 100 publicadores.

## Prévia visual UI-001

A prévia visual usa o Static Site gratuito do Render, definido em
[`render.yaml`](../../render.yaml). Ela publica apenas o build React da UI-001
e não exige banco, Auth0, domínio ou serviço de e-mail. A prévia não é o piloto
operacional: dados são fictícios e permanecem somente na memória do navegador.
O contrato, os critérios e a recuperação estão em [PBL-001](../requisitos/PBL-001.md).

## Composição proposta para o piloto gratuito

| Serviço | Proposta | Responsabilidade |
| --- | --- | --- |
| Aplicação | Render Free Web Service | Executar backend e servir interface compilada sob a mesma origem |
| Banco | Neon Free, PostgreSQL 18 | Persistência externa compatível com Prisma e migrations SQL |
| Identidade | Auth0 Free | Login hospedado, e-mail/senha e fluxo OIDC |
| E-mail | Resend Free | Avisos da aplicação e integração de e-mail da identidade |

Essa composição tem custo-base de **US$ 0 por mês dentro das franquias**, sem
incluir domínio. Não é uma promessa de disponibilidade, capacidade ou ausência
de cobrança futura. Criar limites de gasto quando o serviço oferecer essa opção
e não cadastrar pagamento automático sem decisão específica do mantenedor.

O Render gratuito suspende o serviço após 15 minutos sem requisições e pode
levar cerca de um minuto para reativá-lo. A franquia publicada é de 750 horas
por workspace/mês, e o sistema de arquivos é efêmero. O piloto deve armazenar
todos os dados persistentes no PostgreSQL e exibir o tempo de reativação sem
informar que o sistema está disponível antes de a API responder.
Como o banco Neon é externo ao Render, acompanhar também o tráfego de saída:
o Render pode suspender serviço gratuito que gere volume externo incomum.
[Fonte: limites gratuitos do Render](https://render.com/docs/free).

Não usar Render Postgres Free para o piloto persistente: a instância expira
após 30 dias e não possui backup. Neon é a alternativa proposta para manter o
banco além desse prazo. A franquia gratuita consultada publica 0,5 GB por
projeto, 50 CU-horas/mês, 5 GB de saída e restauração instantânea limitada a
seis horas ou 1 GB de alterações. PostgreSQL 18 está disponível para novos
projetos. Medir os limites no console e confirmar novamente na criação.
[Fontes: plano gratuito do Neon](https://neon.com/blog/new-usage-based-pricing) e
[PostgreSQL 18 no Neon](https://neon.com/blog/category/changelog).

Uma congregação com 100 publicadores está muito abaixo do limite divulgado de
25.000 usuários ativos mensais do Auth0 Free. Isso confirma apenas o número de
usuários; recursos, taxa de requisições, ambientes e configuração de e-mail
continuam sujeitos aos limites do plano.
[Fonte: preços do Auth0](https://auth0.com/pricing).

Resend Free publica 3.000 e-mails por mês e 100 por dia. Uma comunicação para
todos os 100 publicadores já consome toda a franquia diária, sem espaço para
ativação, recuperação, reenvios ou avisos do mesmo dia. O piloto deve medir o
pico e não prometer o prazo de uma hora quando a cota tiver sido atingida.
[Fonte: preços do Resend](https://resend.com/pricing).

O processador da caixa de saída no mesmo serviço do Render deixa de trabalhar
quando a aplicação suspende. No piloto, ele processa eventos enquanto o serviço
estiver ativo e retoma pendências na próxima inicialização. Isso permite validar
persistência, idempotência e retomada, mas não comprova entrega contínua nem o
objetivo operacional de e-mail em até uma hora.

## Critérios de validação e saída do gratuito

Registrar durante o piloto, sem dados pessoais nos logs:

- tempo de primeira resposta após inatividade e frequência de suspensão;
- uso máximo e mensal de CPU da aplicação, conexões, armazenamento e tráfego;
- quantidade diária/mensal de e-mails, pendências, retentativas e atrasos;
- crescimento de auditoria, notificações, designações e convites no banco;
- resultado de backup lógico e restauração em banco descartável;
- concorrência nas reservas e erros observados com os 100 publicadores.

Migrar a parte afetada para serviço pago antes de uso operacional quando houver
qualquer uma destas condições: cota próxima do limite; interrupção que impeça
o fluxo mensal; necessidade de processamento contínuo; prazo de e-mail não
atendido; armazenamento sem margem; ou recuperação incompatível com os dados.
O PR dessa mudança deve registrar evidências, custo e plano de recuperação.

O piloto gratuito não substitui homologação nem produção. Ele serve para validar
fluxos e dimensionamento com o grupo autorizado. Antes de cadastrar pessoas
reais, definir retenção, acesso, exportação e resposta a incidentes.

## Referência de evolução paga

| Item | Referência de preço | Observação |
| --- | --- | --- |
| Serviço web Render | US$ 7/mês, 512 MB | Dimensionamento inicial a medir; não é garantia de capacidade |
| PostgreSQL Render, 1 GB de RAM | US$ 19/mês | Armazenamento cobrado separadamente |
| Armazenamento PostgreSQL | US$ 0,30/GB por mês | Confirmar mínimo e volume na contratação |
| Auth0 Free | US$ 0, até 25.000 usuários ativos mensais publicados | Limites de recursos, APIs, ambientes e SMTP precisam ser validados para o uso escolhido |
| Resend Free | US$ 0, 3.000 e-mails/mês e 100/dia | Pode não comportar o envio concentrado das designações mensais |
| Resend Pro | US$ 20/mês, 50.000 e-mails/mês | Sem limite diário publicado; adicionais conforme consumo |

Fontes: [Render](https://render.com/pricing), [Auth0](https://auth0.com/pricing)
e [Resend](https://resend.com/pricing).

**Cálculo de referência, não orçamento fechado:** um ambiente com servidor e
banco nos tamanhos acima soma US$ 26/mês, mais armazenamento. Dois ambientes
equivalentes (homologação e produção) somam US$ 52/mês mais armazenamento; com
um plano Resend Pro compartilhado dentro de sua franquia, a referência passa
a US$ 72/mês mais armazenamento.

Esses valores não incluem domínio, impostos, câmbio, tráfego excedente, cópia
externa de backup, upgrades de identidade/workspace, observabilidade paga ou
worker separado. Não dimensionar produção apenas por esses preços. A etapa
TEC-001 pode ser feita localmente e em CI antes de contratar os ambientes.

## Identidade e e-mail

As congregações e permissões ficam no banco da aplicação; não pressupor um
recurso pago de organização por congregação. Cada ambiente precisa de credenciais
e dados separados, com limites de plano avaliados antes de sua configuração.

Auth0 oferece conexões de banco para autenticação por usuário/senha. Usar e-mail
como identificador conforme a preferência confirmada. O provedor de e-mail
embutido não deve sustentar a produção: avaliar SMTP externo ou integração
oficial com Resend, incluindo mensagens de ativação e recuperação.
[Conexões Auth0](https://auth0.com/docs/authenticate/database-connections),
[orientação de e-mail Auth0](https://support.auth0.com/center/s/article/Emails-to-Gmail-from-Auth0-never-arrive)
e [integração Resend/Auth0](https://resend.com/changelog/auth0-integration).

Contabilizar destinatários e reenvios, não apenas número de designações. Cem
e-mails em um dia podem ser insuficientes mesmo com baixo total mensal. O
objetivo de aviso em até uma hora exige processamento contínuo, retentativas,
monitoramento de entrega e capacidade contratada; nenhum plano garante que o
destinatário leia a mensagem ou que o provedor final não a filtre.

## Backup e publicação

Os bancos pagos do Render oferecem recuperação; a documentação consultada
informa janela de três dias no workspace Hobby e sete dias em Pro ou superior.
Plano gratuito de banco não oferece essa recuperação. Confirmar esses recursos
no plano escolhido. [Fonte: recuperação e backups](https://render.com/docs/postgresql-backups).

Manter plano de cópia externa e teste de restauração. Definir perda de dados
tolerável e prazo de recuperação antes de produção. “Gerenciado” não elimina
a necessidade de testar recuperação ou acompanhar falhas.

Produção depende de autorização específica. Propor publicação manual após CI
e migration serializada, usando artefatos revisados. A integração com GitHub
não deve ativar publicação automática irrestrita da `main`.
[Fonte: publicação manual no Render](https://render.com/docs/deploys).

## Informações necessárias para fechar a escolha

- Volume de avisos no pico da preparação mensal.
- Domínio disponível, acesso ao DNS e responsáveis pelas contas de serviços.
- Região e necessidades de recuperação/retenção.
- Limite de indisponibilidade e perda de dados aceito no piloto.

Contratação e configuração de serviços só ocorrerão após avaliação concreta
dessas informações. Não solicitar senhas ou tokens por mensagens; usar os
fluxos próprios de autenticação quando chegar essa etapa.
