// db.jsx — Database Visualizer connect (split layout)

const { useState: useState_D, useEffect: useEffect_D, useRef: useRef_D } = React;

const SOURCES = [
  { id: 'postgres', label: 'PostgreSQL',   sub: 'host · port · creds',     color: '#336791', icon: 'P' },
  { id: 'mysql',    label: 'MySQL',        sub: 'host · port · creds',     color: '#00758f', icon: 'M' },
  { id: 'sqlite',   label: 'SQLite',       sub: 'local file path',          color: '#003b57', icon: 'S' },
  { id: 'mongo',    label: 'MongoDB',      sub: 'connection string',        color: '#4DB33D', icon: 'M' },
  { id: 'sqldump',  label: 'SQL Dump',     sub: 'paste or upload .sql',     color: '#bc8cff', icon: '⤓' },
  { id: 'repo',     label: 'From Repo',    sub: 'parse migrations folder',  color: '#3fb950', icon: 'G' },
  { id: 'csv',      label: 'CSV / Parquet', sub: 'infer schema from data',  color: '#76e4f7', icon: '☶' },
  { id: 'snowflake', label: 'Snowflake',   sub: 'account · warehouse',      color: '#29b5e8', icon: '❄' },
];

const RECENT = [
  { name: 'acme_prod',     kind: 'postgres', host: 'db.acme.io:5432',     when: '2h',  tables: 47 },
  { name: 'analytics_warehouse', kind: 'snowflake', host: 'xy12345.us-east-1', when: '1d', tables: 213 },
  { name: 'mobile-app.sql', kind: 'sqldump', host: 'local file',           when: '3d',  tables: 12 },
];

function MiniSchemaPreview() {
  return (
    <svg viewBox="0 0 400 200" style={{width:'100%', height:'auto', display:'block'}}>
      <defs>
        <pattern id="dotgrid2" width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="0.5" cy="0.5" r="0.5" fill="rgba(255,255,255,0.06)"/>
        </pattern>
      </defs>
      <rect width="400" height="200" fill="url(#dotgrid2)"/>

      {[
        { x: 30,  y: 40,  w: 100, label:'users', cols:['id','email','role'], color:'#3fb950' },
        { x: 170, y: 30,  w: 100, label:'posts', cols:['id','user_id','body'], color:'#58a6ff' },
        { x: 290, y: 90,  w: 100, label:'tags',  cols:['id','name'], color:'#bc8cff' },
        { x: 30,  y: 130, w: 100, label:'sessions', cols:['id','user_id'], color:'#d29922' },
      ].map((t, i) => (
        <g key={i}>
          <rect x={t.x} y={t.y} width={t.w} height={20 + t.cols.length * 14}
            rx="4" fill="rgba(13,17,23,0.95)" stroke={t.color} strokeWidth="1"/>
          <rect x={t.x} y={t.y} width={t.w} height="18" rx="4" fill={t.color} fillOpacity="0.15"/>
          <text x={t.x + 8} y={t.y + 13} fontFamily="var(--mono)" fontSize="9" fill={t.color}>{t.label}</text>
          {t.cols.map((c, ci) => (
            <text key={ci} x={t.x + 8} y={t.y + 30 + ci * 14}
              fontFamily="var(--mono)" fontSize="9" fill="var(--fg-3)">{c}</text>
          ))}
        </g>
      ))}
      {/* edges */}
      <path d="M130 70 Q 150 50 170 50" stroke="rgba(63,185,80,0.4)" fill="none" strokeWidth="1"/>
      <path d="M270 70 Q 285 80 290 100" stroke="rgba(88,166,255,0.4)" fill="none" strokeWidth="1"/>
      <path d="M80 130 Q 80 100 80 78"  stroke="rgba(210,153,34,0.4)" fill="none" strokeWidth="1"/>
    </svg>
  );
}

function SourceTile({ s, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:12,
      width:'100%', padding:'12px 14px',
      background: active ? 'rgba(63,185,80,0.06)' : 'var(--bg-1)',
      border: '1px solid ' + (active ? 'rgba(63,185,80,0.4)' : 'var(--line)'),
      borderRadius:8, cursor:'default',
      textAlign:'left', color:'inherit',
      transition:'all 0.12s',
      boxShadow: active ? 'inset 2px 0 0 var(--accent)' : 'none',
    }}>
      <span style={{
        width:32, height:32, borderRadius:6,
        display:'grid', placeItems:'center', flexShrink:0,
        background: s.color + '22',
        border: '1px solid ' + s.color + '55',
        color: s.color,
        fontFamily:'var(--mono)', fontSize:14, fontWeight:600,
      }}>{s.icon}</span>
      <div style={{minWidth:0, flex:1}}>
        <div style={{
          fontFamily:'var(--mono)', fontSize:13, fontWeight:500,
          color: active ? 'var(--accent)' : 'var(--fg)',
        }}>{s.label}</div>
        <div style={{fontSize:11, color:'var(--fg-3)', marginTop:2}}>{s.sub}</div>
      </div>
      {active && <span style={{color:'var(--accent)', fontFamily:'var(--mono)', fontSize:14}}>›</span>}
    </button>
  );
}

function FormField({ label, hint, children, half }) {
  return (
    <div style={{flex: half ? '1 1 0' : '1 1 100%'}}>
      <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:6}}>
        <label className="gg-label" style={{margin:0}}>{label}</label>
        {hint && <span style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-4)'}}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function DBVisualizer({ onNavigate }) {
  const [source, setSource] = useState_D('postgres');
  const [host, setHost] = useState_D('db.production.acme.io');
  const [port, setPort] = useState_D('5432');
  const [dbname, setDbname] = useState_D('acme_prod');
  const [user, setUser] = useState_D('readonly_app');
  const [pass, setPass] = useState_D('');
  const [ssl, setSsl] = useState_D(true);
  const [readonly, setReadonly] = useState_D(true);

  const cur = SOURCES.find(s => s.id === source);

  return (
    <div data-screen-label="03 DB Visualizer" style={{minHeight:'100vh'}}>
      <div className="gg-grid-bg"/>
      <GGNav variant="app" current="db-visualizer"/>

      <div style={{position:'relative', zIndex:1, padding:'28px 28px 60px'}}>
        <div style={{maxWidth:1200, margin:'0 auto'}}>
          {/* header */}
          <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:24, gap:24, flexWrap:'wrap'}}>
            <div>
              <div style={{display:'flex', alignItems:'center', gap:10, color:'var(--fg-3)', fontFamily:'var(--mono)', fontSize:12, marginBottom:8}}>
                <span style={{cursor:'default', color:'var(--fg-2)'}} onClick={() => onNavigate?.('repo')}>← workspace</span>
                <span style={{opacity:0.5}}>›</span>
                <span style={{color:'var(--fg)'}}>database_visualizer</span>
              </div>
              <h1 style={{margin:0, fontFamily:'var(--mono)', fontSize:24, fontWeight:500, letterSpacing:'-0.01em'}}>
                <span style={{color:'var(--fg-3)'}}>›</span> connect_database<span className="gg-cursor"/>
              </h1>
              <p style={{margin:'8px 0 0', color:'var(--fg-3)', fontSize:13, maxWidth:560}}>
                Pick a data source on the left, configure on the right. We pull schema, indexes, and foreign keys — never row data.
              </p>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:8, fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-3)'}}>
              <span style={{display:'inline-flex', width:6, height:6, borderRadius:'50%', background:'var(--accent)', boxShadow:'0 0 6px var(--accent)'}}/>
              tunnel ready · 4 connections cached
            </div>
          </div>

          {/* split */}
          <div className="gg-card" style={{
            padding:0, overflow:'hidden',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.015), transparent)',
            display:'grid', gridTemplateColumns:'320px 1fr 360px',
            minHeight: 560,
          }}>
            {/* LEFT: sources */}
            <div style={{
              padding:20, borderRight:'1px solid var(--line)',
              background:'rgba(0,0,0,0.18)',
              display:'flex', flexDirection:'column', gap:14,
            }}>
              <div>
                <div className="gg-label">data sources</div>
                <div style={{display:'flex', flexDirection:'column', gap:6, marginTop:4}}>
                  {SOURCES.map(s => (
                    <SourceTile key={s.id} s={s} active={source === s.id} onClick={() => setSource(s.id)}/>
                  ))}
                </div>
              </div>
              <div style={{marginTop:8}}>
                <div className="gg-label">recent</div>
                <div style={{display:'flex', flexDirection:'column', gap:6, marginTop:4}}>
                  {RECENT.map(r => (
                    <button key={r.name} style={{
                      display:'flex', alignItems:'center', gap:10,
                      padding:'8px 10px', borderRadius:6,
                      background:'transparent', border:'1px solid var(--line)',
                      cursor:'default', color:'inherit', textAlign:'left',
                    }}>
                      <span style={{
                        width:6, height:6, borderRadius:'50%',
                        background:'var(--accent)', boxShadow:'0 0 6px var(--accent)',
                        flexShrink:0,
                      }}/>
                      <div style={{minWidth:0, flex:1}}>
                        <div style={{fontFamily:'var(--mono)', fontSize:12, color:'var(--fg)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.name}</div>
                        <div style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-3)'}}>{r.host} · {r.tables} tables</div>
                      </div>
                      <span style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-4)'}}>{r.when}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* MIDDLE: form */}
            <div style={{padding:'28px 32px', display:'flex', flexDirection:'column', gap:22, minWidth:0}}>
              <div style={{display:'flex', alignItems:'center', gap:12}}>
                <span style={{
                  width:42, height:42, borderRadius:8,
                  display:'grid', placeItems:'center',
                  background: cur.color + '22', color: cur.color,
                  border: '1px solid ' + cur.color + '55',
                  fontFamily:'var(--mono)', fontSize:18, fontWeight:600,
                }}>{cur.icon}</span>
                <div>
                  <h2 style={{margin:0, fontFamily:'var(--mono)', fontSize:18, fontWeight:500}}>
                    connect to {cur.label.toLowerCase()}
                  </h2>
                  <div style={{fontSize:12, color:'var(--fg-3)', marginTop:2}}>
                    we'll establish a read-only TLS connection · credentials never leave your browser
                  </div>
                </div>
              </div>

              {source === 'sqldump' ? (
                <div style={{flex:1, display:'flex', flexDirection:'column', gap:14}}>
                  <FormField label="paste sql or drop file">
                    <div style={{
                      height:200, border:'1.5px dashed var(--line-strong)',
                      borderRadius:10, background:'var(--panel)',
                      display:'grid', placeItems:'center', textAlign:'center',
                      color:'var(--fg-3)', fontFamily:'var(--mono)', fontSize:12,
                    }}>
                      <div>
                        <div style={{fontSize:24, color:'var(--fg-4)', marginBottom:8}}>⤓</div>
                        drop <span style={{color:'var(--fg-2)'}}>schema.sql</span> here
                        <div style={{fontSize:11, marginTop:6, color:'var(--fg-4)'}}>or paste DDL · max 50 MB</div>
                      </div>
                    </div>
                  </FormField>
                </div>
              ) : (
                <div style={{display:'flex', flexDirection:'column', gap:14}}>
                  <div style={{display:'flex', gap:14}}>
                    <FormField label="host" hint="ipv4 / hostname">
                      <input className="gg-input" value={host} onChange={e => setHost(e.target.value)} style={{fontFamily:'var(--mono)'}}/>
                    </FormField>
                    <FormField label="port" half>
                      <input className="gg-input" value={port} onChange={e => setPort(e.target.value)} style={{fontFamily:'var(--mono)', maxWidth:120}}/>
                    </FormField>
                  </div>
                  <FormField label="database">
                    <input className="gg-input" value={dbname} onChange={e => setDbname(e.target.value)} style={{fontFamily:'var(--mono)'}}/>
                  </FormField>
                  <div style={{display:'flex', gap:14}}>
                    <FormField label="username" half>
                      <input className="gg-input" value={user} onChange={e => setUser(e.target.value)} style={{fontFamily:'var(--mono)'}}/>
                    </FormField>
                    <FormField label="password" hint="optional · uses keychain" half>
                      <input className="gg-input" type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" style={{fontFamily:'var(--mono)'}}/>
                    </FormField>
                  </div>
                  <div style={{display:'flex', gap:18, paddingTop:6}}>
                    <Toggle label="require SSL" value={ssl} onChange={setSsl}/>
                    <Toggle label="read-only mode" value={readonly} onChange={setReadonly}/>
                  </div>
                </div>
              )}

              {/* connection string preview */}
              <div style={{
                marginTop:'auto',
                background:'var(--panel)', border:'1px solid var(--line)',
                borderRadius:8, padding:'10px 14px',
                fontFamily:'var(--mono)', fontSize:12, color:'var(--fg-2)',
                display:'flex', alignItems:'center', gap:8,
                overflow:'hidden',
              }}>
                <span style={{color:'var(--fg-3)', flexShrink:0}}>conn ›</span>
                <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1}}>
                  <span style={{color:'var(--magenta)'}}>{source}{ssl && source !== 'sqldump' ? 's' : ''}</span>
                  <span style={{color:'var(--fg-3)'}}>://</span>
                  <span style={{color:'var(--info)'}}>{user || 'user'}</span>
                  <span style={{color:'var(--fg-3)'}}>:</span>
                  <span style={{color:'var(--fg-4)'}}>{pass ? '••••••' : '<key>'}</span>
                  <span style={{color:'var(--fg-3)'}}>@</span>
                  <span style={{color:'var(--accent)'}}>{host}:{port}</span>
                  <span style={{color:'var(--fg-3)'}}>/</span>
                  <span style={{color:'var(--fg)'}}>{dbname}</span>
                </span>
                <button style={{
                  background:'transparent', border:0, color:'var(--fg-3)',
                  cursor:'default', fontFamily:'var(--mono)', fontSize:11,
                  padding:'4px 8px', borderRadius:4,
                }}>copy</button>
              </div>

              <div style={{display:'flex', gap:10, alignItems:'center'}}>
                <button className="gg-btn gg-btn-primary" style={{flex:1, justifyContent:'center'}}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="m11.78 8.78-7 7a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734L9.69 8.75H1.75a.75.75 0 0 1 0-1.5h7.94L3.72 1.28A.749.749 0 0 1 4.78.22l7 7a.749.749 0 0 1 0 1.06Z"/></svg>
                  connect & analyze
                  <span className="gg-kbd" style={{background:'rgba(0,0,0,0.2)', borderColor:'rgba(0,0,0,0.3)', color:'rgba(6,32,13,0.7)', marginLeft:6}}>↵</span>
                </button>
                <button className="gg-btn gg-btn-secondary" style={{justifyContent:'center'}}>test connection</button>
              </div>
            </div>

            {/* RIGHT: preview */}
            <div style={{
              borderLeft:'1px solid var(--line)',
              background:'rgba(0,0,0,0.18)',
              padding:20, display:'flex', flexDirection:'column', gap:14,
            }}>
              <div>
                <div className="gg-label" style={{marginBottom:10}}>schema preview</div>
                <div style={{
                  background:'var(--panel)', border:'1px solid var(--line)',
                  borderRadius:8, overflow:'hidden',
                }}>
                  <MiniSchemaPreview/>
                </div>
                <div style={{
                  fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-3)',
                  marginTop:8, textAlign:'center',
                }}>preview after connect · 47 tables · 132 fkeys</div>
              </div>

              <div>
                <div className="gg-label" style={{marginBottom:10}}>what we read</div>
                <div style={{display:'flex', flexDirection:'column', gap:8}}>
                  {[
                    ['table & column metadata', true],
                    ['foreign keys & indexes', true],
                    ['view definitions', true],
                    ['row data / values', false],
                    ['stored procedures', true],
                  ].map(([label, yes]) => (
                    <div key={label} style={{
                      display:'flex', alignItems:'center', gap:10,
                      fontFamily:'var(--mono)', fontSize:12,
                      color: yes ? 'var(--fg-2)' : 'var(--fg-4)',
                    }}>
                      <span style={{
                        width:14, height:14, borderRadius:3,
                        display:'grid', placeItems:'center',
                        background: yes ? 'rgba(63,185,80,0.12)' : 'rgba(248,81,73,0.08)',
                        color: yes ? 'var(--accent)' : 'var(--danger)',
                        fontSize:9,
                      }}>{yes ? '✓' : '✕'}</span>
                      <span style={{textDecoration: yes ? 'none' : 'line-through'}}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{
                marginTop:'auto',
                padding:'12px 14px',
                background:'rgba(88,166,255,0.06)',
                border:'1px solid rgba(88,166,255,0.18)',
                borderRadius:8,
                fontSize:11.5, lineHeight:1.5, color:'var(--fg-2)',
              }}>
                <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6, color:'var(--info)', fontFamily:'var(--mono)', fontSize:11}}>
                  <span>ⓘ</span> safe by default
                </div>
                Connection runs in your browser via WebSocket tunnel. Credentials are encrypted with your local key — they never touch our servers.
              </div>
            </div>
          </div>

          {/* keyboard hints */}
          <div style={{
            marginTop:18, display:'flex', justifyContent:'center', gap:24,
            fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-3)',
          }}>
            <span><span className="gg-kbd">tab</span> next field</span>
            <span><span className="gg-kbd">⌘</span><span className="gg-kbd">↵</span> connect</span>
            <span><span className="gg-kbd">⌘</span><span className="gg-kbd">,</span> saved connections</span>
            <span><span className="gg-kbd">esc</span> back to workspace</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <button onClick={() => onChange(!value)} style={{
      display:'inline-flex', alignItems:'center', gap:8,
      background:'transparent', border:0, cursor:'default',
      color:'inherit', padding:0, fontFamily:'inherit',
    }}>
      <span style={{
        width:30, height:18, borderRadius:999,
        background: value ? 'rgba(63,185,80,0.3)' : 'var(--bg-3)',
        border: '1px solid ' + (value ? 'rgba(63,185,80,0.5)' : 'var(--line-strong)'),
        position:'relative', transition:'all 0.15s',
      }}>
        <span style={{
          position:'absolute', top:1, left: value ? 13 : 1,
          width:14, height:14, borderRadius:'50%',
          background: value ? 'var(--accent)' : 'var(--fg-3)',
          transition:'left 0.15s',
        }}/>
      </span>
      <span style={{fontFamily:'var(--mono)', fontSize:12, color: value ? 'var(--fg-2)' : 'var(--fg-3)'}}>{label}</span>
    </button>
  );
}

window.DBVisualizer = DBVisualizer;
