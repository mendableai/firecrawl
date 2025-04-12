declare module 'parse-diff' {
  interface Change {
    type: string;
    normal?: boolean;
    ln?: number;
    ln1?: number;
    ln2?: number;
    content: string;
  }

  interface Chunk {
    content: string;
    changes: Change[];
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
  }

  interface File {
    from: string | null;
    to: string | null;
    chunks: Chunk[];
    deletions: number;
    additions: number;
    binary?: boolean;
  }

  function parseDiff(diff: string): File[];
  export = parseDiff;
}
