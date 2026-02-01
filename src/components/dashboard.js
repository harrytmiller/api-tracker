import React, { useState, useEffect } from 'react';

const emptyAnalysis = {
  specName: null,
  totalEndpoints: 0,
  trafficSamples: 0,
  endpoints: [],
  mismatches: [],
  breakingRisks: [],
  fieldUsage: []
};

function analyzeApiContract(specData, trafficData) {
  const analysis = {
    specName: specData?.info?.title || 'API Spec',
    totalEndpoints: 0,
    trafficSamples: 0,
    endpoints: [],
    mismatches: [],
    breakingRisks: [],
    fieldUsage: []
  };

  const specEndpoints = {};
  if (specData?.paths) {
    Object.entries(specData.paths).forEach(([path, methods]) => {
      Object.entries(methods).forEach(([method, details]) => {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
          const key = `${method.toUpperCase()} ${path}`;
          specEndpoints[key] = { method: method.toUpperCase(), path, deprecated: details.deprecated || false };
        }
      });
    });
  }

  const trafficStats = trafficData?.aggregated_stats?.by_endpoint || {};
  const fieldPresence = trafficData?.aggregated_stats?.field_presence || {};
  const typeObservations = trafficData?.aggregated_stats?.type_observations || {};
  
  analysis.trafficSamples = trafficData?.meta?.total_requests || 0;
  analysis.totalEndpoints = Object.keys(specEndpoints).length;

  Object.entries(specEndpoints).forEach(([key, spec]) => {
    const hits = trafficStats[key]?.count || 0;
    let risk = 'ok';
    if (hits === 0) risk = 'dead';
    else if (spec.deprecated) risk = 'warning';

    analysis.endpoints.push({ method: spec.method, path: spec.path, hits, risk });
  });

  analysis.endpoints.sort((a, b) => b.hits - a.hits);

  Object.entries(fieldPresence).forEach(([endpoint, fields]) => {
    Object.entries(fields).forEach(([field, pct]) => {
      const pctNum = parseFloat(pct);
      if (field.includes('metadata') || field.includes('_v2')) {
        analysis.mismatches.push({ type: 'extra', endpoint, field, frequency: pct, severity: 'warning' });
      }
      if (pctNum === 0 && !field.includes('metadata')) {
        analysis.mismatches.push({ type: 'unused', endpoint, field, frequency: pct, severity: 'warning' });
      }
    });
  });

  Object.entries(typeObservations).forEach(([endpoint, fields]) => {
    Object.entries(fields).forEach(([field, data]) => {
      if (data.observed && Object.keys(data.observed).length > 1) {
        const actualType = Object.keys(data.observed).find(t => t !== data.expected);
        const actualPct = data.observed[actualType] || '?';
        analysis.mismatches.push({
          type: 'type',
          endpoint,
          field,
          expected: data.expected,
          actual: actualType,
          frequency: actualPct,
          severity: 'error'
        });
      }
    });
  });

  // Breaking risks - analyze what would break if removed
  Object.entries(fieldPresence).forEach(([endpoint, fields]) => {
    Object.entries(fields).forEach(([field, pct]) => {
      const pctNum = parseFloat(pct);
      if (!field.includes('.')) {
        let severity = 'high';
        if (pctNum < 30) severity = 'medium';
        if (pctNum < 5) severity = 'safe';
        
        analysis.breakingRisks.push({
          action: 'Field',
          target: field,
          impact: pctNum < 5 ? 'Safe to delete' : `Dont delete — ${pct} of traffic`,
          severity
        });
      }
    });
  });

  // Dead endpoints are safe to remove
  analysis.endpoints.forEach(ep => {
    if (ep.risk === 'dead') {
      analysis.breakingRisks.push({
        action: 'Endpoint',
        target: `${ep.method} ${ep.path}`,
        impact: 'Safe to delete — no traffic',
        severity: 'safe'
      });
    }
    if (ep.risk === 'warning') {
      analysis.breakingRisks.push({
        action: 'Endpoint',
        target: `${ep.method} ${ep.path}`,
        impact: `Deprecated — still ${ep.hits.toLocaleString()} requests`,
        severity: 'deprecated'
      });
    }
  });

  // Field usage
  const firstEndpoint = Object.entries(fieldPresence)[0];
  if (firstEndpoint) {
    Object.entries(firstEndpoint[1]).slice(0, 8).forEach(([field, pct]) => {
      analysis.fieldUsage.push({ field, usage: parseFloat(pct) });
    });
    analysis.fieldUsage.sort((a, b) => b.usage - a.usage);
  }

  return analysis;
}

export default function APIDashboard({ analysis: propAnalysis, onUpload }) {
  const [analysis, setAnalysis] = useState(propAnalysis || emptyAnalysis);
  const [uploadDrag, setUploadDrag] = useState(false);
  const [specFile, setSpecFile] = useState(null);
  const [trafficFile, setTrafficFile] = useState(null);
  const fileInputRef = React.useRef(null);

  useEffect(() => { if (propAnalysis) setAnalysis(propAnalysis); }, [propAnalysis]);

  useEffect(() => {
    if (specFile && trafficFile) {
      const result = analyzeApiContract(specFile.parsedContent, trafficFile.parsedContent);
      result.specName = specFile.name;
      setAnalysis(result);
    }
  }, [specFile, trafficFile]);

  const hasData = analysis.specName !== null;

  const handleFiles = (files) => {
    Array.from(files).filter(f => /\.(yaml|yml|json|har)$/.test(f.name)).forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target.result;
        let parsed = null;
        try {
          if (/\.(json|har)$/.test(file.name)) parsed = JSON.parse(content);
          else parsed = parseYaml(content);
        } catch { alert(`Error parsing ${file.name}`); return; }

        const fileData = { name: file.name, parsedContent: parsed };
        if (/\.(yaml|yml)$/.test(file.name) || parsed?.openapi || parsed?.swagger) setSpecFile(fileData);
        else setTrafficFile(fileData);
        if (onUpload) onUpload(fileData);
      };
      reader.readAsText(file);
    });
  };

  const parseYaml = (str) => {
    const result = {};
    const stack = [{ obj: result, indent: -1 }];
    for (let line of str.split('\n')) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const indent = line.search(/\S/);
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
      const parent = stack[stack.length - 1].obj;
      if (line.includes(':')) {
        const [k, ...v] = line.split(':');
        const key = k.trim(), val = v.join(':').trim();
        if (!val) { parent[key] = {}; stack.push({ obj: parent[key], indent }); }
        else parent[key] = val === 'true' ? true : val === 'false' ? false : val.replace(/^["']|["']$/g, '');
      }
    }
    return result;
  };

  const handleDrop = (e) => { e.preventDefault(); setUploadDrag(false); handleFiles(e.dataTransfer.files); };

  const getColor = (risk) => ({ error: '#ff4d4d', warning: '#ffa64d', dead: '#555', info: '#555', ok: '#4dff88' }[risk] || '#4dffff');
  const methodColor = (m) => ({ GET: '#4dff88', POST: '#4d88ff', PATCH: '#ffa64d', DELETE: '#ff4d4d', PUT: '#a64dff' }[m] || '#4dffff');

  const healthScore = analysis.endpoints.length ? Math.round((analysis.endpoints.filter(e => e.risk === 'ok').length / analysis.endpoints.length) * 100) : 0;

  // Combine all issues: mismatches + dead endpoints + deprecated endpoints
  const allIssues = [
    ...analysis.mismatches,
    ...analysis.endpoints.filter(ep => ep.risk === 'dead').map(ep => ({
      type: 'dead',
      endpoint: `${ep.method} ${ep.path}`,
      field: `${ep.method} ${ep.path}`,
      frequency: '0 requests',
      severity: 'dead'
    })),
    ...analysis.endpoints.filter(ep => ep.risk === 'warning').map(ep => ({
      type: 'deprecated',
      endpoint: `${ep.method} ${ep.path}`,
      field: `${ep.method} ${ep.path}`,
      frequency: `${ep.hits.toLocaleString()} requests`,
      severity: 'warning'
    }))
  ];

  // Sort issues: errors first, then warnings, then dead
  const severityOrder = { error: 0, warning: 1, dead: 2 };
  allIssues.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));

  // Filter organization optimizer to only show safe-to-delete and deprecated items
  const optimizerItems = analysis.breakingRisks.filter(r => 
    r.severity === 'safe' || r.severity === 'deprecated'
  );

  // Sort optimizer: Field first, then Endpoint; within each by safe (can be deleted) then deprecated
  const actionOrder = { Field: 0, Endpoint: 1 };
  const optSeverityOrder = { safe: 0, deprecated: 1 };
  optimizerItems.sort((a, b) => {
    const actionDiff = (actionOrder[a.action] ?? 2) - (actionOrder[b.action] ?? 2);
    if (actionDiff !== 0) return actionDiff;
    return (optSeverityOrder[a.severity] ?? 2) - (optSeverityOrder[b.severity] ?? 2);
  });

  return (
    <div style={styles.container}>
      <div style={styles.grid} />
      <input ref={fileInputRef} type="file" multiple accept=".yaml,.yml,.json,.har" hidden onChange={(e) => handleFiles(e.target.files)} />
      
      <header style={styles.header}>
        <div style={styles.logo}>
          <span style={styles.title}>API INTEL</span>
        </div>
        {hasData && <span style={styles.badge}>◈ {analysis.specName}</span>}
      </header>

      {!hasData ? (
        <div style={styles.empty}>
          <svg width="56" height="56" viewBox="0 0 80 80" fill="none" style={{ opacity: 0.4, marginBottom: 16 }}>
            <rect x="8" y="16" width="64" height="48" rx="2" stroke="#4dffff" strokeWidth="1.5" strokeDasharray="4 2" />
            <path d="M40 28v24M28 40l12-12 12 12" stroke="#4dffff" strokeWidth="1.5" />
          </svg>
          <h2 style={styles.emptyTitle}>Upload Files to Analyze</h2>
          <div style={styles.fileChecks}>
            <div style={{...styles.fileCheck, borderColor: specFile ? '#4dff88' : '#333'}}>
              <span style={{ color: specFile ? '#4dff88' : '#555' }}>{specFile ? '✓' : '1'}</span>
              <span>OpenAPI Spec</span>
            </div>
            <div style={{...styles.fileCheck, borderColor: trafficFile ? '#4dff88' : '#333'}}>
              <span style={{ color: trafficFile ? '#4dff88' : '#555' }}>{trafficFile ? '✓' : '2'}</span>
              <span>Traffic Data</span>
            </div>
          </div>
          <div 
            style={{...styles.dropzone, ...(uploadDrag ? styles.dropzoneActive : {})}}
            onDragOver={(e) => { e.preventDefault(); setUploadDrag(true); }}
            onDragLeave={() => setUploadDrag(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            Drop files or click to browse
          </div>
        </div>
      ) : (
        <main style={styles.main}>
          {/* Health */}
          <div style={styles.health}>
            <div style={styles.ring}>
              <svg width="100" height="100" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="44" fill="none" stroke="#1a1f2e" strokeWidth="6" />
                <circle cx="50" cy="50" r="44" fill="none" stroke={healthScore > 70 ? '#4dff88' : '#ffa64d'} strokeWidth="6" strokeDasharray={`${healthScore * 2.76} 276`} strokeLinecap="round" transform="rotate(-90 50 50)" />
              </svg>
              <span style={styles.ringVal}>{healthScore}%</span>
            </div>
            <div>
              <div style={styles.healthLabel}>Contract Health</div>
              <div style={styles.healthMeta}>{analysis.totalEndpoints} endpoints · {analysis.trafficSamples.toLocaleString()} requests · {allIssues.length} issues</div>
            </div>
          </div>

          {/* Stats */}
          <div style={styles.stats}>
            <div style={styles.stat}><span style={{...styles.statNum, color: '#4dff88'}}>{analysis.endpoints.filter(e => e.risk === 'ok').length}</span><span style={styles.statLbl}>Healthy</span></div>
            <div style={styles.stat}><span style={{...styles.statNum, color: '#555'}}>{analysis.endpoints.filter(e => e.risk === 'dead').length}</span><span style={styles.statLbl}>Dead</span></div>
            <div style={styles.stat}><span style={{...styles.statNum, color: '#ffa64d'}}>{allIssues.filter(m => m.severity === 'warning').length}</span><span style={styles.statLbl}>Warnings</span></div>
            <div style={styles.stat}><span style={{...styles.statNum, color: '#ff4d4d'}}>{allIssues.filter(m => m.severity === 'error').length}</span><span style={styles.statLbl}>Errors</span></div>
          </div>

          {/* Issues - Now includes dead, warnings, and errors */}
          {allIssues.length > 0 && (
            <section>
              <h3 style={styles.section}>Issues</h3>
              <div style={styles.issues}>
                {allIssues.map((m, i) => (
                  <div key={i} style={{...styles.issue, borderLeftColor: getColor(m.severity)}}>
                    <div style={{...styles.issueType, color: getColor(m.severity)}}>
                      {m.type === 'extra' && 'Undocumented Field'}
                      {m.type === 'unused' && 'Never Used'}
                      {m.type === 'type' && 'Type Mismatch'}
                      {m.type === 'dead' && 'Dead Endpoint'}
                      {m.type === 'deprecated' && 'Deprecated'}
                    </div>
                    <div style={styles.issueField}>{m.field}</div>
                    <div style={styles.issueDesc}>
                      {m.type === 'extra' && 'In traffic but missing from spec'}
                      {m.type === 'unused' && 'In spec but never sent by clients'}
                      {m.type === 'type' && <>Expected <span style={{color: '#4dff88'}}>{m.expected}</span> → Got <span style={{color: '#ff4d4d'}}>{m.actual}</span> ({m.frequency})</>}
                      {m.type === 'dead' && 'No traffic received — candidate for removal'}
                      {m.type === 'deprecated' && `Still receiving ${m.frequency}`}
                    </div>
                    <div style={styles.issueMeta}>{m.endpoint}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Organization Optimizer - Only safe-to-delete (red) and deprecated (orange) */}
          {optimizerItems.length > 0 && (
            <section>
              <h3 style={styles.section}>Organization Optimizer</h3>
              <div style={styles.risks}>
                {optimizerItems.map((r, i) => (
                  <div key={i} style={{
                    ...styles.riskRow, 
                    borderLeftColor: r.severity === 'safe' ? '#ff4d4d' : '#ffa64d'
                  }}>
                    <div style={styles.riskAction}>{r.action.toUpperCase()}</div>
                    <div style={styles.riskTarget}>{r.target}</div>
                    <div style={{
                      ...styles.riskImpact, 
                      color: r.severity === 'safe' ? '#ff4d4d' : '#ffa64d'
                    }}>
                      {r.severity === 'safe' ? '⊘ Can be deleted' : '⚠ Deprecated'}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Field Usage */}
          {analysis.fieldUsage.length > 0 && (
            <section>
              <h3 style={styles.section}>Field Usage</h3>
              <div style={styles.usage}>
                {analysis.fieldUsage.map((f, i) => (
                  <div key={i} style={styles.usageRow}>
                    <span style={styles.usageField}>{f.field}</span>
                    <div style={styles.usageBarWrap}>
                      <div style={{...styles.usageBar, width: `${f.usage}%`, background: f.usage < 5 ? '#555' : f.usage < 30 ? '#ffa64d' : '#4dff88'}} />
                    </div>
                    <span style={styles.usagePct}>{f.usage}%</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Endpoints */}
          <section>
            <h3 style={styles.section}>Endpoints</h3>
            <div style={styles.endpoints}>
              {analysis.endpoints.map((ep, i) => (
                <div key={i} style={styles.ep}>
                  <span style={{...styles.method, background: methodColor(ep.method)}}>{ep.method}</span>
                  <span style={styles.path}>{ep.path}</span>
                  <span style={styles.hits}>{ep.hits.toLocaleString()}</span>
                  <span style={{...styles.risk, background: getColor(ep.risk)}}>{ep.risk}</span>
                </div>
              ))}
            </div>
          </section>

          <div style={styles.reupload} onClick={() => { setSpecFile(null); setTrafficFile(null); setAnalysis(emptyAnalysis); }}>
            ↻ Start over
          </div>
        </main>
      )}
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', background: '#0a0f1a', color: '#e0e6ed', fontFamily: "'Space Grotesk', sans-serif" },
  grid: { position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(77,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(77,255,255,0.015) 1px, transparent 1px)', backgroundSize: '32px 32px', pointerEvents: 'none' },
  
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid rgba(77,255,255,0.1)', background: 'rgba(10,15,26,0.95)', position: 'relative', zIndex: 1 },
  logo: { display: 'flex', alignItems: 'center', gap: '10px' },
  title: { fontSize: '14px', fontWeight: 600, letterSpacing: '2px', color: '#4dffff' },
  badge: { fontSize: '11px', padding: '4px 10px', background: 'rgba(77,255,255,0.08)', border: '1px solid rgba(77,255,255,0.15)', fontFamily: 'monospace', color: '#4dffff' },

  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 20px', position: 'relative', zIndex: 1 },
  emptyTitle: { margin: '0 0 20px', fontSize: '16px', color: '#4dffff', letterSpacing: '1px', fontWeight: 500 },
  fileChecks: { display: 'flex', gap: '10px', marginBottom: '20px' },
  fileCheck: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', border: '1px solid', background: 'rgba(10,15,26,0.8)', fontSize: '12px' },
  dropzone: { padding: '32px 48px', border: '2px dashed rgba(77,255,255,0.2)', color: '#6b7c93', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s' },
  dropzoneActive: { borderColor: '#4dffff', background: 'rgba(77,255,255,0.05)', color: '#4dffff' },

  main: { padding: '20px', maxWidth: '800px', margin: '0 auto', position: 'relative', zIndex: 1 },

  health: { display: 'flex', alignItems: 'center', gap: '20px', padding: '16px', background: 'rgba(77,255,255,0.02)', border: '1px solid rgba(77,255,255,0.08)', marginBottom: '16px' },
  ring: { position: 'relative', width: '100px', height: '100px' },
  ringVal: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: 700, fontFamily: 'monospace', color: '#4dffff' },
  healthLabel: { fontSize: '12px', color: '#6b7c93', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' },
  healthMeta: { fontSize: '13px', color: '#8b9cb3' },

  stats: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' },
  stat: { padding: '14px', background: 'rgba(10,15,26,0.5)', border: '1px solid rgba(77,255,255,0.05)', textAlign: 'center' },
  statNum: { display: 'block', fontSize: '22px', fontWeight: 700, fontFamily: 'monospace' },
  statLbl: { fontSize: '10px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px' },

  section: { margin: '0 0 10px', fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px' },
  sectionDesc: { margin: '-6px 0 12px', fontSize: '12px', color: '#6b7c93' },
  
  issues: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px' },
  issue: { padding: '10px', background: 'rgba(10,15,26,0.5)', borderLeft: '3px solid' },
  issueType: { fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' },
  issueField: { fontSize: '12px', fontFamily: 'monospace', marginBottom: '2px' },
  issueDesc: { fontSize: '11px', color: '#6b7c93', marginBottom: '4px' },
  issueMeta: { fontSize: '10px', color: '#444' },

  risks: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' },
  riskRow: { display: 'flex', alignItems: 'center', padding: '10px 12px', background: 'rgba(10,15,26,0.5)', borderLeft: '3px solid', gap: '12px' },
  riskAction: { fontSize: '10px', color: '#6b7c93', textTransform: 'uppercase', letterSpacing: '0.5px', minWidth: '140px' },
  riskTarget: { flex: 1, fontSize: '12px', fontFamily: 'monospace', color: '#e0e6ed', fontWeight: 600 },
  riskImpact: { fontSize: '11px', fontFamily: 'monospace', textAlign: 'right' },

  usage: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' },
  usageRow: { display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' },
  usageField: { fontSize: '11px', fontFamily: 'monospace', color: '#8b9cb3', minWidth: '180px' },
  usageBarWrap: { flex: 1, height: '6px', background: 'rgba(77,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' },
  usageBar: { height: '100%', borderRadius: '3px', transition: 'width 0.3s' },
  usagePct: { fontSize: '11px', fontFamily: 'monospace', color: '#555', minWidth: '40px', textAlign: 'right' },

  endpoints: { display: 'flex', flexDirection: 'column', gap: '4px' },
  ep: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'rgba(10,15,26,0.5)', border: '1px solid rgba(77,255,255,0.03)' },
  method: { padding: '2px 6px', fontSize: '9px', fontWeight: 600, color: '#0a0f1a', borderRadius: '2px', minWidth: '44px', textAlign: 'center' },
  path: { flex: 1, fontSize: '12px', fontFamily: 'monospace', color: '#7a8a9a' },
  hits: { fontSize: '11px', fontFamily: 'monospace', color: '#555', minWidth: '50px', textAlign: 'right' },
  risk: { padding: '2px 6px', fontSize: '8px', fontWeight: 600, color: '#0a0f1a', borderRadius: '2px', textTransform: 'uppercase' },

  reupload: { marginTop: '20px', padding: '10px', textAlign: 'center', color: '#444', fontSize: '11px', cursor: 'pointer', border: '1px dashed rgba(77,255,255,0.08)' },
};