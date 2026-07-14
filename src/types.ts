export type Severity = "P0" | "P1" | "P2";
export type RunStatus = "success" | "failed" | "needs-human-review";

export type TokenSource =
  | { kind: "figma" }
  | { kind: "file"; path: string };

export interface Viewport {
  width: number;
  height: number;
  deviceScaleFactor?: number;
}

export interface QaTarget {
  id: string;
  figma: {
    fileKey: string;
    nodeId: string;
  };
  previewUrl: string;
  viewport: Viewport;
  readinessSelector: string;
  tokenSource: TokenSource;
  sourceGlobs: string[];
}

export interface Finding {
  id: number;
  severity: Severity;
  source: "visual" | "token";
  location: string;
  description: string;
  bbox?: [number, number, number, number];
}

export interface StepLog {
  step: string;
  status: "success" | "failed" | "skipped";
  attempt: number;
  timestamp: string;
  message: string;
}
