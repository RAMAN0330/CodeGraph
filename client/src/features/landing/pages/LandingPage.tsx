import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, CheckCircle2, CircleDotDashed, FileCode2, GitBranch, Network, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { appConfig } from '../../../app/config';
import './LandingPage.css';

function GraphKeepMark() {
  return (
    <svg viewBox="0 0 28 28" fill="none" width="19" height="19" aria-hidden="true">
      <path d="M9 7v11.2a3.8 3.8 0 1 0 2 3.3V12l7 4.1v2.1a3.8 3.8 0 1 0 2-3.3L11 9.7V7A3.8 3.8 0 1 0 9 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const capabilities = [
  { icon: Search, title: 'Understand the whole system', copy: 'Explore code, dependencies, and structure without losing the context between files.' },
  { icon: Network, title: 'Trace architecture visually', copy: 'Turn repositories into navigable graphs that reveal the paths behind every feature.' },
  { icon: ShieldCheck, title: 'Find risk before release', copy: 'Keep security signals, stale code, and ownership visible in the same workspace.' },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    fetch(`${appConfig.apiUrl}/auth/me?t=${Date.now()}`, { credentials: 'include', cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(user => { if (user) navigate('/workspaces', { replace: true }); })
      .catch(() => undefined);
  }, [navigate]);
  const start = () => navigate('/login');
  const rise = reduceMotion ? {} : { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } };

  return <main className="landing-page">
    <div className="landing-grid" aria-hidden="true" />
    <nav className="landing-nav" aria-label="Main navigation"><a className="landing-brand" href="#top"><span className="landing-brand-mark"><GraphKeepMark /></span><span>GraphKeep</span></a><div className="landing-nav-links"><a href="#workflow">Workflow</a><a href="#capabilities">Capabilities</a></div><button className="landing-sign-in" onClick={start}>Sign in</button></nav>
    <section className="landing-hero" id="top">
      <motion.div className="landing-hero-copy" {...rise} transition={{ duration: .55, ease: 'easeOut' }}><p className="landing-kicker"><span /> Repository intelligence</p><h1>GraphKeep turns repositories into a <em>navigable map.</em></h1><p className="landing-lede">Connect GitHub, organize work into projects, and understand every dependency, risk, and ownership signal in one place.</p><div className="landing-actions"><button className="landing-primary" onClick={start}>Get started <ArrowRight size={17} /></button><a className="landing-secondary" href="#workflow">See how it works</a></div></motion.div>
      <motion.div className="landing-workspace-preview" initial={reduceMotion ? false : { opacity: 0, scale: .96, rotate: 1.5 }} animate={reduceMotion ? undefined : { opacity: 1, scale: 1, rotate: 0 }} transition={{ duration: .7, delay: reduceMotion ? 0 : .1, ease: 'easeOut' }} aria-label="Example GraphKeep workspace"><div className="preview-topbar"><span className="preview-dot" /><span>Platform workspace / API project</span><span className="preview-live">Analyzed</span></div><div className="preview-body"><aside className="preview-rail"><GitBranch size={17} /><span className="preview-rail-active" /><span /><span /></aside><div className="preview-content"><div className="preview-heading"><div><span>Repository map</span><strong>acme/api</strong></div><span className="preview-status"><CircleDotDashed size={14} /> Dependencies mapped</span></div><div className="preview-run-grid"><div className="preview-evidence"><p>Signals <b>04</b></p><div className="preview-source"><FileCode2 size={14} /><span>src/auth/session.ts</span><CheckCircle2 size={14} /></div><div className="preview-source"><GitBranch size={14} /><span>src/api/router.ts</span><CheckCircle2 size={14} /></div><div className="preview-source"><Search size={14} /><span>Database relationships</span><span className="preview-pulse" /></div></div><div className="preview-approval"><p>Project flow</p><strong>Workspace → Project → Repository</strong><span>Repository access is verified before analysis starts.</span><button type="button">Ready to explore</button></div></div><div className="preview-timeline"><span>Latest activity</span><div><i /><b>Dependency graph generated</b><small>Now</small></div><div><i /><b>Repository verified</b><small>1 min ago</small></div></div></div></div></motion.div>
    </section>
    <section className="landing-proof" id="workflow"><p>One focused path from connection to understanding.</p><div><span>GITHUB</span><ArrowRight size={15} /><span>WORKSPACE</span><ArrowRight size={15} /><span>PROJECT</span><ArrowRight size={15} /><span>GRAPH</span></div></section>
    <section className="landing-capabilities" id="capabilities"><div className="landing-section-intro"><h2>Start with the work you actually own.</h2><p>GraphKeep keeps repositories inside their projects, so analysis starts with the context your team chose.</p></div><div className="landing-capability-list">{capabilities.map(({ icon: Icon, title, copy }, index) => <motion.article key={title} className="landing-capability" initial={reduceMotion ? false : { opacity: 0, y: 16 }} whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }} viewport={{ once: true, amount: .3 }} transition={{ duration: .4, delay: index * .08 }}><span className="landing-capability-icon"><Icon size={21} /></span><h3>{title}</h3><p>{copy}</p></motion.article>)}</div></section>
    <section className="landing-close"><Sparkles size={24} /><h2>Bring your codebase into focus.</h2><button className="landing-primary" onClick={start}>Get started <ArrowRight size={17} /></button></section>
  </main>;
}
