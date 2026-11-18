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

O trabalho foi registrado em commits locais incrementais, com stage seletivo. Não houve push nesta etapa.

## Entrega

Identidade oficial preservada em `assets/brand/logo.png`, sem alteração do desenho ou criação de monograma. Fundo principal branco, superfícies secundárias claras e cores semânticas centralizadas. Tokens também concentram tipografia, breakpoints, alvos de toque, bordas, espaçamentos e durações. Fontes locais continuam empacotadas; quando seu carregamento falha, a aplicação prossegue com fonte do dispositivo e um aviso legível.

Componentes reutilizáveis aperfeiçoados:

- `Text`: display, title, heading, body, caption e label, com fallback de fontes.
- `Button`: primary, secondary, outline, ghost e destructive, preservando o alias danger utilizado pelo projeto. Estados de pressão, foco, seleção, disabled e loading; tamanhos normal e grande; feedback finito por Reanimated.
- `Panel` e `InteractiveCard`: superfícies informativas e interativas com bordas, sombra discreta e estados visuais.
- `Field`: mantém callbacks, associa erro/ajuda ao campo e permite focar pelo label.
- `Progress`, `LoadingState` e `Notice`: progresso normalizado e estados acessíveis de espera e erro.
- `AppHeader`, `AppNavigation` e `ScreenContainer`: partes nomeadas do Shell existente, sem duplicar o sistema de rotas.
- `TournamentCard` e `TournamentGrid`: cards por status e grid que mede o espaço disponível, com uma a três colunas e entrada escalonada finita.
- `PageHeading` e `SectionTitle`: hierarquia compartilhada e adaptação para larguras reduzidas. `EmptyState`, `Chip`, `Avatar` e `ConfirmDialog` existentes foram preservados e continuam disponíveis.

### Telas concluídas

| Tela | Comportamento entregue |
| --- | --- |
| Início | Logo proporcional, perfil, hero “Bora competir?”, CTA grande para criação existente, código com aviso de recurso futuro, contagens locais, cards reais ou estado vazio |
| Torneios | Busca e filtros por preparação/andamento/conclusão realmente aplicados, limpeza dos filtros, grid compartilhado e acesso aos detalhes |
| Perfil | Avatar/iniciais, apelido editável persistido, estatísticas de participantes associados por profileId e informações da versão/armazenamento local |
| Navegação compartilhada | Início/Torneios/Perfil, indicação ativa também em rotas internas de torneio, barra inferior com safe area no mobile e navegação superior desktop |

O fluxo de criação, sala, sorteio, chaveamento, placar, estatísticas e campeão já existia. Foram mantidos o motor, a persistência e as funcionalidades competitivas. Nas telas secundárias, as mudanças desta etapa foram substituições de cores/fontes/breakpoints por tokens e semântica de seleção web; não foi criada uma nova experiência de sorteio ou celebração. Nenhuma dependência, SDK ou esquema de armazenamento foi alterado. Não há backend, autenticação ou entrada remota simulados.

## Arquivos desta etapa

| Grupo | Criados | Modificados |
| --- | --- | --- |
| Tema e layout | `src/theme/FontContext.tsx`, `src/hooks/useResponsiveLayout.ts` | `src/theme/tokens.ts`, `app/_layout.tsx` |
| Componentes | `src/components/TournamentGrid.tsx` | `ui.tsx`, `Shell.tsx`, `Motion.tsx`, `tournament.tsx`, todos em `src/components/` |
| Telas principais | — | `HomeScreen.tsx`, `TournamentsScreen.tsx`, `ProfileScreen.tsx`, em `src/screens/` |
| Consistência nas telas existentes | — | `BracketScreen.tsx`, `ChampionScreen.tsx`, `CreateScreen.tsx`, `LobbyScreen.tsx`, `StatsScreen.tsx`, em `src/screens/` |
| Testes | `tests/components/ui.test.tsx`, `navigation.test.tsx`, `home-and-profile.test.tsx`; `tests/fixtures/tournaments.ts`; `e2e/interface.spec.ts` | `tests/setup.ts`, `playwright.config.ts` |
| Documentação | `docs/stage-2.md` | `README.md`, `docs/validation.md` |

As fixtures pertencem somente aos testes e são construídas pelo motor real; não são injetadas na aplicação de produção. Artefatos e capturas em `.artifacts/` são ignorados pelo Git.

## Validação executada

Ambiente: Windows, PowerShell, Node 24.22.1. Navegador: Chromium disponível localmente. Os projetos Playwright configuram movimento reduzido; tablet e celulares usam toque simulado.

| Verificação | Resultado |
| --- | --- |
| TypeScript strict | Aprovado, sem erros |
| ESLint Expo | Aprovado |
| Jest / React Native Testing Library | 38 testes aprovados em 6 suítes, incluindo os testes anteriores |
| Playwright completo | 20 casos aprovados: cinco cenários em quatro larguras |
| Reexecução final de interface | Os 12 casos de Home/navegação/dados/fontes passaram novamente após os últimos ajustes; não são 12 cenários adicionais |
| Larguras verificadas | 1440×1000, 768×1024, 375×812 e 320×740 |
| Exportação web de produção | Aprovada |
| Exportações Android e iOS | Bundles Hermes compilados; sem instalação ou execução em aparelho/emulador |
| Revisão visual | Capturas de Home vazia, Home com dados e cards nas quatro larguras; sem overflow observado nesses tamanhos |
| Integridade do diff | `git diff --check` aprovado |

Os testes novos cobrem navegação e destino ativo, CTA por teclado, Home vazia, modal de código futuro, três estados de card, progresso, abertura dos detalhes, busca/filtros/limpeza, perfil com estatísticas válidas, edição persistida e recarga. Logo e fontes locais foram verificadas no navegador; também foi simulada falha das fontes para comprovar que a Home continua utilizável. Os testes completos anteriores exercitam o fluxo competitivo e sorteio de 16 participantes pulável nas quatro larguras.

## Problemas encontrados e corrigidos

1. **Botão perdia os estilos no navegador:** o Pressable transformado por `createAnimatedComponent` não preservava o callback de estilo nessa combinação de versões. A superfície passou a usar Pressable normal, com conteúdo em Animated.View para a microinteração. O navegador agora verifica explicitamente o fundo laranja do CTA.
2. **Seleção não anunciada na web:** a implementação instalada de React Native Web não traduzia `accessibilityState` para todos os atributos ARIA necessários. Foram acrescentados atributos explícitos de seleção, checked, busy e progresso, preservando os estados nativos.
3. **Callbacks e seleção sobrescritos nos componentes:** foco e eventos fornecidos pelo consumidor passaram a ser preservados, junto dos estados selecionado/ocupado/desabilitado.
4. **Home com dados sem adaptação suficiente:** grid medido substituiu larguras percentuais frágeis; título/ação de seção se organizam verticalmente em largura compacta e o guia inicial aparece quando a Home está vazia.
5. **Falha de fonte poderia bloquear a entrada:** o erro libera a interface com aviso e fonte sans-serif do sistema, em vez de manter uma tela de espera ou fallback serifado no navegador.

## Commits locais

| Hash | Commit |
| --- | --- |
| `ca953b3` | `feat(ui): consolidate design tokens and accessible primitives` |
| `14eb1fe` | `feat(navigation): refine responsive shell and active destinations` |
| `5877070` | `fix(ui): preserve button styles and expose web accessibility states` |
| `5f793c2` | `feat(home): refine tournament cards and responsive local screens` |
| `76df275` | `test: cover responsive home navigation and font recovery` |

Este relatório e os ajustes do README são registrados no commit final `docs: document stage two design consolidation`; seu hash pode ser consultado com `git log -6 --oneline` e consta na entrega final. A identidade de autor já utilizada no histórico foi reutilizada apenas nos comandos de commit, sem alterar a configuração Git do usuário. Não houve amend, reset, force push ou push.

## Executar e reproduzir

```powershell
npm.cmd ci
npm.cmd run web
```

Para validar a exportação e os testes:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build:web
npx.cmd playwright install chromium
npm.cmd run test:e2e
npx.cmd expo export --platform android --platform ios --output-dir .artifacts/stage2-native
```

O Playwright inicia o preview de `dist/` em `http://127.0.0.1:8081`. `npm.cmd run preview` também permite inspecioná-lo manualmente. No ambiente desta entrega, foi usado o Chromium já instalado por meio de `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Não é necessário instalar outro navegador quando essa variável aponta para um executável compatível.

## Pendências e recomendação para a Etapa 3

- Homologar em Android e iPhone reais ou emuladores: safe area, teclado, AsyncStorage real, compartilhamento e desempenho de movimento. Bundles compilados não comprovam esses comportamentos.
- Revisar Safari, Firefox, leitores de tela, contraste e texto ampliado com avaliação humana. O suporte implementado não equivale a uma auditoria completa de acessibilidade.
- Reavaliar os alertas transitivos registrados na auditoria inicial antes de publicar. A auditoria npm não foi repetida nesta etapa e as dependências ficaram intactas.
- Convites por código/link/QR, contas, sincronização, backup e formatos futuros continuam pendentes de etapas próprias.

Como o motor e o fluxo competitivo já estão implementados, a Etapa 3 deve começar pela homologação desse fluxo em dispositivos e pela revisão das interações com dados reais, aproveitando a cobertura existente. Refinamentos de sorteio e celebração podem ser tratados depois dessa revisão, sem reconstruir o motor. A integração remota deve aguardar definição própria de contrato, sincronização e recuperação de dados.

## Correção posterior: texto solto em View

O aviso `Unexpected text node: . A text node cannot be a child of a <View>` ao abrir o campeão vinha de `feedback && (...)`: com feedback vazio, a expressão entregava `""` como filho do ScreenContainer. A condição passou a ser booleana. O mesmo padrão foi corrigido no erro da partida, no cálculo de apelido duplicado da sala e nos textos opcionais de cabeçalhos/estado vazio. O Shell não precisava ser alterado.

Acrescentados três testes de regressão que inspecionam os filhos dos Views, inclusive dentro de fragments: campeão antes/depois de copiar ou cancelar compartilhamento; sala com campo vazio e partida sem erro; componentes com textos opcionais vazios. Eles falharam antes da correção e passaram depois. A validação final passou em TypeScript, lint e **41 testes Jest em 7 suítes**.

O fluxo completo de criar, sortear, concluir, recarregar e corrigir foi reexecutado no Chromium desktop contra o servidor Expo de desenvolvimento. Esse ambiente é relevante porque o aviso de React Native Web é desabilitado em produção. O teste passou sem o aviso, e `e2e/tournament.spec.ts` agora captura essa mensagem de console além de `pageerror`. Os totais de 20 casos e as exportações acima se referem à entrega original; não foram repetidos integralmente nesta correção pontual. Nenhum push foi realizado.
