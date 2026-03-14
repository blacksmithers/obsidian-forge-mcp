export type CanvasNodeType = 'text' | 'file' | 'link' | 'group';
export type CanvasSide = 'top' | 'right' | 'bottom' | 'left';
export type CanvasEndShape = 'none' | 'arrow';
export type CanvasColor = string;
export type LayoutDirection = 'TB' | 'BT' | 'LR' | 'RL';
export type BackgroundStyle = 'cover' | 'ratio' | 'repeat';

export interface CanvasNodeBase {
  id: string;
  type: CanvasNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: CanvasColor;
}

export interface CanvasTextNode extends CanvasNodeBase {
  type: 'text';
  text: string;
}

export interface CanvasFileNode extends CanvasNodeBase {
  type: 'file';
  file: string;
  subpath?: string;
}

export interface CanvasLinkNode extends CanvasNodeBase {
  type: 'link';
  url: string;
}

export interface CanvasGroupNode extends CanvasNodeBase {
  type: 'group';
  label?: string;
  background?: string;
  backgroundStyle?: BackgroundStyle;
}

export type CanvasNode = CanvasTextNode | CanvasFileNode | CanvasLinkNode | CanvasGroupNode;

export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide?: CanvasSide;
  fromEnd?: CanvasEndShape;
  toNode: string;
  toSide?: CanvasSide;
  toEnd?: CanvasEndShape;
  color?: CanvasColor;
  label?: string;
}

export interface CanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface SemanticNode {
  label: string;
  type: CanvasNodeType;
  text?: string;
  file?: string;
  subpath?: string;
  url?: string;
  children?: string[];
  color?: CanvasColor;
  width?: number;
  height?: number;
}

export interface SemanticEdge {
  from: string;
  to: string;
  label?: string;
  color?: CanvasColor;
  fromEnd?: CanvasEndShape;
  toEnd?: CanvasEndShape;
}
