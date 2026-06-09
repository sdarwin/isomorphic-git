'use strict'

/*
 * Cross-platform background runner for @isomorphic-git/cors-proxy.
 *
 * Why this exists:
 *   `cors-proxy start` (the package's built-in daemonizer) is not Windows-
 *   compatible because it does `spawn(import.meta.filename, ['run', ...])`
 *   to relaunch its own .js file directly. That relies on the Unix shebang
 *   and fails on Windows, which can't execute .js files as binaries.
 *
 *   This helper sidesteps the bug by spawning `process.execPath` (the
 *   running `node` binary) with `bin.js run` as arguments — equivalent to
 *   `node node_modules/@isomorphic-git/cors-proxy/bin.js run` — detached,
 *   with stdio redirected to a log file. It then waits for the proxy to
 *   start accepting TCP connections on its port. The `stop` action
 *   terminates that PID using the platform's standard mechanism.
 *
 * Usage:
 *   node __tests__/__helpers__/cors-proxy-daemon.cjs start
 *   node __tests__/__helpers__/cors-proxy-daemon.cjs stop
 *
 * It uses only Node.js built-ins plus the already-installed
 * `@isomorphic-git/cors-proxy` package — no new dependencies.
 */

const { spawn, execSync } = require('child_process')
const fs = require('fs')
const net = require('net')
const os = require('os')
const path = require('path')

const PORT = 9999
const PID_FILE = path.join(os.tmpdir(), 'isomorphic-git-cors-proxy.pid')
const LOG_FILE = path.join(os.tmpdir(), 'isomorphic-git-cors-proxy.log')
const READY_TIMEOUT_MS = 15000

function isPidAlive(pid) {
  if (!Number.isFinite(pid)) return false
  try {
    // Signal 0 doesn't kill anything; it just probes whether the process
    // exists and we're allowed to signal it. Works on both Unix and Windows.
    process.kill(pid, 0)
    return true
  } catch (_) {
    return false
  }
}

function readPidFile() {
  if (!fs.existsSync(PID_FILE)) return null
  const raw = fs.readFileSync(PID_FILE, 'utf8').trim()
  const pid = parseInt(raw, 10)
  return Number.isFinite(pid) ? pid : null
}

function removePidFile() {
  try {
    fs.unlinkSync(PID_FILE)
  } catch (_) {
    /* ignore */
  }
}

function killPid(pid) {
  if (process.platform === 'win32') {
    // /T kills the whole process tree (the cors-proxy process plus any
    // children it spawned); /F forces termination.
    execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' })
  } else {
    process.kill(pid)
  }
}

/**
 * Resolves once a TCP connection to 127.0.0.1:port succeeds, or rejects if
 * the port has not become ready within `timeoutMs` milliseconds.
 *
 * @param {number} port
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
function waitForPortReady(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const sock = net.createConnection({ port, host: '127.0.0.1' })
      let settled = false
      sock.once('connect', () => {
        if (settled) return
        settled = true
        sock.end()
        resolve()
      })
      sock.once('error', () => {
        if (settled) return
        settled = true
        sock.destroy()
        if (Date.now() >= deadline) {
          reject(new Error(`port ${port} did not become ready within ${timeoutMs}ms`))
        } else {
          setTimeout(tryConnect, 200)
        }
      })
    }
    tryConnect()
  })
}

async function start() {
  const existingPid = readPidFile()
  if (existingPid !== null && isPidAlive(existingPid)) {
    console.log(`cors-proxy already running, pid=${existingPid}`)
    return
  }
  if (existingPid !== null) {
    // PID file exists but the process is gone; clean up before spawning.
    removePidFile()
  }

  // Resolve the cors-proxy CLI script via the local node_modules so we don't
  // depend on PATH or a .cmd shim on Windows. Per the package's package.json,
  // `bin` is `bin.js` (not `cli.js`).
  const binScript = require.resolve('@isomorphic-git/cors-proxy/bin.js')

  const out = fs.openSync(LOG_FILE, 'a')
  const err = fs.openSync(LOG_FILE, 'a')

  const child = spawn(process.execPath, [binScript, 'run'], {
    detached: true,
    stdio: ['ignore', out, err],
    windowsHide: true,
  })

  fs.writeFileSync(PID_FILE, String(child.pid))
  child.unref()

  console.log(`cors-proxy starting, pid=${child.pid}, log=${LOG_FILE}`)

  try {
    await waitForPortReady(PORT, READY_TIMEOUT_MS)
  } catch (e) {
    // Surface any startup output to help debugging if it failed to listen.
    let tail = ''
    try {
      const log = fs.readFileSync(LOG_FILE, 'utf8')
      tail = log.split(/\r?\n/).slice(-40).join('\n')
    } catch (_) {
      /* ignore */
    }
    throw new Error(
      `cors-proxy did not become ready: ${e.message}\n` +
        `--- last lines of ${LOG_FILE} ---\n${tail}`
    )
  }

  console.log(`cors-proxy ready on port ${PORT}`)
}

function stop() {
  const pid = readPidFile()
  if (pid === null) {
    console.log('cors-proxy not running (no pid file).')
    return
  }
  if (!isPidAlive(pid)) {
    console.log(`cors-proxy already stopped (pid=${pid}).`)
    removePidFile()
    return
  }
  try {
    killPid(pid)
    console.log(`cors-proxy stopped, pid=${pid}`)
  } catch (e) {
    console.log(`cors-proxy could not be stopped cleanly (pid=${pid}): ${e.message}`)
  } finally {
    removePidFile()
  }
}

const action = process.argv[2]
if (action === 'start') {
  start().catch(e => {
    console.error(e && e.stack ? e.stack : String(e))
    process.exit(1)
  })
} else if (action === 'stop') {
  stop()
} else {
  console.error('Usage: node cors-proxy-daemon.cjs <start|stop>')
  process.exit(1)
}
