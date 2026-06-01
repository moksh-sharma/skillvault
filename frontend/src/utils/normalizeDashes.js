/** Unicode dash variants → ASCII hyphen-minus */
const DASH_PATTERN = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g

export function normalizeDashes(value) {
  if (value == null) return value
  if (typeof value !== 'string') return value
  return value.replace(DASH_PATTERN, '-')
}

export function normalizeDashesDeep(obj) {
  if (typeof obj === 'string') return normalizeDashes(obj)
  if (Array.isArray(obj)) return obj.map(normalizeDashesDeep)
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, normalizeDashesDeep(v)])
    )
  }
  return obj
}
