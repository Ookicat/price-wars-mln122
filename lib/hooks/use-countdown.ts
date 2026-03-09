'use client'

import { useEffect, useState } from 'react'

export function useCountdown(endTime: string | null) {
  const [secondsLeft, setSecondsLeft] = useState<number>(0)

  useEffect(() => {
    if (!endTime) {
      setSecondsLeft(0)
      return
    }

    const calcRemaining = () => {
      const diff = new Date(endTime).getTime() - Date.now()
      return Math.max(0, Math.ceil(diff / 1000))
    }

    setSecondsLeft(calcRemaining())

    const interval = setInterval(() => {
      const remaining = calcRemaining()
      setSecondsLeft(remaining)
      if (remaining <= 0) clearInterval(interval)
    }, 250)

    return () => clearInterval(interval)
  }, [endTime])

  return secondsLeft
}
