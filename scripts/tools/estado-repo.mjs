// Prints the repository state in ~10 lines: branch, dirty files, last commits and what each worktree branch has ahead of master.
// Usage: node scripts/tools/estado-repo.mjs   (run it instead of git status + git log + git worktree list + git branch)
import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

console.log(`branch ${git('branch', '--show-current')} @ ${git('rev-parse', '--short', 'HEAD')}`);
const dirty = git('status', '--short').split('\n').filter(Boolean);
console.log(
  dirty.length ? `dirty ${dirty.length}: ${dirty.slice(0, 6).join(' | ')}${dirty.length > 6 ? ' …' : ''}` : 'clean',
);
console.log('last commits:');
for (const l of git('log', '-5', '--format=  %h %s').split('\n')) console.log(`  ${l.trim().slice(0, 96)}`);

const trees = git('worktree', 'list', '--porcelain')
  .split('\n\n')
  .map((b) => Object.fromEntries(b.split('\n').map((l) => l.split(/ (.*)/s))))
  .filter((t) => t.branch);
console.log('branches vs master (ahead/behind):');
let strays = 0; // leftover agent worktrees only add noise; count them
for (const t of trees) {
  const name = t.branch.replace('refs/heads/', '');
  if (name === 'master') continue;
  if (name.startsWith('worktree-agent-')) {
    strays++;
    continue;
  }
  const [behind, ahead] = git('rev-list', '--left-right', '--count', `master...${name}`).split(/\s+/);
  console.log(`  ${name}: +${ahead} -${behind}`);
}
if (strays) console.log(`  (+${strays} worktree-agent-* leftovers: clean up with git worktree remove)`);
