/** Turn { expBin: count } into Recharts rows [{ exp, count }, ...]. */
export function formatExperienceDistribution(counts) {
  const expKeys = Object.keys(counts)
    .map((k) => Number(k))
    .filter((n) => !Number.isNaN(n))
  if (!expKeys.length) return []
  const max = Math.max(...expKeys)
  return Array.from({ length: max + 1 }, (_, exp) => ({
    exp,
    count: counts[exp] || 0,
  }))
}

/** Experience-year range presets for the dashboard filter. */
export const EXPERIENCE_RANGE_OPTIONS = [
  { value: 'all', label: 'All experience levels' },
  { value: '0-5', label: '0–5 years' },
  { value: '6-10', label: '6–10 years' },
  { value: '11-15', label: '11–15 years' },
  { value: '16-20', label: '16–20 years' },
  { value: '21+', label: '21+ years' },
]

const RANGE_BOUNDS = {
  '0-5': { min: 0, max: 5 },
  '6-10': { min: 6, max: 10 },
  '11-15': { min: 11, max: 15 },
  '16-20': { min: 16, max: 20 },
  '21+': { min: 21, max: null },
}

/**
 * Slice full experience distribution chart data by years-of-experience range.
 * @param {Array<{ exp: number, count: number }>} allRows
 * @param {string} rangeKey - 'all' or a key from RANGE_BOUNDS
 */
export function filterExperienceDistributionByRange(allRows, rangeKey) {
  if (!allRows?.length || rangeKey === 'all') {
    return allRows || []
  }

  const bounds = RANGE_BOUNDS[rangeKey]
  if (!bounds) return allRows

  const byExp = Object.fromEntries(allRows.map((r) => [r.exp, r.count || 0]))
  const maxExpInData = Math.max(...allRows.map((r) => r.exp), bounds.min)

  if (bounds.max == null) {
    const start = bounds.min
    const end = Math.max(start, maxExpInData)
    return Array.from({ length: end - start + 1 }, (_, i) => {
      const exp = start + i
      return { exp, count: byExp[exp] || 0 }
    })
  }

  return Array.from({ length: bounds.max - bounds.min + 1 }, (_, i) => {
    const exp = bounds.min + i
    return { exp, count: byExp[exp] || 0 }
  })
}

export function getExperienceRangeLabel(rangeKey) {
  const opt = EXPERIENCE_RANGE_OPTIONS.find((o) => o.value === rangeKey)
  return opt?.label ?? rangeKey
}

export function countCandidatesInRange(allRows, rangeKey) {
  const filtered = filterExperienceDistributionByRange(allRows, rangeKey)
  return filtered.reduce((sum, row) => sum + (row.count || 0), 0)
}
