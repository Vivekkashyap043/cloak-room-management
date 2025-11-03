import React from 'react'

export default function PencilIcon({ className = '', width = 16, height = 16 }) {
  return (
    <svg className={className} width={width} height={height} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 21v-3.75L17.81 2.44a1 1 0 011.41 0l1.34 1.34a1 1 0 010 1.41L6.75 20.99H3z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
