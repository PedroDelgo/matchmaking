# Validação — 18/11/2026

Ambiente: Windows, PowerShell, Node 24.22.1. O diretório inicial continha somente README e Git; não havia protótipo HTML V2 ou outros mockups. Logo oficial fornecida e preservada em assets/brand/logo.png.

## Evidências

| Verificação | Resultado |
| --- | --- |
| TypeScript strict | Aprovado com `npm.cmd run typecheck` |
| ESLint Expo | Aprovado com `npm.cmd run lint` |
| Jest + React Native Testing Library | 24 testes aprovados em 3 suítes |
| Exportação web | Aprovada com `npm.cmd run build:web` |
| Expo dependency check | `Dependencies are up to date` |
| Fluxo web em 1440×1000, 375×812 e 320×740 | Criar, adicionar, sortear, registrar, concluir, recarregar, corrigir e consultar estatísticas aprovados |
| Playwright | 6 testes aprovados: fluxo completo e sorteio de 16 pulável, em cada largura |
| Android/iOS Hermes | Bundles compilados; execução nativa não testada |

Testes de domínio incluem 4/8/16, unicidade, limites, Fisher–Yates, placares inválidos, desempate, avanços, campeão, mudança de vencedor, preservação dos ramos irmãos, preservação de descendentes com mesmo vencedor e estatísticas derivadas. Testes de persistência recarregam torneios completos, rejeitam topologia cíclica e preservam JSON corrompido. Testes de interface exercitam ações e validação em vez de apenas presença de componentes.

O Playwright captura telas em `.artifacts/`: início, criação, chaveamento, placar, campeão, estatísticas e sorteio. A revisão visual encontrou rótulos das abas sobrepostos em 320 px; o layout foi corrigido para ícone sobre texto nessa largura. Elementos decorativos foram removidos da árvore de acessibilidade, e seleções receberam labels explícitas.

## Comandos

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build:web
npm.cmd run check:deps
npm.cmd run test:e2e
npx.cmd expo export --platform android --platform ios --output-dir .artifacts/native-bundles
```

O Chromium previamente disponível no ambiente foi selecionado por `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Em uma máquina nova, execute `npx.cmd playwright install chromium`.

A primeira tentativa de compilação nativa foi bloqueada pela sandbox ao executar Hermes. A repetição com permissão de execução local produziu os dois bundles `.hbc`. Nenhum comando de publicação foi executado.

## Limites e riscos remanescentes

- Sem emuladores ou aparelhos reais: teclado nativo, áreas seguras, AsyncStorage real, desempenho das animações e folha de compartilhamento precisam ser homologados.
- Chromium não comprova comportamento de Safari/Firefox. Leitor de tela, tamanho de texto ampliado e teclado físico precisam de revisão humana.
- `npm audit --omit=dev` reportou 67 entradas: 61 altas e 6 moderadas, incluindo propagação por ferramentas Expo/Metro/Jest. O registro oferecia `picomatch` 4.0.7, ainda incluído no alerta consultado; a correção automática sugeria downgrade do Expo. Não foram aplicadas substituições globais de versões ou downgrade sem validação. Revisar antes de publicar.
- Persistência é local e não equivale a backup. Convites e formatos futuros estão explicitamente indisponíveis.
- A validação inicial ocorreu antes do envio do código ao GitHub. Não houve deploy, registro em hospedagem ou publicação em loja.
- A identidade de autor Git não estava configurada durante a implementação inicial. Para os commits solicitados posteriormente, foi reutilizada a identidade do autor do commit inicial do repositório.
