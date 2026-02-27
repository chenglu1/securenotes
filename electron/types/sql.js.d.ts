declare module 'sql.js' {
  interface SqlJsStatic {
    Database: typeof Database
  }

  interface QueryExecResult {
    columns: string[]
    values: any[][]
  }

  interface StatementIteratorResult {
    /** Get the next row as an object */
    getAsObject(params?: Record<string, any>): Record<string, any>
    step(): boolean
    free(): void
    bind(params?: any[]): boolean
    run(params?: any[]): void
  }

  class Database {
    constructor(data?: ArrayLike<number> | Buffer | null)
    run(sql: string, params?: any[]): Database
    exec(sql: string, params?: any[]): QueryExecResult[]
    prepare(sql: string): StatementIteratorResult
    export(): Uint8Array
    close(): void
    getRowsModified(): number
  }

  export default function initSqlJs(config?: any): Promise<SqlJsStatic>
  export { Database, SqlJsStatic, QueryExecResult, StatementIteratorResult }
}
