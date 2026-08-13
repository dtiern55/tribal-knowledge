import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Notice } from './Notice'
import { PageHeader } from './PageHeader'

describe('shared page feedback', () => {
  it('keeps page context and the title in one semantic header', () => {
    render(
      <PageHeader
        eyebrow="Survivor 51"
        title="Cast"
        description="Meet the castaways."
        meta="18 players"
      />,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Cast' })).toBeVisible()
    expect(screen.getByText('Survivor 51')).toBeVisible()
    expect(screen.getByText('Meet the castaways.')).toBeVisible()
    expect(screen.getByText('18 players')).toBeVisible()
  })

  it('announces errors urgently and non-error notices politely', () => {
    const { rerender } = render(<Notice tone="error">Request failed</Notice>)
    expect(screen.getByRole('alert')).toHaveTextContent('Request failed')

    rerender(<Notice>No season found</Notice>)
    expect(screen.getByRole('status')).toHaveTextContent('No season found')
  })
})
