import { describe, expect, it } from 'vitest';
import { parseShotRules } from '../src/client/shot-debug.ts';
import { SHOT_DEFAULTS } from '../src/shared/battle/shot-rules.ts';

// The debug panel's shot rules read back from the browser (dt:shot-rules): each field on its own, a doubtful one to its default

describe('the saved shot rules', () => {
  it('anything that is not an object reads as the defaults', () => {
    for (const raw of [null, 'x', 3, []]) expect(parseShotRules(raw)).toEqual(SHOT_DEFAULTS);
  });
  it('keeps the good fields and drops each bad one alone', () => {
    const r = parseShotRules({
      launch: false,
      parts: 'yes',
      coverWeight: 0.5,
      forms: { humanoid: [0.3, 0.8], quadruped: [0.9, 0.2] }, // a range turned over
      aims: { quadruped: [0.1, 0.33], humanoid: [0.2, 2] }, // 0.33 is no 5% step, 2 is over 1
    });
    expect(r.launch).toBe(false);
    expect(r.parts).toBe(SHOT_DEFAULTS.parts);
    expect(r.coverWeight).toBe(0.5);
    expect(r.forms.humanoid).toEqual([0.3, 0.8]);
    expect(r.forms.quadruped).toEqual(SHOT_DEFAULTS.forms.quadruped);
    expect(r.aims.quadruped).toEqual(SHOT_DEFAULTS.aims.quadruped);
    expect(r.aims.humanoid).toEqual(SHOT_DEFAULTS.aims.humanoid);
    expect(r.aims.flying).toEqual(SHOT_DEFAULTS.aims.flying);
  });
});
