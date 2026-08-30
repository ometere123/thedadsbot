/** A plain decimal string: optional sign, digits, optional fractional part. */
const DECIMAL = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/

/** Scientific notation, e.g. `1e-8`, `-1.5E+21`. Captures sign, digits, exponent. */
const SCIENTIFIC = /^(-?)(\d*)(?:\.(\d*))?[eE]([+-]?\d+)$/

/**
 * Rewrite scientific notation as a plain decimal string, e.g. `1e-8` →
 * `0.00000001`.
 *
 * Done with string math rather than `Number.prototype.toFixed` so the result is
 * exact. `toFixed` round-trips through a double, which silently corrupts values
 * above 2^53 (`(1e30).toFixed(18)` is off by 19884624838656) and returns
 * exponential notation again at or above 1e21. It also truncates a value
 * smaller than the token's precision to zero, turning a too-small amount into a
 * free order rather than an error.
 *
 * Returns the input unchanged if it is not scientific notation; callers
 * validate the result.
 */
function expandScientificNotation(str: string): string {
  const match = SCIENTIFIC.exec(str)
  if (!match) {
    return str
  }

  const [, sign, intDigits, fracDigits = "", exponent] = match
  const digits = `${intDigits}${fracDigits}`
  if (digits.length === 0) {
    return str
  }

  // Where the decimal point lands once the exponent is applied.
  const pointPosition = intDigits.length + Number(exponent)

  if (pointPosition <= 0) {
    return `${sign}0.${"0".repeat(-pointPosition)}${digits}`
  }
  if (pointPosition >= digits.length) {
    return `${sign}${digits}${"0".repeat(pointPosition - digits.length)}`
  }
  return `${sign}${digits.slice(0, pointPosition)}.${digits.slice(pointPosition)}`
}

/**
 * Parse a decimal string into its base unit representation (e.g. ETH -> wei).
 *
 * Accepts scientific notation from either a number or a string. `String(1e-8)`
 * is `"1e-8"`, so any caller that stringifies an amount before passing it here
 * hits that form.
 *
 * @param value The decimal value as a string or number (e.g. "1.5")
 * @param decimals The number of decimal places (e.g. 18 for ETH)
 * @returns The value in base units as a bigint
 */
export function parseUnits(
  value: string | number | bigint,
  decimals: number,
): bigint {
  const str = expandScientificNotation(value.toString())

  // Reject anything that is not a plain decimal, so malformed input fails here
  // with a clear message rather than as a `SyntaxError` out of `BigInt` below.
  if (!DECIMAL.test(str)) {
    throw new Error(`Invalid decimal value: ${value}`)
  }

  // Handle negative values
  const isNegative = str.startsWith("-")
  const abs = isNegative ? str.slice(1) : str

  const [intPart, fracPart = ""] = abs.split(".")

  // Reject excess decimal places to match ethers.parseUnits behavior
  if (fracPart.length > decimals) {
    throw new Error(`Too many decimal places: ${fracPart.length} > ${decimals}`)
  }
  const paddedFrac = fracPart.padEnd(decimals, "0")
  const combined = (intPart || "0") + paddedFrac

  // Remove leading zeros then parse
  const result = BigInt(combined)
  return isNegative ? -result : result
}

/**
 * Parse an ether-denominated value into wei.
 * Shorthand for `parseUnits(value, 18)`.
 */
export function parseEther(value: string | number | bigint): bigint {
  return parseUnits(value, 18)
}
