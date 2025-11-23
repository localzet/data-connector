import { useEffect } from 'react'
import { Center, Loader, Text, Stack } from '@mantine/core'

export interface MixIdCallbackPageProps {
  onCallback?: (code: string, state: string | null) => void
  redirectTo?: string
}

export default function MixIdCallbackPage({ onCallback, redirectTo = '/settings' }: MixIdCallbackPageProps = {}) {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const urlParams = new URLSearchParams(window.location.search)
    const code = urlParams.get('code')
    const state = urlParams.get('state')

    if (code) {
      // Send message to parent window
      if (window.opener) {
        window.opener.postMessage(
          {
            type: 'mixid-oauth-callback',
            code,
            state,
          },
          window.location.origin
        )
        window.close()
      } else {
        // If no opener, call callback or redirect
        if (onCallback) {
          onCallback(code, state)
        } else if (redirectTo && typeof window !== 'undefined') {
          window.location.href = redirectTo
        }
      }
    } else {
      if (redirectTo && typeof window !== 'undefined') {
        window.location.href = redirectTo
      }
    }
  }, [onCallback, redirectTo])

  return (
    <Center h="100vh">
      <Stack align="center" gap="md">
        <Loader />
        <Text>Обработка авторизации MIX ID...</Text>
      </Stack>
    </Center>
  )
}
