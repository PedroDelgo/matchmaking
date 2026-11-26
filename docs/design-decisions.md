# Direção visual e decisões

Fonte principal: identidade oficial e briefing Matchmaking. Direção de implementação direta autorizada pelo briefing: Sports Arcade Clean, Barlow Condensed ExtraBold, Inter e paleta oficial. A logo é copiada sem redesenho para assets/brand/logo.png.

## Referências pesquisadas antes da interface

- [SAP Good Energy](https://sapgoodenergy.com): títulos esportivos compactos e rótulos utilitários. É a referência de ritmo tipográfico; imagens e identidade não são copiadas.
- [Strava](https://strava.com): canvas claro, laranja reservado para ações e momentos de competição; controles retangulares e comunidade como contexto.
- [shadcn](https://shadcn.com): divisórias leves e controles legíveis, usados apenas na informação tabular e nos formulários.
- [Target: criação de evento](https://refero.design/screens/4bc3d7ae-0af1-41f1-a561-8065bd922f71): uma decisão por etapa, seleção explícita e ação de continuidade.
- [Brilliant: ranking](https://refero.design/screens/1634846c-b8f7-46cc-9487-cb10b5645d90): posição, avatar e valores alinhados.
- [Apple Sports: estatísticas](https://refero.design/screens/233a8ef5-e081-4822-b1c8-95ddbc77003e): densidade controlada e colunas numéricas.
- [TikTok: convites](https://refero.design/flows/2756): métodos agrupados e estado explícito, retomados na interface real da 5D.

## Decisões travadas

| Decisão | Fonte | Papel | Motivo |
| --- | --- | --- | --- |
| Branco e cinza #F5F5F3 | Briefing | Canvas e superfície | Legibilidade cotidiana |
| Laranja #FF6A00 | Briefing / Strava | CTA e seleção | Hierarquia das ações |
| Grafite com laranja | Briefing | Sorteio e campeão | Reservar energia para a competição |
| Barlow Condensed / Inter | Briefing | Impacto / utilidade | Personalidade com leitura clara |
| Assistente de 3 etapas | Briefing / Target | Criação | Redução da carga de formulário |
| Árvore desktop, rodadas mobile | Briefing | Chaveamento | Aproveitar cada largura |
| Geometria de chaveamento | Produto | Ilustração nativa | Explicar o próprio produto sem imagens aleatórias |

Sem monograma: apenas a logo completa foi fornecida. Sem backend, autenticação ou convites simulados. Nenhuma publicação automática.

Na 5D, métodos link/QR/código ficam juntos na sala existente, com papel explícito, prévia mínima e aceite separado. QR preto/branco centralizado, ampliável e gerado localmente; feedback de cópia, loading/erro e atualização manual usam os componentes existentes. A skill Refero foi consultada; o catálogo ao vivo retornou `NO_SUBSCRIPTION`, então foram usadas estas referências previamente pesquisadas e o guia de craft. O [relatório 5D](stage-5d.md) discrimina as provas web e pendências nativas. Links de desenvolvimento são identificados como tal; não há domínio público ou redesign.

Na 5E, o status de conexão fica junto do contexto Na nuvem, com texto, ícone e anúncio acessível. Branco, hierarquia utilitária e controles existentes preservam as referências SAP/Strava. Conectado exige assinatura confirmada e snapshot reconciliado; queda avisa sobre dados possivelmente antigos e mantém atualização manual. Mudança durante edição exige revisão explícita. A pesquisa Refero novamente retornou `NO_SUBSCRIPTION`; foram reaproveitadas estas referências e o guia de craft, sem redesign. O [relatório 5E](stage-5e.md) registra a validação.
