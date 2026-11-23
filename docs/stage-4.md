# Etapa 4 — movimento e momentos competitivos

## Auditoria de continuidade — 23/11/2026

Estado encontrado: `main` em `8b74dfd`, sincronizada com `origin/main`, após o push autorizado na conversa anterior. Índice vazio. Havia alterações não commitadas em `README.md`, `e2e/stability.spec.ts` e `tests/fixtures/tournaments.ts`, além deste relatório e de `e2e/motion.spec.ts` ainda não rastreados. Todos foram lidos e preservados. O histórico dos últimos 20 commits já continha sete commits de implementação da Etapa 4; eles não foram recriados.

Antes de editar, foram conferidos status/branch, histórico, diffs staged/unstaged, arquivos novos, README, decisões visuais, Etapas 2/3/4, componentes/hooks/tokens de movimento e testes existentes. TypeScript, lint e os **92 testes Jest em 16 suítes** passaram na base encontrada. A exportação web e a suíte Playwright completa foram executadas sobre essa implementação. O roteiro abaixo distingue os resultados desta auditoria dos relatos anteriores.

**Conclusão:** a implementação de movimento solicitada já estava pronta no código. O que permanecia parcial era o fechamento da validação/documentação e o registro dos testes locais em commit. Não foi demonstrada uma lacuna funcional que justificasse criar outra animação, substituir componentes ou refatorar o motor. Esta execução conclui esses registros e acrescenta o planejamento da Etapa 5. Homologação nativa continua parcial; backend continua não implementado.

Na tabela, **Concluído e validado** significa revisão do código e cobertura automatizada/web disponível, não execução em Android/iOS. **Implementado parcialmente** inclui suporte implementado cuja homologação em aparelho falta. Nenhum recurso de movimento da lista foi encontrado como **Não implementado**.

| Área / item solicitado | Classificação | Evidência e limite |
| --- | --- | --- |
| Sistema: tokens de duração/easing | Concluído e validado | `motion.ts`, aliases em `tokens`; typecheck e revisão dos consumidores |
| Sistema: presets | Concluído e validado | `Motion`, seleção, springs e sequências centralizados |
| Sistema: consistência das transições | Concluído e validado | Feedback 200 ms, etapas 320 ms, competição até 700 ms; revisão visual |
| Sistema: movimento reduzido | Concluído e validado | Preferência assíncrona/eventos, término durante execução e ausência de replay: Jest + E2E |
| Sistema: animações finitas/canceláveis | Concluído e validado | Geração, cleanup, skip, blur e desmontagem; sem loops de partículas |
| Criação: transições entre etapas | Concluído e validado | `Motion` com direção de avanço/retorno; `creation-motion` |
| Criação: feedback dos cards selecionados | Concluído e validado | `SelectionCard`, check, radio, foco e escala; testes de seleção |
| Criação: progresso animado | Concluído e validado | `Progress` com valor normalizado e preferência reduzida |
| Criação: formulário preservado | Concluído e validado | Rascunho no store fora da camada remontada; criação/back/recarga |
| Sala: entrada de jogadores | Concluído e validado | Entrada de card/avatar em 200 ms; testes de adição e preenchimento |
| Sala: atualização das vagas | Concluído e validado | Contagem/barra derivadas dos participantes, sem iniciar sorteio |
| Sala: reorganização suave | Concluído e validado | `LinearTransition` finita; comportamento funcional de remoção preservado; desempenho nativo pendente |
| Sala: estado de sala completa | Concluído e validado | Mensagem e ação explícita; teste impede sorteio automático |
| Sorteio: apresentação em grafite | Concluído e validado | Capturas atuais desktop/mobile; identidade oficial mantida |
| Sorteio: embaralhamento visual | Concluído e validado | Transform isolado da entrada; sequência finita, sem alterar a ordem lógica |
| Sorteio: revelação dos confrontos | Concluído e validado | Pares recebidos do motor; Jest 4/8/16 e E2E de fases |
| Sorteio: transição para chaveamento | Concluído e validado | Conclusão única/automática; saída externa não redireciona depois |
| Sorteio: pular | Concluído e validado | E2E 4/8/16 compara todo o torneio antes/depois |
| Sorteio: proteção contra duplicação | Concluído e validado | Ref + status atual do store; testes acionam duas vezes no mesmo ciclo |
| Chaveamento: rodada atual | Concluído e validado | Destaque explícito e contexto manual preservado; `competition-progress` |
| Chaveamento: entrada dos confrontos | Concluído e validado | `Motion` e transições entre rodadas, respeitando redução |
| Chaveamento: vencedores animados | Concluído e validado | Entrada ao mudar vencedor/placar, check e fundo persistentes |
| Chaveamento: progressão visual | Concluído e validado | Conexões por `nextMatchId`; correção remove somente caminhos invalidados |
| Chaveamento: layout Android/iOS/web | Implementado parcialmente | Web 320/375/768/1440 e bundles nativos aprovados; layout real Android/iOS não executado |
| Final: apresentação dos finalistas | Concluído e validado | IDs reais e casos de final ainda indefinida; testes de final |
| Final: confronto decisivo destacado | Concluído e validado | Banner grafite/laranja, nome e placar legíveis nos fluxos E2E |
| Final: transição para celebração | Concluído e validado | Motor confirma a final antes de navegar; campeão/correção testados |
| Campeão: revelação animada | Concluído e validado | Fases e chave do resultado; rerender comum não reinicia |
| Campeão: troféu | Concluído e validado | Transform/opacity finitos; captura e teste de fase |
| Campeão: confetes | Concluído e validado | 24 partículas; término/desmontagem até 4,8 s em Jest/E2E |
| Campeão: estatísticas finais | Concluído e validado | Ranking do motor, placar real e desempate; fluxos 4/8/16 |
| Campeão: pular | Concluído e validado | Teste revela resultado e cancela partículas imediatamente |
| Campeão: limpeza de timers/animações | Concluído e validado | Cleanup/desmontagem e fim automático; isso não mede vazamentos nativos |

A direção desta revisão é o produto existente: logo intacta, Barlow Condensed ExtraBold/Inter, branco `#FFFFFF`, grafite `#191919` e laranja `#FF6A00`. A consulta atual aos estilos SAP/KODE via Refero retornou `NO_SUBSCRIPTION`; não se apresenta essa tentativa como pesquisa concluída. Foram usados o briefing, as decisões e referências já documentadas abaixo e o guia de movimento da skill instalada: feedback, continuidade, hierarquia e interrupção pelo usuário. Nenhuma nova direção visual, imagem ou biblioteca foi introduzida.

O sorteio é calculado e colocado no store antes da apresentação, acionando a persistência existente. Na web, os E2E confirmam a cópia em localStorage antes/depois de pular. No nativo, a escrita AsyncStorage é assíncrona e `start` não aguarda seu reconhecimento: não se afirma durabilidade garantida em encerramento abrupto durante a gravação. O teste real de forçar parada continua pendente.

## Base e direção da implementação anterior

Inspeção inicial em `9c7b056`, branch `main`, árvore limpa, seis commits locais da Etapa 3 ainda não enviados. TypeScript, ESLint e os 63 testes Jest de dez suítes passaram antes das alterações. O motor, a persistência protegida e os retornos com `dismissTo` são preservados.

Já existiam entradas simples, feedback de pressão nos botões, sorteio com espera fixa e confetes finitos. A etapa organiza essa linguagem e apresenta os confrontos e o campeão a partir dos resultados reais, sem fazer o motor depender da animação.

Checkpoint nativo: `adb`, `emulator`, `java` e `xcrun` ausentes do PATH; SDK e Android Studio não encontrados nos caminhos usuais. Não há aparelho/emulador acessível. A implementação continua com testes automatizados e exportações; execução nativa permanece pendente.

Direção travada antes da implementação: produto existente e briefing como autoridade, logo intacta, Barlow Condensed/Inter, branco predominante e laranja `#FF6A00`. Grafite, diagonais e títulos de impacto concentram-se no sorteio, final e vitória. Sem novas imagens ou dependências.

| Referência consultada no Refero                                      | Papel restrito                                                               |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| SAP Good Energy `311c13ac-bb43-44fe-858b-39f350505866`               | Preservar tipografia atlética, controles retangulares e canvas claro         |
| KODE Immersive `f4ab8f10-c19f-4b2f-bf64-8b21cbcf7e43`                | Palco grafite, sinal laranja e hierarquia espacial nos momentos especiais    |
| Champions for Good `752d1c9a-fbd9-4b7f-962e-3e15ffc226e1`            | Camadas com entradas curtas; sem copiar paleta, imagens ou rotações extremas |
| Nike Training Club, conquista `61ae0fd3-6a39-43c1-84ab-0b45746c17dc` | Nome/conquista centrais e saída/compartilhamento alcançáveis                 |

O guia de movimento da skill Refero orienta feedback, continuidade e hierarquia. Seleção dura 200 ms, etapas 320 ms e momentos de competição usam entradas de até 700 ms. Sequências têm orçamento total explícito e podem ser encerradas; preferência reduzida apresenta o resultado diretamente. A seleção permanece indicada por cor, check e semântica acessível.

## Entrega

| Área            | Comportamento final                                                                                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Criação         | `SelectionCard` responde com escala discreta, fundo/borda em 200 ms, check e estado radio. Etapas entram 16 px na direção do avanço/retorno. Prévia esquemática explica o mata-mata. Rascunho, teclado e back existentes preservados.                                     |
| Sala            | Entrada de participante/avatar e reposicionamento em 200 ms, sem escalonar os 16 itens. Contador e barra acompanham os dados. Sala completa comunica prontidão e exige ação explícita para sortear.                                                                       |
| Match Reveal    | Palco grafite e diagonal, participantes, embaralhamento lateral finito, pares reais aproximando-se com VS. Quatro participantes recebem intervalo maior entre pares; oito/dezesseis usam entradas agrupadas mais curtas. Conteúdo rolável e CTA com safe area.            |
| Chaveamento     | Rodada em disputa explícita, troca de rodada com entrada curta, contexto escolhido preservado. Vencedor indicado por fundo/check/texto e feedback finito. Árvore usa os `nextMatchId` reais e destaca o trajeto confirmado; após conclusão, destaca o caminho do campeão. |
| Grande final    | Banner grafite/laranja, título e finalistas reais. Controles de placar, revisão, cancelamento, correção e retorno continuam disponíveis abaixo do banner.                                                                                                                 |
| Champion Reveal | Suspense, nome, troféu leve e 24 confetes finitos. Resultado da final, desempate quando necessário e estatísticas do motor. Pular e ações de compartilhar/retornar disponíveis durante a apresentação.                                                                    |

A árvore completa continua com rolagem horizontal intencional. O card compacto mantém coluna de 240 px e posiciona o nome acima do placar, evitando comprimir nomes longos entre avatar e números. No celular, a alternativa de avanço usa destaque e transição entre rodadas: não foi introduzido um voo de avatar entre coordenadas de telas distintas. Essa escolha evita depender da medição simultânea de cards fora do viewport.

## Sistema e ciclo de vida

`src/theme/motion.ts` centraliza durações, easing, presets de spring, distâncias, escalas, opacidades, intensidades e as sequências. Os aliases existentes em `tokens` continuam atendendo consumidores anteriores. As animações implementadas usam principalmente `transform`/`opacity`; exceções pequenas são cores/bordas da seleção, largura da barra e reposicionamento dos até 16 participantes. Não há loop de partículas, nova biblioteca ou alteração de SDK.

`useCompetitionSequence` controla somente apresentação. A primeira ação de sorteio chama o store existente, que calcula e persiste a ordem; `MatchReveal` recebe o torneio já iniciado. Nenhuma fase visual chama sorteador, grava placar ou determina campeão. Ref e leitura atual do status impedem dois sorteios, inclusive quando movimento reduzido conclui imediatamente.

| Sequência | Fases e orçamento                                                                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sorteio   | `idle → preparing` 650 ms, `shuffling` 750 ms, `revealing` 1500/1400/1800 ms para 4/8/16, `holding` 250 ms, `completed`. Totais 3150/3050/3450 ms. Pular/voltar encerram antes. |
| Campeão   | Preparação 600 ms, revelação 600 ms, troféu 600 ms, celebração 3000 ms; total 4800 ms. Depois permanece o resultado estático.                                                   |

Conclusão, pular, cancelar e timeout convergem para uma única conclusão por execução. Cancelamento explícito do modal segue para o chaveamento já salvo; desmontar limpa timers sem navegar. Se outra rota recebe foco mantendo a sala montada na pilha, a sala desarma a conclusão e fecha o modal, sem redirecionar depois. Um identificador de geração rejeita callbacks antigos mesmo que já tenham sido enfileirados. Callbacks e rerenders comuns não reiniciam a sequência.

A chave da vitória contém torneio, campeão e resultado da final. Uma correção real apresenta os dados novos; compartilhar ou atualizar outra parte do store mantém a execução existente. Perder foco cancela a celebração. Os confetes são desmontados até 4,8 s e seus valores animados são cancelados na saída. O bloqueio de compartilhamento simultâneo e `router.dismissTo` foram preservados.

`useMotionPreference` diferencia preferência ainda desconhecida de movimento reduzido. Enquanto a consulta resolve, o comportamento é conservador; eventos recentes prevalecem sobre uma leitura inicial atrasada. Com redução ativa, resultados ficam disponíveis diretamente, sem embaralhamento/confetes. Ativar redução durante a sequência encerra a apresentação; desativá-la depois não reproduz novamente. Não há flashes, rotações extremas ou informação comunicada apenas pelo movimento.

## Arquivos e cobertura

- Novos: `src/theme/motion.ts`, `src/hooks/useCompetitionSequence.ts`, `src/components/SelectionCard.tsx`, `MatchReveal.tsx` e `ChampionReveal.tsx`.
- Aperfeiçoados: `Motion`, `Progress`, `tournament.tsx`, preferência reduzida e telas de criação, sala, chaveamento, partida e campeão.
- Novas suítes Jest: `competition-sequence`, `creation-motion`, `match-reveal`, `competition-progress`, `champion-reveal` e `draw-focus`, em `tests/components/`. Mocks Reanimated preservam a identidade dos shared values entre renders; mocks legados expõem a preferência pronta.
- Novo `e2e/motion.spec.ts`: seis cenários nas quatro larguras. O helper de viewport em `stability.spec.ts` verifica todas as ocorrências visíveis do nome, incluindo campeão e finalista. Fixture continua exclusiva dos testes; apenas seu parâmetro de ID recebeu tipo explícito.

Os 29 testes adicionais Jest cobrem fases, concorrência, preferência atrasada/eventos, callback antigo, skip/back/desmontagem, perda de foco sem desmontagem, 4/8/16, ordem imutável, contexto de rodada, invalidação dos caminhos, nomes/placares grandes, final e campeão corrigidos, encerramento de confetes e retorno. Os 63 casos anteriores foram mantidos. Compartilhamento simultâneo/fallback continua coberto pelos testes anteriores e pelos novos casos de vitória.

## Verificação executada

Ambiente: Windows, PowerShell, Node 24.22.1 e Chromium local. Desktop 1440×1000, tablet 768×1024, mobile 375×812 e pequeno 320×740; toque simulado nos projetos mobile/tablet.

| Verificação                         | Resultado                                                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| TypeScript strict                   | Aprovado                                                                                                             |
| ESLint                              | Aprovado, sem avisos                                                                                                 |
| Jest / React Native Testing Library | **92 testes em 16 suítes**, aprovados                                                                                |
| Playwright completo                 | **52 casos aprovados** nesta auditoria: 13 cenários × quatro larguras, incluindo os 28 casos anteriores e os 24 de motion |
| Expo de desenvolvimento             | Relato anterior: dez casos desktop aprovados com console monitorado; não reexecutados nesta auditoria sem mudanças de runtime |
| Exportação web                      | Reexecutada e aprovada nesta auditoria, sem alterar o código de produção                                              |
| Expo dependency check               | `Dependencies are up to date`                                                                                        |
| Android/iOS                         | Reexportados para `.artifacts/stage4-audit-native`, 3,8 MB por plataforma; nenhum aparelho/emulador executado             |
| Revisão visual                      | Nesta auditoria: sorteio/revelação desktop e mobile, sala de 16 no mobile, campeão tablet/320; outras capturas são do relato anterior |

As seis novas jornadas de motion geram 24 casos Playwright: sorteios reais de 4/8/16 puláveis, sequência automática, saída por navegação externa e vitória finita. Os casos verificam o torneio inteiro salvo antes/depois de pular, pares formados pelo motor, ausência de navegação tardia, compartilhamento sem repetição e mudanças de preferência. Nos testes web, o compartilhamento assíncrono é simulado para provocar concorrência; isso não comprova o compartilhamento do sistema operacional.

Console monitora `pageerror`, `console.error` e, nos novos casos, o aviso específico de transform sobrescrito por animação de layout. O aviso informativo de movimento reduzido do Reanimated em desenvolvimento não representa erro. Preferência reduzida é padrão nas jornadas antigas; os novos cenários de motion habilitam movimento e também testam a mudança de preferência.

Os dez casos de desenvolvimento do relato anterior são reexecuções dos seis cenários de motion e dos quatro fluxos competitivos completos/puláveis, não dez casos adicionais à suíte Playwright. Naquela execução passaram após a correção de foco e sem erros de console ou aviso de transforms sobrescritos. A suíte intermediária de 48 também pertence à implementação anterior; a auditoria atual executou os 52 casos da suíte ampliada.

## Problemas encontrados e resolvidos

1. Consulta inicial de acessibilidade podia parecer uma escolha explícita por movimento reduzido e pular antes da preferência real. O estado `ready` resolve essa ambiguidade; leitura atrasada não substitui evento mais recente.
2. Callback antigo poderia alcançar uma execução nova do hook. A geração da sequência e o encerramento único protegem fases e navegação; há teste com callback capturado da execução anterior.
3. Cards de modalidade ficavam em uma coluna em 320 px por arredondamento de largura e gap. A base flexível agora acomoda as duas colunas.
4. Nome de 40 caracteres e placar `999999` comprimiam o texto na árvore. O compacto separa nome e números, mantendo as conexões alinhadas pela altura medida.
5. Desenvolvimento revelou conflito entre `entering` e `transform` de embaralhamento no mesmo avatar. Entrada e movimento passaram a ter camadas distintas; monitor específico foi acrescentado ao E2E.
6. O nome do campeão aparece legitimamente no destaque e no resultado da final. O teste antigo de viewport esperava uma ocorrência; agora verifica todas, mantendo a checagem de bounds/overflow. A primeira suíte completa teve 40 aprovações e oito falhas desse locator; a reexecução integral final usa o helper corrigido.
7. Capturas iniciais podiam registrar o meio do fade do modal ou da aproximação dos pares. Os testes aguardam opacidade final das camadas para produzir evidências legíveis.
8. Navegação SPA por cima da sala podia preservá-la montada e deixar o sorteio redirecionar após a saída. O caso foi reproduzido no Chromium; cleanup de foco agora fecha o modal e desarma o callback. Regressões unitária e E2E verificam que perfil continua aberto depois do prazo, com confrontos intactos.

A consulta de dependências e a primeira exportação Hermes receberam EACCES da sandbox; as repetições autorizadas passaram, sem instalar pacotes. Capturas, traces e bundles ficam em `.artifacts/`, ignorados pelo Git. Não houve auditoria npm de segurança nesta etapa; compatibilidade de versões não substitui a revisão dos alertas transitivos descritos na validação inicial.

Nesta auditoria, a primeira tentativa do Playwright procurou Chromium `1255`, ausente nesta máquina, e não chegou às asserções do aplicativo. A execução com `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` apontando para Chromium `1254` executou todos os 52 casos. O encerramento automático do preview ficou bloqueado pelo ambiente: após conferir sua árvore de processos, somente o preview filho dessa execução foi finalizado; o Playwright terminou com código 0 e `52 passed (10.3m)`. Esse tempo inclui a espera de encerramento. A checagem Expo inicialmente recebeu EACCES de rede e Hermes recebeu permission denied ao iniciar o compilador; ambos passaram na repetição com acesso autorizado. Nenhum pacote ou versão foi alterado.

## Evidências locais

Capturas `stage4-create-{largura}.png`, `stage4-final-{largura}.png`, `stage4-tree-{largura}.png`, `stage4-champion-{largura}.png` e `stage4-result-{largura}.png` registram as quatro larguras. Os E2E acrescentam `stage4-draw-{capacidade}-{projeto}.png`, `stage4-revealed-{projeto}.png` e `stage4-champion-{projeto}.png`. Traces de falhas intermediárias permanecem nos diretórios de teste ignorados. São imagens de verificação com dados de teste construídos pelo motor, sem injetar demonstrações no aplicativo de produção. Não foi gravado vídeo.

## Reproduzir

```powershell
npm.cmd ci
npm.cmd run web
```

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build:web
npx.cmd playwright install chromium
npm.cmd run test:e2e
npm.cmd run check:deps
npx.cmd expo export --platform android --platform ios --output-dir .artifacts/stage4-native
```

Playwright inicia o preview de `dist/` na porta 8081. Nesta máquina, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` apontou para o Chromium instalado. Para investigar avisos que não existem em produção, execute os cenários contra `npm.cmd run web` e confira console/LogBox. As configurações temporárias usadas para esse diagnóstico estão somente em `.artifacts/`.

## Homologação Android/iOS ainda pendente

### Galaxy S25 Ultra: Expo Go e configuração atual

O projeto instala Expo `~58.0.26`, React Native `0.88.1`, Reanimated `4.7.1` e Worklets `0.13.0`. A checagem Expo atual aprovou as dependências. Em 23/11/2026, a [página oficial de instalação do Expo Go](https://expo.dev/go) lista SDK 58. Conferir a versão no aparelho: o modelo S25 Ultra, sozinho, não comprova compatibilidade do contêiner instalado.

Os módulos utilizados têm suporte documentado no Expo Go do SDK: [Reanimated/Worklets](https://docs.expo.dev/versions/v58.0.0/sdk/reanimated/), [AsyncStorage](https://docs.expo.dev/versions/v58.0.0/sdk/async-storage/), [safe areas](https://docs.expo.dev/versions/v58.0.0/sdk/safe-area-context/) e [screens](https://docs.expo.dev/versions/v58.0.0/sdk/screens/), além dos módulos Expo de fontes/linking/Router. Não foi encontrado módulo nativo personalizado; não há `expo-dev-client`, `eas.json` ou diretórios nativos rastreados. Expo Go é uma opção para a primeira execução, ainda não testada neste aparelho. Não valida package, scheme, configuração Android nem futuras dependências externas ao contêiner.

`app.json` mantém orientação livre, package `app.matchmaking.local`, scheme `matchmaking` e teclado Android `resize`. O Shell/modais usam safe areas e tratamento de teclado. O binário próprio precisa validar essas configurações, barras do sistema e gestos; a exportação Hermes não o substitui.

No PowerShell, depois de encerrar qualquer preview/Metro seu que ocupe 8081:

```powershell
npm.cmd ci
npm.cmd run check:deps
npx.cmd expo start --go --lan --clear
```

Conectar computador e S25 à mesma rede Wi-Fi, abrir o leitor QR do Expo Go e usar o endereço LAN exibido. `localhost` no telefone aponta para o telefone. Se não conectar, verificar isolamento de clientes da rede/SSID de convidados, VPN, interface de rede escolhida e permissão do Node no firewall para a rede privada/porta do Metro; não desativar todo o firewall. Abrir o endereço HTTP LAN do Metro no navegador do telefone ajuda a separar falha de rede de falha do app. Fontes e logo são locais, portanto não dependem de download de assets externos na inicialização.

### Túnel e autenticação

Se LAN continuar indisponível, encerrar o servidor anterior e tentar:

```powershell
npx.cmd expo whoami
npx.cmd expo login
npx.cmd expo start --go --tunnel --clear
```

O login é feito pelo usuário no terminal; não fornecer senha/token no código. Como a tentativa anterior solicitou autenticação, verificar a sessão antes de abrir um novo QR. Isso não significa que todo túnel sempre exige conta: a CLI instalada também possui caminho de identificação anônima. A [referência Expo CLI](https://docs.expo.dev/more/expo-cli/#tunneling) documenta o transporte ngrok e o pacote auxiliar `@expo/ngrok`; seguir o prompt de instalação se faltar. Não foi instalado nem aberto túnel nesta auditoria, e não se garante que a autenticação resolva bloqueios de rede/serviço. O endereço muda ao reiniciar; escanear o QR novo.

### Quando usar development build

Para conferir o aplicativo próprio, adicionar módulo não incluído no Expo Go ou investigar incompatibilidade de runtime nativo, preparar um development build. A [documentação oficial](https://docs.expo.dev/develop/development-builds/introduction/) exige incluir `expo-dev-client`. O comando abaixo é um roteiro futuro, **não executado nesta entrega**, e altera dependências/gera projeto nativo:

```powershell
npx.cmd expo install expo-dev-client
adb devices
npx.cmd expo run:android --device
```

Requer JDK/Android SDK/Android Studio configurados conforme o [guia de ambiente](https://docs.expo.dev/get-started/set-up-your-environment/), S25 com depuração USB autorizada e status `device` no adb. Não executar com destino `unauthorized` esperando instalação. Na primeira execução `run:android` pode gerar `android/` e compilar/instalar o app. Para reabrir o Metro depois de instalar esse build:

```powershell
npx.cmd expo start --dev-client --lan --clear
```

No modo USB, `adb reverse tcp:8081 tcp:8081` e `--localhost` são uma alternativa quando o binário e adb já estiverem prontos. Para build em nuvem seria necessário configurar conta/projeto EAS, perfil development e artefato instalável; isso continua como opção futura, sem contratação, criação remota ou build executado aqui.

### Diagnóstico de inicialização

| Sintoma | Verificação e ação |
| --- | --- |
| QR/endereço não abre | Separar rede de runtime; conferir IP/porta/SSID/VPN, permitir Node somente na rede necessária e usar QR atual; tentar túnel se necessário |
| SDK incompatível no Expo Go | Instalar uma versão oficial que suporte SDK 58, ou gerar development build correspondente; não atualizar o projeto inteiro para tentar corrigir conexão |
| Módulo nativo ausente / versão Worklets-Reanimated divergente | Registrar erro completo, conferir `check:deps` e contêiner; rebuild após mudança nativa. Limpar cache Metro não instala código nativo no telefone |
| Bundle antigo / Metro | Encerrar o servidor correto, reiniciar com `--clear` e recarregar. Usar DevTools/Hermes, sem debugger remoto legado incompatível com Reanimated |
| Erro depois de carregar JS | Guardar stack/LogBox e passo de reprodução, distinguindo instalação/rede de exceção da tela; não apagar armazenamento como primeira tentativa |
| Dados não reaparecem | Conferir se abriu Expo Go ou o package próprio: são armazenamentos distintos. Repetir force-stop/reabertura no mesmo binário, sem limpar dados |

### Casos em aparelho

Repita o roteiro funcional da Etapa 3 e acrescente:

| Caso novo                    | Resultado esperado em aparelho                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Criação e sala               | Seleção clara, teclado/CTA alcançáveis, back preserva rascunho, lista de 16 sem animação acumulada; completar sala não sorteia            |
| Match Reveal 4/8/16          | Uma ordem persistida antes da apresentação; toque repetido/pular/back não sorteiam novamente; CTA alcançável em portrait/landscape        |
| Sair durante sorteio/vitória | Sem navegação tardia, áudio inexistente, partículas/camadas encerradas e dados preservados ao reabrir                                     |
| Rodadas e árvore             | Nome longo/placar grande legíveis, rolagem intencional, conexões correspondem aos próximos jogos e contexto de rodada mantido             |
| Final/correção               | Placares disponíveis abaixo do banner; cancelar preserva dados; correção invalida apenas descendentes e campeão novo corresponde ao motor |
| Vitória                      | Pode pular imediatamente; confetes terminam até 4,8 s; compartilhar duas vezes não abre dois fluxos; voltar recupera chaveamento          |
| Acessibilidade               | TalkBack/VoiceOver, texto ampliado, safe areas e redução de movimento; alternar preferência durante a apresentação não a reproduz depois  |
| Desempenho                   | Repetir entrada/saída em aparelho de entrada, observar Profiler/memória e registrar travamentos; não presumir 60 FPS                      |

Registre modelo, sistema/API, versão/build, escala de fonte, orientação, preferência, caso e evidência. iOS exige iPhone compatível ou macOS/Xcode para simulador/build. Bundles Hermes não são APK/IPA nem comprovam execução nativa. Safe areas reais, teclado, back/gestos, AsyncStorage, compartilhamento nativo, texto ampliado, leitores de tela, memória e FPS continuam pendentes. Safari e Firefox também não foram homologados.

## Git e próximo passo

Os sete commits de implementação já existiam e foram enviados ao remoto antes desta auditoria, por autorização do usuário: `ea4bc5a` (sistema), `9faf6b5` (criação), `a60ee4b` (sala/sorteio), `da3c34c` (chave/final), `523d417` (campeão), `2c9e7a6` (transforms) e `8b74dfd` (cleanup de foco). Nenhum foi duplicado. O índice foi preenchido seletivamente para registrar os testes/documentos que já estavam locais e o novo planejamento. A identidade do histórico foi reutilizada somente no comando de commit, sem editar configuração Git. Não houve amend, reset, artefatos adicionados, push ou deploy nesta execução. Os hashes novos constam na entrega final e em `git log`.

A [arquitetura proposta para a Etapa 5](stage-5-architecture.md) compara Supabase e NestJS + PostgreSQL, recomenda uma fronteira transacional que reutiliza o motor e detalha identidade, convidados, convites, concorrência, migração e recuperação. Sua execução começa pela homologação nativa acima e pela prova de comandos atômicos com múltiplos clientes. Backend, login, multiplayer, backup e convites reais continuam sem implementação nesta etapa.
