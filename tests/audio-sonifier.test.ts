import { describe, expect, it } from 'vitest';
import { sonifyFrequency, sonifyGain } from '../src/app/AudioSonifier';

describe('audio sonification mapping', () => {
  it('frequency rises with |w| and clamps to [min, max]', () => {
    // Legacy law for voice 0: clamp(200 + |w|·55, 80, 1200).
    expect(sonifyFrequency(0, 200, 55, 80, 1200)).toBe(200);
    expect(sonifyFrequency(2, 200, 55, 80, 1200)).toBeCloseTo(310, 9);
    expect(sonifyFrequency(-2, 200, 55, 80, 1200)).toBeCloseTo(310, 9); // uses |w|
    expect(sonifyFrequency(1000, 200, 55, 80, 1200)).toBe(1200); // clamps high
  });

  it('voice 1 law clamps to [120, 1500]', () => {
    expect(sonifyFrequency(0, 300, 70, 120, 1500)).toBe(300);
    expect(sonifyFrequency(1000, 300, 70, 120, 1500)).toBe(1500);
  });

  it('gain grows with |w| and saturates at max', () => {
    expect(sonifyGain(0, 0.018)).toBe(0);
    expect(sonifyGain(10, 0.018)).toBeCloseTo(0.18, 9);
    expect(sonifyGain(1000, 0.018)).toBe(0.5); // saturates
    expect(sonifyGain(-10, 0.014)).toBeCloseTo(0.14, 9);
  });
});
