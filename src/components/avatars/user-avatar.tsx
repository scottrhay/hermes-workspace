import { memo } from 'react'
import { cn } from '@/lib/utils'

type AvatarProps = {
  size?: number
  className?: string
  src?: string | null
  alt?: string
}

/** User avatar — custom photos when supplied, otherwise the AIA Copilot lion. */
function UserAvatarComponent({
  size = 28,
  className,
  src,
  alt = 'User avatar',
}: AvatarProps) {
  if (src && src.trim().length > 0) {
    return (
      <img
        src={src}
        alt={alt}
        className={cn('shrink-0 object-cover', className)}
        style={{
          width: size,
          height: size,
          borderRadius: Math.max(6, Math.round(size * 0.2)),
        }}
      />
    )
  }

  return (
    <img
      src="/aia-lion-avatar.webp"
      alt={alt}
      className={cn('shrink-0 object-cover', className)}
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(6, Math.round(size * 0.2)),
      }}
    />
  )
}

export const UserAvatar = memo(UserAvatarComponent)
