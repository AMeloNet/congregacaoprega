# Versões propostas para a base técnica

Status: proposta para [ADR-0001](../decisoes/0001-arquitetura-inicial.md).
Consulta em 18/09/2026. Nada foi instalado ou testado nesta entrega.

## Seleção inicial

| Componente | Versão proposta | Motivo/validação documental |
| --- | --- | --- |
| Node.js | 24.21.0 LTS | Linha LTS; satisfaz os requisitos publicados das ferramentas selecionadas |
| TypeScript | 6.0.3 | Compatível com a faixa publicada do typescript-eslint; não adotar 7.0.2 nesta composição |
| React e react-dom | 19.3.0 | Manter ambos na mesma versão |
| NestJS core/common/testing | 12.0.3 | Mesma versão para os componentes principais; projeto em ESM |
| PostgreSQL | 18.6 | Linha 18 suportada; mesma versão principal em testes e ambiente alvo |
| Prisma CLI, cliente e adapter-pg | 7.10.0 | Versão estável alinhada; não usar o candidato 8.0.0-rc.15 retornado por latest |
| pg | 8.23.0 | Driver PostgreSQL para o adaptador |
| Vite | 8.3.0 | Ferramenta da interface; faixa aceita pelo Vitest selecionado |
| Vitest | 5.0.1 | Unitários/integração; cobertura deverá usar pacote da mesma versão |
| Playwright Test | 1.63.0 | Jornadas reais no navegador; instalar navegadores correspondentes à versão fixada |
| Testing Library React | 16.3.3 | Cenários de interação por elementos acessíveis; declara suporte ao React 19 |
| pnpm | 11.19.0 | Workspaces e instalação reproduzível pelo lockfile; versão efetivamente disponível no ambiente local |
| ESLint | 10.11.0 | Análise estática |
| typescript-eslint | 8.70.0 | Declara ESLint 10 e TypeScript >=4.8.4 e <6.1.0 |
| Prettier | 3.9.8 | Formatação |

Os pacotes complementares, tipos, adaptador HTTP do Nest, ambiente DOM dos
testes e imagens Docker ainda precisam ser fixados e verificados na preparação
da instalação. Este quadro não é um manifesto de dependências completo.

## Compatibilidade e limites da pesquisa

- O registro npm retornou TypeScript 7.0.2 como latest, mas o intervalo do
  typescript-eslint consultado termina antes de 6.1.0. Foi escolhida 6.0.3.
- O Prisma CLI retornou um release candidate como latest, enquanto cliente e
  adaptador retornaram 7.10.0. Foi consultado explicitamente o CLI 7.10.0 para
  manter a mesma série e excluir pré-lançamentos.
- Nest 12 publica pacotes ESM e possui requisitos de Node diferentes entre
  execução e geração de projeto. A versão proposta do Node cobre ambos.
  A infraestrutura de testes deve comprovar injeção de dependências e metadados
  de decorators; transpilar TypeScript sem erro não basta.
- PostgreSQL gerenciado pode receber correções menores pelo provedor. Registrar
  a versão efetiva do ambiente e acompanhar essas correções nos testes; mudança
  de versão principal exige decisão e plano próprios.
- MIT e Apache-2.0 são as licenças declaradas pelos pacotes npm consultados.
  A instalação deverá inventariar dependências transitivas e preservar avisos.
  Serviços gerenciados e Docker Desktop têm termos próprios a verificar antes do uso.

## Reprodutibilidade a implementar

Fixar versões diretas, runtime e gerenciador; versionar lockfile e digests das
imagens. Fixar ações de CI por commit. Atualizações passam por PR com verificação
de compatibilidade, segurança e regressão. Não usar latest ou faixas flutuantes
para selecionar ferramentas em um build publicado.

Se a prova de instalação falhar, corrigir a composição documentada antes de
prosseguir, sem declarar aprovado o conjunto apenas pelos metadados.

Na implantação TEC-001, pnpm 12.4.2 não pôde iniciar no Windows deste ambiente:
seu executável opcional não estava disponível. Fixamos pnpm 11.19.0, que já
funciona no ambiente local, e o lockfile precisa ser validado por instalação
congelada também no CI. O Node local é 24.19.0, compatível com a faixa exigida;
o CI deve usar a versão-alvo 24.21.0.

## Fontes primárias

- [Node.js — versões](https://nodejs.org/en/about/previous-releases).
- [NestJS — migração para versão 12](https://docs.nestjs.com/migration-guide).
- [PostgreSQL — versões suportadas](https://www.postgresql.org/support/versioning/).
- [Metadados npm do TypeScript 6.0.3](https://registry.npmjs.org/typescript/6.0.3).
- [Metadados npm do typescript-eslint 8.70.0](https://registry.npmjs.org/typescript-eslint/8.70.0).
- [Metadados npm do Prisma 7.10.0](https://registry.npmjs.org/prisma/7.10.0).
- Demais versões: metadados publicados pelos respectivos mantenedores no
  registro npm, consultados nos endpoints de pacote e conferidos por versão.
