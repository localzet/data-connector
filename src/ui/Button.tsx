import { Button as MantineButton, ButtonProps as MantineButtonProps } from '@mantine/core'
import { forwardRef } from 'react'

export interface ButtonProps extends MantineButtonProps {
  // Future custom props can be added here
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
  return <MantineButton ref={ref} {...props} />
})

Button.displayName = 'Button'

