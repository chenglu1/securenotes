import { app, shell } from 'electron'
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'

type NewsLogLevel = 'info' | 'warn' | 'error'

const LOG_DIRECTORY = 'logs'
const LOG_FILE_NAME = 'news-digest.log'
const ROTATED_LOG_FILE_NAME = 'news-digest.log.1'
const MAX_LOG_FILE_SIZE_BYTES = 768 * 1024

function ensureLogDirectory(): string {
  const directoryPath = join(app.getPath('userData'), LOG_DIRECTORY)
  if (!existsSync(directoryPath)) {
    mkdirSync(directoryPath, { recursive: true })
  }

  return directoryPath
}

export function getNewsLogFilePath(): string {
  return join(ensureLogDirectory(), LOG_FILE_NAME)
}

function getRotatedLogFilePath(): string {
  return join(ensureLogDirectory(), ROTATED_LOG_FILE_NAME)
}

function rotateLogFileIfNeeded(filePath: string) {
  if (!existsSync(filePath)) {
    return
  }

  try {
    const stats = statSync(filePath)
    if (stats.size < MAX_LOG_FILE_SIZE_BYTES) {
      return
    }

    const rotatedPath = getRotatedLogFilePath()
    if (existsSync(rotatedPath)) {
      unlinkSync(rotatedPath)
    }

    renameSync(filePath, rotatedPath)
  } catch {
    // Ignore log rotation failures to avoid blocking the main workflow.
  }
}

function serializeMetadata(metadata: unknown): string {
  if (metadata === undefined) {
    return ''
  }

  try {
    return JSON.stringify(metadata, (_key, value) => {
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
        }
      }

      return value
    })
  } catch {
    return String(metadata)
  }
}

export function writeNewsLog(level: NewsLogLevel, message: string, metadata?: unknown) {
  const filePath = getNewsLogFilePath()
  rotateLogFileIfNeeded(filePath)

  const metadataText = serializeMetadata(metadata)
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}${metadataText ? ` ${metadataText}` : ''}`

  try {
    appendFileSync(filePath, `${line}\n`, 'utf8')
  } catch {
    // Avoid throwing if the file system is temporarily unavailable.
  }

  const consoleMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info
  if (metadata === undefined) {
    consoleMethod(`[news] ${message}`)
    return
  }

  consoleMethod(`[news] ${message}`, metadata)
}

export async function openNewsLogFile(): Promise<void> {
  const filePath = getNewsLogFilePath()
  if (!existsSync(filePath)) {
    writeFileSync(filePath, '', 'utf8')
  }

  const errorMessage = await shell.openPath(filePath)
  if (errorMessage) {
    throw new Error(errorMessage)
  }
}