const disabledValues = new Set(['false', '0', 'no', 'off'])
const configuredValue = import.meta.env.VITE_PERSONAL_LEARNING_EDITION

export const PERSONAL_LEARNING_EDITION = !disabledValues.has(
  String(configuredValue ?? 'true').trim().toLowerCase()
)

export const PERSONAL_LEARNING_EDITION_VERSION = '1.0'
export const COMPLIANCE_EFFECTIVE_DATE = '2026-07-03'
