# Cidades, gerenciamento do grupo, equipamento, recrutamento e classes novas

Pedido do Fernando (13/11): "crie o menu de gerenciamento de personagens igual o do FFT e cidades iguais às do FFT também, com bares, side quests, equipamentos, lojas, recrutamento; implemente novas classes; e no geral fique testando em loops para identificar bugs e melhorias de interface, UX e game feel".

Referência: só fluxo e mecânica do FFT (PS1) e do Tactics Ogre; nada de arte, texto, nome ou música (regra do projeto). Fontes já levantadas em `referencia-fft.md` e `referencia-tactics-ogre-e-fft-ui.md`.

## 1. Gerenciamento do grupo ("Formação", como no FFT)

- **Onde:** botão Grupo no mapa (tecla G, já existe a lista só de leitura em `world-ui.ts` `openParty`) e dentro de toda cidade.
- **Tela 1, lista:** retrato, nome, classe e vida de cada unidade; marca quem vai à próxima batalha (até 4) e quem fica no acampamento.
- **Tela 2, ficha da unidade** (ao escolher alguém): números (vida, velocidade, movimento, salto), habilidades com a explicação de cada uma, os 3 espaços de equipamento (arma, armadura, acessório) e as ações:
  - **Equipar:** escolhe um item do baú do grupo para cada espaço; mostra antes → depois de cada número, como o FFT.
  - **Trocar de classe:** entre as classes liberadas; as habilidades vêm da classe (aprendidas por fase, `party(n)`).
  - **Dispensar:** só recrutados; os da história ficam.
- **Dados:** o grupo salvo em `dt:grupo` (lista de unidades: base/classe, nome, equipamento, recrutado ou da história) e o baú em `dt:bau` (itens e ouro). Fronteira de confiança: `parseGroup`/`parseChest` recusam lixo, como os outros saves.

## 2. Equipamento

- **Regra (src/shared):** item é dado com stats gerais, iguais contra tudo (regra do projeto): `+vida`, `+dano` (soma na faixa das habilidades físicas ou mágicas, conforme o item), `+acerto`, `+movimento`, `+salto`, `+velocidade`. A ficha da batalha = classe + itens (o `buildDevScenario` já monta a ficha de cada unidade: soma ali).
- **Espaços:** arma (dano/acerto), armadura (vida), acessório (movimento, salto, velocidade).
- **Balanceamento:** cada item medido no simulador antes de entrar (`MEDIR=300`), a curva da campanha tem de continuar caindo fase a fase.

## 3. Cidades

- **No mapa:** pontos de cidade (Vauclair e uma no Ato II), com o mesmo jeito de entrar dos pontos de história. Entrar abre o menu da cidade em pergaminho, por cima do mapa, com a música da cidade.
- **Bar:** boatos (falas curtas que contam a história e dão dica) e **missões opcionais** — batalhas extras fora da linha principal, com regra própria (sobreviver N turnos, proteger um aliado, derrubar um chefe), que dão ouro e itens. Uma missão some depois de vencida.
- **Loja:** compra e venda de equipamento com o ouro do baú; o estoque cresce a cada ato. Mostra antes → depois na ficha de quem vai usar (como o FFT).
- **Recrutamento:** contrata uma unidade genérica de uma classe liberada, com nome sorteado; preço em ouro; o grupo tem teto (ex.: 8).
- **Ouro:** vencer uma fase dá ouro pelas estrelas; missões dão mais.

## 4. Classes novas

Cada uma com boneco KayKit existente (com `tint` quando dividir boneco) e habilidades de stats gerais:

| Classe | Papel | Ideia de números (iniciais, a medir) |
|---|---|---|
| Lanceiro | salta alto e alcança 2 casas com a lança | vida 38, mov 4, **salto 3**; Estocada longa (alcance 2, dano físico), Salto (cai do alto numa casa, com carga) |
| Monge | corpo a corpo sem arma, se cura | vida 40, mov 4, salto 2; Soco, Chute giratório (área 1), Respirar (cura a si) |
| Sacerdote | cura e proteção em área | vida 26, mov 3; Cura em área (carga), Proteção (reduz dano por 1 rodada) |
| Químico | itens que todo mundo usa | vida 30, mov 4; Poção (cura, alcance 1, sem carga), Bomba (área, empurrão) |

As classes entram liberadas aos poucos (recrutamento e troca de classe), não no elenco fixo da campanha, para não mexer na curva medida.

## 5. Testes em loop

- **Roteiros Playwright** sempre com `--mute-audio` (pedido do Fernando): campanha inteira com `?auto=1`, cada tela da cidade, compra, equipar, recrutar, missão do bar, e o grupo nas batalhas.
- **A cada bloco:** gates, medição da campanha, prints em 1280x720 e 1920x1080 e um revisor independente.

## 6. Ordem de entrega

1. Ficha da unidade no Grupo (números, habilidades, espaços de equipamento) — só leitura. **Começa em 13/11.**
2. Regra de equipamento (src/shared) + baú + Equipar na ficha, com 6–9 itens iniciais medidos.
3. Cidade de Vauclair no mapa: menu da cidade, Loja e Bar com boatos.
4. Missões do bar (2 primeiras) com recompensa em ouro e item.
5. Recrutamento e troca de classe; depois as 4 classes novas, uma por vez, cada uma medida.
6. Segunda cidade (Ato II) e estoque por ato.
