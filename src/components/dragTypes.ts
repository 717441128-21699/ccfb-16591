export type DragState =
  | { kind: 'new'; specId: string; x: number; y: number; inside: boolean }
  | {
      kind: 'move';
      axleId: string;
      pointerId: number;
      px: number;
      py: number;
      grabDx: number;
      grabDy: number;
    };
