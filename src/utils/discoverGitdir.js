/**
 * discoverGitdir
 *
 * When processing git commands on a submodule determine
 * the actual git directory based on the contents of the .git file.
 *
 * Otherwise (if sent a directory) return that directory as-is.
 *
 * It may be arbitrary but the implementation process submodules
 * only in the front-end location of src/api/ rather than the backend of
 * src/commands/. This keeps a clear division of responsibilities, and
 * should be maintained.
 *
 * A consequence though is that submodule tests must
 * sometimes be "aware" of submodules also, similar to src/api.
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
  else {
     // Neither a file nor a directory. This correlates to a "git init" scenario where it's empty.
     // This is the expected result for normal repos, and indeterminate for submodules, but
     // would be unusual with submodules.
     return dotgit
    }
}
