# UI-001 — Cenários do protótipo

Status: planejados; registrar execução e resultados na entrega. Referência:
[UI-001](../requisitos/UI-001.md).

| Cenário | Critério | Resultado esperado |
| --- | --- | --- |
| T-UI-01 | UI-01, UI-02 | Navegar por início, programação, reserva, detalhe, convites, administração, recursos e relatório; voltar e recarregar mantêm rota válida e identificação da demonstração |
| T-UI-02 | UI-03, UI-04 | Criar reserva fictícia em local/horário/tipo permitido mostra detalhe e três posições; tentar horário indisponível não cria reserva |
| T-UI-03 | UI-03, UI-04 | Aceitar convite pendente confirma pessoa; recusar libera posição; expirado explica impedimento |
| T-UI-04 | UI-03, UI-04 | Responsável bloqueia/reabre terceira vaga vazia; grupo cheio impede ingresso; cancelamento simulado atualiza estado |
| T-UI-05 | UI-03, UI-04 | Finalizar cria versão e bloqueia ações do publicador; reabertura mantém bloqueio do publicador; nova finalização cria outra versão; restauração repõe estado inicial |
| T-UI-06 | UI-05 | Navegação e ações por teclado, sem rolagem horizontal em celular e computador; relatório imprimível sem cortar informação essencial |
| T-UI-07 | UI-02 | Protótipo não requisita endpoints de negócio, não oferece senha nem dispara e-mail |

Testes de componente cobrem transições e mensagens. Testes de navegador cobrem
as jornadas e a apresentação em Chromium desktop/celular. A comprovação de
concorrência, permissões no servidor e persistência pertence às etapas funcionais.
