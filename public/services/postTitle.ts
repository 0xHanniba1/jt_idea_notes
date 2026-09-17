// Match Go's Unicode whitespace normalization, including NEL and the BOM.
export const normalizePostTitle = (title: string): string => title.replace(/[\s\u0085]+/g, " ").trim()

export const isValidPostTitle = (title: string): boolean => {
  const length = Array.from(normalizePostTitle(title)).length
  return length >= 1 && length <= 100
}
