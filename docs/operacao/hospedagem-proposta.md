# Proposta de hospedagem gerenciada

Status: **avaliação para revisão; nenhum serviço contratado ou configurado**.
Preços consultados em 18/09/2026, em dólares dos EUA, sujeitos a mudança.
Relacionada a [ADR-0001](../decisoes/0001-arquitetura-inicial.md).

## Preferências confirmadas

- Avaliar hospedagem gerenciada.
- Login por e-mail e senha, com ativação e recuperação por e-mail.
- Internet obrigatória para consultas e alterações na primeira versão.

## Composição recomendada para avaliar

| Serviço | Proposta | Responsabilidade |
| --- | --- | --- |
| Aplicação | Render, serviço web pago | Executar backend e servir interface compilada sob a mesma origem |
| Banco | Render Postgres pago, versão principal 18 | Banco separado, acesso privado e recuperação gerenciada |
| Identidade | Auth0, sujeito a validação dos limites do plano | Login hospedado, e-mail/senha e fluxo OIDC |
| E-mail | Resend | Avisos da aplicação e integração de e-mail da identidade |

Render oferece PostgreSQL 18 em novas instâncias. A escolha de região deve
considerar latência e requisitos de dados; aplicação e banco devem compartilhar
a região e usar conexão privada. Verificar limites antes de criar ambientes.
[Fonte: criação do Render Postgres](https://render.com/docs/postgresql-creating-connecting).

Alternativa de hospedagem: Railway, com cobrança por consumo e mínimo publicado
de US$ 5 no Hobby ou US$ 20 no Pro, abatidos no uso. Esses mínimos não são um
orçamento completo de aplicação e banco; avaliar separadamente operação do
banco, recuperação e limites. A composição Render é a candidata inicial pela
separação explícita entre serviço web e PostgreSQL gerenciado.
[Fonte: planos Railway](https://docs.railway.com/pricing/plans).

## Estimativa preliminar

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

- Teto mensal de custo aceito e moeda de referência.
- Quantidade inicial e estimada de congregações, publicadores e acessos simultâneos.
- Volume de avisos no pico da preparação mensal.
- Domínio disponível, acesso ao DNS e responsáveis pelas contas de serviços.
- Região e necessidades de recuperação/retenção.

Contratação e configuração de serviços só ocorrerão após avaliação concreta
dessas informações. Não solicitar senhas ou tokens por mensagens; usar os
fluxos próprios de autenticação quando chegar essa etapa.
