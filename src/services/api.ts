const PRODUCTION_API_BASE_URL = 'https://securenotes-server.onrender.com/api'

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function hasElectronBridge(): boolean {
  return typeof window !== 'undefined' && typeof window.api !== 'undefined'
}

export function getApiBaseUrl(): string {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
  if (configuredBaseUrl) {
    return trimTrailingSlash(configuredBaseUrl)
  }

  if (hasElectronBridge()) {
    return PRODUCTION_API_BASE_URL
  }

  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    return '/api'
  }

  return PRODUCTION_API_BASE_URL
}

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${getApiBaseUrl()}${normalizedPath}`
}

export function resolveApiUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl
  }

  if (!pathOrUrl.startsWith('/')) {
    return apiUrl(pathOrUrl)
  }

  const baseUrl = getApiBaseUrl()
  if (baseUrl.startsWith('/')) {
    return pathOrUrl
  }

  return new URL(pathOrUrl, new URL(baseUrl).origin).toString()
}

export async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}

export function getErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') {
    return fallback
  }

  const message = (payload as { message?: unknown }).message
  if (typeof message === 'string' && message.trim()) {
    return message
  }

  if (Array.isArray(message)) {
    const messages = message.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    if (messages.length > 0) {
      return messages.join('; ')
    }
  }

  const error = (payload as { error?: unknown }).error
  if (typeof error === 'string' && error.trim()) {
    return error
  }

  return fallback
}

export function isFetchError(error: unknown): boolean {
  return error instanceof TypeError && /fetch|network|load failed/i.test(error.message)
}