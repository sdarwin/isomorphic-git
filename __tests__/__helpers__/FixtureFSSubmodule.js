/* eslint-env node, browser, jasmine */

// In cases where 'makeFixture' is used, create an alternative 'makeFixtureAsSubmodule'
// that will position the target repository as a submodule
// within a larger superproject and return variables pointing at the submodule
// so it can be tested.
//
// An ideal methodology might run 'git submodule' commands and create full-fledged
// correct submodules to test with.
//
// However isometric-git's __fixtures__ are incomplete and can't always be checked out.
// We want to test the same __fixtures__.
// Therefore, create faux submodules such that at least their .git folder is properly positioned.
// That's what discoverGitdir.js solves for, in any case. The way to run git
// commands inside a submodule is to be aware of the remote location of the .git folder.

import http from 'isomorphic-git/http'

const path = require('path')

const localhost =
  typeof window === 'undefined' ? 'localhost' : window.location.hostname

const { clone } = require('isomorphic-git')

const { makeFixture } = require('./FixtureFS.js')

/**
 *
 * Inspired by an answer at
 * https://stackoverflow.com/questions/13786160/copy-folder-recursively-in-node-js?answertab=createdasc#tab-top
 *
 * copyRecursiveSync is not working entirely even though a "diff" shows the copy is correct. Could be file permissions.
 * An alternative is symlink. However that disrupts " git add '.' " for some reason.
 * Fallback to a shell script copyRecursiveSyncShell which is used now.
 *
 */
var copyRecursiveSync = async function(fs, src, dest) {
  console.log('src to copy:')
  console.log(src)
  console.log('dest to copy:')
  console.log(dest)
  var stats = await fs._stat(src)
  console.log('after stat of src:')
  var isDirectory = await stats.isDirectory()
  if (isDirectory) {
    await fs._mkdir(dest)
    const listofdirs = await fs._readdir(src)
    console.log('listofdirs:')
    console.log(listofdirs)
    console.log(typeof listofdirs)
    listofdirs.forEach(async childItemName => {
      copyRecursiveSync(
        fs,
        path.join(src, childItemName),
        path.join(dest, childItemName)
      )
    })
  } else {
    // fs.copyFileSync(fs, src, dest)
    const bufferx = await fs._readFile(src)
    console.log('bufferx:')
    console.log(bufferx)
    // await fs._writeFile(dest, await fs._readFile(src))
    await fs._writeFile(dest, bufferx)
  }
}

var copyRecursiveSyncShell = async function(src, dest) {
    const { spawnSync } = require('child_process')
    const output = spawnSync(
      'cp -rp ' + String(src) + ' ' + String(dest) + ' ',
      {
        shell: '/bin/bash'
      }
    )
    // console.log('copyRecursive:')
    // console.log(`stderr: ${output.stderr.toString()}`)
    // console.log(`stdout: ${output.stdout.toString()}`)
}

export async function makeFixtureAsSubmodule(fixture) {
  // Create fixture for submodule (sm)
  const { fs: fssm, dir: dirsm, gitdir: gitdirsm } = await makeFixture(fixture)
  // console.log('fssm:')
  // console.log(fssm)
  // console.log('dirsm:')
  // console.log(dirsm)
  // console.log('gitdirsm:')
  // console.log(gitdirsm)

  // Create fixture for superproject (sp)
  const { fs: fssp, dir: dirsp } = await makeFixture('superproject-' + fixture)

  // The superproject gitdir ought to be a .git subfolder,
  // and not a distant tmp folder:
  const gitdirsp = path.join(dirsp, '.git')

  await clone({
    fs: fssp,
    http,
    dir: dirsp,
    gitdir: gitdirsp,
    url: `http://${localhost}:8888/test-submodules.git`,
  })
  // console.log('fssp:')
  // console.log(fssp)
  // console.log('dirsp:')
  // console.log(dirsp)
  // console.log('gitdirsp:')
  // console.log(gitdirsp)

  // Move the submodule's gitdir into place
  await fssp._mkdir(path.join(gitdirsp, 'modules'))
  // THE SYMLINK METHOD
  // await fssp._symlink(gitdirsm, path.join(gitdirsp, 'modules', 'mysubmodule'))
  // THE COPYRECURSIVESYNC METHOD
  // await copyRecursiveSync(fssp, gitdirsm, path.join(gitdirsp, 'modules', 'mysubmodule'))
  // THE SHELL METHOD
  await copyRecursiveSyncShell(gitdirsm, path.join(gitdirsp, 'modules', 'mysubmodule'))

  // Move the submodule's main dir into place
  const officialSubmoduleDir = path.join(dirsp, 'mysubmodule')
  // THE SYMLINK METHOD
  // await fssp._symlink(dirsm, officialSubmoduleDir)
  // THE COPYRECURSIVESYNC METHOD
  // await copyRecursiveSync(fssp, dirsm, officialSubmoduleDir)
  // THE SHELL METHOD
  await copyRecursiveSyncShell(dirsm, officialSubmoduleDir)

  // Write a ".git" file into the submodule
  const submoduleGitFile = path.join(officialSubmoduleDir, '.git')
  const submoduleGitFileContent = 'gitdir: ../.git/modules/mysubmodule\n'
  await fssp._writeFile(submoduleGitFile, submoduleGitFileContent)

  // Notice that the returned values correspond to the submodule
  // and even include the 'tricky' submoduleGitFile which is just
  // a plain file named '.git'.
  return { fs: fssp, dir: officialSubmoduleDir, gitdir: submoduleGitFile }
}
