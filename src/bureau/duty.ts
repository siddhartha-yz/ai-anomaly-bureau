import { createEndlessCasePreview, type EndlessCasePreview } from '../endless/generator'

export type DutyCasePreview = EndlessCasePreview

export function createDutyCasePreview(seed: number): DutyCasePreview {
  return createEndlessCasePreview(seed)
}
