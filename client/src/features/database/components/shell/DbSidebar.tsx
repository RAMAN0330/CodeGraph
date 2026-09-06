import { motion, useReducedMotion } from 'framer-motion';
import {
  LayoutDashboard, Activity, Terminal, Network, HardDrive, GitCompare, Radio, ShieldCheck, AlertTriangle,
} from 'lucide-react';
import type { DbNavId } from '../../types';

const NAV_ITEMS: { id: DbNavId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'performance', label: 'Performance', icon: Activity },
  { id: 'queries', label: 'Queries', icon: Terminal },
  { id: 'schema', label: 'Schema', icon: Network },
  { id: 'storage', label: 'Storage', icon: HardDrive },
  { id: 'replication', label: 'Replication', icon: GitCompare },
  { id: 'activity', label: 'Activity', icon: Radio },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
];

const SPRING_SNAPPY = { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 } as const;
const staggerChildren = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const fadeUp = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const } } };

interface DbSidebarProps {
  active: DbNavId;
  onChange: (section: DbNavId) => void;
}

export default function DbSidebar({ active, onChange }: DbSidebarProps) {
  const reduceMotion = useReducedMotion();

  return (
    <aside className="db-sidebar">
      <motion.nav className="db-nav" aria-label="Database dashboard sections" initial="hidden" animate="show" variants={staggerChildren}>
        {NAV_ITEMS.map(item => {
          const isActive = item.id === active;
          const Icon = item.icon;
          return (
            <motion.div key={item.id} variants={fadeUp}>
              <button
                className={`db-nav-item${isActive ? ' active' : ''}`}
                onClick={() => onChange(item.id)}
                aria-current={isActive ? 'page' : undefined}
                title={item.label}
              >
                {isActive && <motion.span layoutId="db-nav-active" className="db-nav-active-indicator" transition={reduceMotion ? { duration: 0 } : SPRING_SNAPPY} />}
                <span className="db-nav-item-content">
                  <Icon size={17} strokeWidth={1.8} />
                  <span className="db-sidebar-label">{item.label}</span>
                </span>
              </button>
            </motion.div>
          );
        })}
      </motion.nav>
    </aside>
  );
}
