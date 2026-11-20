import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { standIn, type UnitView } from '../src/client/scene/unit-view.ts';

// Nov 20: the Quaternius snake brings its own rig and 4 clips; the KayKit gesture names play its closest one
const view = (names: string[]) => ({ clips: names.map((n) => new THREE.AnimationClip(n, 1, [])) }) as UnitView;
const snake = view([
  'SnakeArmature|Snake_Attack',
  'SnakeArmature|Snake_Idle',
  'SnakeArmature|Snake_Jump',
  'SnakeArmature|Snake_Walk',
]);

describe('stand-in clips for a model with its own rig', () => {
  it('maps each KayKit gesture to the closest own clip', () => {
    expect(standIn(snake, 'Idle')?.name).toBe('SnakeArmature|Snake_Idle');
    expect(standIn(snake, 'Walking_A')?.name).toBe('SnakeArmature|Snake_Walk');
    expect(standIn(snake, 'Hit_A')?.name).toBe('SnakeArmature|Snake_Jump');
    expect(standIn(snake, 'Jump_Start')?.name).toBe('SnakeArmature|Snake_Jump');
    expect(standIn(snake, 'Melee_1H_Attack_Chop')?.name).toBe('SnakeArmature|Snake_Attack');
    expect(standIn(snake, 'Ranged_Magic_Shoot')?.name).toBe('SnakeArmature|Snake_Attack');
  });
  it('has no fall, and a KayKit model never borrows a clip', () => {
    expect(standIn(snake, 'Death_A')).toBeUndefined();
    expect(standIn(view(['Jump_Idle', 'Idle']), 'Cheer')).toBeUndefined();
  });
});
