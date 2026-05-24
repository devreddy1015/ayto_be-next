import React from "react"
import EnterAnimation from "./EnterAnimation"

interface StaggerListProps {
  children: React.ReactNode[]
  staggerDelay?: number
  duration?: number
}

export default function StaggerList({
  children,
  staggerDelay = 60,
  duration = 300,
}: StaggerListProps) {
  return (
    <>
      {React.Children.map(children, (child, index) => (
        <EnterAnimation
          key={index}
          delay={index * staggerDelay}
          duration={duration}
        >
          {child}
        </EnterAnimation>
      ))}
    </>
  )
}
