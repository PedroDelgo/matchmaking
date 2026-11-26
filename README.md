# Matchmaking

Transforme qualquer disputa entre amigos em um campeonato memorável.

Campeonatos **neste dispositivo**, sem conta e offline, ou **na nuvem**, vinculados à conta: **Início → Criar → Sala → Sortear → Chaveamento → Resultados → Campeão**. A Home reúne as duas origens. A importação cria uma cópia somente após revisão e confirmação; o original local permanece intacto. Nesta entrega, Auth, API e PostgreSQL foram executados apenas no computador de desenvolvimento: não existe serviço publicado na internet.

## Tecnologias

- Expo SDK 58, React Native 0.88.1, React 19.3 e React Native Web.
- TypeScript strict e Expo Router com rotas por arquivo.
- Zustand com persistência versionada: AsyncStorage no Android/iOS, localStorage na web.
- Reanimated para transições, revelação dos confrontos e celebração.
- Inter, Barlow Condensed ExtraBold e Ionicons, empacotados localmente.
- Jest, React Native Testing Library e Playwright.
- Fundação backend local: Supabase CLI, PostgreSQL 17, serviço Node 24/TypeScript, `pg` e `jose`, desacoplados do app.
- Supabase Auth, sessão separada por projeto, SecureStore Android/iOS e Crypto para PKCE; localStorage na web.

As dependências específicas do SDK foram instaladas com `expo install`, conforme a [documentação oficial](https://docs.expo.dev/router/installation/). `npm run check:deps` verifica a compatibilidade instalada.

## Requisitos e instalação

Node.js 22.13 ou superior para o app; backend e ferramentas desta entrega usam **Node 24**. Ambiente utilizado: **Windows, Node 24.22.1**. Use o lockfile para reproduzir a instalação.

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

Esse script abre um destino Android disponível. Para o Galaxy S25 Ultra com Expo Go compatível com SDK 58, use `npx.cmd expo start --go --lan --clear`, computador e telefone na mesma rede, e escaneie o QR no Expo Go. Confira o [roteiro Android da Etapa 4](docs/stage-4.md#galaxy-s25-ultra-expo-go-e-configuração-atual), com diagnóstico de LAN/túnel, autenticação e preparação de development build. O binário próprio exige SDK/JDK ou configuração de build em nuvem; `expo-dev-client` ainda não está instalado. Não houve homologação em aparelho nesta entrega.

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
  domain/                    Tipos, validação e identificação de nomes repetidos
  engine/                    Motor puro de chaveamento e estatísticas
src/features/auth/           Conta, ciclo de sessão, armazenamento e PKCE
src/store/                   Zustand, validação e adaptador de armazenamento
src/hooks/                   Movimento reduzido e layout responsivo
src/utils/                   Compartilhamento com adaptador web
assets/brand/logo.png         Logo oficial preservada
tests/                       Domínio, persistência e comportamento das telas
e2e/                         Fluxo completo no navegador
docs/                        Decisões e relatório de validação
scripts/                     Preview da exportação local
backend/                     Serviço transacional e testes PostgreSQL locais
supabase/                    Configuração local, migrations e asserts de acesso
```

## Scripts e verificações

| Comando                  | Finalidade                                 |
| ------------------------ | ------------------------------------------ |
| `npm.cmd start`          | Servidor Expo                              |
| `npm.cmd run web`        | Desenvolvimento web                        |
| `npm.cmd run android`    | Abrir emulador Android                     |
| `npm.cmd run ios`        | Abrir simulador iOS no macOS               |
| `npm.cmd run typecheck`  | TypeScript strict                          |
| `npm.cmd run lint`       | ESLint com configuração Expo               |
| `npm.cmd test`           | Testes Jest e React Native Testing Library |
| `npm.cmd run build:web`  | Exportação web em `dist/`                  |
| `npm.cmd run preview`    | Preview local de `dist/`                   |
| `npm.cmd run test:e2e`   | Playwright em 1440, 768, 375 e 320 px      |
| `npm.cmd run check:deps` | Compatibilidade das dependências com SDK   |

Para instalar o Chromium usado pelo Playwright em uma nova máquina:

```powershell
npx.cmd playwright install chromium
npm.cmd run build:web
npm.cmd run test:e2e
```

Também é possível definir `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` para um Chromium já instalado. Capturas e traces ficam em `.artifacts/`, ignorado pelo Git. Os testes de componentes isolam navegação, animações e integrações nativas; as regras de torneio e as ações do estado são reais.

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
- O store local permanece independente. Cache remoto por conta e API de comandos tratam revisões, conflitos e tentativas idempotentes sem misturar snapshots ao envelope local.

## Implementado

- Home com campeonatos locais/remotos e tela Torneios com busca e filtros por origem/status.
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

Validação da Etapa 3: **63 testes Jest e 28 casos Playwright completos**, TypeScript/lint aprovados, verificações adicionais no servidor de desenvolvimento, exportação web e bundles Hermes Android/iOS. O [relatório da Etapa 3](docs/stage-3.md) distingue os testes executados das pendências e fornece o roteiro Android/iOS. Não houve execução nativa em aparelho/emulador. Seus commits foram enviados ao remoto após autorização posterior do usuário; o relatório registra o estado histórico da entrega.

## Movimento e momentos competitivos — Etapa 4

Seleção de modalidade, progresso da sala e transições de etapas compartilham tokens de movimento. Match Reveal apresenta o sorteio já persistido em uma sequência finita e pulável para 4/8/16. Chaveamento destaca rodadas, avanços e o caminho real do campeão; a Grande Final recebe apresentação própria. Champion Reveal combina nome, troféu e confetes com fim em 4,8 s, resultado real da final e compartilhamento protegido. Movimento reduzido apresenta os resultados diretamente, sem reproduzir a celebração após rerenders.

Na auditoria de 23/11/2026, a implementação de movimento já estava concluída e foi preservada: **92 testes Jest em 16 suítes e 52 casos Playwright**, TypeScript, lint, exportação web, compatibilidade Expo e bundles Hermes Android/iOS aprovados. O [relatório da Etapa 4](docs/stage-4.md) classifica cada requisito e distingue a verificação web da homologação nativa ainda pendente. Os sete commits de implementação até `8b74dfd` haviam sido enviados ao remoto por autorização anterior; os novos registros de testes/documentação desta auditoria ficam locais, sem push ou deploy.

## Planejamento multiplayer — Etapa 5

A [proposta de arquitetura](docs/stage-5-architecture.md) compara Supabase e NestJS + PostgreSQL e orienta as entregas de autenticação, permissões, convites, concorrência, migração e recuperação. A fundação local da Etapa 5A foi implementada conforme o relato abaixo; integrações remotas, plano, pooler e avaliação de carga/custo continuam pendentes.

## Fundação backend — Etapa 5A

PostgreSQL local pelo Supabase CLI, três migrations com integridade/RLS/grants e serviço Node 24/TypeScript que reutiliza o motor existente. `record_result` e `correct_result` usam uma conexão/transação, lock por torneio, revisão otimista, evento e recibo idempotente. O servidor valida JWT assimétrico por JWKS e autoriza o proprietário; não há login visual ou conexão do app com o backend.

Validação: **13 testes de integração em PostgreSQL real e 3 unitários Node**, incluindo HTTP compilado, concorrência, rollback, correções, reconstrução 4/8/16, RLS e escrita negada. As regressões mantêm **92 testes Jest e 52 Playwright** aprovados, além de TypeScript, lint, builds web/backend, bundles Hermes e compatibilidade Expo. Auth completo e pooler remoto não foram testados. Consulte [docs/stage-5a.md](docs/stage-5a.md) para arquitetura, segurança, evidências e limitações.

Com Node 24 e Docker Desktop em execução:

```powershell
npm.cmd ci
npm.cmd run db:start
npm.cmd run db:migrate
Copy-Item backend/.env.example backend/.env
```

Preencha somente o arquivo ignorado `backend/.env` com o DSN do operador PostgreSQL local em `MATCHMAKING_TEST_DATABASE_URL`. Não use credenciais remotas ou `EXPO_PUBLIC_`. Então execute:

```powershell
npm.cmd run backend:typecheck
npm.cmd run backend:test
npm.cmd run backend:test:db
```

A integração compila o serviço e cria/remove seu próprio banco e login temporários, sem resetar um banco existente. `db:start` inicia somente PostgreSQL; não oferece Auth funcional. O [relatório](docs/stage-5a.md#executar-localmente) explica como provisionar o login restrito e configurar um emissor JWT compatível para executar o HTTP manualmente. Nenhum projeto remoto, push ou deploy foi realizado nesta etapa.

## Identidade e perfis — Etapa 5B

Conta opcional com cadastro por e-mail/senha, confirmação, login, persistência, refresh, recuperação, logout e perfil remoto privado. O perfil local e o envelope `matchmaking-local-v1` foram preservados. A [auditoria da retomada 5B](docs/stage-5b.md) registra o trabalho anterior reaproveitado, correções, testes reais, limites de revogação e roteiro para o S25 Ultra.

Para Auth local, com Docker ativo:

```powershell
npm.cmd run auth:local
npm.cmd run web
```

O primeiro comando preserva volumes/chaves e prepara `.env.local` apenas se ausente, com configurações públicas. API em `127.0.0.1:54321`, e-mails capturados no [Mailpit local](http://127.0.0.1:54324). Confirme/recupere no mesmo navegador e origem que iniciaram o fluxo. Não coloque segredos administrativos em `EXPO_PUBLIC_*`. Sem configuração de Auth, os campeonatos locais seguem disponíveis.

```powershell
npm.cmd run backend:test:auth
npm.cmd run backend:test:db:local
# Use Chromium instalado pelo Playwright ou configure PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
npm.cmd run test:auth:e2e
```

Esses runners capturam as credenciais locais da CLI somente em memória. Na entrega 5B, comprovaram **124 testes Jest, 60 Playwright (8 de Auth real), 3 unitários Node, 16 PostgreSQL e 7 subtestes Auth reais**. Os bundles Hermes Android/iOS foram exportados, mas os fluxos nativos ainda não foram homologados em aparelho. No S25, use a URL LAN do computador, as portas e os redirects exatos do [roteiro 5B](docs/stage-5b.md#galaxy-s25-ultra--preparação-e-roteiro-pendente). A validação ampliada da 5C está no relatório seguinte.

## Campeonatos na conta — Etapa 5C

A [entrega 5C](docs/stage-5c.md) amplia a API Node com criação, lista paginada, detalhes consistentes, participantes, sorteio e importação idempotente. Placares/correções continuam transacionais. O cliente usa as mesmas telas e animações; uma alteração remota só aparece como salva depois da confirmação do servidor. Perda da resposta permite repetir o comando original; conflito exige reler e revisar a intenção.

Com Node 24 e Docker ativo, em um terminal:

```powershell
npm.cmd run auth:local
npm.cmd run api:local
```

`api:local` usa um login restrito temporário, guardado somente em memória e removido ao encerrar normalmente. Não copia credenciais administrativas para o app. Em outro terminal:

```powershell
$env:EXPO_PUBLIC_MATCHMAKING_API_URL = 'http://127.0.0.1:8090'
npm.cmd run web
```

As configurações públicas de Auth continuam no `.env.local` ignorado e preservado. Consulte `.env.example`. `127.0.0.1` serve para o navegador do computador; para telefone físico, siga o [roteiro 5C](docs/stage-5c.md#galaxy-s25-ultra--roteiro-pendente). O telefone acessa APIs, nunca a porta PostgreSQL.

Use `npm.cmd run test:auth:e2e` para compilar o serviço, iniciar a API temporária e executar também os casos online reais. O build recebe somente configurações públicas. `test:e2e` comum sem as variáveis de teste mantém os casos Auth/online como skipped. Não execute outra exportação web enquanto o preview da suíte lê `dist`.

Validação final 5C: **140 testes Jest/23 suítes, 84 Playwright, 24 PostgreSQL, 3 Node e 7 subtestes Auth + pai**, aprovados. TypeScript/lint, build backend, export web e bundles Hermes Android/iOS também passaram. A stack de teste é local; os bundles não representam homologação em aparelho.

## Convites e entrada de amigos — Etapa 5D

A [entrega 5D](docs/stage-5d.md) acrescenta convites reais para jogar ou assistir, com link, código e QR gerado no dispositivo. O organizador cria/revoga convites e consulta os membros na sala. Quem recebe pode usar a conta atual ou iniciar uma sessão convidada sem e-mail/senha; só a confirmação explícita ocupa vaga. Participantes e espectadores consultam resultados, e o organizador continua responsável por alterá-los.

O aceite confirma membership, jogador quando necessário, uso e recibo na mesma transação PostgreSQL. Última vaga/uso, expiração, revogação e repetição após resposta perdida são validados pelo servidor. A 5D entregou atualização manual; a sincronização automática foi acrescentada na 5E abaixo.

Execute os mesmos `auth:local`, `api:local` e `web` descritos acima. A API prepara um pepper privado em `backend/.invite-pepper`, ignorado e preservado; não o copie para o cliente. A origem padrão dos convites é `http://127.0.0.1:8081`, válida somente no computador. Configure `MATCHMAKING_INVITE_BASE_URL` no processo servidor para outra origem de desenvolvimento. O [roteiro S25](docs/stage-5d.md#galaxy-s25-ultra-e-dois-dispositivos--roteiro-pendente) explica a LAN, portas e CORS exato; nenhum domínio público ou App Link foi configurado.

Sessão convidada não tem recuperação por e-mail: sair, limpar dados ou mudar de instalação pode perder o acesso. Ela não cria/importa/organiza campeonatos. Link/código aparecem apenas na criação e não podem ser recuperados do banco. Uma aceitação pendente guarda temporariamente a credencial no journal da própria identidade para repetir exatamente a operação; ela é removida após confirmação.

Validação local: **164 Jest/25 suítes, 96 Playwright, 37 PostgreSQL, 5 Node e 15 no runner Auth real**, aprovados. TypeScript/lint, compatibilidade Expo, builds web/backend e bundles Hermes Android/iOS passaram. Aparelhos e deep links instalados continuam pendentes. Para navegador no telefone, Auth exige HTTPS/contexto seguro; HTTP LAN serve à prévia e ao caminho nativo de desenvolvimento, sem reduzir a exigência WebCrypto.

## Sincronização autorizada — Etapa 5E

A [entrega 5E](docs/stage-5e.md) acrescenta Supabase Realtime local com JWT real e sinais mínimos sob RLS. Entrada de amigos, acessos, sorteio, placares, correções e campeão atualizam nas sessões autorizadas. Cada sinal provoca releitura consistente pela API; o motor e a concorrência transacional permanecem os mesmos. O aplicativo informa Conectando/Conectado/Reconectando/Sem conexão/Atualizando/Acesso encerrado e preserva atualização manual.

`auth:local` inicia também Realtime pelo proxy Supabase na porta **54321**. Use os mesmos `api:local` e `web` acima. Ao atualizar uma stack antiga sem Realtime, encerre seus processos e execute `npx.cmd supabase stop` padrão, seguido de `auth:local`, preservando volumes e chaves. Em duas sessões independentes, abra o mesmo campeonato admitido e aguarde **Conectado** antes de conferir atualização automática.

```powershell
npm.cmd run backend:test:db:local
npm.cmd run backend:test:auth
$env:MATCHMAKING_TEST_REALTIME_RESTART = '1'
npm.cmd run backend:test:realtime
Remove-Item Env:MATCHMAKING_TEST_REALTIME_RESTART
npm.cmd run test:auth:e2e
```

Execute os runners em sequência. A variável autoriza a prova que para/reinicia **somente o container Realtime local identificado**, restaurado em `finally`; sem ela o runner falha nesse caso. Não execute essa interrupção junto de outras suítes. O [relatório](docs/stage-5e.md) registra as provas e o [roteiro S25](docs/stage-5e.md#galaxy-s25-ultra-e-segundo-dispositivo--pendente), incluindo LAN/Auth/API/WebSocket e limites de HTTPS.

Remoção de acesso retira o snapshot quando a invalidação chega ou na revalidação posterior. Offline pode conservar dados já recebidos; não há garantia de apagar cópias anteriores. Uma edição de placar aberta mantém sua revisão inicial e exige revisão explícita após mudança remota. Reconexão recupera leitura e não reenvia comandos automaticamente.

Validação local final: **199 Jest/30 suítes, 112 Playwright, 48 PostgreSQL, 5 Node, 15 Auth e 10 Realtime**, aprovados. A prova Realtime usa WebSockets reais, rollback, revogação, entrega invertida/duplicada e reinício isolado do serviço. TypeScript/lint, builds web/backend, bundles Hermes Android/iOS e compatibilidade Expo passaram. A execução em aparelhos permanece pendente.

## Limitações e próxima etapa

Identidade/perfil, campeonatos remotos, convites e sincronização funcionam com os serviços locais configurados. Notificações push e operação pública continuam pendentes. Não há backup remoto ou ambiente de produção. O cache remoto é de memória por identidade; o journal separado guarda tentativas exatas, nomes/snapshots e, durante uma aceitação pendente, a credencial do convite. Não guarda tokens de sessão e não é sincronização offline. Pontos corridos e fase de grupos continuam futuros. Limpar dados ou desinstalar pode remover campeonatos locais e metadados de retomada.

A validação web foi feita no Chromium em quatro larguras (1440, 768, 375 e 320 px), com toque simulado nos projetos tablet e mobile. Safari, Firefox, aparelhos Android/iOS, leitores de tela e fontes ampliadas ainda precisam de homologação. A compilação de bundles não comprova execução nativa em aparelho.

A auditoria npm repetida na Etapa 5E apontou 22 alertas moderados e nenhum alto/crítico. As versões compatíveis do SDK foram preservadas; não foi aplicado `audit fix --force`. A revisão dos alertas transitivos continua pendente antes de publicação. Veja o [relatório 5E](docs/stage-5e.md).

**Próximo passo:** homologar sincronização e reconexão em dois dispositivos Android/iPhone e medir carga/fan-out antes de definir a operação pública. Persistência nativa, deep links, teclado e acessibilidade em aparelho continuam pendentes, assim como domínio/TLS, proteção contra abuso, retenção global e recuperação de backups.

Decisões visuais e referências: [docs/design-decisions.md](docs/design-decisions.md). O envio do código ao GitHub é separado da publicação do aplicativo. Nenhum deploy ou publicação em loja foi realizado.
