import { motion } from 'framer-motion';
import { Database, Sparkles, Layout, Shield, ArrowRight } from 'lucide-react';
import { Icon } from '../components/ui/Icon';

export default function LandingPage() {
  const handleGitHubAuth = () => {
    window.location.href = `${import.meta.env.VITE_API_URL ?? 'http://localhost:5000'}/auth/github`;
  };

  return (
    <div className="landing-container" style={{
      minHeight: '100vh',
      background: 'var(--bg-main)',
      color: 'var(--text-primary)',
      overflowX: 'hidden',
      position: 'relative'
    }}>
      {/* Background Decor */}
      <div style={{ position: 'absolute', top: '-10%', right: '-5%', width: '600px', height: '600px', background: 'radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)', zIndex: 0, opacity: 0.5 }} />
      <div style={{ position: 'absolute', bottom: '-10%', left: '-5%', width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%)', zIndex: 0, opacity: 0.5 }} />

      {/* Grid Overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `linear-gradient(var(--border-glass) 1px, transparent 1px), linear-gradient(90deg, var(--border-glass) 1px, transparent 1px)`,
        backgroundSize: '50px 50px',
        maskImage: 'radial-gradient(ellipse at center, black, transparent 90%)',
        opacity: 0.1,
        zIndex: 1
      }} />

      {/* Navbar */}
      <nav style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '24px 60px',
        position: 'relative',
        zIndex: 20,
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid var(--border-glass)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'var(--accent-primary)', padding: '8px', borderRadius: '10px', display: 'flex' }}>
            <Icon name="logo" size="m" className="text-white" />
          </div>
          <span style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.03em' }}>CodeFlow</span>
        </div>
        <div style={{ display: 'flex', gap: '40px', fontSize: '0.9rem', fontWeight: 500 }}>
          {['Features', 'Docs', 'Pricing', 'Security'].map(item => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              style={{ cursor: 'pointer', color: 'var(--text-secondary)', transition: 'color 0.2s', textDecoration: 'none' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
            >
              {item}
            </a>
          ))}
        </div>
        <button
          onClick={handleGitHubAuth}
          style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', padding: '10px 20px', borderRadius: '10px', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}
        >
          Sign In
        </button>
      </nav>

      {/* Hero Section */}
      <main style={{ position: 'relative', zIndex: 10, maxWidth: '1200px', margin: '0 auto', padding: '100px 20px', textAlign: 'center' }}>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 20px',
            background: 'rgba(16, 185, 129, 0.1)',
            borderRadius: '100px',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            marginBottom: '32px',
            color: 'var(--accent-primary)',
            fontSize: '0.85rem',
            fontWeight: 600
          }}>
            <Sparkles size={14} />
            <span>Introducing the Ghost File System v2.0</span>
          </div>

          <h1 style={{ fontSize: 'clamp(3rem, 10vw, 5.5rem)', fontWeight: 850, lineHeight: 0.95, marginBottom: '28px', letterSpacing: '-0.04em' }}>
            The OS for Your <br/>
            <span style={{ background: 'linear-gradient(to right, #10b981, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Code Infrastructure</span>
          </h1>

          <p style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', maxWidth: '750px', margin: '0 auto 48px', lineHeight: 1.6 }}>
            Bridges the gap between heavy Git engines and live introspection.
            Map dependencies, visualize databases, and explore your architecture with zero latency.
          </p>

          <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginBottom: '120px' }}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleGitHubAuth}
              style={{
                background: 'var(--accent-primary)',
                color: 'white',
                padding: '18px 40px',
                borderRadius: '14px',
                fontSize: '1.15rem',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                boxShadow: '0 20px 40px rgba(16, 185, 129, 0.2)'
              }}
            >
              <Icon name="github" size="m" /> Get Started Free
            </motion.button>
            <button style={{
              background: 'transparent',
              color: 'var(--text-primary)',
              padding: '18px 40px',
              borderRadius: '14px',
              fontSize: '1.15rem',
              fontWeight: 600,
              border: '1px solid var(--border-glass)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              View Demo <ArrowRight size={18} />
            </button>
          </div>
        </motion.div>

        {/* Features Showcase */}
        <div id="features" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '32px' }}>
          {[
            {
              icon: <Database size={28} />,
              title: "Live DB Introspection",
              desc: "Automatically map Django, SQLAlchemy, and Prisma schemas into interactive ER diagrams directly from your source code.",
              color: "#3b82f6",
              tryLink: true
            },
            {
              icon: <Layout size={28} />,
              title: "Ghost File System",
              desc: "Proprietary virtualization engine that handles 50,000+ files at 60fps using Decoupled Asynchronous State Architecture.",
              color: "#10b981",
              tryLink: false
            },
            {
              icon: <Shield size={28} />,
              title: "Security Intelligence",
              desc: "Identify security regressions and sensitive data leaks before they reach production with automated PR scanning.",
              color: "#f59e0b",
              tryLink: false
            }
          ].map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.15 }}
              style={{
                padding: '40px',
                background: 'var(--bg-glass)',
                borderRadius: '28px',
                border: '1px solid var(--border-glass)',
                textAlign: 'left',
                backdropFilter: 'blur(12px)',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '16px',
                background: `${f.color}15`,
                color: f.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '28px'
              }}>
                {f.icon}
              </div>
              <h3 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '16px' }}>{f.title}</h3>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '1.05rem' }}>{f.desc}</p>
              {f.tryLink && (
                <a
                  href="/db"
                  style={{ display: 'inline-block', marginTop: '16px', color: '#3b82f6', fontSize: '0.9rem', fontWeight: 600, textDecoration: 'none' }}
                >
                  Try it →
                </a>
              )}

              <div style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: '100px',
                height: '100px',
                background: `radial-gradient(circle at top right, ${f.color}10, transparent 70%)`
              }} />
            </motion.div>
          ))}
        </div>

        {/* Stats Section */}
        <div id="pricing" style={{ marginTop: '120px', padding: '60px', background: 'var(--bg-glass)', borderRadius: '32px', border: '1px solid var(--border-glass)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '40px' }}>
          {[
            { label: 'Files Handled', value: '1M+' },
            { label: 'Analysis Speed', value: '250ms' },
            { label: 'Active Teams', value: '450+' },
            { label: 'Frameworks', value: '12' }
          ].map((stat, i) => (
            <div key={i}>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>{stat.value}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </main>

      <footer style={{ padding: '80px 60px 40px', borderTop: '1px solid var(--border-glass)', marginTop: '80px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginBottom: '32px' }}>
          <Icon name="logo" size="m" />
          <span style={{ fontSize: '1.2rem', fontWeight: 800 }}>CodeFlow</span>
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          © 2026 CodeFlow Systems. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
