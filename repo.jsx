// repo.jsx — Command-palette style repository selector

const { useState: useState_R, useEffect: useEffect_R, useMemo: useMemo_R, useRef: useRef_R } = React;

const REPOS = [
  { name:'CodeGraph',                 desc:'Interactive code architecture visualizer with AST parsing.', lang:'HTML',       langColor:'#e34c26', stars: 142, vis:'public',  age:'7d',   files:'8.2k', branch:'main',     status:'analyzed' },
  { name:'Weather-Load-analyzer',     desc:'Climate-aware grid load forecasting using historical NOAA data.', lang:'Python',     langColor:'#3572A5', stars: 38,  vis:'public',  age:'16d',  files:'1.4k', branch:'main',     status:'idle' },
  { name:'karapathy-NN-Zero2Hero',    desc:'Notes & exercises following Andrej Karpathy\'s neural net series.', lang:'Jupyter',    langColor:'#DA5B0B', stars: 12,  vis:'public',  age:'1mo',  files:'342',  branch:'master',   status:'idle' },
  { name:'Hands-On-Large-Language-Models', desc:"Companion code for the O'Reilly LLM book.", lang:'Python',     langColor:'#3572A5', stars: 91,  vis:'public',  age:'1mo',  files:'2.1k', branch:'main',     status:'idle' },
  { name:'ML-For-Beginners',          desc:'12 weeks, 26 lessons, 52 quizzes — classic ML for everyone.', lang:'Jupyter',    langColor:'#DA5B0B', stars: 412, vis:'public',  age:'1mo',  files:'5.6k', branch:'main',     status:'analyzed' },
  { name:'gstack',                    desc:"Garry Tan's exact Claude Code setup & opinionated tooling.", lang:'TypeScript', langColor:'#3178c6', stars: 28,  vis:'public',  age:'1mo',  files:'816',  branch:'main',     status:'idle' },
  { name:'ai-for-bharat',             desc:'Multilingual ASR pipeline for Indian languages.', lang:'Python',     langColor:'#3572A5', stars: 6,   vis:'private', age:'3mo',  files:'1.1k', branch:'develop',  status:'idle' },
  { name:'time-weaver',               desc:'Schedule a job, watch its timeline weave through CRON expressions.', lang:'TypeScript', langColor:'#3178c6', stars: 14,  vis:'private', age:'3mo',  files:'612',  branch:'main',     status:'idle' },
  { name:'Algo_Data_Stream',          desc:'Real-time + historical market data streaming with replay buffer.', lang:'Python',     langColor:'#3572A5', stars: 22,  vis:'public',  age:'9mo',  files:'2.3k', branch:'main',     status:'idle' },
  { name:'Student-Performance',       desc:'EDA + regression notebooks on UCI student grades dataset.', lang:'Jupyter',    langColor:'#DA5B0B', stars: 4,   vis:'public',  age:'10mo', files:'48',   branch:'main',     status:'idle' },
  { name:'Heap-Based-Optimization',   desc:'Building energy consumption optimizer with heap-based scheduler.', lang:'Python',     langColor:'#3572A5', stars: 7,   vis:'public',  age:'11mo', files:'124',  branch:'main',     status:'idle' },
  { name:'rust-mini-lsp',             desc:'A toy language-server protocol implementation in Rust.', lang:'Rust',       langColor:'#dea584', stars: 18,  vis:'public',  age:'1y',   files:'92',   branch:'main',     status:'idle' },
  { name:'go-graphdb-sandbox',        desc:'Append-only graph DB experiment, single-binary Go server.', lang:'Go',         langColor:'#00ADD8', stars: 9,   vis:'private', age:'1y',   files:'58',   branch:'main',     status:'idle' },
  { name:'next-portfolio-2024',       desc:'Personal portfolio site, Next.js 14 + MDX, ISR cached.', lang:'TypeScript', langColor:'#3178c6', stars: 3,   vis:'public',  age:'1y',   files:'214',  branch:'main',     status:'analyzed' },
];

const FILTERS = ['all', 'public', 'private', 'analyzed', 'starred'];
const LANGS = ['all', 'TypeScript', 'Python', 'Jupyter', 'Rust', 'Go', 'HTML'];

function LangDot({ color }) {
  return <span style={{
    display:'inline-block', width:10, height:10, borderRadius:'50%',
    background:color, boxShadow: '0 0 4px ' + color + '80',
    marginRight:6, verticalAlign:'middle',
  }}/>;
}

function RepoRow({ r, active, onMouseEnter, onSelect, mode }) {
  const ref = useRef_R(null);
  useEffect_R(() => {
    if (active && ref.current) ref.current.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (mode === 'card') {
    return (
      <div
        ref={ref}
        onMouseEnter={onMouseEnter}
        onClick={onSelect}
        className="gg-card"
        style={{
          padding:18, cursor:'default',
          borderColor: active ? 'rgba(63,185,80,0.4)' : 'var(--line)',
          background: active ? 'rgba(63,185,80,0.04)' : 'var(--bg-1)',
          boxShadow: active ? '0 0 0 1px rgba(63,185,80,0.4), 0 0 24px rgba(63,185,80,0.08)' : 'none',
          transform: active ? 'translateY(-1px)' : 'none',
        }}>
        <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8}}>
          <div style={{display:'flex', alignItems:'center', gap:8, minWidth:0}}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="var(--fg-3)" style={{flexShrink:0}}><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8Z"/></svg>
            <span style={{
              fontFamily:'var(--mono)', fontSize:13, fontWeight:500,
              color: active ? 'var(--accent)' : 'var(--info)',
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
            }}>{r.name}</span>
          </div>
          <span style={{
            padding:'2px 8px', borderRadius:999,
            fontFamily:'var(--mono)', fontSize:10,
            background: r.vis === 'public' ? 'rgba(63,185,80,0.08)' : 'rgba(255,255,255,0.04)',
            border: '1px solid ' + (r.vis === 'public' ? 'rgba(63,185,80,0.2)' : 'var(--line-strong)'),
            color: r.vis === 'public' ? 'var(--accent)' : 'var(--fg-3)',
            flexShrink:0,
          }}>{r.vis}</span>
        </div>
        <p style={{
          margin:'10px 0 14px', fontSize:13, color:'var(--fg-3)', lineHeight:1.5,
          display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden',
          minHeight: 39,
        }}>{r.desc}</p>
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-3)',
        }}>
          <span><LangDot color={r.langColor}/>{r.lang}</span>
          <span style={{display:'flex', gap:10}}>
            <span>★ {r.stars}</span>
            <span>{r.age} ago</span>
          </span>
        </div>
      </div>
    );
  }

  // List mode
  return (
    <div
      ref={ref}
      onMouseEnter={onMouseEnter}
      onClick={onSelect}
      style={{
        display:'grid',
        gridTemplateColumns: '20px 1.4fr 2fr 100px 100px 80px 90px',
        gap:14, alignItems:'center',
        padding:'10px 16px', borderRadius:8, cursor:'default',
        background: active ? 'rgba(63,185,80,0.07)' : 'transparent',
        boxShadow: active ? 'inset 0 0 0 1px rgba(63,185,80,0.3)' : 'none',
        fontFamily:'var(--mono)', fontSize:12,
        transition:'background 0.1s',
      }}>
      <span style={{color: active ? 'var(--accent)' : 'var(--fg-4)'}}>
        {active ? '▸' : <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8Z"/></svg>}
      </span>
      <span style={{color: active ? 'var(--accent)' : 'var(--info)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
        {r.name}
      </span>
      <span style={{color:'var(--fg-3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.desc}</span>
      <span style={{color:'var(--fg-2)'}}><LangDot color={r.langColor}/>{r.lang}</span>
      <span style={{color:'var(--fg-3)'}}>{r.branch}</span>
      <span style={{color:'var(--fg-3)'}}>★ {r.stars}</span>
      <span style={{color:'var(--fg-3)', textAlign:'right'}}>{r.age}</span>
    </div>
  );
}

function RepoPreview({ r }) {
  if (!r) return null;
  return (
    <div style={{padding:24, height:'100%', display:'flex', flexDirection:'column', gap:18}}>
      <div>
        <div style={{
          display:'inline-flex', alignItems:'center', gap:8,
          fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-3)',
          padding:'4px 10px', border:'1px solid var(--line-strong)',
          borderRadius:999, marginBottom:14,
        }}>
          <span style={{
            width:6, height:6, borderRadius:'50%',
            background: r.status === 'analyzed' ? 'var(--accent)' : 'var(--fg-4)',
            boxShadow: r.status === 'analyzed' ? '0 0 6px var(--accent)' : 'none',
          }}/>
          {r.status === 'analyzed' ? 'previously analyzed' : 'not analyzed yet'}
        </div>
        <h3 style={{
          margin:0, fontFamily:'var(--mono)', fontSize:18, fontWeight:500,
          color:'var(--info)', letterSpacing:'-0.01em', wordBreak:'break-word',
        }}>{r.name}</h3>
        <p style={{margin:'10px 0 0', fontSize:13, color:'var(--fg-2)', lineHeight:1.55}}>{r.desc}</p>
      </div>

      <div style={{
        display:'grid', gridTemplateColumns:'1fr 1fr', gap:1,
        background:'var(--line)', borderRadius:8, overflow:'hidden',
        border:'1px solid var(--line)',
      }}>
        {[
          ['language', <span><LangDot color={r.langColor}/>{r.lang}</span>],
          ['files', r.files],
          ['branch', r.branch],
          ['updated', r.age + ' ago'],
        ].map(([k, v]) => (
          <div key={k} style={{
            padding:'12px 14px', background:'var(--bg-1)',
            display:'flex', flexDirection:'column', gap:4,
          }}>
            <span style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.06em'}}>{k}</span>
            <span style={{fontFamily:'var(--mono)', fontSize:13, color:'var(--fg)'}}>{v}</span>
          </div>
        ))}
      </div>

      <div>
        <div style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8}}>recent commits</div>
        <div style={{
          fontFamily:'var(--mono)', fontSize:11.5, lineHeight:1.7,
          background:'var(--panel)', border:'1px solid var(--line)',
          borderRadius:8, padding:'10px 14px',
        }}>
          {[
            { h:'a8f3c2d', m:'fix: handle null branch refs', a:'2h' },
            { h:'4e1b09a', m:'feat: add schema diff endpoint', a:'1d' },
            { h:'9c2f8e1', m:'chore: bump deps to latest', a:'3d' },
          ].map(c => (
            <div key={c.h} style={{display:'flex', gap:10, color:'var(--fg-3)'}}>
              <span style={{color:'var(--accent)'}}>{c.h}</span>
              <span style={{color:'var(--fg-2)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{c.m}</span>
              <span>{c.a}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{marginTop:'auto', display:'flex', flexDirection:'column', gap:8}}>
        <button className="gg-btn gg-btn-primary" style={{width:'100%', justifyContent:'center'}}>
          analyze repository
          <span style={{marginLeft:8, opacity:0.7, display:'inline-flex', gap:4}}>
            <span className="gg-kbd" style={{background:'rgba(0,0,0,0.2)', borderColor:'rgba(0,0,0,0.3)', color:'rgba(6,32,13,0.7)'}}>↵</span>
          </span>
        </button>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
          <button className="gg-btn gg-btn-secondary" style={{justifyContent:'center', height:32, fontSize:12}}>open in graph</button>
          <button className="gg-btn gg-btn-secondary" style={{justifyContent:'center', height:32, fontSize:12}}>schema only</button>
        </div>
      </div>
    </div>
  );
}

function RepoSelector({ onNavigate }) {
  const [q, setQ] = useState_R('');
  const [filter, setFilter] = useState_R('all');
  const [lang, setLang] = useState_R('all');
  const [active, setActive] = useState_R(0);
  const [mode, setMode] = useState_R('list'); // list | card
  const inputRef = useRef_R(null);

  const filtered = useMemo_R(() => {
    return REPOS.filter(r => {
      if (filter === 'public' && r.vis !== 'public') return false;
      if (filter === 'private' && r.vis !== 'private') return false;
      if (filter === 'analyzed' && r.status !== 'analyzed') return false;
      if (filter === 'starred' && r.stars < 50) return false;
      if (lang !== 'all' && r.lang !== lang) return false;
      if (q && !(r.name.toLowerCase().includes(q.toLowerCase()) || r.desc.toLowerCase().includes(q.toLowerCase()))) return false;
      return true;
    });
  }, [q, filter, lang]);

  useEffect_R(() => { setActive(0); }, [q, filter, lang]);
  useEffect_R(() => { inputRef.current?.focus(); }, []);

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { /* select */ }
    else if (e.key === 'Escape') { setQ(''); }
  };

  const current = filtered[active];

  return (
    <div data-screen-label="02 Repo selector" style={{minHeight:'100vh', display:'flex', flexDirection:'column'}}>
      <div className="gg-grid-bg"/>
      <GGNav variant="app" current="select-repo"/>

      <div style={{
        position:'relative', zIndex:1, flex:1,
        display:'grid', gridTemplateColumns:'1fr 380px',
        minHeight:0,
      }}>
        {/* Left: command palette */}
        <div style={{display:'flex', flexDirection:'column', minHeight:0, padding:'24px 28px', gap:16}}>
          {/* Header */}
          <div>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:18}}>
              <div>
                <h1 style={{
                  margin:0, fontFamily:'var(--mono)', fontSize:20, fontWeight:500,
                  letterSpacing:'-0.01em',
                }}>
                  <span style={{color:'var(--fg-3)'}}>›</span> select_repository<span className="gg-cursor"/>
                </h1>
                <p style={{margin:'6px 0 0', color:'var(--fg-3)', fontSize:13}}>
                  {filtered.length} of {REPOS.length} repositories · indexed via github.com/raman1530
                </p>
              </div>
              <div style={{display:'flex', gap:6}}>
                <button
                  onClick={() => setMode('list')}
                  className={`gg-btn gg-btn-sm ${mode==='list' ? 'gg-btn-secondary' : 'gg-btn-ghost'}`}
                  style={mode==='list' ? {color:'var(--accent)', borderColor:'rgba(63,185,80,0.3)', background:'rgba(63,185,80,0.06)'} : {}}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M0 2a1 1 0 1 1 2 0 1 1 0 0 1-2 0Zm3.75-.5h11.5a.75.75 0 0 1 0 1.5H3.75a.75.75 0 0 1 0-1.5ZM0 8a1 1 0 1 1 2 0 1 1 0 0 1-2 0Zm3.75-.75h11.5a.75.75 0 0 1 0 1.5H3.75a.75.75 0 0 1 0-1.5ZM0 14a1 1 0 1 1 2 0 1 1 0 0 1-2 0Zm3.75-.75h11.5a.75.75 0 0 1 0 1.5H3.75a.75.75 0 0 1 0-1.5Z"/></svg>
                  list
                </button>
                <button
                  onClick={() => setMode('card')}
                  className={`gg-btn gg-btn-sm ${mode==='card' ? 'gg-btn-secondary' : 'gg-btn-ghost'}`}
                  style={mode==='card' ? {color:'var(--accent)', borderColor:'rgba(63,185,80,0.3)', background:'rgba(63,185,80,0.06)'} : {}}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 0A1.75 1.75 0 0 0 0 1.75v3c0 .966.784 1.75 1.75 1.75h3A1.75 1.75 0 0 0 6.5 4.75v-3A1.75 1.75 0 0 0 4.75 0h-3ZM1.5 1.75a.25.25 0 0 1 .25-.25h3a.25.25 0 0 1 .25.25v3a.25.25 0 0 1-.25.25h-3a.25.25 0 0 1-.25-.25v-3Zm9.75-.25A1.75 1.75 0 0 0 9.5 1.75v3c0 .966.784 1.75 1.75 1.75h3A1.75 1.75 0 0 0 16 4.75v-3A1.75 1.75 0 0 0 14.25 0Zm-.25 1.75a.25.25 0 0 1 .25-.25h3a.25.25 0 0 1 .25.25v3a.25.25 0 0 1-.25.25h-3a.25.25 0 0 1-.25-.25v-3ZM0 11.25c0-.966.784-1.75 1.75-1.75h3a1.75 1.75 0 0 1 1.75 1.75v3A1.75 1.75 0 0 1 4.75 16h-3A1.75 1.75 0 0 1 0 14.25v-3Zm1.75-.25a.25.25 0 0 0-.25.25v3a.25.25 0 0 0 .25.25h3a.25.25 0 0 0 .25-.25v-3a.25.25 0 0 0-.25-.25h-3Zm9.5-1.5A1.75 1.75 0 0 0 9.5 11.25v3A1.75 1.75 0 0 0 11.25 16h3A1.75 1.75 0 0 0 16 14.25v-3a1.75 1.75 0 0 0-1.75-1.75h-3Zm-.25 1.75a.25.25 0 0 1 .25-.25h3a.25.25 0 0 1 .25.25v3a.25.25 0 0 1-.25.25h-3a.25.25 0 0 1-.25-.25v-3Z"/></svg>
                  cards
                </button>
              </div>
            </div>
          </div>

          {/* Search */}
          <div style={{
            position:'relative',
            background:'var(--bg-1)', border:'1px solid var(--line-strong)',
            borderRadius:10, padding:'4px 12px',
            display:'flex', alignItems:'center', gap:10,
            transition:'border-color 0.15s, box-shadow 0.15s',
          }}>
            <span style={{
              fontFamily:'var(--mono)', fontSize:14, color:'var(--accent)',
              flexShrink:0,
            }}>›</span>
            <input
              ref={inputRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={onKey}
              placeholder="filter repositories — type to fuzzy match name or description"
              style={{
                flex:1, background:'transparent', border:0, outline:0,
                color:'var(--fg)', fontFamily:'var(--mono)', fontSize:13,
                padding:'10px 0',
              }}
            />
            <div style={{display:'flex', gap:6, alignItems:'center', color:'var(--fg-3)', fontFamily:'var(--mono)', fontSize:11}}>
              <span className="gg-kbd">↑</span><span className="gg-kbd">↓</span>
              <span style={{margin:'0 4px'}}>navigate</span>
              <span className="gg-kbd">↵</span>
              <span style={{margin:'0 4px'}}>analyze</span>
              <span className="gg-kbd">esc</span>
              <span style={{marginLeft:4}}>clear</span>
            </div>
          </div>

          {/* Filters */}
          <div style={{display:'flex', gap:14, alignItems:'center', flexWrap:'wrap'}}>
            <div style={{
              display:'flex', gap:0, padding:3,
              background:'var(--bg-1)', borderRadius:8,
              border:'1px solid var(--line)',
            }}>
              {FILTERS.map(f => (
                <button key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding:'6px 12px', border:0, borderRadius:5,
                    fontFamily:'var(--mono)', fontSize:12, cursor:'default',
                    background: filter === f ? 'rgba(63,185,80,0.1)' : 'transparent',
                    color: filter === f ? 'var(--accent)' : 'var(--fg-3)',
                    boxShadow: filter === f ? 'inset 0 0 0 1px rgba(63,185,80,0.25)' : 'none',
                    transition:'all 0.1s',
                  }}>{f}</button>
              ))}
            </div>
            <div style={{display:'flex', alignItems:'center', gap:8, fontFamily:'var(--mono)', fontSize:12, color:'var(--fg-3)'}}>
              <span>lang:</span>
              <div style={{display:'flex', gap:4, flexWrap:'wrap'}}>
                {LANGS.map(l => (
                  <button key={l}
                    onClick={() => setLang(l)}
                    style={{
                      padding:'4px 10px', border:'1px solid',
                      borderColor: lang === l ? 'rgba(63,185,80,0.3)' : 'var(--line)',
                      borderRadius:5,
                      fontFamily:'var(--mono)', fontSize:11, cursor:'default',
                      background: lang === l ? 'rgba(63,185,80,0.06)' : 'transparent',
                      color: lang === l ? 'var(--accent)' : 'var(--fg-3)',
                    }}>{l}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="gg-scroll" style={{flex:1, overflow:'auto', minHeight:0, paddingRight:6}}>
            {filtered.length === 0 ? (
              <div style={{
                padding:'80px 0', textAlign:'center',
                fontFamily:'var(--mono)', color:'var(--fg-3)',
              }}>
                <div style={{fontSize:24, marginBottom:12}}>(╯°□°)╯</div>
                <div style={{fontSize:13}}>no repositories match <span style={{color:'var(--fg)'}}>"{q}"</span></div>
              </div>
            ) : mode === 'card' ? (
              <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:14}}>
                {filtered.map((r, i) => (
                  <RepoRow key={r.name} r={r} active={i === active}
                    mode="card"
                    onMouseEnter={() => setActive(i)}
                    onSelect={() => setActive(i)}/>
                ))}
              </div>
            ) : (
              <div style={{display:'flex', flexDirection:'column'}}>
                <div style={{
                  display:'grid',
                  gridTemplateColumns: '20px 1.4fr 2fr 100px 100px 80px 90px',
                  gap:14, padding:'8px 16px',
                  fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-4)',
                  textTransform:'uppercase', letterSpacing:'0.06em',
                  borderBottom:'1px solid var(--line)', marginBottom:4,
                }}>
                  <span/>
                  <span>name</span>
                  <span>description</span>
                  <span>language</span>
                  <span>branch</span>
                  <span>★</span>
                  <span style={{textAlign:'right'}}>updated</span>
                </div>
                {filtered.map((r, i) => (
                  <RepoRow key={r.name} r={r} active={i === active}
                    mode="list"
                    onMouseEnter={() => setActive(i)}
                    onSelect={() => setActive(i)}/>
                ))}
              </div>
            )}
          </div>

          {/* Status bar */}
          <div style={{
            display:'flex', justifyContent:'space-between',
            paddingTop:12, borderTop:'1px solid var(--line)',
            fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-3)',
          }}>
            <span>showing <span style={{color:'var(--fg)'}}>{filtered.length}</span> · <span style={{color:'var(--accent)'}}>{filtered.filter(r=>r.status==='analyzed').length}</span> analyzed</span>
            <span>connected as <span style={{color:'var(--fg)'}}>raman1530</span> via oauth · scope: <span style={{color:'var(--fg)'}}>repo,read:org</span></span>
          </div>
        </div>

        {/* Right: preview pane */}
        <div style={{
          borderLeft:'1px solid var(--line)',
          background:'rgba(255,255,255,0.015)',
          display:'flex', flexDirection:'column',
          overflow:'auto',
        }}>
          <RepoPreview r={current}/>
        </div>
      </div>
    </div>
  );
}

window.RepoSelector = RepoSelector;
