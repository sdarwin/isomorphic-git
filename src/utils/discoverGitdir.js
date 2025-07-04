/**
 * discoverGitdir
 *
 * When processing git commands on a submodule determine
 * the actual git directory based on the contents of the .git file.
 *
 * Otherwise (if sent a directory) return that directory as-is.
 *
 */

import * as path from 'path'

import { assertParameter } from './assertParameter.js'

export async function discoverGitdir({ fsp, dotgit }) {
  assertParameter('fsp', fsp)
  assertParameter('dotgit', dotgit)

  const dotgitStat = await fsp
    ._stat(dotgit)
    .catch(() => ({ isFile: () => false, isDirectory: () => false }))
  if (dotgitStat.isDirectory()) {
    return dotgit
  } else if (dotgitStat.isFile()) {
    return fsp
      ._readFile(dotgit, 'utf8')
      .then(contents => contents.trimRight().substr(8))
      .then(submoduleGitdir => {
        const gitdir = path.join(path.dirname(dotgit), submoduleGitdir)
        return gitdir
      })
  }
}
