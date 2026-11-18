# Etapa 3 — estabilidade, mobile e retomada

## Estado encontrado e continuidade

A Etapa 3 começou em `18ca604`, na branch `main`, limpa e sincronizada com `origin/main`. README, decisões visuais, validação e Etapa 2 foram consultados. TypeScript, lint e os 41 testes Jest anteriores passaram antes das mudanças. A correção de texto solto em View e seus três testes foram preservados.

Na retomada solicitada pelo usuário, `main` estava um commit à frente: `ba9abda`, correção de persistência já verificada. O índice estava vazio. Permaneciam modificações em `app.json`, Shell, UI, componentes de torneio, criação, sala, chaveamento, partida, campeão e setup de testes; os arquivos de teclado, testes mobile e E2E de estabilidade ainda não estavam rastreados. Este relatório ainda não existia. Os diffs, arquivos novos e histórico foram revisados; nenhum trabalho anterior foi descartado, recriado ou repetido em commits.

Classificação na retomada:

- **Concluído:** motor existente; correção de persistência em `ba9abda`, com 33 testes de motor/persistência aprovados; identidade oficial e regressão de texto em View preservadas.
- **Parcial:** ajustes de teclado/back, modais, placares longos e animações estavam implementados, mas precisavam de integração, revisão visual e cobertura final. Na primeira checagem da retomada, 59 testes passaram. Os testes adicionais de teclado/back foram concluídos em seguida.
- **Pendente:** executar a suíte Playwright completa com os casos novos, tratar regressões, reexportar as plataformas, documentar o roteiro nativo e concluir os commits. Homologação em aparelho continuava pendente por falta do ambiente Android/iOS.

## Direção preservada

O produto da Etapa 2 continua sendo o alvo: logo original, Barlow Condensed/Inter, branco, grafite e laranja `#FF6A00`. A skill Refero foi usada para a revisão pontual; SAP Good Energy (`311c13ac-bb43-44fe-858b-39f350505866`) e Strava (`dd3513c1-ac8a-48dd-a74c-1036c3ff333b`) foram consultadas novamente. A tela [Apple Sports](https://refero.design/screens/233a8ef5-e081-4822-b1c8-95ddbc77003e) reforçou o alinhamento e a leitura de números no mobile. Não houve redesenho, nova paleta ou criação de imagens.

| Decisão | Fonte | Aplicação restrita |
| --- | --- | --- |
| Preservar canvas, tipografia e cor de ação | Briefing / produto existente / SAP / Strava | Ajustar encaixe, sem mudar identidade |
| Nomes completos e números legíveis | Briefing / Apple Sports | Quebra de nomes, placares adaptados e slots medidos |
| Conteúdo rolável e ações alcançáveis | Briefing / Refero craft | Modais e telas baixas |
| Movimento finito e cancelável | Briefing / componentes existentes | Encerrar partículas e limpar timers, sem nova experiência cinematográfica |

## Problemas e correções

1. **Risco de perda dos dados locais:** JSON válido com envelope inválido podia ser interpretado como armazenamento vazio pelo Zustand e substituído. A leitura agora valida envelope, versão numérica e estado antes da hidratação. Dados inválidos permanecem intactos e as gravações ficam bloqueadas, com aviso. Campos extras não podem substituir ações do store: o merge importa somente torneios, perfil e rascunho.
2. **Teclado e retorno por etapa:** Shell agora usa KeyboardAvoidingView nas plataformas nativas, permite fechar o teclado ao rolar e oculta a navegação inferior enquanto ele está aberto. A configuração Android explicita `resize`. Avançar/revisar fecha o teclado; o back Android, apenas enquanto a criação está focada, retorna uma etapa preservando os dados. Na primeira etapa, devolve o controle à navegação normal.
3. **Modais em telas baixas:** ConfirmDialog permite rolagem e respeita insets. O sorteio usa rolagem para todo o conteúdo e mantém o botão de pular no rodapé com safe area. Não depende mais de uma lista interna com altura fixa.
4. **Nomes e placares longos:** MatchCard deixa o nome quebrar linhas e informa confronto/resultado no hint acessível. A árvore mede a altura necessária dos cards para separar partidas e conexões. A partida usa coluna em largura inferior a 360 px ou fontScale elevado e adapta o tamanho de placares longos. Ações da criação se empilham em largura compacta.
5. **Histórico duplicado ao retornar:** substituir uma partida por outro chaveamento deixava cópias da mesma rota na pilha. Retornos de partida/campeão usam `router.dismissTo`, que recupera o chaveamento existente e também atende entrada direta pela alternativa do Router. Os novos cenários E2E reproduziram a falha antes da correção.
6. **Interações temporárias:** sorteio protege chamadas repetidas; voltar, pular e timeout convergem para uma conclusão única. Confetes existentes terminam, desmontam após cinco segundos e cancelam animações na saída. Compartilhamento bloqueia chamadas simultâneas, ignora conclusão após desmontar e limpa o texto alternativo ao tentar novamente. Preferência reduzida continua respeitada.

O tratamento do teclado segue o [guia atual do Expo](https://docs.expo.dev/guides/keyboard-handling/), incluindo behavior nas duas plataformas nativas e ausência de `pan` combinado com padding. A validação em aparelho ainda é necessária. Não foram adicionadas bibliotecas, alteradas versões, refeito o motor ou mudado o esquema persistido.

## Resultado por área

| Item | Estado antes da retomada | Trabalho realizado | Estado final |
| --- | --- | --- | --- |
| Homologação mobile | Ajustes sem validação final; sem aparelho | Chromium 320/375/768/1440, tela baixa 640×360, exports Hermes e roteiro manual | Web verificada; nativo pendente |
| Navegação | Back por etapa iniciado; retorno duplicava chaveamento | Testes de back/cleanup e retorno com dismissTo | Automatizados aprovados; gesto nativo pendente |
| Criação de campeonatos | Fluxo existente; ajustes de teclado iniciados | Rascunho preservado, ações compactas, modais roláveis | Web e testes de componentes aprovados |
| Chaveamento | Motor pronto; nomes/slots rígidos | Altura medida, nomes completos, placares grandes e conclusão 8/16 | E2E e persistência aprovados |
| Animações | Cleanup e proteções iniciados | Sorteio único, fim de confetes, share protegido e preferência reduzida | Testes e verificação web aprovados; desempenho nativo pendente |
| Persistência | Correção já commitada em ba9abda | Preservação confirmada, recarga e isolamento 4/8/16 | Testes aprovados; AsyncStorage real pendente |
| Testes | 41 na base; novos casos parcialmente integrados | 63 Jest, 28 Playwright completos, quatro casos em desenvolvimento | Todos aprovados ao finalizar |
| Documentação | Somente etapas anteriores | Este relatório, procedimentos Android/iOS e README | Atualizada |

Home vazia/com dados, logo, fontes e navegação principal continuam cobertas pela suíte existente, executada novamente. Não precisavam ser reconstruídas. Estados de erro, empate, participantes duplicados, sala incompleta, partidas indisponíveis e correção de resultados continuam cobertos pelo domínio/interface. O novo teste de persistência acrescenta erros de leitura e escrita do AsyncStorage simulado.

## Validação efetivamente executada

Ambiente: Windows, PowerShell, Node 24.22.1, Chromium local. `adb`, `emulator`, `java` e `xcrun` não foram localizados no PATH; SDK/Android Studio também não foram encontrados nos caminhos usuais verificados. Nenhum aparelho ou emulador foi executado.

| Verificação | Resultado final |
| --- | --- |
| TypeScript strict | Aprovado |
| ESLint | Aprovado, sem avisos |
| Jest / React Native Testing Library | **63 testes em 10 suítes**, incluindo a regressão de texto em View |
| Playwright completo | **28 casos aprovados**: sete cenários em quatro larguras, sem remover os casos anteriores |
| Servidor Expo de desenvolvimento | Quatro casos desktop aprovados: completo de 4, completo de 8/16 e sorteio pulável; console monitorado |
| Verificação adicional em desenvolvimento | Criação/revisão/cancelamento de descarte em 640×360; confetes montados e removidos em 320×740 sem preferência reduzida; zero erros de console |
| Exportação web | Aprovada com o código final |
| Expo dependency check | `Dependencies are up to date` |
| Android e iOS | Bundles Hermes finais exportados; não são APK/IPA nem execução nativa |
| Git | Diff verificado; stage seletivo; sem push nesta etapa |

Os quatro casos de desenvolvimento são reexecuções de cenários, não quatro casos extras na suíte de 28. Desktop: 1440×1000; tablet: 768×1024; mobile: 375×812; pequeno: 320×740. A suíte usa movimento reduzido, exceto o cenário que explicitamente exercita o sorteio animado. As verificações locais adicionais também testaram o encerramento da celebração com movimento habilitado.

Os cenários novos de 8/16 usam fixtures apenas no preparo inicial, construídas pelo motor real. Todos os resultados seguintes são registrados pela interface. Verificam cada avanço, campeão, ranking, recarga parcial/final, rascunho e outro torneio isolados. O caso de 8 também cancela uma correção, confirma depois a troca de vencedor e verifica que somente seus descendentes perdem placares. Nome de 40 caracteres e placar 999999 exercitam a responsividade.

Falhas intermediárias: a primeira suíte completa passou nos 20 casos anteriores e falhou nos oito novos devido à duplicação do chaveamento. O retorno foi corrigido e a suíte inteira passou novamente. Os locators novos também foram ajustados para distinguir a tela visível mantida pelo Router e os dois CTAs legítimos do desktop, sem remover verificações. Uma tipagem do evento BackHandler foi alinhada à versão instalada. Hermes e a consulta de compatibilidade inicialmente receberam EACCES da sandbox; as repetições autorizadas passaram. Não há testes reprovados remanescentes nesses comandos.

Capturas, traces e bundles estão em `.artifacts/`, ignorados pelo Git. Foram inspecionadas Home, placar com nome longo, campeão e criação em tela baixa. Não foi medido FPS, consumo real de memória ou desempenho em Android. Não foi feita homologação humana com TalkBack/VoiceOver ou texto ampliado do sistema; branches de fontScale foram revisados em código. Sem memoização indiscriminada ou afirmação de ausência de vazamentos nativos.

## Arquivos alterados

- Configuração: `app.json` (comportamento do teclado Android).
- UI/layout: `src/components/Shell.tsx`, `ui.tsx`, `tournament.tsx` e novo `src/hooks/useKeyboardVisible.ts`.
- Telas: `CreateScreen.tsx`, `LobbyScreen.tsx`, `BracketScreen.tsx`, `MatchScreen.tsx`, `ChampionScreen.tsx`, em `src/screens/`.
- Persistência: `src/store/useAppStore.ts`.
- Testes: `tests/setup.ts`; novos `tests/persistence-stability.test.ts`, `tests/components/mobile-navigation.test.tsx`, `tests/components/mobile-motion.test.tsx`, `e2e/stability.spec.ts`.
- Documentação: novo `docs/stage-3.md` e ajustes pontuais no `README.md`.

## Commits

| Momento | Hash | Mensagem |
| --- | --- | --- |
| Antes da retomada | `ba9abda` | `fix(storage): preserve invalid local data and protect store actions` |
| Retomada | `c365d1e` | `fix(mobile): handle keyboard navigation and scrollable dialogs` |
| Retomada | `98d2f3d` | `fix(motion): finalize draw and victory interactions` |
| Retomada | `dc2ff0f` | `fix(tournament): preserve bracket navigation and readable scores` |
| Retomada | `f85368d` | `test: cover complete tournaments reloads and data isolation` |

Este relatório é registrado no commit final `docs: finalize stage three validation`; seu hash consta na resposta final e em `git log`. Autor existente no histórico reutilizado por comando, sem editar configurações Git. Não houve reset, amend, force push, push ou inclusão de artefatos. A base da Etapa 2 já havia sido enviada ao remoto por solicitação posterior do usuário; a Etapa 3 permanece local.

## Executar e repetir verificações

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
npx.cmd expo export --platform android --platform ios --output-dir .artifacts/stage3-native
```

O Playwright inicia o preview de produção em 8081. Para verificar avisos de desenvolvimento manualmente, encerre esse preview e execute `npm.cmd run web`; percorra criação, partida e campeão observando console e LogBox. O Chromium já instalado foi selecionado por `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` nesta entrega. Um navegador ausente pode ser instalado pelo comando acima.

## Roteiro Android — execução ainda pendente

### Preparação

1. Instale Android Studio/SDK/JDK e configure um AVD ou conecte o aparelho com depuração USB. Use o [guia de ambiente do Expo](https://docs.expo.dev/get-started/set-up-your-environment/). Confirme que `adb devices` lista o dispositivo como `device`, aceitando a autorização USB no aparelho.
2. No diretório do projeto, execute `npm.cmd ci`. Para Expo Go, instale uma versão compatível com SDK 58 e execute `npx.cmd expo start --go --lan`; leia o QR Code no telefone na mesma rede. No emulador, `npm.cmd run android` abre o destino disponível. Pare o preview web se ele ocupar 8081.
3. Para validar o binário próprio e a configuração nativa, com SDK/JDK prontos execute `npx.cmd expo run:android --device`. Esse comando pode gerar o diretório Android e compilar/instalar um build local. Ele **não foi executado nesta entrega**. As instruções estão na [referência Expo CLI](https://docs.expo.dev/more/expo-cli/). Testes em Expo Go não substituem os do binário próprio.

### Casos e resultados esperados

| Caso | Passos manuais | Resultado esperado |
| --- | --- | --- |
| Home / áreas seguras | Abrir vazio; visitar Início/Torneios/Perfil; repetir com torneios; usar navegação por gesto e por três botões | Logo proporcional; conteúdo/barra fora dos recortes; toque confortável; destino ativo correto |
| Teclado | Criar, focar nome e modalidade livre; abrir sala/perfil/placar; escrever, rolar e fechar | Campo/CTA alcançáveis; barra inferior oculta durante teclado; tela recupera altura ao fechar |
| Back de criação | Preencher nome, chegar à revisão, pressionar voltar duas vezes e uma terceira | Revisão→formato→identidade; nome/capacidade preservados; primeiro back com teclado aberto deve fechar o teclado conforme o sistema; na primeira etapa, navegação normal |
| Modais / rotação | Em revisão abrir descarte, cancelar, girar o aparelho; repetir remoção e correção | Conteúdo/ações roláveis e alcançáveis; cancelar não altera dados; portrait e landscape funcionam |
| Sala | Usar nome longo, adicionar repetido, remover com confirmação, preencher 4/8/16 vagas | Duplicados identificados sem confundir IDs; capacidade respeitada; sorteio só com sala completa |
| Sorteio | Tocar rapidamente, usar pular e back; repetir com movimento reduzido | Uma ordem persistida; uma navegação; modal sem bloquear saída; sem animação longa quando reduzido |
| Fluxos 4/8/16 | Registrar todas as rodadas e um empate com vencedor explícito; consultar campeão/ranking | Avanços e campeão corretos; chave/rodadas legíveis; árvore pode rolar horizontalmente |
| Correção | Em torneio concluído trocar vencedor anterior, cancelar uma vez e confirmar depois | Cancelar preserva tudo; confirmar invalida só descendentes, remove campeão e atualiza estatísticas |
| Persistência real | Criar dois torneios e um rascunho; registrar placares; forçar parada e reabrir, sem limpar dados | Torneios/participantes/placares/rascunho reaparecem; alteração de um torneio não muda o outro |
| Acessibilidade | Ativar TalkBack, fonte ampliada e remover animações nas configurações Android | Labels/seleção/erros anunciados; textos e ações alcançáveis; sem obrigação de assistir animações |
| Desempenho | Repetir sorteio/campeão e navegação; observar monitor/Profiler em aparelho de entrada | Sem trabalho contínuo após celebração; sem acúmulo de timers/camadas; registrar travamentos se houver |

No build próprio, uma parada sem apagar dados pode ser feita com `adb shell am force-stop app.matchmaking.local`; reabra pelo ícone do aplicativo. O comando se refere ao package do `app.json`, não ao contêiner Expo Go. Não limpe o armazenamento para esse teste.

Registre aparelho/AVD, Android/API, build, orientação, escala de fonte, preferência de movimento, caso, resultado e evidência. Marque os resultados somente após a execução. Safe areas, teclado real, gesto voltar, status/navigation bars, AsyncStorage real, leitor de tela, memória e FPS permanecem **pendentes**.

## iOS, limitações e próxima etapa

iOS: bundle Hermes exportado, sem simulador/aparelho. Repetir o roteiro em iPhone com versão compatível ou build próprio; simulador/build local requer macOS/Xcode. Verificar home indicator/notch, teclado, gesto de retorno, VoiceOver, Dynamic Type, AsyncStorage, compartilhamento e redução de movimento.

Safari e Firefox continuam pendentes. A auditoria npm de segurança inicial não foi repetida e seus alertas transitivos ainda exigem revisão antes de publicação. Compatibilidade de versões aprovada não é auditoria de segurança. Nenhum APK/IPA, deploy ou publicação foi produzido; backend, login, multiplayer e convites reais não foram implementados.

A Etapa 4 deve começar com o registro dos testes em dispositivos. Depois, evoluir os momentos visuais de sorteio/vitória com medidas de desempenho e as mesmas proteções de integridade. Preservar o motor e as regressões; tratar integração remota e recuperação/backup como escopo próprio.
