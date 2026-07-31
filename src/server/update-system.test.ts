import { afterEach, describe, expect, it } from 'vitest'
import {
  agentUpdatesEnabled,
  applyAgentUpdate,
  readAgentUpdateStatus,
  remoteUrlMatches,
  updateAvailableFromDivergence,
} from './update-system'

describe('update-system helpers', () => {
  it('matches GitHub URL forms against expected repo aliases', () => {
    expect(
      remoteUrlMatches('https://github.com/outsourc-e/hermes-workspace.git', [
        'outsourc-e/hermes-workspace',
      ]),
    ).toBe(true)
    expect(
      remoteUrlMatches('git@github.com:NousResearch/hermes-agent.git', [
        'hermes-agent',
      ]),
    ).toBe(true)
    expect(
      remoteUrlMatches('https://github.com/example/other.git', [
        'hermes-workspace',
      ]),
    ).toBe(false)
  })

  it('only reports update availability when the remote side is ahead', () => {
    expect(updateAvailableFromDivergence({ ahead: 2, behind: 0 }, true)).toBe(false)
    expect(updateAvailableFromDivergence({ ahead: 0, behind: 3 }, true)).toBe(true)
    expect(updateAvailableFromDivergence({ ahead: 2, behind: 3 }, true)).toBe(true)
    expect(updateAvailableFromDivergence({ ahead: 0, behind: 0 }, false)).toBe(false)
    expect(updateAvailableFromDivergence(null, true)).toBe(true)
  })
})

describe('agent update kill switch', () => {
  afterEach(() => {
    delete process.env.HERMES_ALLOW_AGENT_UPDATE
  })

  it('is disabled unless HERMES_ALLOW_AGENT_UPDATE is exactly "1"', () => {
    delete process.env.HERMES_ALLOW_AGENT_UPDATE
    expect(agentUpdatesEnabled()).toBe(false)
    for (const value of ['', '0', 'true', 'yes']) {
      process.env.HERMES_ALLOW_AGENT_UPDATE = value
      expect(agentUpdatesEnabled()).toBe(false)
    }
    process.env.HERMES_ALLOW_AGENT_UPDATE = '1'
    expect(agentUpdatesEnabled()).toBe(true)
  })

  it('reports the agent as unsupported so the notifier hides the button', () => {
    delete process.env.HERMES_ALLOW_AGENT_UPDATE
    const status = readAgentUpdateStatus()
    // The notifier filters the banner on updateAvailable && canUpdate.
    expect(status.canUpdate).toBe(false)
    expect(status.updateAvailable).toBe(false)
    expect(status.state).toBe('unsupported')
    expect(status.reason).toMatch(/HERMES_ALLOW_AGENT_UPDATE/)
  })

  it('refuses to apply an agent update while disabled', () => {
    delete process.env.HERMES_ALLOW_AGENT_UPDATE
    const result = applyAgentUpdate()
    expect(result.ok).toBe(false)
    expect(result.restartRequired).toBe(false)
    expect(result.error).toMatch(/disabled/i)
  })
})
