// landing.jsx — GitGraph marketing landing

const { useState: useState_L, useEffect: useEffect_L } = React;

function CodeSample() {
  return (
    <div className="gg-code">
      <div className="gg-code-hd">
        <div style={{display:'flex', gap:10, alignItems:'center'}}>
          <div className="gg-code-dots"><span/><span/><span/></div>
          <span style={{fontFamily:'var(--mono)'}}>analyze.ts</span>
        </div>
        <span style={{fontFamily:'var(--mono)', fontSize:11}}>typescript · 24 lines</span>
      </div>
      <div className="gg-code-body">
{`<span class="tok-com">// connect once, query forever</span>
<span class="tok-kw">import</span> { graph } <span class="tok-kw">from</span> <span class="tok-str">'gitgraph'</span>

<span class="tok-kw">const</span> <span class="tok-var">repo</span> = <span class="tok-kw">await</span> <span class="tok-fn">graph.connect</span>({
  source: <span class="tok-str">'github.com/acme/api'</span>,
  branch: <span class="tok-str">'main'</span>,
  depth: <span class="tok-num">3</span>,
})

<span class="tok-kw">const</span> { nodes, edges } = <span class="tok-kw">await</span> <span class="tok-var">repo</span>.<span class="tok-fn">analyze</span>({
  detect: [<span class="tok-str">'circular'</span>, <span class="tok-str">'orphans'</span>, <span class="tok-str">'leaks'</span>],
})

<span class="tok-com">// → 1,247 files indexed in 312ms</span>
<span class="tok-com">// → 4 circular deps, 2 unused exports</span>
<span class="tok-fn">graph.render</span>(nodes, edges)`}
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, desc, accent, demo }) {
  return (
    <div className="gg-card" style={{padding:24, display:'flex', flexDirection:'column', gap:16, minHeight: 280}}>
      <div style={{display:'flex', alignItems:'center', gap:10}}>
        <span style={{
          width:34, height:34, borderRadius:8,
          display:'grid', placeItems:'center',
          background: accent + '14', color: accent,
          border: '1px solid ' + accent + '33',
        }}>{icon}</span>
        <span style={{fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-3)', letterSpacing:'0.06em', textTransform:'uppercase'}}>
          {title.split('·')[0]}
        </span>
      </div>
      <div>
        <h3 style={{margin:0, fontSize:18, fontWeight:600, letterSpacing:'-0.01em'}}>{title.split('·')[1] || title}</h3>
        <p style={{marginTop:8, color:'var(--fg-3)', fontSize:14, lineHeight:1.6}}>{desc}</p>
      </div>
      <div style={{marginTop:'auto'}}>{demo}</div>
    </div>
  );
}

function TerminalDemo() {
  return (
    <div style={{
      fontFamily:'var(--mono)', fontSize:12,
      background:'var(--bg)', borderRadius:8,
      padding:'10px 12px', border:'1px solid var(--line)',
      lineHeight:1.7,
    }}>
      <div><span style={{color:'var(--accent)'}}>$</span> <span style={{color:'var(--fg-2)'}}>gg scan --secrets</span></div>
      <div style={{color:'var(--fg-3)'}}>scanning 1,247 files...</div>
      <div><span style={{color:'var(--danger)'}}>!</span> <span style={{color:'var(--fg-2)'}}>3 issues</span> <span style={{color:'var(--fg-3)'}}>in 0.4s</span></div>
    </div>
  );
}

function SchemaDemo() {
  return (
    <div style={{
      fontFamily:'var(--mono)', fontSize:11,
      background:'var(--bg)', borderRadius:8, padding:12,
      border:'1px solid var(--line)', display:'grid',
      gridTemplateColumns:'1fr 1fr', gap:8,
    }}>
      {['users', 'posts', 'comments', 'sessions'].map((t, i) => (
        <div key={t} style={{
          padding:'6px 8px', borderRadius:5,
          background: 'rgba(88,166,255,0.06)',
          border:'1px solid rgba(88,166,255,0.2)',
          color:'var(--info)',
          display:'flex', justifyContent:'space-between',
        }}>
          <span>{t}</span>
          <span style={{color:'var(--fg-4)'}}>{[12,8,6,4][i]}c</span>
        </div>
      ))}
    </div>
  );
}

function BranchDemo() {
  return (
    <svg viewBox="0 0 240 70" style={{width:'100%', height:70}}>
      <line x1="10" y1="20" x2="230" y2="20" stroke="var(--accent)" strokeWidth="1.5"/>
      <line x1="60" y1="20" x2="100" y2="50" stroke="var(--magenta)" strokeWidth="1.5"/>
      <line x1="100" y1="50" x2="180" y2="50" stroke="var(--magenta)" strokeWidth="1.5"/>
      <line x1="180" y1="50" x2="200" y2="20" stroke="var(--magenta)" strokeWidth="1.5"/>
      {[10, 60, 110, 160, 200, 230].map((x, i) => (
        <circle key={i} cx={x} cy="20" r="4" fill="var(--bg)" stroke="var(--accent)" strokeWidth="1.5"/>
      ))}
      {[100, 140, 180].map((x, i) => (
        <circle key={i} cx={x} cy="50" r="4" fill="var(--bg)" stroke="var(--magenta)" strokeWidth="1.5"/>
      ))}
      <text x="10" y="65" fontFamily="var(--mono)" fontSize="9" fill="var(--fg-3)">main</text>
      <text x="100" y="40" fontFamily="var(--mono)" fontSize="9" fill="var(--fg-3)">feat/auth</text>
    </svg>
  );
}

function Stat({ value, label, sub }) {
  return (
    <div style={{padding:'24px 32px'}}>
      <div style={{
        fontFamily:'var(--mono)', fontSize:32, fontWeight:600,
        color:'var(--fg)', letterSpacing:'-0.03em',
        display:'flex', alignItems:'baseline', gap:6,
      }}>
        {value}
        {sub && <span style={{fontSize:14, color:'var(--accent)', fontWeight:400}}>{sub}</span>}
      </div>
      <div style={{
        marginTop:6, fontFamily:'var(--mono)', fontSize:11,
        color:'var(--fg-3)', letterSpacing:'0.06em', textTransform:'uppercase',
      }}>{label}</div>
    </div>
  );
}

function Landing({ onNavigate }) {
  return (
    <div data-screen-label="01 Landing">
      <div className="gg-grid-bg"/>
      <GGNav variant="marketing" onNavigate={onNavigate}/>

      {/* Hero */}
      <section className="gg-section" style={{paddingTop: 80, paddingBottom: 48}}>
        <div className="gg-container" style={{display:'grid', gridTemplateColumns:'1.05fr 1fr', gap:64, alignItems:'center'}}>
          <div>
            <span className="gg-eyebrow">
              <span style={{width:6, height:6, borderRadius:'50%', background:'var(--accent)', boxShadow:'0 0 6px var(--accent)'}}/>
              v0.4.2 · open source
            </span>
            <h1 style={{
              margin: '24px 0 0',
              fontSize: 64, lineHeight: 1.02,
              fontWeight: 600, letterSpacing: '-0.035em',
              fontFamily: 'var(--sans)',
            }}>
              Read your repo<br/>
              <span style={{
                fontFamily:'var(--mono)', fontWeight:500, letterSpacing:'-0.04em',
                background: 'linear-gradient(90deg, var(--accent), var(--info))',
                WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
                backgroundClip:'text',
              }}>
                like a graph<span className="gg-cursor" style={{verticalAlign:'-3px'}}/>
              </span>
            </h1>
            <p style={{
              marginTop:24, maxWidth:520,
              fontSize:17, lineHeight:1.6, color:'var(--fg-2)',
            }}>
              GitGraph indexes architecture, dependencies, and database schemas — then
              renders them as a queryable graph. Find dead code, circular imports, and
              schema drift in seconds.
            </p>
            <div style={{display:'flex', gap:12, marginTop:32, alignItems:'center'}}>
              <button className="gg-btn gg-btn-primary" onClick={() => onNavigate?.('repo')}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
                continue with github
              </button>
              <button className="gg-btn gg-btn-secondary" onClick={() => onNavigate?.('db')}>
                try the schema visualizer →
              </button>
            </div>
            <div style={{
              marginTop:28, display:'flex', alignItems:'center', gap:14,
              fontFamily:'var(--mono)', fontSize:12, color:'var(--fg-3)',
            }}>
              <span><span className="gg-kbd">⌘</span> <span className="gg-kbd">K</span></span>
              <span style={{opacity:0.5}}>·</span>
              <span>install via</span>
              <code style={{background:'var(--bg-2)', padding:'4px 8px', borderRadius:5, color:'var(--fg-2)'}}>brew install gitgraph</code>
            </div>
          </div>
          <div>
            <GraphViz/>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section style={{
        position:'relative', zIndex:1,
        borderTop:'1px solid var(--line)', borderBottom:'1px solid var(--line)',
        background:'rgba(255,255,255,0.015)',
      }}>
        <div className="gg-container" style={{
          display:'grid', gridTemplateColumns:'repeat(4, 1fr)',
          divideX:'1px solid var(--line)',
        }}>
          {[
            { v:'1.2M', l:'files indexed daily', s:'+18%' },
            { v:'180', l:'p50 analysis (ms)' },
            { v:'10k', l:'fps schema render' },
            { v:'14', l:'frameworks understood' },
          ].map((s, i) => (
            <div key={i} style={{
              borderLeft: i ? '1px solid var(--line)' : 'none',
            }}>
              <Stat value={s.v} label={s.l} sub={s.s}/>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="gg-section">
        <div className="gg-container">
          <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:40}}>
            <div>
              <span className="gg-eyebrow">// features</span>
              <h2 style={{
                margin:'18px 0 0', fontSize:42, fontWeight:600,
                letterSpacing:'-0.03em', maxWidth:600,
              }}>
                Four lenses on the same codebase.
              </h2>
            </div>
            <p style={{maxWidth:380, color:'var(--fg-3)', fontSize:14, lineHeight:1.6, margin:0}}>
              Each view shares a common index — switch perspectives without re-scanning.
              Selection state follows you between graph, schema, and security.
            </p>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:16}}>
            <FeatureCard
              icon={<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"/></svg>}
              accent="#3fb950"
              title="GRAPH · Architecture map"
              desc="Modules, files, and imports rendered live. Click any node to trace what depends on it."
              demo={<BranchDemo/>}
            />
            <FeatureCard
              icon={<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/></svg>}
              accent="#58a6ff"
              title="SCHEMA · Database visualizer"
              desc="Drop in credentials, an SQL dump, or a repo. Tables, foreign keys, and indexes — instantly."
              demo={<SchemaDemo/>}
            />
            <FeatureCard
              icon={<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/></svg>}
              accent="#bc8cff"
              title="BRANCH · Review timeline"
              desc="Side-by-side branch comparison with inline reviewer notes and conflict prediction."
              demo={<BranchDemo/>}
            />
            <FeatureCard
              icon={<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M11.46.146A.5.5 0 0 0 11.107 0H4.893a.5.5 0 0 0-.353.146L.146 4.54A.5.5 0 0 0 0 4.893v6.214a.5.5 0 0 0 .146.353l4.394 4.394a.5.5 0 0 0 .353.146h6.214a.5.5 0 0 0 .353-.146l4.394-4.394a.5.5 0 0 0 .146-.353V4.893a.5.5 0 0 0-.146-.353Z"/></svg>}
              accent="#f85149"
              title="SECURITY · Vulnerability scan"
              desc="Secrets, outdated deps, exposed surfaces — flagged at file, function, and route level."
              demo={<TerminalDemo/>}
            />
          </div>
        </div>
      </section>

      {/* Code + visual split */}
      <section className="gg-section" style={{paddingTop:0}}>
        <div className="gg-container">
          <div className="gg-card" style={{
            padding:48,
            background:'linear-gradient(180deg, rgba(255,255,255,0.02), transparent)',
            display:'grid', gridTemplateColumns:'1fr 1fr', gap:48, alignItems:'center',
          }}>
            <div>
              <span className="gg-eyebrow">// embed</span>
              <h2 style={{margin:'16px 0 16px', fontSize:32, fontWeight:600, letterSpacing:'-0.025em'}}>
                Or use it as a library.
              </h2>
              <p style={{color:'var(--fg-2)', fontSize:15, lineHeight:1.65, margin:0, maxWidth:440}}>
                Same engine that powers the UI, exposed as a single TypeScript package.
                Build your own dashboards, lint rules, or AI tooling on top.
              </p>
              <div style={{marginTop:24, display:'flex', gap:10}}>
                <button className="gg-btn gg-btn-secondary">read the docs →</button>
                <button className="gg-btn gg-btn-ghost">npm i gitgraph</button>
              </div>
            </div>
            <CodeSample/>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="gg-section" style={{paddingTop:32, paddingBottom:80}}>
        <div className="gg-container" style={{textAlign:'center'}}>
          <div style={{
            fontFamily:'var(--mono)', fontSize:13, color:'var(--fg-3)',
            display:'inline-flex', alignItems:'center', gap:10,
          }}>
            <span style={{height:1, width:40, background:'var(--line-strong)'}}/>
            <span>$ gitgraph init</span>
            <span style={{height:1, width:40, background:'var(--line-strong)'}}/>
          </div>
          <h2 style={{
            margin:'20px 0 14px', fontSize:48, fontWeight:600,
            letterSpacing:'-0.03em',
          }}>Stop reading code line by line.</h2>
          <p style={{color:'var(--fg-3)', fontSize:16, maxWidth:520, margin:'0 auto 28px'}}>
            Free for public repos. 14-day trial on private. No credit card.
          </p>
          <div style={{display:'flex', gap:12, justifyContent:'center'}}>
            <button className="gg-btn gg-btn-primary" onClick={() => onNavigate?.('repo')}>
              continue with github
            </button>
            <button className="gg-btn gg-btn-ghost">or browse the demo repo →</button>
          </div>
        </div>
      </section>

      <footer style={{
        position:'relative', zIndex:1,
        borderTop:'1px solid var(--line)',
        padding:'24px 28px',
        display:'flex', justifyContent:'space-between', alignItems:'center',
        fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-3)',
      }}>
        <span>gitgraph © 2026 · MIT license</span>
        <span>commit <span style={{color:'var(--fg-2)'}}>#a8f3c2d</span> · deployed 2 hours ago</span>
      </footer>
    </div>
  );
}

window.Landing = Landing;
