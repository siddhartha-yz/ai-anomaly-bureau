import { createRng, jitter } from './rng'
import type { Label, RawFeatures, Sample, Split } from './types'

export type Dataset = {
  seed: number
  train: Sample[]
  test: Sample[]
}

function makeSample(
  split: Split,
  label: Label,
  index: number,
  features: RawFeatures,
  flags?: Sample['flags'],
): Sample {
  return {
    id: `${split}-${label}-${index}`,
    split,
    label,
    features,
    flags,
  }
}

function typicalCat(rng: ReturnType<typeof createRng>): RawFeatures {
  return {
    warmth: jitter(rng, 0.74, 0.11),
    roundness: jitter(rng, 0.79, 0.09),
    texture: jitter(rng, 0.77, 0.10),
    aspect: jitter(rng, 0.34, 0.09),
  }
}

function typicalBread(rng: ReturnType<typeof createRng>): RawFeatures {
  return {
    warmth: jitter(rng, 0.72, 0.12),
    roundness: jitter(rng, 0.33, 0.10),
    texture: jitter(rng, 0.36, 0.10),
    aspect: jitter(rng, 0.76, 0.10),
  }
}

export function createDataset(seed = 20260809): Dataset {
  const rng = createRng(seed)
  const train: Sample[] = []
  const test: Sample[] = []

  for (let i = 0; i < 16; i += 1) {
    train.push(makeSample('train', 'cat', i, typicalCat(rng)))
    train.push(makeSample('train', 'bread', i, typicalBread(rng)))
  }

  // Two measurement-noise points per class. They are intentionally embedded in
  // the opposite cluster, so a 1-NN classifier can memorize them and carve tiny
  // incorrect regions while smoother models can ignore the local accident.
  train.push(
    makeSample(
      'train',
      'cat',
      16,
      { warmth: 0.73, roundness: 0.36, texture: 0.34, aspect: 0.76 },
      { noise: true, outlier: true },
    ),
    makeSample(
      'train',
      'cat',
      17,
      { warmth: 0.78, roundness: 0.40, texture: 0.38, aspect: 0.71 },
      { noise: true, outlier: true },
    ),
    makeSample(
      'train',
      'bread',
      16,
      { warmth: 0.71, roundness: 0.75, texture: 0.80, aspect: 0.35 },
      { noise: true, outlier: true },
    ),
    makeSample(
      'train',
      'bread',
      17,
      { warmth: 0.76, roundness: 0.70, texture: 0.76, aspect: 0.40 },
      { noise: true, outlier: true },
    ),
  )

  for (let i = 0; i < 6; i += 1) {
    test.push(makeSample('test', 'cat', i, typicalCat(rng)))
    test.push(makeSample('test', 'bread', i, typicalBread(rng)))
  }

  // Hidden variants deliberately break the early shortcut "round = cat".
  for (let i = 6; i < 10; i += 1) {
    test.push(
      makeSample(
        'test',
        'cat',
        i,
        {
          warmth: jitter(rng, 0.89, 0.05),
          roundness: jitter(rng, 0.47, 0.05),
          texture: jitter(rng, 0.78, 0.07),
          aspect: jitter(rng, 0.36, 0.06),
        },
        { orangeCat: true },
      ),
    )
    test.push(
      makeSample(
        'test',
        'bread',
        i,
        {
          warmth: jitter(rng, 0.83, 0.06),
          roundness: jitter(rng, 0.70, 0.06),
          texture: jitter(rng, 0.34, 0.07),
          aspect: jitter(rng, 0.75, 0.07),
        },
        { roundBread: true },
      ),
    )
  }

  // Audit probes sit close to the noisy training measurements. 1-NN should
  // follow the memorized noise; k=5 / simpler boundaries should follow the cluster.
  test.push(
    makeSample(
      'test',
      'bread',
      10,
      { warmth: 0.72, roundness: 0.35, texture: 0.35, aspect: 0.75 },
      { auditProbe: true },
    ),
    makeSample(
      'test',
      'bread',
      11,
      { warmth: 0.79, roundness: 0.41, texture: 0.39, aspect: 0.70 },
      { auditProbe: true },
    ),
    makeSample(
      'test',
      'cat',
      10,
      { warmth: 0.70, roundness: 0.76, texture: 0.79, aspect: 0.36 },
      { auditProbe: true },
    ),
    makeSample(
      'test',
      'cat',
      11,
      { warmth: 0.75, roundness: 0.69, texture: 0.75, aspect: 0.41 },
      { auditProbe: true },
    ),
  )

  return { seed, train, test }
}
