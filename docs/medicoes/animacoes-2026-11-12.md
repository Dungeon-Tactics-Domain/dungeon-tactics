# Animações por habilidade (12/11/2026)

Pedido do Fernando (12/11): "animacoes parecidas com cada uma do final fantasy tactics". Cada habilidade ganhou um gesto e um efeito próprios, com o mesmo papel da habilidade correspondente no FFT. O visual é todo nosso:

- **Gestos:** os clipes KayKit que os bonecos já tinham, mais 13 do KayKit Character Animations 1.1 (Rig_Medium, CC0), juntos em `public/models/animacoes.glb` (312 KB) por `scripts/assets/anim-pack.mjs`.
- **Efeitos:** formas simples do Three (arco de corte, projétil, anel, pedacinhos de luz). Nada foi copiado do jogo original.

Tabela no código: `src/client/fx.ts` (`LOOKS`); efeitos em `playFx`; aura de carga em `chargeAura`.

## Habilidade → gesto → efeito

| Habilidade | Gesto (clipe) | Gesto enquanto carrega | Efeito | Papel no FFT que inspirou |
|---|---|---|---|---|
| Golpe | Melee_1H_Attack_Chop | — | arco de corte branco no alvo | ataque de espada |
| Golpe pesado | Melee_2H_Attack_Chop | Melee_2H_Idle + aura laranja | arco grande dourado e estilhaços | golpe forte lento |
| Escudada | Melee_Block_Attack | Melee_2H_Idle + aura | poeira no impacto | empurrão |
| Giro | 2H_Melee_Attack_Spin | Melee_2H_Idle + aura | anel branco abrindo em volta | golpe em área |
| Tiro | Ranged_Bow_Release | — | flecha reta | arco |
| Tiro mirado | Ranged_Bow_Release | Ranged_Bow_Aiming_Idle + aura | flecha reta | Carga do Arqueiro |
| Tiro de recuo | Ranged_Bow_Release | Ranged_Bow_Aiming_Idle + aura | flecha reta | arco |
| Adaga, Facada | Melee_1H_Attack_Stab | — | arco curto | faca |
| Faca arremessada | Throw | — | faca voando | Arremessar |
| Raio de fogo | Ranged_Magic_Shoot | — | bola de fogo voando e anel no impacto | Fogo |
| Explosão | Ranged_Magic_Raise | Ranged_Magic_Spellcasting + aura azul | anel de fogo grande e faíscas | magia em área |
| Rajada | Ranged_Magic_Shoot | Ranged_Magic_Spellcasting + aura azul | anel de vento | magia de empurrão |
| Cura | Ranged_Magic_Raise | Ranged_Magic_Spellcasting + aura azul | luz verde subindo | Cura (luz subindo) |
| Rasteira | Unarmed_Melee_Attack_Kick | Melee_2H_Idle + aura | poeira | — |
| Golpe mortal | Melee_1H_Attack_Slice_Diagonal | Melee_2H_Idle + aura | arco grande e estilhaços | golpe forte lento |
| Machadada | Melee_2H_Attack_Chop | Melee_2H_Idle + aura | arco grande e estilhaços | machado |
| Pancada | Melee_Unarmed_Attack_Punch_A | Melee_2H_Idle + aura | poeira | soco |
| Estudo: Atacar | Melee_1H_Attack_Chop (arqueiro: arco; químico: estocada) | — | corte ou flecha | ATTACK |
| Estudo: Arremessar pedra | Throw | — | pedra em arco e poeira | Throw Stone |
| Estudo: Investida | Dodge_Forward, avançando meia casa e voltando | — | poeira | Dash (avanço rápido) |
| Estudo: Acumular, Grito | Cheer | — | luz dourada subindo | Accumulate, Yell |
| Estudo: Desejo | Ranged_Magic_Raise | — | luz verde subindo | Wish |
| Estudo: Poção | Throw | — | frasco em arco e luz verde | Throw Item |
| Estudo: Quebras | Melee_1H_Attack_Chop | — | corte e luz roxa descendo | Battle Skill |
| Estudo: Carga +1 e +2 | Ranged_Bow_Release | Ranged_Bow_Aiming_Idle + aura laranja | flecha | Charge |
| Estudo: Fogo | Ranged_Magic_Shoot | Ranged_Magic_Spellcasting + aura azul | anel de fogo e faíscas | Fire |
| Estudo: Cura | Ranged_Magic_Raise | Ranged_Magic_Spellcasting + aura azul | luz verde subindo | Cure |

A aura de carga é azul para magia e laranja para golpe físico, como o brilho de quem conjura no FFT. Ela fica no chão até a carga sair ou ser desfeita.

## Tempos novos (estimativa, em `src/client/timing.ts`)

- `projectile`: 280 ms, o voo da flecha, da faca e da bola de fogo. Pedra e frasco em arco levam 1,4 vez isso.
- `lunge`: 260 ms, o avanço e a volta da Investida.

## Conferido

- Vitrine gravada (`docs/medicoes/animacoes/vitrine-animacoes.webm`, 3 min, 1280x720): as 17 habilidades acima foram usadas pelo jogo de verdade (tecla da barra, mouse no alvo, dois cliques e, nas de carga, esperar até saírem), com 0 erro no console.
- A vitrine achou um bug no motor, corrigido com teste (`tests/battle-charge.test.ts`): quando quem carrega morria, a fila tentava mostrar a carga dele e o HUD quebrava. Agora a carga de quem morre some, e a que seguia quem morreu passa a mirar a casa onde ele estava.
- Também mudou o resumo da ação: ação sem resultado num alvo (Acumular, Grito) agora aparece ("Ramza: Acumular"); a prévia dessas habilidades diz em quem e o efeito, no lugar de "dano 0 · ALIADO!".
- Gates: typecheck 0 erros, 178 testes passando, build ok. Simulador igual ao do bloco das regras.

## Sem conferir

- Quadro a quadro, se cada efeito se lê bem em todos os ângulos de câmera e com o pixel art em 3 e 4 px.
- A Rajada e o Tiro de recuo fora da vitrine (mesmos efeitos de outras habilidades).
