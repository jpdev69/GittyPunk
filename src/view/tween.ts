export function lerpFactor(delta: number, speed: number): number {
  return 1 - Math.exp(-delta * speed);
}

export function stepToward(
  current: number,
  target: number,
  delta: number,
  speed: number,
): number {
  return current + (target - current) * lerpFactor(delta, speed);
}
