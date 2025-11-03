import React from 'react'

export default function Spinner({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 50 50" style={{ display: 'inline-block' }}>
      <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" strokeWidth="4" strokeOpacity="0.15" />
      <path d="M45 25a20 20 0 00-6.1-14.1" stroke="currentColor" strokeWidth="4" strokeLinecap="round" fill="none" />
    </svg>
  )
}
