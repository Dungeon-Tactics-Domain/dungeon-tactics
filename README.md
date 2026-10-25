# Dungeon Tactics

Jogo tático por turnos no navegador, com o ritmo e o layout da série Final Fantasy Tactics (nada copiado: arte, música, texto e regras próprios), bonecos KayKit em pixel art e uma campanha com história.

**Jogar (ambiente do PR 1):** https://pr-1-dungeon-tactics.fernandorffdev.com

## O que tem

- Campanha **Cinzas do Farol**: abertura narrada, criação do protagonista (nome e classe), mapa mundial com o grupo andando entre 11 pontos (7 batalhas e 4 histórias), conversas antes e depois de cada batalha com bipe de voz por personagem, 2 atos e epílogo
- Fases com objetivos diferentes (derrotar todos, proteger o Farol, derrubar o chefe), estrelas por fase (vencer, ninguém cair, Farol inteiro) e habilidades liberadas aos poucos (2, 3 e 4 por herói)
- Chefe que ocupa 2x2 casas (Colosso de Ossos), Onda sombria (área de raio 2), casas de espinhos, água rasa e funda, altura que dá alcance e acerto
- Regras de turno do FFT: custo do turno, fila de CT e magias com carga (a área acende em roxo até cair)
- Mapas: Colina do Farol, Escaramuça, Cripta Alagada, Bosque das Cinzas e Passo Gelado; menu de desenvolvedor para montar heróis, inimigos e mapa
- Músicas próprias sintetizadas no navegador (título, mapa, estrada, cripta, neve e chefe), efeitos sonoros CC0
- Teclado, mouse e controle; segurar Enter (ou ⏩ no toque) acelera a vez do inimigo; velocidade do texto ajustável
- Em português e inglês

## Stack

- **Cliente:** TypeScript, Vite, Three.js (WebGL), interface em HTML/CSS puros, Web Audio; publicado como arquivos estáticos (Cloudflare)
- **Regras:** `src/shared/battle` (puro, sem DOM), com simulador IA contra IA para medir dificuldade
- **Testes:** Vitest (regras e funções puras do cliente); roteiros Playwright para o fluxo no navegador

## Rodar

```bash
npm ci
npm run dev        # cliente em http://localhost:5173
npm run typecheck  # tipos do cliente e dos scripts
npx vitest run     # testes
npm run sim -- beacon_hill 1000   # vitória dos heróis por semente (IA contra IA)
```

No localhost, `?auto=1` faz a IA jogar pelos heróis (para testar o fim de fase sem jogar à mão).

## Contribuir

- Guia de contribuição em inglês: [CONTRIBUTING.md](CONTRIBUTING.md) (máquina, agentes e skills, fluxo, testes, balanceamento e revisão)
- Regras do código para gente e para agentes de IA (Claude Code, Codex, Cursor): [CLAUDE.md](CLAUDE.md), também lido via [AGENTS.md](AGENTS.md); cada pasta principal tem o seu `CLAUDE.md`
- Fluxo de Git (detalhes no guia de contribuição): branch da tarefa no próprio repositório (não fork) a partir do `master` → PR para o `master` com o modelo, CI verde → jogo no ar, publicado sozinho. Todo PR recebe a revisão automática do Claude; comente `@claude` num PR ou issue para pedir ajuda
- Ambiente de cada PR: todo PR (rascunho também) publica em `https://pr-<n>-dungeon-tactics.fernandorffdev.com`, apagado quando o PR fecha (`CLAUDE.md`, seção "Ambiente por PR")
- O jogo no ar é publicado sozinho quando o PR entra no `master`

## Créditos

Modelos, texturas, efeitos, sons e música de uso livre (KayKit, Kenney, ambientCG, Poly Haven, OpenGameArt); lista completa em `public/CREDITS.txt` e índice de todos os assets em [docs/ASSETS.md](docs/ASSETS.md) (todo asset novo entra lá). Biblioteca com todos os modelos grátis do KayKit para quem contribui: `assets/kaykit/`. O código nasceu do projeto Warlock Wars (mesma estrutura de CI, PR e documentação).