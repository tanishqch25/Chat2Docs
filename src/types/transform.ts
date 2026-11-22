/** Where the transform page stands. */
export const TRANSFORM_STEPS = ['mode', 'key', 'generate'] as const

export type TransformStep = (typeof TRANSFORM_STEPS)[number]
