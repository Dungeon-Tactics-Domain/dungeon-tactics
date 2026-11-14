# Game design pillars — Dungeon Tactics

Source: Oct 25, 2026 grill with Fernando. Rule for this document: every design decision goes in here with its date and reason; a generic design skill was deliberately rejected (decision of Oct 25), so this file is the criterion.

## Pillars

1. **Plan, don't react.** The turn queue and each enemy's range stay visible. Losing should feel like the plan's fault, not the interface's. (Into the Breach)
2. **Height and cover matter.** Whoever is up high sees and reaches farther; cover changes the hit chance. Rewards the archer and the rogue. (FFT)
3. **Luck you can read.** Dice exist (hit and damage), but the chance is shown before confirming. Never a hidden miss. (D&D, XCOM)
4. **Mobile first.** Everything is played with one finger, in two taps and a Confirm; touch targets ≥ 44 px; the battle is saved if the app closes.
5. **Weighty choices, mistakes with an out.** Limited undo and restart in one tap: the player takes risks without a time penalty.
6. **Grim but playable.** Dark tone, short text, losses and hard choices; legibility beats atmosphere. (Darkest Dungeon as the feel to aim for)

## Measurable goals (to be validated by simulation and testing)

- Battle of 8 to 12 min (average turns per hero to be measured).
- Every battle winnable with the party at hand; no single obvious solution (AI simulation across several seeds).
- A new player understands the objective, the queue and confirm without long tutorial text (test with 3 people).
- No touch target < 44 px; contrast per the accessibility review.
- Performance: stable 30 fps on the reference phone (to be measured).

## Out for now

Permadeath, stress and afflictions, expedition with resources, hamlet. Don't block them: the hero's state persists between battles.
