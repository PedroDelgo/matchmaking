# Etapa 5D — convites e admissão de amigos

Retomada em **25/11/2026**. **Em implementação:** os blocos abaixo registram progresso verificável e serão fechados após integração, regressões e revisão final. Não representam homologação nativa ou serviço público.

## Base auditada

`main` limpa em `f4cabfe`, sincronizada com `origin/main`. O push solicitado após a 5C enviou os 19 commits anteriores; o estado histórico do relatório 5C permanece preservado. Executados status, branch, log de 25 commits, diffs e arquivos não rastreados. Não havia trabalho 5D iniciado. Lidos README, relatórios 5A–5C, arquitetura, decisões visuais, migrations/RLS, Auth, membros, comandos, repositório, store, sala, rotas e testes.

Base reconfirmada: TypeScript app/backend, ESLint, 140 Jest/23 suítes, 3 Node, 24 PostgreSQL e Auth real (7 subtestes + pai). A matriz de 84 E2E ainda está em execução no registro inicial. Docker estava parado; foi iniciado. A primeira chamada ocorreu antes de o engine ficar pronto; a repetição recuperou a stack sem reset, remoção de volumes ou mudanças de credenciais.

## Blocos

- A: migration 006 acrescenta convites privados, recibos/eventos, limites de tentativa e vínculo explícito de membership ao participante. RLS/grants e trigger de proprietário permanente; validada no banco descartável com as 24 integrações existentes.
- B: backend em implementação; preview não consome uso, aceitação bloqueia raiz antes do convite, contador/participante/membro/evento/recibo confirmam juntos. Testes novos pendentes.
- C: aplicativo, QR e sessões convidadas pendentes.
- D: integração Auth/E2E, regressões finais e relatório pendentes.

## Referência visual travada

Implementação direta no sistema existente: canvas branco, grafite, laranja para ação/seleção, Barlow Condensed/Inter, Shell/Panel/Field/Button/ConfirmDialog originais. A pesquisa Refero ao vivo retornou `NO_SUBSCRIPTION`; foram usados `design-decisions.md`, suas referências já pesquisadas (incluindo agrupamento de métodos de convite) e o guia de craft da skill. Não há redesign ou nova marca.

| Decisão | Fonte | Aplicação |
| --- | --- | --- |
| Uma área de convite na sala | Briefing e sala atual | Métodos link/QR/código no mesmo contexto |
| Papel explícito antes de criar | Briefing | Jogar e assistir não se confundem |
| Prévia e confirmação separadas | Briefing/segurança | Abrir link não ocupa vaga |
| Formulário curto e rótulos visíveis | Guia de craft Refero | Código com paste/autocorreção desativada; feedback acessível |
| QR real preto/branco, centralizado e ampliável | Briefing | Contraste e área livre ao redor; geração local |

## Política definida para implementação

Organizador permanente, participante e espectador têm fronteiras separadas. Supabase Anonymous Sign-ins será habilitado apenas após revisar RLS: a sessão convidada usa a role `authenticated`, com `is_anonymous=true`, e não pode criar/importar/administrar campeonatos. Não substitui sessão existente. Remover seu armazenamento ou sair perde a recuperabilidade; não há conversão/transferência automática.

Tokens terão 32 bytes aleatórios e somente digest persistido. Códigos terão oito caracteres sem 0/1/I/O, digest HMAC com segredo exclusivo do servidor e limite de tentativas persistente por IP da conexão/identidade. Headers de proxy não serão confiados. Falhas de aceitação não revertem o contador de tentativas. Links web usarão fragmento, sem enviar o segredo na URL HTTP, e serão removidos do histórico visível ao abrir a tela.

O link/código só será exibido na criação. Repetir o comando devolve metadados sem recriar o convite; não há recuperação fictícia do segredo a partir de hash. Se a resposta da criação se perder, o organizador pode conferir/revogar o convite e emitir outro explicitamente. Aceitações possuem ID/payload duráveis antes do envio e replay autorizado, sem outro uso/vaga.

Somente novos jogadores em preparação ocupam vaga; espectadores entram também após o sorteio. Nome igual nunca reivindica participante criado manualmente. Membro existente não consome outro uso nem muda de papel implicitamente. Remover um jogador competitivo conserva sua identidade reservada e o membro passa a espectador; remoção do acesso é operação separada auditada.
