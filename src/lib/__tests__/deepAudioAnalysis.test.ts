import { describe, it, expect } from "vitest";
import { freqToNote } from "../deepAudioAnalysis";

describe("freqToNote", () => {
  it("converts A440 (440Hz) to A 4 with 0 cents", () => {
    const result = freqToNote(440);
    expect(result).toEqual({ note: "A 4", octave: 4, cents: 0 });
  });

  it("handles non-positive frequencies (<= 0Hz) safely", () => {
    expect(freqToNote(0)).toEqual({ note: "C", octave: 0, cents: 0 });
    expect(freqToNote(-100)).toEqual({ note: "C", octave: 0, cents: 0 });
  });

  it("converts middle C (C4, ~261.63 Hz) correctly", () => {
    const result = freqToNote(261.6256);
    expect(result.note).toBe("C 4");
    expect(result.octave).toBe(4);
    expect(result.cents).toBe(0);
  });

  it("converts C0 (~16.35 Hz) correctly", () => {
    const result = freqToNote(16.3516);
    expect(result.note).toBe("C 0");
    expect(result.octave).toBe(0);
  });

  it("converts high frequencies like A8 (7040 Hz) correctly", () => {
    const result = freqToNote(7040);
    expect(result).toEqual({ note: "A 8", octave: 8, cents: 0 });
  });

  it("converts sharp / accidental notes like C#4 (~277.18 Hz) correctly", () => {
    const result = freqToNote(277.1826);
    expect(result.note).toBe("C# 4");
    expect(result.octave).toBe(4);
    expect(result.cents).toBe(0);
  });

  it("calculates positive cents detuning correctly for slightly sharp frequencies", () => {
    // A4 + 20 cents = 440 * 2^(20/1200) ≈ 445.10 Hz
    const freqSharp = 440 * Math.pow(2, 20 / 1200);
    const result = freqToNote(freqSharp);
    expect(result.note).toBe("A 4");
    expect(result.octave).toBe(4);
    expect(result.cents).toBe(20);
  });

  it("calculates negative cents detuning correctly for slightly flat frequencies", () => {
    // A4 - 25 cents = 440 * 2^(-25/1200) ≈ 433.68 Hz
    const freqFlat = 440 * Math.pow(2, -25 / 1200);
    const result = freqToNote(freqFlat);
    expect(result.note).toBe("A 4");
    expect(result.octave).toBe(4);
    expect(result.cents).toBe(-25);
  });
});
