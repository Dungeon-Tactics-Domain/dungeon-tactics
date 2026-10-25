# Pilares de game design — Dungeon Tactics

Fonte: grill de 25/10/2026 com o Fernando. Regra deste documento: toda decisão de design entra aqui com data e porquê; uma skill de design genérica foi recusada de propósito (decisão de 25/10), então este arquivo é o critério.

## Pilares

1. **Planejar, não reagir.** A fila de turnos e o alcance de cada inimigo ficam visíveis. Perder deve parecer culpa do plano, não da interface. (Into the Breach)
2. **Altura e cobertura importam.** Quem está no alto enxerga e alcança mais; cobertura muda a chance de acerto. Valoriza arqueiro e ladino. (FFT)
3. **Sorte com leitura.** Dado existe (acerto e dano), mas a chance aparece antes de confirmar. Nunca erro escondido. (D&D, XCOM)
4. **Celular primeiro.** Tudo se joga com um dedo, em dois toques e um Confirmar; toque ≥ 44 px; batalha salva se o app fecha.
5. **Escolhas com peso, erro com saída.** Desfazer limitado e reiniciar em um toque: o jogador arrisca sem punição de tempo.
6. **Sombrio mas jogável.** Tom dark, texto curto, perdas e escolhas difíceis; legibilidade vence atmosfera. (Darkest Dungeon como norte de sensação)

## Metas mensuráveis (a validar por simulação e teste)

- Batalha de 8 a 12 min (turnos médios por herói a medir).
- Cada batalha vencível com o grupo da hora; nenhuma solução única óbvia (simulação com IA em várias sementes).
- Novo jogador entende objetivo, fila e confirmar sem texto de tutorial longo (teste com 3 pessoas).
- Nenhum alvo de toque < 44 px; contraste conforme a revisão de acessibilidade.
- Desempenho: 30 fps estáveis no celular de referência (a medir).

## Fora por ora

Morte permanente, estresse e aflições, expedição com recursos, vila. Não bloquear: o estado do herói persiste entre batalhas.
