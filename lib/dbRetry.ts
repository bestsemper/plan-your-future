/**
 * Retry wrapper for database operations to handle transient connection failures
 * Implements exponential backoff with a maximum of 3 attempts
 */
export async function withDbRetry<T>(
  operation: () => Promise<T>,
  operationName: string = 'database operation'
): Promise<T> {
  const maxAttempts = 3
  const baseDelayMs = 100

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      const isLastAttempt = attempt === maxAttempts
      const isTransientError =
        error instanceof Error &&
        (error.message.includes('ECONNREFUSED') ||
          error.message.includes('ENOTFOUND') ||
          error.message.includes('timeout') ||
          error.message.includes('Connection refused') ||
          error.message.includes('too many connections') ||
          error.message.includes('deadlock detected'))

      if (isLastAttempt || !isTransientError) {
        throw error
      }

      // Exponential backoff
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1)
      console.warn(
        `${operationName} failed (attempt ${attempt}/${maxAttempts}). Retrying in ${delayMs}ms...`,
        error instanceof Error ? error.message : String(error)
      )

      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  throw new Error(`${operationName} failed after ${maxAttempts} attempts`)
}
