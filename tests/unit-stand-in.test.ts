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
  // Nov 20: the swarm creatures have their own fall; the bat flies in place of idle and walk and has its own hit
  it('plays a Death clip when the rig has one, and the bat flies to stand and walk', () => {
    const bat = view([
      'BatArmature|Bat_Flying',
      'BatArmature|Bat_Attack',
      'BatArmature|Bat_Hit',
      'BatArmature|Bat_Death',
    ]);
    expect(standIn(bat, 'Idle')?.name).toBe('BatArmature|Bat_Flying');
    expect(standIn(bat, 'Walking_A')?.name).toBe('BatArmature|Bat_Flying');
    expect(standIn(bat, 'Hit_A')?.name).toBe('BatArmature|Bat_Hit');
    expect(standIn(bat, 'Melee_1H_Attack_Chop')?.name).toBe('BatArmature|Bat_Attack');
    expect(standIn(bat, 'Death_A')?.name).toBe('BatArmature|Bat_Death');
  });
  it('has no fall, and a KayKit model never borrows a clip', () => {
    expect(standIn(snake, 'Death_A')).toBeUndefined();
    expect(standIn(view(['Jump_Idle', 'Idle']), 'Cheer')).toBeUndefined();
  });
});
