export function getApiErrorMessage(error: unknown, fallback?: string): string | undefined {
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return fallback;
  }
  const response = (error as { response?: { data?: { error?: unknown } } }).response;
  const apiError = typeof response?.data?.error === 'string' ? response.data.error : undefined;
  return apiError ?? fallback;
}
