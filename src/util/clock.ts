export interface Clock {
  now(): number;
  isoNow(): string;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  isoNow: () => new Date().toISOString(),
};
