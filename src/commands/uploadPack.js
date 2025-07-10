import { GitRefManager } from '../managers/GitRefManager.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'
import { writeRefsAdResponse } from '../wire/writeRefsAdResponse.js'

export async function uploadPack({
  fs,
  dir,
  gitdir = join(dir, '.git'),
  advertiseRefs = false,
}) {
  const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })
  try {
    if (advertiseRefs) {
      // Send a refs advertisement
      const capabilities = [
        'thin-pack',
        'side-band',
        'side-band-64k',
        'shallow',
        'deepen-since',
        'deepen-not',
        'allow-tip-sha1-in-want',
        'allow-reachable-sha1-in-want',
      ]
      let keys = await GitRefManager.listRefs({
        fs,
        gitdir: updatedGitdir,
        filepath: 'refs',
      })
      keys = keys.map(ref => `refs/${ref}`)
      const refs = {}
      keys.unshift('HEAD') // HEAD must be the first in the list
      for (const key of keys) {
        refs[key] = await GitRefManager.resolve({ fs, gitdir: updatedGitdir, ref: key })
      }
      const symrefs = {}
      symrefs.HEAD = await GitRefManager.resolve({
        fs,
        gitdir: updatedGitdir,
        ref: 'HEAD',
        depth: 2,
      })
      return writeRefsAdResponse({
        capabilities,
        refs,
        symrefs,
      })
    }
  } catch (err) {
    err.caller = 'git.uploadPack'
    throw err
  }
}
