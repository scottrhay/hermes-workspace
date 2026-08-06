#!/usr/bin/env node
/**
 * One-time Telegram user login.
 *
 * Produces a StringSession that lets the workspace read forum topics the way
 * Telegram Desktop does — as you, over MTProto — instead of as a bot. Bots
 * cannot list topics at all (`channels.getForumTopics` is not in the Bot API),
 * which is why this exists.
 *
 * Run:  pnpm telegram:login
 *
 * The printed session string is FULL ACCOUNT ACCESS. It is not scoped like a
 * bot token: anything you can read or send, it can. Store it in .env only.
 */
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { TelegramClient, sessions } from 'teleproto'

const { StringSession } = sessions

const ENV_PATH = resolve(process.cwd(), '.env')

function readEnvValue(key) {
  if (!existsSync(ENV_PATH)) return ''
  const line = readFileSync(ENV_PATH, 'utf8')
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${key}=`))
  return line ? line.slice(key.length + 1).trim() : ''
}

/** Rewrites a single key in .env, preserving everything else. */
function writeEnvValue(key, value) {
  const lines = existsSync(ENV_PATH)
    ? readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)
    : []
  const index = lines.findIndex((entry) => entry.startsWith(`${key}=`))
  if (index >= 0) lines[index] = `${key}=${value}`
  else lines.push(`${key}=${value}`)
  writeFileSync(ENV_PATH, lines.join('\n'), 'utf8')
}

const apiId = Number(process.env.TELEGRAM_API_ID || readEnvValue('TELEGRAM_API_ID'))
const apiHash = process.env.TELEGRAM_API_HASH || readEnvValue('TELEGRAM_API_HASH')

if (!Number.isInteger(apiId) || apiId <= 0 || !apiHash) {
  console.error(
    'Missing TELEGRAM_API_ID / TELEGRAM_API_HASH.\n' +
      'Register an app at https://my.telegram.org, then add both to .env.',
  )
  process.exit(1)
}

const existing = readEnvValue('TELEGRAM_USER_SESSION')
const rl = createInterface({ input: stdin, output: stdout })

if (existing) {
  const overwrite = await rl.question(
    'TELEGRAM_USER_SESSION is already set. Log in again and replace it? [y/N] ',
  )
  if (!/^y(es)?$/i.test(overwrite.trim())) {
    console.log('Left the existing session in place.')
    rl.close()
    process.exit(0)
  }
}

console.log(
  '\nLogging in as your Telegram user account.\n' +
    'Telegram will send a login code to your Telegram app (not SMS, usually).\n',
)

const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
  connectionRetries: 3,
})

try {
  await client.start({
    phoneNumber: async () =>
      (await rl.question('Phone number (with country code, e.g. +15551234567): ')).trim(),
    password: async () =>
      (await rl.question('Two-factor password (blank if none): ')).trim(),
    phoneCode: async () => (await rl.question('Login code: ')).trim(),
    onError: (error) => {
      console.error('Login error:', error?.message ?? error)
    },
  })

  const session = client.session.save()
  if (typeof session !== 'string' || !session) {
    throw new Error('Telegram did not return a session string')
  }

  writeEnvValue('TELEGRAM_USER_SESSION', session)
  const me = await client.getMe()
  const who = [me?.firstName, me?.lastName].filter(Boolean).join(' ')
  console.log(
    `\nSigned in as ${who || 'your account'}${me?.username ? ` (@${me.username})` : ''}.\n` +
      'TELEGRAM_USER_SESSION written to .env.\n\n' +
      'Restart the workspace to pick it up. Treat that value like a password —\n' +
      'it grants full access to your Telegram account.',
  )
} catch (error) {
  console.error('\nLogin failed:', error?.message ?? error)
  process.exitCode = 1
} finally {
  rl.close()
  await client.disconnect().catch(() => undefined)
  await client.destroy().catch(() => undefined)
}
