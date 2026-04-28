"use client";
import { useEffect, useRef, useState } from "react";

export default function AnimatedNumber({
  value,
  decimals = 0,
  duration = 800,
}: {
  value: number;
  decimals?: number;
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    let frame: number;
    const start = display;
    const end = value;
    const animate = (ts: number) => {
      if (startedAt.current === null) startedAt.current = ts;
      const progress = Math.min((ts - startedAt.current) / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + (end - start) * eased);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    startedAt.current = null;
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return (
    <span className="tabular-nums">
      {display.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </span>
  );
}
