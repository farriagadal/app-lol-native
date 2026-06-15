/** Declaración mínima de sql.js (no publica tipos propios). */
declare module 'sql.js' {
  export interface QueryExecResult {
    columns: string[];
    values: Array<Array<number | string | Uint8Array | null>>;
  }
  export interface Statement {
    run(params?: unknown): void;
    free(): void;
  }
  export interface Database {
    exec(sql: string, params?: unknown): QueryExecResult[];
    run(sql: string, params?: unknown): void;
    prepare(sql: string, params?: unknown): Statement;
    export(): Uint8Array;
    close(): void;
  }
  export interface SqlJsStatic {
    Database: new (data?: Uint8Array | null) => Database;
  }
  export interface InitSqlJsOptions {
    locateFile?: (file: string) => string;
  }
  export default function initSqlJs(opts?: InitSqlJsOptions): Promise<SqlJsStatic>;
}
