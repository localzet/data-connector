import { Paper, PaperProps } from '@mantine/core'
import { forwardRef } from 'react'

export interface CardProps extends PaperProps {
  // Future custom props can be added here
}

export const Card = forwardRef<HTMLDivElement, CardProps>((props, ref) => {
  return <Paper ref={ref} withBorder p="md" {...props} />
})

Card.displayName = 'Card'

