# Matchmaking

Transforme qualquer disputa entre amigos em um campeonato memorável.

Primeira versão funcional e local de uma plataforma de torneios: **Início → Criar → Sala → Sortear → Chaveamento → Resultados → Campeão**. A aplicação começa vazia e lista somente campeonatos criados neste dispositivo. Os nomes de demonstração só são adicionados pela ação explícita na sala.

## Tecnologias

- Expo SDK 58, React Native 0.88.1, React 19.3 e React Native Web.
- TypeScript strict e Expo Router com rotas por arquivo.
- Zustand com persistência versionada: AsyncStorage no Android/iOS, localStorage na web.
- Reanimated para transições, revelação dos confrontos e celebração.
- Inter, Barlow Condensed ExtraBold e Ionicons, empacotados localmente.
- Jest, React Native Testing Library e Playwright.

As dependências específicas do SDK foram instaladas com `expo install`, conforme a [documentação oficial](https://docs.expo.dev/router/installation/). `npm run check:deps` verifica a compatibilidade instalada.

## Requisitos e instalação

Node.js 22.13 ou superior; ambiente utilizado: **Windows, Node 24.22.1**. Use o lockfile para reproduzir a instalação.

```powershell
cd C:\Users\pedro\OneDrive\Documentos\Projetos\matchmaking
npm.cmd ci
```

No PowerShell com execução de scripts bloqueada, utilize `npm.cmd` e `npx.cmd`, sem alterar a política de execução. Em outros terminais, `npm` e `npx` também funcionam.

## Executar

### Web

```powershell
npm.cmd run web
```

Abra o endereço local indicado pelo Expo. Para conferir a exportação de produção:

```powershell
npm.cmd run build:web
npm.cmd run preview
```

O preview local abre em `http://127.0.0.1:8081`. O servidor de preview serve a SPA com fallback para as rotas e destina-se somente à validação local.

### Android

```powershell
npm.cmd run android
```

Requer Android Studio, SDK e um emulador iniciado. Para um aparelho físico, execute `npm.cmd start` e escaneie o QR Code em uma versão do Expo Go compatível com o SDK 58, ou use um development build compatível.

### iOS

```powershell
npm.cmd run ios
```

O simulador exige macOS e Xcode. No Windows, use `npm.cmd start` e um iPhone com Expo Go compatível ou development build. Não foram executados testes em simuladores ou aparelhos reais nesta entrega. Os bundles Hermes de ambas as plataformas foram compilados.

## Como testar uma disputa

1. Crie um campeonato em três etapas. Mata-mata oferece 4, 8 ou 16 vagas.
2. Adicione participantes por nome. “Eu também vou jogar” vincula explicitamente o perfil local.
3. Opcionalmente, utilize “Preencher com participantes de exemplo”, identificado como demonstração.
4. Complete a sala e sorteie os confrontos. O sorteio é salvo antes da animação, que pode ser pulada.
5. Toque nos confrontos e registre os placares. Um empate exige a escolha explícita de quem venceu o desempate segundo a regra da modalidade.
6. Confirme a revisão do placar. O vencedor avança automaticamente.
7. Conclua a final e compartilhe o texto da conquista, quando suportado pela plataforma.
8. Para corrigir um jogo encerrado, escolha “Corrigir resultado”. Uma mudança de vencedor com jogos posteriores concluídos exige confirmação e limpa os resultados dependentes.

## Estrutura

```text
app/                         Rotas e layout do Expo Router
src/screens/                 Fluxos e composição das telas
src/components/              Design system, navegação e componentes de torneio
src/theme/                   Paleta oficial, fontes, espaçamento e movimento
src/features/tournaments/
  domain/                    Tipos e identificação visual de nomes repetidos
  engine/                    Motor puro de chaveamento e estatísticas
src/store/                   Zustand, validação e adaptador de armazenamento
src/hooks/                   Movimento reduzido e layout responsivo
src/utils/                   Compartilhamento com adaptador web
assets/brand/logo.png         Logo oficial preservada
tests/                       Domínio, persistência e comportamento das telas
e2e/                         Fluxo completo no navegador
docs/                        Decisões e relatório de validação
scripts/                     Preview da exportação local
```

## Scripts e verificações

| Comando | Finalidade |
| --- | --- |
| `npm.cmd start` | Servidor Expo |
| `npm.cmd run web` | Desenvolvimento web |
| `npm.cmd run android` | Abrir emulador Android |
| `npm.cmd run ios` | Abrir simulador iOS no macOS |
| `npm.cmd run typecheck` | TypeScript strict |
| `npm.cmd run lint` | ESLint com configuração Expo |
| `npm.cmd test` | Testes Jest e React Native Testing Library |
| `npm.cmd run build:web` | Exportação web em `dist/` |
| `npm.cmd run preview` | Preview local de `dist/` |
| `npm.cmd run test:e2e` | Playwright em 1440, 768, 375 e 320 px |
| `npm.cmd run check:deps` | Compatibilidade das dependências com SDK |

Para instalar o Chromium usado pelo Playwright em uma nova máquina:

```powershell
npx.cmd playwright install chromium
npm.cmd run build:web
npm.cmd run test:e2e
```

Também é possível definir `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` para um Chromium já instalado. Capturas e traces ficam em `.artifacts/`, ignorado pelo Git. Os testes de componentes substituem somente navegação, animações e a implementação nativa de armazenamento; as regras de torneio e as ações do estado são reais.

## Regras e arquitetura

- Motor sem dependência de React; funções imutáveis e sorteador Fisher–Yates com RNG injetável nos testes.
- IDs de participantes únicos, inclusive para apelidos iguais. A interface diferencia nomes repetidos pelo número do jogador.
- Apenas inteiros seguros não negativos são aceitos como placar. Empates exigem vencedor pertencente ao confronto.
- Ao trocar um vencedor, apenas o caminho de partidas dependentes perde os resultados. O outro lado da chave é preservado. Manter o vencedor preserva os resultados posteriores.
- Campeão e conclusão derivam da final; estatísticas derivam exclusivamente de partidas concluídas.
- Ranking: vitórias decrescentes, saldo decrescente, pontos marcados decrescentes, nome em português e ID. O ranking estatístico não substitui o campeão da chave.
- Perfil associado por `profileId`; nomes iguais em torneios diferentes não são vinculados automaticamente.
- Persistência na chave `matchmaking-local-v1`, esquema versão 1, com hidratação explícita após montar o cliente. O rascunho também é persistido.
- Dados incompatíveis ou estruturalmente inválidos são preservados e as gravações ficam bloqueadas na sessão, com mensagem ao usuário. Nenhuma recuperação apaga o conteúdo automaticamente. Falhas de escrita também bloqueiam novas gravações até recarregar, preservando o estado na memória.
- O adaptador de armazenamento e os métodos do store delimitam a futura integração com API, sem abstrações de backend antecipadas.

## Implementado

- Home com campeonatos locais e tela Torneios com busca e filtros funcionais.
- Criação progressiva, rascunho recuperável e descarte confirmado.
- Sala com adicionar/remover, capacidade, participação explícita do organizador e exemplos opcionais.
- Sorteio único, persistido e pulável; animação e alternativa sem movimento.
- Árvore conectada com rolagem intencional no desktop, rodadas e visão geral no celular.
- Placares com controles, entrada direta, desempate, revisão e correção protegida.
- Estatísticas gerais e por jogador, ranking e perfil local editável.
- Celebração com campeão correto, troféu, partículas e compartilhamento real de texto. Na web, usa Web Share ou copia para a área de transferência; se não houver suporte, exibe texto selecionável.
- Estados vazios, rotas inexistentes, limites, erros e confirmação antes de excluir.
- Logo oficial copiada integralmente do arquivo fornecido. O monograma não foi fornecido e não foi recriado.

## Consolidação da Etapa 2

A identidade foi consolidada em tokens semânticos: canvas branco, superfícies claras, ações laranja, Barlow Condensed para impacto e Inter para leitura. Os componentes existentes foram aperfeiçoados com variantes de botão, loading, foco, seleção, erros de formulário e fallback de fontes. `AppHeader`, `AppNavigation` e `ScreenContainer` compartilham a navegação, com barra inferior no celular e navegação no cabeçalho desktop.

Home e Torneios utilizam um grid medido de uma a três colunas e cards distintos para preparação, andamento e conclusão. Perfil preserva edição e estatísticas locais, com informações da versão do aplicativo. Movimento é finito e respeita a preferência reduzida. O motor competitivo existente foi preservado.

Validação da entrega: TypeScript e lint aprovados, 38 testes Jest, **20 casos Playwright** nas quatro larguras, exportação web e bundles Hermes Android/iOS. Os 12 casos de interface foram reexecutados após os ajustes. A correção posterior de texto solto em View elevou a suíte para **41 testes Jest** aprovados e foi validada no fluxo completo em Chromium com servidor de desenvolvimento. O [relatório da Etapa 2](docs/stage-2.md) registra essa entrega, enviada ao remoto após autorização posterior do usuário.

## Estabilidade e revisão mobile — Etapa 3

Teclado e navegação por etapas foram preparados para as plataformas nativas; modais permitem rolagem e respeitam safe areas. Nomes e placares longos foram revistos, o retorno recupera o chaveamento existente e animações temporárias encerram com cleanup. A hidratação agora preserva envelopes inválidos e impede que campos persistidos substituam ações do store.

Validação atual: **63 testes Jest e 28 casos Playwright completos**, TypeScript/lint aprovados, verificações adicionais no servidor de desenvolvimento, exportação web e bundles Hermes Android/iOS. O [relatório da Etapa 3](docs/stage-3.md) distingue os testes executados das pendências e fornece o roteiro Android/iOS. Não houve execução nativa em aparelho/emulador. Os commits da Etapa 3 permanecem locais, sem push.

## Limitações e próxima etapa

Sem backend, login, sincronização, convites remotos, notificações ou QR Code funcional. Pontos corridos e fase de grupos estão identificados como futuros. Compartilhamento não gera uma imagem. Limpar os dados do navegador ou desinstalar o aplicativo pode remover os campeonatos; não existe backup em nuvem.

A validação web foi feita no Chromium em quatro larguras (1440, 768, 375 e 320 px), com toque simulado nos projetos tablet e mobile. Safari, Firefox, aparelhos Android/iOS, leitores de tela e fontes ampliadas ainda precisam de homologação. A compilação de bundles não comprova execução nativa em aparelho.

A auditoria npm da implementação inicial encontrou alertas em dependências transitivas do ecossistema Expo/Metro/Jest. As versões compatíveis do SDK foram preservadas; não foi aplicado `audit fix --force`, que sugeria retroceder o SDK. A auditoria não foi repetida na Etapa 2. A revisão desses alertas é uma pendência para publicação comercial. Veja [o relatório de validação inicial](docs/validation.md).

**Próximo passo recomendado:** homologar em Android e iPhone reais, incluindo persistência, teclado, animações, compartilhamento e acessibilidade. Depois, definir o contrato do backend e uma estratégia de backup/migração antes de implementar convites reais.

Decisões visuais e referências: [docs/design-decisions.md](docs/design-decisions.md). O envio do código ao GitHub é separado da publicação do aplicativo. Nenhum deploy ou publicação em loja foi realizado.
