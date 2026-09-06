import React from 'react';
import {
  Zap, Search, Folder, FolderOpen, FileText, Layers, Activity, Shield, Lock,
  Factory, Eye, Webhook, Sparkles, Globe, LayoutGrid, Box, Building2, Route,
  Database, RefreshCw, Puzzle, Radio, Link2, AlertTriangle, ScrollText, Eraser,
  GitFork, Copy, FlaskConical, Ban, Key, GitPullRequest, Upload, Share2, X,
  Settings, Sun, Moon, Network, Grid3x3, Workflow, ArrowLeftRight, Boxes,
  Target, Radar, Users, ImageIcon, StickyNote, Code2, Paintbrush, BarChart3,
  ShieldCheck, GitBranch, GitMerge, Check,
} from 'lucide-react';
import { GithubIcon } from './GithubIcon';

type IconComponent = React.ComponentType<{ size?: number; strokeWidth?: number }>;

const ICONS: Record<string, IconComponent> = {
  logo: Zap,
  bolt: Zap,
  search: Search,
  folder: Folder,
  'folder-open': FolderOpen,
  file: FileText,
  layers: Layers,
  activity: Activity,
  shield: Shield,
  lock: Lock,
  factory: Factory,
  eye: Eye,
  hook: Webhook,
  spark: Sparkles,
  globe: Globe,
  layout: LayoutGrid,
  box: Box,
  building: Building2,
  route: Route,
  database: Database,
  refresh: RefreshCw,
  puzzle: Puzzle,
  radio: Radio,
  link: Link2,
  warning: AlertTriangle,
  scroll: ScrollText,
  broom: Eraser,
  split: GitFork,
  copy: Copy,
  beaker: FlaskConical,
  ban: Ban,
  key: Key,
  'pull-request': GitPullRequest,
  export: Upload,
  share: Share2,
  close: X,
  settings: Settings,
  sun: Sun,
  moon: Moon,
  graph: Network,
  treemap: LayoutGrid,
  matrix: Grid3x3,
  tree: Workflow,
  flow: ArrowLeftRight,
  cluster: Boxes,
  target: Target,
  impact: Radar,
  users: Users,
  action: Zap,
  image: ImageIcon,
  note: StickyNote,
  code: Code2,
  brush: Paintbrush,
  chart: BarChart3,
  security: ShieldCheck,
  'git-branch': GitBranch,
  'git-merge': GitMerge,
  check: Check,
  github: GithubIcon,
};

const SIZE_PX: Record<string, number> = {
  s: 12,
  m: 14,
  l: 16,
  xl: 20,
  xxl: 48,
};

export interface IconProps {
  name?: string;
  size?: 's' | 'm' | 'l' | 'xl' | 'xxl';
  className?: string;
}

export function Icon({ name = 'file', size = 'm', className }: IconProps) {
  const Component = ICONS[name] || FileText;
  const wrapperClassName = `icon icon-${size}${className ? ` ${className}` : ''}`;
  return (
    <span className={wrapperClassName} aria-hidden="true">
      <Component size={SIZE_PX[size]} strokeWidth={1.8} />
    </span>
  );
}
