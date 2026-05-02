// tweaks-panel.jsx — floating design tweaks panel

const { useState: useState_T, useEffect: useEffect_T, useRef: useRef_T } = React;

/* ── useTweaks ───────────────────────────────────────────────────────────── */
function useTweaks(defaults) {
  const key = '__gg_tweaks__';
  const stored = (() => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } })();
  const [t, setT] = useState_T({ ...defaults, ...stored });

  const setTweak = (k, v) => {
    setT(prev => {
      const next = { ...prev, [k]: v };
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  return [t, setTweak];
}

/* ── Primitive controls ──────────────────────────────────────────────────── */
function TweakSection({ label }) {
  return (
    <div style={{
      fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-4)',
      letterSpacing: '0.1em', textTransform: 'uppercase',
      borderTop: '1px solid var(--line)', margin: '8px 0 6px', paddingTop: 10,
    }}>{label}</div>
  );
}

function TweakRow({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-3)', flex: 1, minWidth: 0 }}>{label}</span>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function TweakRadio({ label, value, options, onChange }) {
  return (
    <TweakRow label={label}>
      <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', borderRadius: 5, padding: 2, border: '1px solid var(--line)' }}>
        {options.map(o => (
          <button key={o.value} onClick={() => onChange(o.value)} style={{
            fontFamily: 'var(--mono)', fontSize: 10, padding: '3px 7px', borderRadius: 4, border: 0, cursor: 'default',
            background: value === o.value ? 'rgba(63,185,80,0.15)' : 'transparent',
            color: value === o.value ? 'var(--accent)' : 'var(--fg-3)',
            boxShadow: value === o.value ? 'inset 0 0 0 1px rgba(63,185,80,0.3)' : 'none',
            transition: 'all .1s',
          }}>{o.label}</button>
        ))}
      </div>
    </TweakRow>
  );
}

function TweakColor({ label, value, onChange }) {
  return (
    <TweakRow label={label}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ position: 'relative', width: 22, height: 22 }}>
          <input type="color" value={value} onChange={e => onChange(e.target.value)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'default', border: 0, padding: 0 }}/>
          <span style={{
            display: 'block', width: 22, height: 22, borderRadius: 5,
            background: value, border: '1px solid rgba(255,255,255,0.15)',
            pointerEvents: 'none',
          }}/>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-3)' }}>{value}</span>
      </div>
    </TweakRow>
  );
}

function TweakSelect({ label, value, options, onChange }) {
  return (
    <TweakRow label={label}>
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg)',
        background: 'var(--bg-2)', border: '1px solid var(--line-strong)',
        borderRadius: 5, padding: '3px 6px', cursor: 'default', outline: 'none',
        maxWidth: 130,
      }}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </TweakRow>
  );
}

function TweakToggle({ label, value, onChange }) {
  return (
    <TweakRow label={label}>
      <button onClick={() => onChange(!value)} style={{
        width: 30, height: 17, borderRadius: 999, border: 0, cursor: 'default',
        background: value ? 'rgba(63,185,80,0.35)' : 'var(--bg-3)',
        boxShadow: value ? 'inset 0 0 0 1px rgba(63,185,80,0.5)' : 'inset 0 0 0 1px var(--line-strong)',
        position: 'relative', transition: 'all .15s',
      }}>
        <span style={{
          position: 'absolute', top: 1.5, left: value ? 13 : 1.5,
          width: 12, height: 12, borderRadius: '50%',
          background: value ? 'var(--accent)' : 'var(--fg-4)',
          transition: 'left .15s',
        }}/>
      </button>
    </TweakRow>
  );
}

/* ── TweaksPanel ─────────────────────────────────────────────────────────── */
function TweaksPanel({ title = 'Tweaks', children }) {
  const [open, setOpen] = useState_T(true);

  return (
    <div style={{
      position: 'fixed', right: 16, top: 68, zIndex: 2147483646,
      width: 240, fontFamily: 'var(--mono)',
    }}>
      <div style={{
        background: 'rgba(11,14,19,0.92)', border: '1px solid var(--line-strong)',
        borderRadius: 10, backdropFilter: 'blur(16px)',
        overflow: 'hidden',
      }}>
        {/* header */}
        <button onClick={() => setOpen(o => !o)} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '9px 12px', border: 0, background: 'transparent',
          cursor: 'default', color: 'var(--fg-2)',
          borderBottom: open ? '1px solid var(--line)' : 'none',
        }}>
          <span style={{ fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--accent)' }}>◈</span>
            {title}
          </span>
          <span style={{ fontSize: 10, color: 'var(--fg-4)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
        </button>

        {open && (
          <div style={{ padding: '10px 12px 12px' }}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakColor, TweakSelect, TweakToggle });
