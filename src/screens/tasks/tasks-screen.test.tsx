/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OPENENGINE_DASHBOARD_URL, TasksScreen } from './tasks-screen'

describe('TasksScreen', () => {
  it('embeds the OpenEngine dashboard in an iframe with an open-in-new-tab link', () => {
    render(<TasksScreen />)

    const iframe = screen.getByTitle('OpenEngine Tasks')
    expect(iframe.tagName).toBe('IFRAME')
    expect(iframe.getAttribute('src')).toBe(OPENENGINE_DASHBOARD_URL)

    const link = screen.getByRole('link', { name: /open in new tab/i })
    expect(link.getAttribute('href')).toBe(OPENENGINE_DASHBOARD_URL)
  })
})
