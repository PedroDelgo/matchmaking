# Etapa 5B — retomada de identidade, sessão e perfis

Retomada em **24/11/2026**. Identidade implementada e validada com **Supabase Auth local real**, confirmação e recuperação por e-mail capturado no Mailpit, perfis privados e comandos do backend 5A. Os torneios continuam locais. Android/iOS possuem adaptadores e bundles Hermes, mas a execução em aparelho e os deep links nativos ainda precisam de homologação.

## Estado encontrado e auditoria

A retomada começou na `main`, em `59f22fb`, quatro commits à frente de `origin/main`, sem alterações no index. Foram executados `git status`, `git branch --show-current`, `git log --oneline -20`, `git diff`, `git diff --cached` e `git ls-files --others --exclude-standard`, antes das alterações. Nenhum commit 5B existia. Os commits preservados eram:

| Commit | Entrega anterior |
| --- | --- |
| `f265f5b` | Ferramentas e Supabase local |
| `8e29231` | Integridade e acesso ao banco |
| `c17f647` | Comandos transacionais e concorrência |
| `59f22fb` | Relatório final 5A |

Já existiam alterações não commitadas em `.gitignore`, `app.json`, layout, perfil, dependências, configuração Supabase e testes SQL/PostgreSQL. Os arquivos novos incluíam cliente Supabase, controller/provider, armazenamento fragmentado, validação, telas/rotas, `AccountPanel`, migration 004, script local e testes Jest/Auth/Playwright. `.env.local` e a chave de assinatura local ignorada também foram preservados. Este relatório não existia; README e arquitetura ainda anunciavam Auth como futuro.

A base encontrada passou em TypeScript app/backend, ESLint e **115 testes Jest em 18 suítes**. O runner Node e a consulta Expo exigiram execução fora da sandbox. Docker estava parado: `docker desktop start` iniciou o engine e recuperou a stack já existente. Não foi necessário reset, remoção de volumes ou o fallback `supabase stop` do script. A base de Auth passou em cinco subtestes reais; o Playwright estava impedido de iniciar pela declaração de opções de worker dentro de `describe`. Portanto, existência de código não foi tratada como entrega previamente comprovada.

| Recurso | Estado encontrado | Trabalho da retomada | Estado final |
| --- | --- | --- | --- |
| Supabase Auth e JWT | Implementado, não validado nesta retomada | Início do Docker, health check e tokens reais ES256 | Concluído e testado localmente |
| Cadastro e confirmação | Implementados, sem evidência de UI executável | E-mail Mailpit, PKCE, login negado antes de confirmar | Concluídos e testados no navegador |
| Login e erros | Implementados | Credenciais válidas/inválidas, erro sanitizado e envio pelo teclado | Concluídos e testados |
| Sessão e persistência | Implementadas; respostas tardias incompletamente protegidas | Invalidação após stop/logout e testes de remontagem | Concluídas e testadas em SDK/Jest/web |
| Refresh e expiração | Renovação SDK; estados não distinguiam expiração | Estados `refreshing`/`expired`, refresh real após expiração do metadado persistido | Concluídos e testados; ciclo nativo em aparelho pendente |
| Logout | Implementado | Revogação real do refresh, limpeza persistida e teste de falha offline | Concluído e testado; access JWT mantém validade criptográfica |
| Armazenamento | Adaptadores implementados | Testes de sessão grande, gravação incompleta e falhas; cripto nativa PKCE | Web e lógica testados; Keychain/Keystore em aparelho não validados |
| Recuperação de senha | Implementada, não validada em UI | E-mail real, nova senha aceita, antiga/reutilização recusadas | Concluída e testada na web |
| Deep links | Callback existente; `sb_flow_id` descartado | Encaminhamento de fluxo PKCE e validação de parâmetros | Web concluída; Android/iOS bloqueados por ausência de aparelho/build instalado |
| Perfis | Migration e edição existentes | Provisionamento, datas, Unicode e edição real persistente | Concluídos e testados |
| RLS e campos protegidos | Políticas propostas em código | SQL real e Data API com contas A/B e requisição sem sessão | Concluídos e testados |
| Isolamento de contas | Cache por identidade e abort existentes | Respostas atrasadas, troca A/B, rascunho visual e estado local | Concluído e testado |
| Modo local | Funcionalidade anterior concluída | Regressão completa e comparação do envelope antes/depois de Auth | Preservado e testado |
| Testes e documentação | Novos testes escritos; relatório ausente | Correção do runner, cobertura adicional, execução e este relatório | Validação local concluída; homologações externas pendentes |

## O que foi preservado e corrigido

Foram reaproveitados o serviço único de Auth, a tabela `profiles`, as rotas e os componentes criados antes da interrupção. O diff contra `59f22fb` confirma que `src/store`, motor/domínio de torneios, tokens de tema e logo não mudaram. A chave `matchmaking-local-v1`, versão 1, o perfil local, os IDs e o rascunho continuam independentes da conta. Entrar, sair, trocar conta ou mudar apelido remoto não importa torneios nem associa participantes por nome. A aplicação abre e cria campeonatos sem configuração ou sessão de Auth.

Correções efetivas: opções `trace`/`screenshot` do Playwright movidas para o escopo do arquivo; encaminhamento de `sb_flow_id`; respostas de login/callback/senha invalidadas após desmontagem ou logout; finalizadores antigos impedidos de substituir operações novas; pausa de refresh quando o provider inicia em background; estados próprios de renovação e sessão expirada; envio dos formulários pelo teclado; build Expo sem as credenciais administrativas dos testes; recusa de parâmetros/DSN alternativos; health check; teste PostgreSQL com DSN capturado em memória; e inspeção do build web contra segredos conhecidos da stack.

A revisão do SDK instalado mostrou fallback para `Math.random` e desafio PKCE `plain` sem WebCrypto. Foi acrescentado **`expo-crypto ~58.0.8`**, compatível com o mesmo SDK 58. A adaptação nativa fornece `getRandomValues` e digest SHA-256 somente quando ausentes; outros algoritmos são recusados nessa adaptação. A web exige WebCrypto disponível. Não houve upgrade de Expo, alteração do motor ou autenticação HS256 alternativa. Os módulos previamente adicionados foram preservados: `@supabase/supabase-js 2.119.2`, `expo-secure-store ~58.0.3` e `react-native-url-polyfill 4.0.0`, reproduzidos pelo lockfile.

## Auth local e banco

`supabase/config.toml` habilita Auth, API e SMTP local. Serviços ativos: PostgreSQL, GoTrue/Auth, Kong, PostgREST e Mailpit; Realtime, Storage, Studio, Analytics, Edge e pooler seguem desativados. API em `127.0.0.1:54321`, PostgreSQL em `54322`, Mailpit em `127.0.0.1:54324`. O issuer explícito é `http://127.0.0.1:54321/auth/v1`, com JWKS ES256. Confirmação de e-mail está ativa; senha mínima de dez caracteres; rotação de refresh ativa; JWT de uma hora e e-mail de uso único com validade configurada de 900 segundos.

O script `auth:local` gera uma chave privada ES256 apenas se o arquivo ignorado não existir. Preserva chave e `.env.local` existentes, inicia a stack, verifica health e executa `migration up --local`. Quando necessário em uma instalação iniciada somente com `db start`, possui fallback de parada padrão com backup e reinício do projeto; **esse caminho não foi executado nesta retomada**. Nunca usa `--no-backup`, `db reset`, login/link ou projeto remoto. A saída da CLI que contém credenciais é capturada e não impressa. A configuração pública encontrada foi comparada silenciosamente ao destino local; os valores não são registrados neste relatório.

Migration **`20261123000400_auth_profiles.sql`**, já encontrada, estende `public.profiles` com `updated_at`. Um trigger em `auth.users` cria perfil neutro `Competidor`, sem confiar em metadados de cadastro. A migration também provisiona contas anteriores sem sobrescrever apelidos. A validação de escrita normaliza espaços, exige 2–40 pontos de código e recusa controles/invisíveis direcionais. Datas são do servidor. A função privilegiada usa nomes qualificados e `search_path = ''`, sem execução concedida aos clientes.

`authenticated` pode atualizar **somente `nickname`** e apenas a própria linha, com `USING` e `WITH CHECK` por `auth.uid()`. As políticas de leitura existentes continuam isolando o perfil. ID, criação, atualização, inserção e exclusão não ficam disponíveis ao cliente. As permissões de torneios e a role `matchmaking_command` da 5A foram preservadas. Há quatro migrations locais, sem tabela duplicada de perfis. Os asserts foram executados também em banco descartável.

## Sessão e armazenamento

O singleton Supabase é a autoridade da sessão; `AuthController` publica seu estado para `AuthProvider`/`useAuth`, sem persistir uma segunda sessão no Zustand. O estado distingue inicialização, não autenticado, autenticado, restauração/recuperação, renovação, erro e expiração. O carregamento inicial valida a identidade no Auth antes de exibir o perfil; uma falha de rede oculta os dados remotos e mantém o aplicativo local acessível.

Na web, o SDK persiste em `localStorage` com namespace por URL de projeto, separado do envelope de torneios. Não há cookie HttpOnly neste app cliente: scripts da mesma origem podem acessar a sessão, logo proteção contra XSS e HTTPS continuam requisitos antes de publicação. Android/iOS usam exclusivamente SecureStore: cada fragmento e o manifesto passam pela camada criptografada do sistema, com `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Fragmentos têm até 384 pontos de código/1536 bytes, evitando os limites históricos de valores grandes do Keychain; o manifesto só muda depois de todos os fragmentos gravarem. Gravações são serializadas. Falhas de leitura/escrita são sanitizadas, ocultam a conta e não recorrem a AsyncStorage para tokens.

O SDK faz refresh e rotação; `processLock` coordena operações nativas e o provider controla `startAutoRefresh`/`stopAutoRefresh` conforme AppState. Listeners de Auth, armazenamento e AppState são removidos no unmount. Validações concorrentes são deduplicadas; respostas antigas usam geração/identidade e abort de perfil. Uma chamada física pendente mantém a serialização durante a remontagem dos efeitos do provider: eventos de login próprios só são publicados pelo resultado validado, e a revalidação aguarda a chamada terminar. Isso foi testado com o SDK falso emitindo `SIGNED_IN` antes de resolver a Promise, como o SDK real. Troca de conta descarta cache e formulário remoto anterior. O logout local do SDK 2.119.2 remove a sessão persistida **antes** da revogação HTTP; erro de rede informa que a revogação não foi confirmada. Falha do próprio armazenamento é exibida e exige nova tentativa.

**Limite comprovado:** logout invalida o refresh token, mas o backend 5A valida criptografia/claims do access token e não consulta revogação. Um access JWT ainda válido continua aceito até expirar. A suíte verifica explicitamente esse comportamento. Verificação de sessão no servidor, gestão de aparelhos e política de revogação são pendências antes de uso público.

## E-mail, callbacks e recuperação

Cadastro e recuperação usam PKCE. O e-mail é realmente enviado pelo Auth ao SMTP local e capturado no Mailpit; **não houve entrega por um provedor externo**. O callback troca `code` junto de `sb_flow_id`, quando presente, e deduplica o mesmo par. Parâmetros inválidos/duplicados são recusados, erros são genéricos, query sensível é removida do histórico web e uma resposta após sair da rota não navega novamente. O reset exige a sessão marcada pelo evento `PASSWORD_RECOVERY`; visitar diretamente a rota não libera o formulário. Depois de atualizar a senha, a sessão local é encerrada e o usuário entra novamente.

O verificador PKCE deve permanecer no armazenamento que iniciou o fluxo: abra o e-mail no mesmo navegador/origem ou na mesma instalação nativa. Alterar entre `localhost` e `127.0.0.1`, limpar dados ou abrir o link em outro navegador pode impedir a troca. Nesse caso, solicite novo link no destino correto. Link reutilizado foi recusado pelo Auth real. Link efetivamente envelhecido até expirar não foi aguardado; erros de expiração possuem tratamento/testes de contrato e o caso de reutilização foi exercitado ponta a ponta.

As rotas Expo Router são `/auth/sign-in`, `/auth/sign-up`, `/auth/forgot-password`, `/auth/callback` e `/auth/reset-password`. O esquema nativo `matchmaking` foi preservado; em Expo Go `Linking.createURL` usa a rota `exp://.../--/auth/callback`. A allowlist padrão cobre as origens web locais e `matchmaking://auth/callback`; a URL `exp://` real precisa ser acrescentada explicitamente antes do teste em telefone. Build instalado exige testar o esquema efetivo, abertura fria/quente e retorno do e-mail. Não se declara homologação nativa com base em bundles.

## Interface e referências

O sistema existente e [as decisões visuais](design-decisions.md) foram a referência principal: branco, grafite `#191919`, laranja `#FF6A00`, Barlow Condensed ExtraBold, Inter, logo original, Shell, Field, Button e Notice. A skill Refero foi consultada para formulários/foco/acessibilidade. A consulta ao catálogo ao vivo retornou `NO_SUBSCRIPTION`; foram usados o design já pesquisado do produto e o guia de craft fornecido pela skill. Não foi criado redesign. Foram inspecionadas capturas de cadastro em 320 px e login em 1440 px, sem overflow horizontal. As capturas vazias ficam em `.artifacts/`, ignoradas.

Conta e perfil local aparecem separados. Formulários têm rótulos, preenchimento automático adequado, senha protegida, confirmação, erros e loading, e utilizam o tratamento de teclado/safe areas já existente no Shell. A validação de teclado físico real, teclado Samsung, leitor de tela e fonte ampliada depende do roteiro abaixo.

## Validação executada

| Comando/verificação | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | TypeScript app strict aprovado |
| `npm.cmd run backend:typecheck` | TypeScript backend strict aprovado |
| `npm.cmd run lint` | ESLint aprovado |
| `npm.cmd test -- --silent` | **124 testes, 21 suítes**, aprovados |
| `npm.cmd run backend:test` | **3 testes Node**, aprovados |
| `npm.cmd run backend:test:db:local` | **16 testes PostgreSQL**, migrations e asserts SQL aprovados |
| `npm.cmd run backend:test:auth` | **7 subtestes + teste pai (8 no runner)** de Auth real, aprovados |
| `npm.cmd run test:auth:e2e` | **60 casos** nas quatro larguras: 52 regressões locais e 8 Auth real |
| `npm.cmd run test:auth:e2e -- e2e/auth.spec.ts` | Oito casos Auth reexecutados após o ajuste final de serialização; sem mocks |
| Export web / build backend | Aprovados; executados automaticamente pelos runners e scripts de build |
| `npm.cmd run check:deps` | `Dependencies are up to date` |
| `npx.cmd expo export --platform android --platform ios --output-dir .artifacts/stage5b-native` | Dois bundles Hermes aprovados; não APK/IPA nem execução em aparelho |
| Auditoria npm | 22 moderados, zero altos/críticos; sem `audit fix --force` |

Playwright utiliza Chromium do **Microsoft Edge instalado**, indicado por `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, em 1440/768/375/320 px. A primeira tentativa esbarrou nas opções de worker no lugar errado; corrigidas. A segunda não encontrou o executável Chromium esperado pela versão Playwright; foi usado o caminho do Edge permitido pela configuração existente. Uma rodada completa passou. Outra terminou com 58 aprovações e dois HTTP 404: uma exportação manual concorrente substituiu `dist` durante o preview. Essa interferência de execução foi identificada nos traces e a suíte foi repetida com o build fixo, sem alterar as expectativas dos testes. Nenhum teste foi removido ou relaxado.

Auth no navegador cobre cadastro/confirmação, perfis A/B, apelido persistente após reload, reentrada, logout, recuperação por e-mail, senha antiga recusada, link consumido rejeitado, criação sem conta e comparação byte a byte do envelope local antes/depois. Traces e screenshots estão desligados nesse arquivo para não armazenar senhas/códigos. Testes de torneios mantêm as opções anteriores. Sem variáveis administrativas, o `test:e2e` comum marca esses oito casos Auth como **skipped**; use `test:auth:e2e` para executá-los com credenciais apenas no processo de teste.

O teste Auth usa contas aleatórias reais e PostgREST/RLS, além do caminho **token Auth → HTTP compilado → JWKS real → login PostgreSQL restrito → comando/recibo**. Rejeita ator externo e token inválido. Outro caso move apenas o metadado de expiração da sessão persistida para o passado e comprova refresh automático real, sem forjar um JWT. Os testes Node preservam as negativas de assinatura, issuer, audience, expiração e contrato. A suíte PostgreSQL conserva concorrência, idempotência e rollback da 5A e acrescenta perfil/Unicode/grants.

`backend:test:db` sem DSN falhou explicitamente, como esperado, pois `backend/.env` não existia. Acrescentou-se `backend:test:db:local`, que captura o DSN local da CLI em memória, compila o serviço e chama o mesmo runner descartável. Não foi criado arquivo com senha. A sandbox também bloqueou inicialmente `tsx`, Docker e consultas npm/Expo; os comandos necessários foram reexecutados com o acesso local autorizado. Esses bloqueios não foram contabilizados como aprovações.

Os runners removem apenas usuários/e-mails, fixture de torneio e login aleatórios daquela execução. A inspeção também encontrou um defeito de limpeza do E2E: endpoints individuais Mailpit recusavam DELETE e a resposta final não era conferida. A limpeza passou a usar o endpoint de lote com IDs explícitos e verificação de sucesso, como a suíte Auth. Foram identificadas 36 mensagens das rodadas desta retomada por destinatário aleatório e data posterior à correção inicial do arquivo E2E; só esses IDs foram removidos. A suíte 5A cria/remove seu banco próprio. Interrupção forçada pode impedir `finally`: inspecione os identificadores antes de qualquer limpeza. Não há rotina que apague todas as contas ou mensagens. Segredos conhecidos da stack e a parte privada da chave foram procurados nos fontes revisáveis e nos artefatos web/Hermes sem imprimir seus valores; nenhuma ocorrência encontrada.

Após a rodada completa de 60 aprovações, os oito casos Auth passaram novamente com o controller final. A inspeção final confirmou **quatro migrations, zero bancos/logins temporários, zero contas Auth de teste e zero e-mails temporários remanescentes**. A configuração pública ignorada corresponde à stack local. Não há falha remanescente nos comandos de validação acima.

## Executar no computador

Requisitos: Node 24, Docker Desktop ativo e portas livres. Na raiz:

```powershell
npm.cmd ci
docker desktop start
npm.cmd run auth:local
npm.cmd run web
```

O script prepara `.env.local` apenas se ausente, com URL e chave **pública**. Se já existe, revise-o localmente usando `.env.example`; ele não é sobrescrito. Não copie chaves administrativas para `EXPO_PUBLIC_*`. O Expo abre em `8081`; os callbacks padrão usam essa porta. Se houver conflito, pare apenas o servidor que você iniciou ou ajuste explicitamente a allowlist/origem para a nova porta.

Confirme as contas pelo [Mailpit local](http://127.0.0.1:54324). Use a mesma origem do navegador que iniciou cadastro/recuperação. Para export e preview:

```powershell
npm.cmd run build:web
npm.cmd run preview
```

Para regressões:

```powershell
npm.cmd run typecheck
npm.cmd run backend:typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run backend:test
npm.cmd run backend:test:db:local
npm.cmd run backend:test:auth
npm.cmd run check:deps
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm.cmd run test:auth:e2e
```

Se preferir o Chromium do Playwright, instale-o com `npx.cmd playwright install chromium` e não defina o caminho do Edge. O backend manual continua usando o login exclusivo e as instruções da [5A](stage-5a.md#executar-localmente); seu `SUPABASE_AUTH_URL` local agora pode usar o issuer real descrito acima. O app 5B não chama `/commands` nem oferece criação/importação remota.

## Galaxy S25 Ultra — preparação e roteiro pendente

**Não há aparelho conectado nem development build instalado disponível nesta execução.** Os passos a seguir preparam o teste; não representam resultados obtidos no S25. A execução iOS também permanece pendente.

1. Use computador e S25 na mesma LAN privada, sem isolamento entre clientes do Wi-Fi. Descubra o IPv4 da interface ativa com `Get-NetIPConfiguration`. No telefone, `127.0.0.1` aponta ao próprio telefone.
2. Execute `npm.cmd run auth:local` no computador. Em `.env.local`, use `EXPO_PUBLIC_SUPABASE_URL=http://<IP_PRIVADO_DO_PC>:54321`, mantendo somente a chave pública local. HTTP em IP privado é aceito apenas no build de desenvolvimento; produção exige HTTPS. O telefone fala com Auth/Data API, **nunca com PostgreSQL/54322**.
3. Para os links de e-mail abrirem no telefone, ajuste localmente `auth.external_url` para `http://<IP_PRIVADO_DO_PC>:54321/auth/v1`. Mantenha `jwt_issuer` em loopback nesta prova para o backend local continuar validando o issuer fixo, sem permitir HTTP LAN no verificador de produção. As duas opções têm funções diferentes: endereço navegável do e-mail e claim `iss`. Reverta essa edição local ao terminar.
4. Inicie `npx.cmd expo start --go --lan --clear` e abra o QR do Expo Go. A porta Metro padrão é `8081`. Adicione à `auth.additional_redirect_urls` a URL **exata** `exp://<IP_PRIVADO_DO_PC>:8081/--/auth/callback` correspondente ao endereço atual do Expo. Não use wildcard geral. Para build instalado, a allowlist já inclui `matchmaking://auth/callback`; confirme a URL efetivamente retornada por `Linking.createURL` nesse build.
5. Alterações da configuração Auth exigem reiniciar somente a stack deste projeto com `npx.cmd supabase stop` seguido de `npm.cmd run auth:local`, **sem `--no-backup` ou reset**. Termine os testes antes: isso interrompe conexões. Preserve o volume e a chave de assinatura. Esse ajuste LAN/reinício não foi necessário nem executado na validação loopback registrada acima.
6. No Firewall do Windows, permita apenas TCP `54321` (Auth/Data API) e `8081` (Metro), perfil **Privado**, origem igual ao IP do S25 ou à LAN de teste. Por exemplo, em PowerShell administrativo e substituindo o placeholder: `New-NetFirewallRule -DisplayName 'Matchmaking Auth S25 teste' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 54321,8081 -Profile Private -RemoteAddress '<IP_DO_S25>'`. Confira antes regras amplas já existentes. A CLI Docker publica portas em todas as interfaces por padrão; **não crie permissão LAN para 54322 ou 54324**, não encaminhe portas no roteador e não use rede pública. O firewall não foi alterado nesta entrega. Para isolamento estritamente em loopback, a documentação Supabase descreve rede Docker com binding em `127.0.0.1`; isso impede o acesso LAN direto do aparelho até preparar um caminho específico de teste.
7. No computador, abra Mailpit em `127.0.0.1:54324`. Copie o link individual de confirmação/recuperação para o telefone, mantendo o mesmo Expo/armazenamento que iniciou a solicitação. Não exponha a caixa de e-mails na LAN; ela contém links de acesso. Não registre o link em Git, prints ou logs. Após cadastro iniciado no Expo Go, tentar consumi-lo no navegador do PC pode perder a troca PKCE.
8. Teste cadastro, confirmação e login; fechamento/abertura do Expo Go; background/foreground; refresh; logout; reinício após logout; credencial inválida; perfil editado e persistido; contas A/B; modo avião e falha de armazenamento quando reproduzível. Compare torneios, perfil local e rascunho antes/depois; nenhuma associação por apelido é esperada.
9. Solicite recuperação no próprio aparelho, abra o e-mail no destino correto, defina senha nova, valide login novo e rejeição da antiga. Teste link repetido/expirado, abertura fria/quente, voltar/navegação, teclado Samsung, safe areas, fonte ampliada e TalkBack. Se Expo Go não entregar o esquema/retorno, conclua a prova em development build com o esquema `matchmaking`; não marque como homologado apenas porque o formulário abriu.
10. Ao terminar, remova somente a regra de firewall que você criou, reverta as edições LAN e volte a URL pública do cliente para loopback no computador. Não há túnel de Auth/banco configurado. O túnel Metro do Expo, por si só, não encaminha Auth nem torna os e-mails acessíveis.

## Arquivos e Git

Novos arquivos preservados/concluídos: `.env.example`, `app/auth/*`, `src/features/auth/*`, `src/screens/AuthScreen.tsx`, `src/components/AccountPanel.tsx`, `scripts/auth-local.mjs`, migration 004, `backend/test/auth.integration.ts`, `e2e/auth.spec.ts`, testes de sessão/fluxos, e este relatório. Acrescentados nesta retomada: adaptação/teste Crypto, testes da configuração do cliente e do provider. Modificados: dependências/lockfile, `.gitignore`, `app.json`, layout, tela de perfil, configuração Supabase, asserts SQL, teste PostgreSQL, README e nota de continuidade da arquitetura.

Commits desta retomada, com stage seletivo e validação:

| Commit | Conteúdo |
| --- | --- |
| `be66b2b` | `chore(auth): configure local Supabase and secure client tooling` |
| `cb7f0b0` | `feat(profile): provision private account profiles` |
| `7089982` | `feat(auth): persist secure sessions and isolate accounts` |
| `065fcda` | `feat(auth): complete account and password recovery screens` |
| `3ab1cf1` | `test(auth): verify real sessions and backend command authorization` |
| `b657466` | `fix(auth): serialize pending requests across provider remounts` |
| Commit deste relatório | `docs: finalize stage five identity audit`; hash em `git log` e na resposta final |

Autor existente reutilizado por comando, sem alterar a configuração Git. Não houve reset, clean, amend, push, force push, deploy ou publicação. `.env.local`, chaves privadas, builds, capturas e traces permanecem ignorados.

## Limitações e próxima etapa

Pendentes: homologação Android/iOS, Keychain/Keystore e AppState reais, deep links em build instalado, Safari/Firefox, acessibilidade em leitor de tela, e-mail externo, TLS/domínio público, política de revogação imediata e operação/abuso/observabilidade de produção. Os 22 avisos moderados transitivos do conjunto Expo/Jest continuam sujeitos a revisão compatível antes de publicação. A execução local não oferece garantias de disponibilidade nem backup remoto.

A 5B entrega identidade e perfis. **5C** deverá oferecer leitura/criação remota e importação idempotente com consentimento, preservar IDs e envelope locais, definir isolamento de cache por conta e validar a fronteira transacional já existente. Permanecem fora desta entrega convites/QR, multiplayer, Realtime, rankings globais, pagamentos e sincronização entre celulares.

Referências oficiais consultadas: [React Native/Auth e AppState](https://supabase.com/docs/guides/auth/quickstarts/react-native), [configuração da CLI](https://supabase.com/docs/guides/local-development/cli/config), [desenvolvimento local e rede Docker](https://supabase.com/docs/guides/local-development), [SecureStore e limites](https://docs.expo.dev/versions/latest/sdk/securestore/), [Expo Crypto](https://docs.expo.dev/versions/latest/sdk/crypto/) e [deep links Expo](https://docs.expo.dev/linking/into-your-app/). Os comportamentos específicos de PKCE e logout foram também conferidos no código do SDK instalado, sem presumir equivalência entre versões.
