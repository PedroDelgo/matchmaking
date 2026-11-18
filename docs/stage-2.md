# Etapa 2 — consolidação visual e navegação

## Inspeção inicial

Base: commit 01c19b6, branch main, árvore de trabalho limpa. Expo SDK 58, Router, fontes locais, Zustand e armazenamento versionado já estavam configurados. A implementação anterior já incluía Home, listagem, perfil, criação e o fluxo competitivo completo, além de 24 testes Jest e 6 testes Playwright. Nenhuma dessas funções precisa ser reconstruída. Não há monograma fornecido, apenas a logo oficial completa.

Lacunas confirmadas: cores/fontes/breakpoints/durações fora dos tokens; variantes pouco distintas nos cards de torneio; falta de um LoadingState reutilizável e de fallback explícito de fonte; estados selected de botões sobrescritos; callbacks de foco dos campos e botões substituídos; Home com dados sem grid adaptativo; cobertura insuficiente da Home, filtros, perfil e navegação principal.

## Direção travada antes de implementar

O produto existente é o alvo visual, com a identidade oficial Sports Arcade Clean como autoridade. Manter a logo intacta, Barlow Condensed em impacto, Inter em controles, branco predominante, superfícies #F5F5F3 e ações #FF6A00. Preservar a geometria de chaveamento no hero. Não acrescentar fotos ou ilustrações sem relação com a tarefa. Não alterar SDK, motor, sorteio ou celebração nesta etapa.

Referências Refero consultadas novamente: SAP Good Energy (311c13ac-bb43-44fe-858b-39f350505866), Strava (dd3513c1-ac8a-48dd-a74c-1036c3ff333b), shadcn (200b455f-0b23-459c-99dc-421439de886b). As pesquisas foram feitas pelos nomes e pelas linguagens visuais de cada uma.

| Decisão | Referência | Papel preservado |
| --- | --- | --- |
| Branco predominante e títulos atléticos | Briefing / SAP | Canvas claro; impacto fica na tipografia |
| Laranja em CTA e seleção | Briefing / Strava | Ação e estado, sem pintar todos os cards |
| Controles retangulares e bordas discretas | SAP / shadcn | Densidade utilitária nos componentes |
| Cards reais em grid quando há espaço | Briefing / shadcn | Produto e dados como conteúdo principal |
| Foco visível, labels e toque mínimo 44 | Refero craft / briefing | Acessibilidade em toda interação |
| Durações e preferência reduzida | Briefing | Movimento finito, voltado a feedback |

O trabalho será registrado em commits locais incrementais, com stage seletivo. Não haverá push nesta etapa.
