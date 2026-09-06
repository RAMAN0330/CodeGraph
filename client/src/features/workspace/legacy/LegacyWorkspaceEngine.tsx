// @ts-nocheck -- isolated generated implementation; do not import outside the workspace page.
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Icon } from '../../../shared/components/Icon';
import { VirtualizedRepoTree } from '../../../shared/components/VirtualizedRepoTree';
import { Parser, DEFAULT_EXCLUDE_CHIPS, compileExcludePatterns, parseExcludePatterns, shouldExcludeFile, shouldIgnoreDirectory, buildAppUrl } from '../../analysis/services/parser';
import { GitHub, buildTree, calcBlast, calcHealth } from '../../repository/services/github';
import WorkspaceHeader from '../components/WorkspaceHeader';
import WorkspaceSidebar from '../components/WorkspaceSidebar';
import WorkspaceOverview from '../components/WorkspaceOverview';
import WorkspaceExplorerSidebar from '../components/WorkspaceExplorerSidebar';
import RepositoryGraphCanvas from '../components/RepositoryGraphCanvas';
import DatabaseSchemaSection from '../components/sections/DatabaseSchemaSection';
import PullRequestsSection from '../components/sections/PullRequestsSection';
import MigrationsSection from '../components/sections/MigrationsSection';
import SecuritySection from '../components/sections/SecuritySection';
import PatternsSection from '../components/sections/PatternsSection';
import ActionsSection from '../components/sections/ActionsSection';
import SettingsSection from '../components/sections/SettingsSection';
import PrivacyModal from '../components/modals/PrivacyModal';
import GithubAppKeyModal from '../components/modals/GithubAppKeyModal';
import ExcludePatternModal from '../components/modals/ExcludePatternModal';
import UnusedFunctionsModal from '../components/modals/UnusedFunctionsModal';
import ConfirmDialog from '../components/modals/ConfirmDialog';
import DrillDownModal from '../components/modals/DrillDownModal';
import PrReviewModal from '../components/modals/PrReviewModal';
import DbSchemaOverlay from '../components/modals/DbSchemaOverlay';
import AnalysisReportModal from '../components/modals/AnalysisReportModal';
import { generateReport } from '../../export/services/reportGenerator';
import { useDbSchemaLoader } from '../hooks/useDbSchemaLoader';
import ExplorerFilesView from '../components/ExplorerFilesView';
import FilePreviewModal from '../components/modals/FilePreviewModal';
import { parseDbSchema } from '../../database/services/dbParser';
import { saveBookmark } from '../services/bookmarks';
import { recordAnalysisSnapshot } from '../services/analysisHistory';
import { buildArchitectureGraph } from '../services/architectureGraph';
import CommandPalette from '../components/CommandPalette';
import { decodeShareLink } from '../../export/services/exporters';
import { extractManifestDependencies } from '../../security/services/manifestParser';
import { scanDependencies } from '../../security/services/osv';
import { fetchTrendData, buildActivityPoints } from '../../analysis/services/trends';
import { appConfig } from '../../../app/config';
import { analyzeSource } from '../../analysis/services/sourceAnalysisClient';

const extractManifestDeps = extractManifestDependencies;
const BranchDiff = React.lazy(() => import('../../git-insights/components/BranchDiff'));
const ContributorInsights = React.lazy(() => import('../../git-insights/components/ContributorInsights'));
const CommitTimeline = React.lazy(() => import('../../git-insights/components/CommitTimeline'));
const StaleCodeRadar = React.lazy(() => import('../../analysis/components/StaleCodeRadar'));
const CodeOwnershipMap = React.lazy(() => import('../../git-insights/components/CodeOwnershipMap'));
const ReleaseNotesGenerator = React.lazy(() => import('../../git-insights/components/ReleaseNotesGenerator'));
const TechDebtTimeline = React.lazy(() => import('../../analysis/components/TechDebtTimeline'));
const ExportModal = React.lazy(() => import('../../export/components/ExportModal'));
const MetricsTrendChart = React.lazy(() => import('../../analysis/components/MetricsTrendChart'));
const ArchitectureDiagram = React.lazy(() => import('../components/ArchitectureDiagram'));

export function canAutoRunSelectedRepo(authResolved: boolean, repo: string | null) {
    return authResolved && !!repo;
}

function iconLabel(name, label, size, className) {
    return React.createElement(React.Fragment, null,
        React.createElement(Icon, { name: name, size: size || 's', className: className } as any),
        ' ',
        label
    );
}

function sectionFallback(label?: string) {
    return React.createElement('div', { className: 'loading section-loading' },
        React.createElement('div', { className: 'spinner' }),
        React.createElement('div', { className: 'loading-text' }, label || 'Loading…')
    );
}

export default function LegacyWorkspaceEngine(){
    var _b=useState<any>(''),repoUrl=_b[0],setRepoUrl=_b[1];
    var _c=useState<any>(''),token=_c[0],setToken=_c[1];
    var _auth=useState<any>(null),authUser=_auth[0],setAuthUser=_auth[1];
    var _authResolved=useState<any>(false),authResolved=_authResolved[0],setAuthResolved=_authResolved[1];
    var _autoRunRepo=useState<any>(null),autoRunRepo=_autoRunRepo[0],setAutoRunRepo=_autoRunRepo[1];
    var _authMethod=useState<any>('none'),authMethod=_authMethod[0],setAuthMethod=_authMethod[1];// 'none', 'pat', 'github_app'
    var _appId=useState<any>(''),appId=_appId[0],setAppId=_appId[1];
    var _privateKey=useState<any>(''),privateKey=_privateKey[0],setPrivateKey=_privateKey[1];
    var _showKeyModal=useState<any>(false),showKeyModal=_showKeyModal[0],setShowKeyModal=_showKeyModal[1];
    var _d=useState<any>(false),loading=_d[0],setLoading=_d[1];
    var _e=useState<any>(''),progress=_e[0],setProgress=_e[1];
    var _f=useState<any>(null),error=_f[0],setError=_f[1];
    var _g=useState<any>(null),data=_g[0],setData=_g[1];
    var _h=useState<any>(null),repoInfo=_h[0],setRepoInfo=_h[1];
    var _j=useState<any>(null),selected=_j[0],setSelected=_j[1];
    var _k=useState<any>(new Set([''])),expandedPaths=_k[0],setExpandedPaths=_k[1];
    var _m2=useState<any>(null),drillDown=_m2[0],setDrillDown=_m2[1];// {type:'issue'|'pattern'|'security'|'suggestion'|'duplicate', data:...}
    var _n=useState<any>(null),blastRadius=_n[0],setBlastRadius=_n[1];
    var _o=useState<any>(null),ownership=_o[0],setOwnership=_o[1];
    var _p=useState<any>(''),prUrl=_p[0],setPrUrl=_p[1];
    var _q=useState<any>(null),prData=_q[0],setPrData=_q[1];
    var _r=useState<any>(false),showExport=_r[0],setShowExport=_r[1];
    var _s=useState<any>(false),showPR=_s[0],setShowPR=_s[1];
    var _t=useState<any>(false),showPrivacy=_t[0],setShowPrivacy=_t[1];
    var _v=useState<any>(null),toast=_v[0],setToast=_v[1];
    var _w=useState<any>(false),ownerLoading=_w[0],setOwnerLoading=_w[1];
    var _x=useState<any>(null),folderFilter=_x[0],setFolderFilter=_x[1];
    var _y=useState<any>(new Set()),expandedFns=_y[0],setExpandedFns=_y[1];
    var _z=useState<any>(false),showUnused=_z[0],setShowUnused=_z[1];
    var _ac=useState<any>(292),sidebarWidth=_ac[0],setSidebarWidth=_ac[1];
    var _xv=useState<'graph'|'files'>('graph'),explorerView=_xv[0],setExplorerView=_xv[1];
    useEffect(function(){if(!selected&&explorerView==='files')setExplorerView('graph');},[selected,explorerView]);
    var _af=useState<any>(null),filePreview=_af[0],setFilePreview=_af[1];// {path, content, line, filename, loading, error}
    var _ag=useState<any>(null),localDirHandle=_ag[0],setLocalDirHandle=_ag[1];
    var _ah=useState<any>(false),showExcludeModal=_ah[0],setShowExcludeModal=_ah[1];
    var _ai=useState<any>(''),excludePatternInput=_ai[0],setExcludePatternInput=_ai[1];
    var _aj=useState<any>(''),excludePatternDraft=_aj[0],setExcludePatternDraft=_aj[1];
    var _ak=useState<any>(false),launchFolderAfterExcludeSave=_ak[0],setLaunchFolderAfterExcludeSave=_ak[1];
    var _al=useState<any>(null),confirmDialog=_al[0],setConfirmDialog=_al[1];
    // Branch state
    var _br=useState<any>(''),currentBranch=_br[0],setCurrentBranch=_br[1];
    var _brl=useState<any>([]),branches=_brl[0],setBranches=_brl[1];
    var _brload=useState<any>(false),branchLoading=_brload[0],setBranchLoading=_brload[1];
    // DB schema auto-detected badge
    var _dbdet=useState<any>(false),dbSchemaDetected=_dbdet[0],setDbSchemaDetected=_dbdet[1];
    var _prevSnap=useState<any>(null),previousSnapshot=_prevSnap[0],setPreviousSnapshot=_prevSnap[1];
    // Active sidebar section
    var _sec=useState<any>('overview'),activeSection=_sec[0],setActiveSection=_sec[1];
    var _pal=useState<any>(false),showPalette=_pal[0],setShowPalette=_pal[1];
    var _vuln=useState<any>([]),vulns=_vuln[0],setVulns=_vuln[1];
    var _vulnLoad=useState<any>(false),vulnLoading=_vulnLoad[0],setVulnLoading=_vulnLoad[1];
    var _vulnErr=useState<any>(null),vulnError=_vulnErr[0],setVulnError=_vulnErr[1];
    var _tsnap=useState<any>([]),trendSnapshots=_tsnap[0],setTrendSnapshots=_tsnap[1];
    var _tactv=useState<any>([]),activityPoints=_tactv[0],setActivityPoints=_tactv[1];
    var _rcommits=useState<any>([]),recentCommits=_rcommits[0],setRecentCommits=_rcommits[1];
    var _tload=useState<any>(false),trendLoading=_tload[0],setTrendLoading=_tload[1];
    var _rc=useState<any>({}),revertCounts=_rc[0],setRevertCounts=_rc[1];
    var svgRef=useRef(null);
    var analysisContentCacheRef=useRef({});
    var analyzeGenerationRef=useRef(0);// guards against a stale poll loop applying results after a newer analyze() call started
    var selectFileRef=useRef(null);
    var confirmResolverRef=useRef(null);
    var activeExcludePatterns=useMemo(function(){return compileExcludePatterns(excludePatternInput);},[excludePatternInput]);

    useEffect(function(){
      Promise.all([
        fetch(`${appConfig.apiUrl}/auth/config`,{cache:'no-store'}).then(function(r){return r.ok?r.json():{github:false};}),
        fetch(`${appConfig.apiUrl}/auth/me`,{credentials:'include'}).then(function(r){return r.ok?r.json():null;})
      ])
        .then(function(results){
          var config=results[0],user=results[1];
          if(!user&&config.github){window.location.href='/';return;}
          if(user){
            setAuthUser(user);
            if(user.github){
              fetch(`${appConfig.apiUrl}/api/github/token`,{credentials:'include'})
                .then(function(r){return r.ok?r.json():null;})
                .then(function(data){if(data&&data.token)setToken(data.token);})
                .catch(function(){});
            }
          }
          setAuthResolved(true);
        })
        .catch(function(){setAuthResolved(true);});
    },[]);

    useEffect(function(){
        return function(){
            if(confirmResolverRef.current){
                confirmResolverRef.current(false);
                confirmResolverRef.current=null;
            }
        };
    },[]);

    useEffect(function(){
        if(!confirmDialog)return;
        function onKeyDown(e){
            if(e.key==='Escape'){
                e.preventDefault();
                closeConfirmDialog(false);
            }
        }
        document.addEventListener('keydown',onKeyDown);
        return function(){document.removeEventListener('keydown',onKeyDown);};
    },[confirmDialog]);

    useEffect(function(){
      function handleKey(e: any){
        if((e.ctrlKey||e.metaKey)&&e.key==='k'){
          e.preventDefault();
          if(data) setShowPalette(true);
        }
      }
      document.addEventListener('keydown', handleKey);
      return function(){ document.removeEventListener('keydown', handleKey); };
    }, [data]);

    useEffect(function(){
        var params=new URLSearchParams(window.location.search);
        var shareParam=params.get('share');
        if(shareParam){
            var decoded=decodeShareLink(shareParam);
            if(decoded&&decoded.repoUrl){
                setRepoUrl(decoded.repoUrl);
                setTimeout(function(){analyze();},100);
                return;
            }
        }
        var repo=params.get('repo');
        // Auto-run whenever a repo is named in the URL — this is also how a
        // page reload restores the workspace, since no analysis result is
        // kept in memory or storage across reloads. The old `run=1` flag
        // gated this, but nothing sets `run` back to 1 after the URL is
        // rewritten post-analysis (see buildAppUrl below), so a reload would
        // otherwise leave the "Restoring…" screen with nothing to restore it.
        if(repo&&repo.length<200&&!repo.includes('{')&&/^[a-zA-Z0-9_.\/-]+$/.test(repo)){
            setRepoUrl(repo);
            setAutoRunRepo(repo);
        }
    },[]);

    useEffect(function(){
        if(!canAutoRunSelectedRepo(authResolved,autoRunRepo))return;
        setAutoRunRepo(null);
        internal_analyze(undefined,autoRunRepo,token||undefined);
    },[authResolved,autoRunRepo,token]);

    useEffect(function(){
        if(!prData||!prData.files||!prData.files.length||!repoInfo)return;
        var cancelled=false;
        (async function(){
            var counts={};
            for(var i=0;i<prData.files.length&&!cancelled;i++){
                var f=prData.files[i];
                var fp=f.filename||f.path||'';
                if(!fp)continue;
                try{
                    var res=await fetch(
                        'https://api.github.com/repos/'+repoInfo.owner+'/'+repoInfo.repo+'/commits?per_page=20&path='+encodeURIComponent(fp),
                        {headers:{'Authorization':'token '+token,'Accept':'application/vnd.github.v3+json'}}
                    );
                    if(res.ok){
                        var commits=await res.json();
                        if(Array.isArray(commits)){
                            var reverts=commits.filter(function(c){return (c.commit&&c.commit.message||'').toLowerCase().startsWith('revert');}).length;
                            if(reverts>0)(counts as any)[fp]=reverts;
                        }
                    }
                }catch(e){}
            }
            if(!cancelled)setRevertCounts(counts);
        })();
        return function(){cancelled=true;};
    },[prData,repoInfo,token]);

    function parseUrl(url){
        if(!url||typeof url!=='string')return null;
        url=url.trim();
        if(url.length>200||url.includes('{')|| url.includes('"'))return null;
        var m=url.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
        if(m)return{owner:m[1],repo:m[2].replace(/\.git$/,'')};
        var simple=url.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
        if(simple)return{owner:simple[1],repo:simple[2]};
        return null;
    }

    function resetAnalysisState(){
        setError(null);
        setData(null);
        setSelected(null);
        setBlastRadius(null);
        setOwnership(null);
        setFolderFilter(null);
        setPrData(null);
        setFilePreview(null);
    }

    function openExcludeModal(continueToFolder){
        setExcludePatternDraft(excludePatternInput);
        setLaunchFolderAfterExcludeSave(!!continueToFolder);
        setShowExcludeModal(true);
    }

    function closeExcludeModal(){
        setShowExcludeModal(false);
        setLaunchFolderAfterExcludeSave(false);
    }

    function saveExcludePatterns(){
        var nextInput=excludePatternDraft;
        var nextPatterns=compileExcludePatterns(nextInput);
        var shouldLaunchFolder=launchFolderAfterExcludeSave;
        setExcludePatternInput(nextInput);
        setShowExcludeModal(false);
        setLaunchFolderAfterExcludeSave(false);
        if(shouldLaunchFolder){
            launchLocalFolderPicker(nextPatterns);
        }
    }

    function closeConfirmDialog(result){
        setConfirmDialog(null);
        if(confirmResolverRef.current){
            var resolve=confirmResolverRef.current;
            confirmResolverRef.current=null;
            resolve(!!result);
        }
    }

    function requestConfirm(options){
        return new Promise(function(resolve: any){
            if(confirmResolverRef.current){
                confirmResolverRef.current(false);
            }
            confirmResolverRef.current=resolve;
            setConfirmDialog(Object.assign({
                tone:'warning',
                icon:'warning',
                title:'Please confirm',
                message:'',
                confirmLabel:'Continue',
                cancelLabel:'Cancel'
            },options||{}));
        });
    }

    function switchBranchLight(br: string){
        if(!repoInfo||!br||br===currentBranch)return;
        setCurrentBranch(br);
        setBranchLoading(true);
        setProgress('Switching to '+br+'...');
        GitHub.scan(repoInfo.owner,repoInfo.repo,null,activeExcludePatterns,br).then(function(result: any){
            var files=result.files||result;
            if(!files||!files.length){showNotification('No files found on branch '+br,'warn');return;}
            var tree=buildTree(files);
            setData(function(prev: any){
                if(!prev)return prev;
                return Object.assign({},prev,{files:files,tree:tree,stats:Object.assign({},prev.stats,{files:files.length})});
            });
            showNotification('Switched to '+br+' — '+files.length+' files','success');
            setProgress('');
            triggerDjangoIntrospection(br);
        }).catch(function(e: any){
            showNotification('Failed to switch branch: '+e.message,'error');
            setCurrentBranch(currentBranch);
        }).finally(function(){setBranchLoading(false);});
    }

    function triggerDjangoIntrospection(branchOverride?: any, repoUrlOverride?: string) {
        const API = appConfig.apiUrl;
        const targetUrl = repoUrlOverride || repoUrl;
        if (!targetUrl) return;
        fetch(`${API}/api/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: targetUrl, token, branch: branchOverride || currentBranch || 'main' })
        }).then(res => res.json()).then(resp => {
            if (!resp.task_id) return;
            const interval = setInterval(async () => {
                try {
                    const r = await fetch(`${API}/api/tasks/${resp.task_id}`, { credentials: 'include' });
                    const d = await r.json();
                    if (d.status === 'completed') {
                        clearInterval(interval);
                        // Convert Django models → dbSchema format
                        var tables = (d.result?.models || []).map(function(m: any) {
                            return {
                                name: m.name,
                                app: m.file ? m.file.split('/')[0] : 'django',
                                columns: m.fields.map(function(f: any) {
                                    return { name: f.name, type: f.type, nullable: true };
                                }),
                                foreignKeys: d.result.relationships
                                    .filter(function(r: any) { return r.source === m.name; })
                                    .map(function(r: any) { return { column: r.field, references: { table: r.target, column: 'id' } }; })
                            };
                        });
                        if (tables.length) {
                            setDbSchema({ source: 'django', tables });
                            setDbSchemaDetected(true);
                        }
                    } else if (d.status === 'failed') {
                        clearInterval(interval);
                    }
                } catch { clearInterval(interval); }
            }, 2000);
        }).catch(() => {});
    }

    function analyze(branchOverride?: any, repoUrlOverride?: string, forceRefresh?: boolean) {
        if (branchOverride && typeof branchOverride !== 'string') branchOverride = undefined;
        // Always run the main JS analysis; trigger Django introspection in parallel
        internal_analyze(branchOverride, repoUrlOverride, undefined, forceRefresh);
        if (parseUrl(repoUrlOverride||repoUrl)) {
            triggerDjangoIntrospection(branchOverride, repoUrlOverride);
        }
    }

    function internal_analyze(branchOverride?: any, repoUrlOverride?: string, tokenOverride?: string, forceRefresh?: boolean)
{
        // Ensure branchOverride is a string (React can pass event objects if called from onClick)
        if (branchOverride && typeof branchOverride !== 'string') branchOverride = undefined;
        var p=parseUrl(repoUrlOverride||repoUrl);
        if(!p){setError('Invalid URL. Use format: owner/repo');return;}
        var currentExcludePatterns=activeExcludePatterns;
        
        // Validate authentication inputs
        if(authMethod==='pat'&&!token){
            setError('Please enter a Personal Access Token');return;
        }
        if(authMethod==='github_app'){
            if(!appId){setError('Please enter the GitHub App ID');return;}
            if(!privateKey){setError('Please set the GitHub App private key');return;}
        }
        
        resetAnalysisState();
        analysisContentCacheRef.current={};
        setLocalDirHandle(null);
        setLoading(true);
        setProgress('Initializing...');
        
        // Configure GitHub authentication based on method
        GitHub.token=null;
        GitHub.appId=null;
        GitHub.privateKey=null;
        GitHub.installationToken=null;

        if(authMethod==='pat'||authMethod==='none'){
            // 'none' means OAuth session auth — token is set from /auth/me
            GitHub.token=tokenOverride||token||null;
        }else if(authMethod==='github_app'){
            GitHub.appId=appId;
            GitHub.privateKey=privateKey;
        }
        
        setRepoInfo(p);
        // Fetch branches list in background
        setBranchLoading(true);
        setBranches([]);
        GitHub.getBranches(p.owner, p.repo).then(function(brList: any){
            setBranches(brList||[]);
            setBranchLoading(false);
        }).catch(function(){setBranchLoading(false);});

        // The GitHub fetch + parse now runs as a durable background job on
        // the server (see server/src/queue/analysisQueue.ts) — it keeps
        // running even if this tab closes. This just polls the analysis
        // endpoint until the job finishes (or force-refreshes it first for
        // a manual Rescan), then applies the finished result exactly like
        // the old in-browser pipeline used to.
        var requestedBranch=branchOverride||currentBranch||undefined;
        var branchParam=encodeURIComponent(requestedBranch||'HEAD');
        var analysisBase=appConfig.apiUrl+'/api/analysis/'+encodeURIComponent(p.owner)+'/'+encodeURIComponent(p.repo);
        var pollGeneration=(analyzeGenerationRef.current=(analyzeGenerationRef.current||0)+1);

        function applyReadyData(dataObj: any){
            if(analyzeGenerationRef.current!==pollGeneration)return;// superseded by a newer analyze() call
            var detectedBranch=requestedBranch||currentBranch||'main';
            if(detectedBranch&&!currentBranch)setCurrentBranch(detectedBranch);
            setData(dataObj);
            setLoading(false);
            setProgress('');
            setVulns([]);setVulnError(null);
            var _mDeps=extractManifestDeps(dataObj.files||[]);
            if(_mDeps.length>0){setVulnLoading(true);scanDependencies(_mDeps).then(function(r: any){setVulns(r);setVulnLoading(false);}).catch(function(){setVulnError('Vulnerability scan unavailable (network error)');setVulnLoading(false);});}
            else{setVulnError('No supported manifest files found (package.json, requirements.txt, go.mod, Gemfile.lock)');}
            setTrendSnapshots([]);
            // 60 commits just for weekly activity bucketing (cheap: metadata only).
            // fetchTrendData internally re-slices to its own 5-commit cap before
            // doing the expensive per-commit tree+file analysis, so this doesn't
            // change that cost.
            setRecentCommits([]);
            if(p&&p.owner&&p.repo){setTrendLoading(true);GitHub.getCommits(p.owner,p.repo,undefined,60).then(function(fetchedCommits: any){setRecentCommits(fetchedCommits||[]);setActivityPoints(buildActivityPoints(fetchedCommits||[]));return fetchTrendData(fetchedCommits||[],p.owner,p.repo,GitHub);}).then(function(snaps: any){setTrendSnapshots(snaps);setTrendLoading(false);}).catch(function(){setTrendLoading(false);});}
            var _repoKey=(p.owner+'/'+p.repo+'@'+(detectedBranch||'main'));
            var _health=calcHealth(dataObj);
            var _prevSnapshot=recordAnalysisSnapshot(_repoKey,{
                timestamp:new Date().toISOString(),
                healthScore:_health.score,
                healthGrade:_health.grade,
                stats:{
                    files:dataObj.stats.files,functions:dataObj.stats.functions,connections:dataObj.stats.connections,
                    loc:dataObj.stats.loc,security:dataObj.stats.security,dead:dataObj.stats.dead,
                    violations:dataObj.stats.violations,duplicates:dataObj.stats.duplicates,patterns:dataObj.stats.patterns,
                },
            });
            setPreviousSnapshot(_prevSnapshot);
            var _repoBookmarkKey=(p.owner+'/'+p.repo);
            saveBookmark(_repoBookmarkKey,'https://github.com/'+_repoBookmarkKey,{
              files: dataObj.stats.files,
              language: (dataObj.stats.languages&&dataObj.stats.languages[0]&&dataObj.stats.languages[0].name)||'Unknown',
              functions: dataObj.stats.functions,
            });
            setExpandedPaths(new Set(['']));
            window.history.replaceState({},'',buildAppUrl(p.owner+'/'+p.repo,false));
            var files=dataObj.files||[];
            var hasDjango=files.some(function(f: any){return f.name==='models.py'||f.path.toLowerCase().includes('/models/');});
            var hasSql=files.some(function(f: any){var ext=(f.name.split('.').pop()||'').toLowerCase();return ext==='sql'||ext==='prisma';});
            if(hasDjango||hasSql){
                setDbSchemaDetected(true);
                var schemaFiles=files.filter(function(f: any){
                    var ext=(f.name.split('.').pop()||'').toLowerCase();
                    return f.name==='models.py'||f.path.toLowerCase().includes('/models/')||ext==='sql'||ext==='prisma'||f.name==='schema.rb'||f.path.toLowerCase().includes('sqlalchemy')||f.path.toLowerCase().includes('models.py');
                }).map(function(f: any){return{path:f.path,content:f.content||null};});
                var parsed=parseDbSchema(schemaFiles);
                if(parsed.tables.length>0){setDbSchema(parsed);showNotification(parsed.tables.length+' tables parsed — click Database to view ER diagram','info');}
                else{showNotification('Schema files detected but no tables parsed','info');}
            }else{setDbSchemaDetected(false);setDbSchema(null);}
        }

        function poll(){
            if(analyzeGenerationRef.current!==pollGeneration)return;
            fetch(analysisBase+'?branch='+branchParam,{credentials:'include'}).then(function(res: any){
                return res.json().then(function(payload: any){
                    if(!res.ok&&res.status!==202)throw new Error((payload&&payload.error)||'Analysis request failed');
                    return payload;
                });
            }).then(function(payload: any){
                if(analyzeGenerationRef.current!==pollGeneration)return;
                if(payload.status==='ready'){
                    applyReadyData(payload.data);
                }else if(payload.status==='failed'){
                    setError('Analysis failed on the server. Try Rescan to retry.');
                    setLoading(false);
                }else{
                    setProgress(payload.status==='active'?'Analyzing on server…':'Queued for analysis…');
                    setTimeout(poll,2000);
                }
            }).catch(function(e: any){
                if(analyzeGenerationRef.current!==pollGeneration)return;
                setError('Analysis failed: '+(e.message||e));
                setLoading(false);
            });
        }

        if(forceRefresh){
            fetch(analysisBase+'/refresh?branch='+branchParam,{method:'POST',credentials:'include'})
                .catch(function(){})
                .then(poll);
        }else{
            poll();
        }
    }

    function launchLocalFolderPicker(compiledPatterns){
        if(!(window as any).showDirectoryPicker){
            setError('Your browser does not support folder selection. Please use Chrome, Edge, or a Chromium-based browser.');
            return;
        }
        (window as any).showDirectoryPicker().then(function(dirHandle: any){
            setLocalDirHandle(dirHandle);
            resetAnalysisState();
            analysisContentCacheRef.current={};
            setLoading(true);
            setProgress('Reading local folder...');
            readLocalFolder(dirHandle,compiledPatterns||activeExcludePatterns);
        }).catch(function(e: any){
            if(e.name!=='AbortError'){
                setError('Failed to open folder: '+(e.message||e));
            }
        });
    }

    function openLocalFolder(){
        openExcludeModal(true);
    }

    function refreshAnalysis(){
        if(localDirHandle){
            resetAnalysisState();
            analysisContentCacheRef.current={};
            setLoading(true);
            setProgress('Reading local folder...');
            readLocalFolder(localDirHandle,activeExcludePatterns);
            return;
        }
        analyze(undefined,undefined,true);
    }

    async function readLocalFolder(dirHandle, compiledPatterns, path=''){
        var files=[];
        var SOFT_LIMIT=500,HARD_LIMIT=Infinity;
        var fileCount=0;

        async function readDirectory(handle, currentPath){
            for await (const entry of handle.values()){
                if(fileCount>=HARD_LIMIT)break;
                var entryPath=currentPath?currentPath+'/'+entry.name:entry.name;
                if(entry.kind==='directory'){
                    if(!shouldIgnoreDirectory(entryPath,entry.name,compiledPatterns)){
                        await readDirectory(entry,entryPath);
                    }
                }else if(entry.kind==='file'){
                    var name=entry.name;
                    if(shouldExcludeFile(entryPath,name,compiledPatterns))continue;
                    var folder=currentPath||'root';
                    files.push({path:entryPath,name:name,folder:folder,size:0,isCode:Parser.isCode(name)});
                    fileCount++;
                    if(fileCount%50===0)setProgress('Scanning files... '+fileCount+' found');
                }
            }
        }

        await readDirectory(dirHandle,'');
        
        if(files.length>SOFT_LIMIT&&files.length<=HARD_LIMIT){
            var proceed=await requestConfirm({
                tone:'warning',
                icon:'folder',
                title:'Analyze a large folder?',
                message:
                    'This folder has '+files.length+' files.\n\n'+
                    'Analyzing larger folders can take longer.\n\n'+
                    'Continue with all '+files.length+' files?',
                confirmLabel:'Analyze folder'
            });
            if(!proceed){setLoading(false);return;}
        }
        var max=files.length;
        var analyzed=[];
        var allFns=[];
        var contentCache=analysisContentCacheRef.current||{};
        analysisContentCacheRef.current=contentCache;

        async function processFile(i){
            if(i>=max){await finishAnalysis();return;}
            var f=files[i];
            // Yield to browser every 50 files to keep UI responsive
            if(i>0&&i%50===0)await new Promise(function(r: any){setTimeout(r,0);});
            setProgress('Analyzing '+(i+1)+'/'+max+': '+f.name);
            var isCodeFile=f.isCode!==false&&Parser.isCode(f.name);
            
            // Get file handle from path
            var parts=f.path.split('/');
            var currentHandle=dirHandle;
            for(var j=0;j<parts.length-1;j++){
                if(currentHandle.values){
                    var found=false;
                    for await (const entry of currentHandle.values()){
                        if(entry.name===parts[j]&&entry.kind==='directory'){
                            currentHandle=entry;
                            found=true;
                            break;
                        }
                    }
                    if(!found)break;
                }
            }
            
            try{
                if(isCodeFile){
                    var fileHandle=await currentHandle.getFileHandle(parts[parts.length-1]);
                    var fileObj=await fileHandle.getFile();
                    var content=await fileObj.text();
                    contentCache[f.path]=content||'';
                    var layer=Parser.detectLayer(f.path);
                    var sourceAnalysis=await analyzeSource(f.path,content);
                    var actualIsCode=sourceAnalysis.actualIsCode;
                    var fns=sourceAnalysis.functions;
                    analyzed.push({path:f.path,name:f.name,folder:f.folder,content:content,functions:fns,lines:sourceAnalysis.lines,layer:sourceAnalysis.layer||layer,churn:0,isCode:actualIsCode});
                    if(actualIsCode){
                        fns.forEach(function(fn: any){allFns.push(Object.assign({},fn,{folder:f.folder,layer:layer}));});
                    }
                    processFile(i+1);
                }else{
                    var fileHandle=await currentHandle.getFileHandle(parts[parts.length-1]);
                    var fileObj=await fileHandle.getFile();
                    var content=await fileObj.text();
                    contentCache[f.path]=content||'';
                    var layer=Parser.detectLayer(f.path);
                    var lines=content?content.split('\n').length:0;
                    analyzed.push({path:f.path,name:f.name,folder:f.folder,content:content||'',functions:[],lines:lines,layer:layer,churn:0,isCode:false});
                    processFile(i+1);
                }
            }catch(e){
                analyzed.push({path:f.path,name:f.name,folder:f.folder,content:'',functions:[],lines:0,layer:Parser.detectLayer(f.path),churn:0,isCode:false});
                processFile(i+1);
            }
        }

        async function finishAnalysis(){
            try{
            // Phase 1: Build function stats index
            setProgress('Building dependency graph (1/5)...');
            await new Promise(function(r: any){setTimeout(r,0);});
            var fnNames=[...new Set(allFns.map(function(f: any){return f.name;}))];
            var conns=[];
            var fnStats={};
            allFns.forEach(function(fn: any){
                if(!fnStats[fn.name]){
                    fnStats[fn.name]={
                        internal:0,
                        external:0,
                        callers:new Map(),
                        file:fn.file,
                        folder:fn.folder,
                        line:fn.line,
                        code:fn.code,
                        isTopLevel:fn.isTopLevel!==false,
                        isExported:fn.isExported||false,
                        isClassMethod:fn.isClassMethod||false,
                        type:fn.type||'function',
                        decorators:fn.decorators||null,
                        className:fn.className||null
                    };
                }
            });

            // Phase 2: Find calls in batches with yielding to prevent UI freeze
            var CALL_BATCH=30;
            for(var bi=0;bi<analyzed.length;bi+=CALL_BATCH){
                var batchEnd=Math.min(bi+CALL_BATCH,analyzed.length);
                setProgress('Analyzing dependencies (2/5)... '+batchEnd+'/'+analyzed.length+' files');
                for(var fi=bi;fi<batchEnd;fi++){
                    var file=analyzed[fi];
                    if(!file.content)continue;
                    var tokenSet=new Set((file.content.match(/\b[A-Za-z_$]\w*\b/g)||[]));
                    var candidateFnNames=fnNames.filter(function(fn: any){var base=String(fn).split('.').pop();return tokenSet.has(fn)||tokenSet.has(base);});
                    if(!candidateFnNames.length)continue;
                    var calls=Parser.findCalls(file.content,candidateFnNames,file.path,allFns);
                    Object.entries(calls).forEach(function(entry: any){
                        var fn=entry[0],cnt=entry[1];
                        if(cnt<=0)return;
                        var def=fnStats[fn]?fnStats[fn].file:null;
                        if(def){
                            if(def===file.path){
                                fnStats[fn].internal+=cnt;
                            }else{
                                conns.push({source:def,target:file.path,fn:fn,count:cnt});
                                var ex=fnStats[fn].callers.get(file.path);
                                if(ex)ex.count+=cnt;else fnStats[fn].callers.set(file.path,{file:file.path,name:file.name,count:cnt});
                                fnStats[fn].external+=cnt;
                            }
                        }
                    });
                }
                // Yield to browser between batches
                await new Promise(function(r: any){setTimeout(r,0);});
            }
            Object.values(fnStats).forEach(function(s: any){s.callers=Array.from(s.callers.values());s.count=s.internal+s.external;});
            // Phase 2.5: Resolve markdown/wiki links into graph edges
            setProgress('Resolving markdown links...');
            await new Promise(function(r: any){setTimeout(r,0);});
            var mdAllPaths=analyzed.map(function(f: any){return f.path;});
            analyzed.forEach(function(file: any){
                if(!Parser.isMarkdown(file.name))return;
                file.layer='note';
                if(!file.content)return;
                var links=Parser.extractMarkdownLinks(file.content);
                var deps=[];
                links.forEach(function(link: any){
                    var resolved=Parser.resolveMarkdownLink(link.target,file.path,mdAllPaths,link.kind);
                    deps.push({kind:link.kind,raw:link.raw,target:link.target,resolved:resolved});
                    if(resolved&&resolved!==file.path){
                        conns.push({source:file.path,target:resolved,fn:link.raw,count:1,kind:link.kind});
                    }
                });
                file.dependencies=deps;
            });
            analyzed.forEach(function(f: any){if(!f.dependencies)f.dependencies=[];});
            var issues=[];
            var deadFns=Object.entries(fnStats).filter(function(x: any){
                var name=x[0],stats=x[1];
                if(stats.internal>0||stats.external>0)return false;
                if(stats.isClassMethod)return false;
                if(!stats.isTopLevel)return false;
                // Python-aware: skip decorated functions (framework-registered: routes, signals, etc.)
                if(stats.decorators&&stats.decorators.length>0)return false;
                // Python-aware: skip classes
                if(stats.type==='class'||stats.type==='dataclass'||stats.type==='abstract_class')return false;
                // Python-aware: skip dunder/magic methods
                var baseName=name.includes('.')?name.split('.').pop():name;
                if(baseName.startsWith('__')&&baseName.endsWith('__'))return false;
                // Python-aware: skip test functions
                if(baseName.startsWith('test_')||baseName==='setUp'||baseName==='tearDown'||baseName==='setUpClass'||baseName==='tearDownClass')return false;
                if(stats.file&&(stats.file.includes('test_')||stats.file.includes('_test.')||stats.file.includes('/tests/')))return false;
                // Python-aware: skip migration functions (Alembic)
                if((baseName==='upgrade'||baseName==='downgrade')&&stats.file&&(stats.file.includes('migration')||stats.file.includes('alembic')||stats.file.includes('versions')))return false;
                // Python-aware: skip common framework entry points
                if(['main','create_app','make_app','get_app','setup','configure','register','on_startup','on_shutdown','lifespan'].indexOf(baseName)>=0)return false;
                // JS/TS: skip explicitly exported functions (module exports are meant for external consumption)
                if(stats.isExported&&stats.file&&/\.[jt]sx?$/.test(stats.file))return false;
                // Skip functions in test/spec files (broader pattern)
                if(stats.file&&(/\.(?:spec|test)\.[jt]sx?$/.test(stats.file)||stats.file.includes('__tests__')))return false;
                return true;
            });
            if(deadFns.length)issues.push({type:'warning',title:deadFns.length+' Unused Functions',desc:'Functions not called from other files',items:deadFns.map(function(x: any){return{name:x[0],file:x[1].file,line:x[1].line,code:x[1].code};})});
            var godFiles=analyzed.filter(function(f: any){return f.functions.length>15;});
            if(godFiles.length)issues.push({type:'critical',title:godFiles.length+' Large Files',desc:'Files with 15+ functions',items:godFiles.map(function(f: any){return{name:f.name+' ('+f.functions.length+' fns)',file:f.path,fns:f.functions.length,lines:f.lines};})});
            var coupling={};
            conns.forEach(function(c: any){coupling[c.target]=(coupling[c.target]||0)+1;});
            var highCoup=Object.entries(coupling).filter(function(x: any){return x[1]>8;}).sort(function(a: any, b: any){return b[1]-a[1];});
            if(highCoup.length)issues.push({type:'warning',title:highCoup.length+' Highly Coupled',desc:'Files imported by 8+ others',items:highCoup.map(function(x: any){return{name:x[0].split('/').pop()+' ('+x[1]+' imports)',file:x[0],imports:x[1]};})});
            var connSet=new Set(conns.map(function(c: any){return c.source+'|'+c.target;}));
            var circular=[];
            conns.forEach(function(c: any){if(connSet.has(c.target+'|'+c.source)){var key=[c.source,c.target].sort().join('|');if(!circular.includes(key))circular.push(key);}});
            if(circular.length)issues.push({type:'critical',title:circular.length+' Circular Dependencies',desc:'Files that import each other',items:circular.map(function(p: any){var parts=p.split('|');return{name:parts.map(function(x: any){return x.split('/').pop();}).join(' ↔ '),files:parts};})});

            // Phase 3: Pattern and security detection with yielding
            setProgress('Detecting patterns (3/5)...');
            await new Promise(function(r: any){setTimeout(r,0);});
            var patterns=Parser.detectPatterns(analyzed);
            var securityIssues=Parser.detectSecurity(analyzed);

            // Phase 4: Duplicate detection and complexity (most expensive)
            setProgress('Analyzing code quality (4/5)...');
            await new Promise(function(r: any){setTimeout(r,0);});
            var duplicates=Parser.detectDuplicates(analyzed,allFns);
            var layerViolations=Parser.detectLayerViolations(analyzed,conns);

            // Calculate complexity in batches
            for(var ci=0;ci<analyzed.length;ci+=CALL_BATCH){
                var cEnd=Math.min(ci+CALL_BATCH,analyzed.length);
                for(var cj=ci;cj<cEnd;cj++){
                    analyzed[cj].complexity=Parser.calcComplexity(analyzed[cj].content,analyzed[cj].path);
                }
                if(ci+CALL_BATCH<analyzed.length)await new Promise(function(r: any){setTimeout(r,0);});
            }

            // Phase 5: Free file content from memory (can be lazy-loaded for preview)
            setProgress('Finalizing (5/5)...');
            await new Promise(function(r: any){setTimeout(r,0);});
            analyzed.forEach(function(f: any){f.content=null;});

            var folders=[...new Set(analyzed.map(function(f: any){return f.folder;}))].sort();
            var tree=buildTree(analyzed);
            var totalLoc=analyzed.reduce(function(s: any, f: any){return s+f.lines;},0);
            var langStats={};
            analyzed.forEach(function(f: any){var ext=f.name.split('.').pop().toLowerCase();langStats[ext]=(langStats[ext]||0)+f.lines;});
            var langArray=Object.entries(langStats).sort(function(a: any, b: any){return b[1]-a[1];}).map(function(e: any){return{ext:e[0],lines:e[1],pct:Math.round(e[1]/totalLoc*100)};});
            if(duplicates.length>0){
                var nameDups=duplicates.filter(function(d: any){return d.type==='name';});
                var codeDups=duplicates.filter(function(d: any){return d.type==='code';});
                if(nameDups.length)issues.push({type:'warning',title:nameDups.length+' Duplicate Function Names',desc:'Same function name in multiple files',items:nameDups.map(function(d: any){return{name:d.name+' ('+d.count+' files)',suggestion:d.suggestion,files:d.files,count:d.count};})});
                if(codeDups.length)issues.push({type:'warning',title:codeDups.length+' Similar Code Blocks',desc:'Copy-paste code detected',items:codeDups.map(function(d: any){return{name:d.name,suggestion:d.suggestion,files:d.files};})});
            }
            if(layerViolations.length>0){
                issues.push({type:'critical',title:layerViolations.length+' Architecture Violations',desc:'Lower layers importing from higher layers',items:layerViolations.map(function(v: any){return{name:v.fromLayer+' → '+v.toLayer,file:v.from,toFile:v.to,fn:v.fn,suggestion:v.suggestion};})});
            }
            var highComplexity=analyzed.filter(function(f: any){return f.complexity&&f.complexity.level==='critical';}).sort(function(a: any, b: any){return b.complexity.score-a.complexity.score;});
            if(highComplexity.length)issues.push({type:'warning',title:highComplexity.length+' High Complexity Files',desc:'Files with complexity score >30',items:highComplexity.map(function(f: any){return{name:f.name+' ('+f.complexity.score+')',file:f.path,score:f.complexity.score,lines:f.lines};})});
            var dataObj={files:analyzed,functions:allFns,connections:conns,fnStats:fnStats,folders:folders,tree:tree,issues:issues,patterns:patterns,securityIssues:securityIssues,duplicates:duplicates,layerViolations:layerViolations,deadFunctions:deadFns.map(function(x: any){var codeLines=x[1].code?x[1].code.split('\n').length:0;return{name:x[0],file:x[1].file,folder:x[1].folder,line:x[1].line,code:x[1].code,codeLines:codeLines,ext:x[1].file.split('.').pop()};}),excludePatterns:(compiledPatterns||[]).map(function(x: any){return x.raw;}),stats:{files:analyzed.length,functions:allFns.length,connections:conns.length,dead:deadFns.length,patterns:patterns.length,security:securityIssues.filter(function(i: any){return i.severity==='high';}).length,duplicates:duplicates.length,violations:layerViolations.length,loc:totalLoc,languages:langArray}};
            dataObj.suggestions=Parser.generateSuggestions(dataObj);
            setData(dataObj);
            setVulns([]);setVulnError(null);
            var _mDeps2=extractManifestDeps(dataObj.files||[]);
            if(_mDeps2.length>0){setVulnLoading(true);scanDependencies(_mDeps2).then(function(r: any){setVulns(r);setVulnLoading(false);}).catch(function(){setVulnError('Vulnerability scan unavailable (network error)');setVulnLoading(false);});}
            else{setVulnError('No supported manifest files found (package.json, requirements.txt, go.mod, Gemfile.lock)');}
            setTrendSnapshots([]);setActivityPoints([]);setTrendLoading(false);
            setExpandedPaths(new Set(['']));
            setRepoInfo({owner:'local',repo:'folder',name:'Local Folder'});
            var hasDjangoLocal=analyzed.some(function(f: any){return f.name==='models.py'||f.path.toLowerCase().includes('/models/');});
            var hasSqlLocal=analyzed.some(function(f: any){var ext=(f.name.split('.').pop()||'').toLowerCase();return ext==='sql'||ext==='prisma';});
            if(hasDjangoLocal||hasSqlLocal){
                setDbSchemaDetected(true);
                var schemaFilesLocal=analyzed.filter(function(f: any){
                    var ext=(f.name.split('.').pop()||'').toLowerCase();
                    return f.name==='models.py'||f.path.toLowerCase().includes('/models/')||ext==='sql'||ext==='prisma'||f.path.toLowerCase().includes('sqlalchemy')||f.path.toLowerCase().includes('models.py');
                }).map(function(f: any){return{path:f.path,content:f.content||null};});
                var parsedLocal=parseDbSchema(schemaFilesLocal);
                if(parsedLocal.tables.length>0){setDbSchema(parsedLocal);showNotification(parsedLocal.tables.length+' tables parsed — click Database to view ER diagram','info');}
                else{showNotification('Schema files detected but no tables parsed','info');}
            }
            else{setDbSchemaDetected(false);setDbSchema(null);}
            setLoading(false);
            }catch(err){
                setError('Analysis failed: '+(err.message||err)+'. Try a smaller folder or subfolder.');
                setLoading(false);
            }
        }

        if(files.length===0){
            setError((compiledPatterns&&compiledPatterns.length)?'No code files found in the selected folder after applying exclude patterns':'No code files found in the selected folder');
            setLoading(false);
            return;
        }

        processFile(0);
    }

    var selectFile=useCallback(function(path: any){
        if(!data)return;
        var file=(data as any).files.find(function(f: any){return f.path===path;});
        if(file){
            setSelected(file);
            var blast=calcBlast(path,(data as any).connections,(data as any).files);
            setBlastRadius(blast);
            setOwnership(null);
            setExpandedFns(new Set());
            if(repoInfo&&!localDirHandle){
                setOwnerLoading(true);
                GitHub.getBlame(repoInfo.owner,repoInfo.repo,path).then(function(owners: any){setOwnership(owners);setOwnerLoading(false);}).catch(function(){setOwnerLoading(false);});
            }else if(localDirHandle){
                setOwnerLoading(false);
                setOwnership([]);
            }
        }
    },[data,repoInfo,localDirHandle]);
    selectFileRef.current=selectFile;

    var togglePath=useCallback(function(p: any){setExpandedPaths(function(prev: any){var n=new Set(prev);if(n.has(p))n.delete(p);else n.add(p);return n;});},[]);
    var toggleFn=useCallback(function(name: any){setExpandedFns(function(prev: any){var n=new Set(prev);if(n.has(name))n.delete(name);else n.add(name);return n;});},[]);

    // Resolve a file's source text from whatever's cheapest: the in-memory analysis,
    // the content cache, the open local directory, or (last) a GitHub API round trip.
    // Shared by the file preview modal and the Code graph view's on-demand cards.
    function fetchFileContent(path: string): Promise<{content: string|null; error?: string|null}>{
        if(!repoInfo)return Promise.resolve({content:null,error:'No repository loaded'});
        if(data as any){
            var existingFile=(data as any).files.find(function(f: any){return f.path===path;});
            if(existingFile&&existingFile.content)return Promise.resolve({content:existingFile.content,error:null});
        }
        if(analysisContentCacheRef.current&&analysisContentCacheRef.current[path]){
            return Promise.resolve({content:analysisContentCacheRef.current[path],error:null});
        }
        if(localDirHandle){
            return (async function(){
                try{
                    var parts=path.split('/');
                    var currentHandle=localDirHandle;
                    for(var i=0;i<parts.length-1;i++){
                        currentHandle=await currentHandle.getDirectoryHandle(parts[i]);
                    }
                    var fileHandle=await currentHandle.getFileHandle(parts[parts.length-1]);
                    var fileObj=await fileHandle.getFile();
                    var content=await fileObj.text();
                    analysisContentCacheRef.current[path]=content||'';
                    return {content:content,error:null};
                }catch(e: any){
                    return {content:null,error:e.message||'Failed to load file'};
                }
            })();
        }
        return GitHub.getFile(repoInfo.owner,repoInfo.repo,path,currentBranch||undefined).then(function(content: any){
            if(content){
                analysisContentCacheRef.current[path]=content;
                return {content:content,error:null};
            }
            return {content:null,error:'File not accessible — try a PAT for private repos'};
        }).catch(function(e: any){
            return {content:null,error:e.message||'Failed to load file'};
        });
    }

    // Open file preview
    function openFilePreview(path,line){
        if(!repoInfo)return;
        var filename=path.split('/').pop();
        if(Parser.isBinary(filename)){setFilePreview({path:path,filename:filename,content:null,line:null,loading:false,error:'Binary file — cannot be previewed'});return;}
        setFilePreview({path:path,filename:filename,content:null,line:line||null,loading:true,error:null});
        fetchFileContent(path).then(function(res){
            setFilePreview({path:path,filename:filename,content:res.content,line:line||null,loading:false,error:res.error||null});
        });
    }

    function exportJSON(){if(!data)return;var blob=new Blob([JSON.stringify({stats:(data as any).stats,files:(data as any).files.map(function(f: any){return{path:f.path,fns:f.functions.length,layer:f.layer,lines:f.lines,dependencies:f.dependencies||[]};}),connections:(data as any).connections,issues:(data as any).issues,patterns:(data as any).patterns,security:(data as any).securityIssues},null,2)],{type:'application/json'});var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download='graphkeep-analysis.json';a.click();}
    function showNotification(msg,type){setToast({msg:msg,type:type||'success'});setTimeout(function(){setToast(null);},3000);}
    function analyzePR(){if(!prUrl||!repoInfo)return;var m=prUrl.match(/\/pull\/(\d+)/);if(!m){showNotification('Invalid PR URL','error');return;}GitHub.getPR(repoInfo.owner,repoInfo.repo,m[1]).then(function(pr: any){if(pr)setPrData(pr);else showNotification('Could not load PR','error');});}
    function filterByFolder(path){setFolderFilter(function(prev: any){return prev===path?null:path;});}
    var health=useMemo(function(){return calcHealth(data as any);},[data]);
    // Computed client-side (not always present on the server-analyzed payload)
    // so the Overview page's recommendations stay correct regardless of
    // whether the repo was analyzed via GitHub polling or a local folder.
    var overviewSuggestions=useMemo(function(){return data?Parser.generateSuggestions(data):[];},[data]);
    var overviewArchitecture=useMemo(function(){
        if(!data)return null;
        var graph=buildArchitectureGraph((data as any).files||[],(data as any).connections||[]);
        var circularCount=((data as any).issues||[]).filter(function(i: any){return i.title&&i.title.includes('Circular');}).length;
        return{layers:graph.groups.length,modules:graph.nodes.length,edges:graph.edges.length,circular:circularCount};
    },[data]);
    var _dbLoader=useDbSchemaLoader({data:data,repoInfo:repoInfo,localDirHandle:localDirHandle,currentBranch:currentBranch,analysisContentCacheRef:analysisContentCacheRef,showNotification:showNotification});
    var showDbSchema=_dbLoader.showDbSchema,setShowDbSchema=_dbLoader.setShowDbSchema;
    var dbViewMode=_dbLoader.dbViewMode,setDbViewMode=_dbLoader.setDbViewMode;
    var dbSchema=_dbLoader.dbSchema,setDbSchema=_dbLoader.setDbSchema;
    var dbSearchQuery=_dbLoader.dbSearchQuery,setDbSearchQuery=_dbLoader.setDbSearchQuery;
    var dbAppFilter=_dbLoader.dbAppFilter,setDbAppFilter=_dbLoader.setDbAppFilter;
    var selectedDbTable=_dbLoader.selectedDbTable,setSelectedDbTable=_dbLoader.setSelectedDbTable;
    var dbAppOptions=_dbLoader.dbAppOptions,filteredDbSchema=_dbLoader.filteredDbSchema,openDbSchema=_dbLoader.openDbSchema;

    var showNav=!(activeSection==='overview'&&!data);
    return React.createElement('div',{className:'workspace-shell'+(showNav?'':' workspace-shell-nonav')},
        React.createElement(WorkspaceHeader,{
            repoInfo:repoInfo,
            loading:loading,
            hasData:!!data,
            currentBranch:currentBranch,
            branches:branches,
            branchLoading:branchLoading,
            onBranchSwitch:function(br: any){switchBranchLight(br);},
            onPaletteOpen: function(){ if(data) setShowPalette(true); },
            onExport: data ? function(){ setShowExport(true); } : undefined,
            onGoHome:function(){ window.location.href='/select-repo'; },
            activeSection:activeSection,
        }),
        showNav&&React.createElement(WorkspaceSidebar,{
            login:authUser?.login??'',
            avatarUrl:authUser?.avatar_url??'',
            activeSection:activeSection,
            hasData:!!data,
            onSectionChange:function(s: any){setActiveSection(s);if(s==='database'&&data&&!dbSchema)openDbSchema();},
        }),
        React.createElement('div',{
        className:'app workspace-one-dark'+(activeSection==='overview'?'':' workspace-tool-mode'),
        style:{paddingTop:0,paddingLeft:showNav?12:0}
    },
        React.createElement(React.Suspense,{fallback:sectionFallback()},
        React.createElement('div',{key:activeSection,className:'workspace-section-enter'},
        activeSection==='overview'&&React.createElement(WorkspaceOverview,{
            repoInfo:repoInfo,
            data:data,
            health:health,
            loading:loading,
            progress:progress,
            error:error,
            vulns:vulns,
            vulnLoading:vulnLoading,
            activityPoints:activityPoints,
            recentCommits:recentCommits,
            trendSnapshots:trendSnapshots,
            dbSchemaDetected:dbSchemaDetected,
            suggestions:overviewSuggestions,
            previousSnapshot:previousSnapshot,
            architecture:overviewArchitecture,
            onOpen:function(s: any){setActiveSection(s);if(s==='database'&&data&&!dbSchema)openDbSchema();},
            onOpenUnused:function(){if(data&&(data as any).deadFunctions?.length)setShowUnused(true);},
        }),
        activeSection==='branches'&&(repoInfo
            ?React.createElement('div',{style:{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}},
                React.createElement(BranchDiff,{
                    owner:repoInfo.owner,
                    repo:repoInfo.repo,
                    branches:branches&&branches.length?branches:[{name:currentBranch||'main'}],
                    currentBranch:currentBranch||'main',
                })
            )
            :React.createElement('div',{className:'gi-page'},
                React.createElement('div',{className:'floating-empty'},
                    React.createElement('div',{style:{fontSize:'32px'}},'🌿'),
                    React.createElement('h3',null,'No repository connected'),
                    React.createElement('p',null,'Analyze a repository first to view branches.')
                )
            )
        ),
        activeSection==='contributors' && repoInfo && React.createElement(ContributorInsights, {
          owner: repoInfo.owner,
          repo: repoInfo.repo,
          token: token,
          folders: ((data as any).folders)||[],
        } as any),
        activeSection==='commits' && repoInfo && React.createElement(CommitTimeline, {
          owner: repoInfo.owner,
          repo: repoInfo.repo,
          token: token,
          branch: currentBranch||'main',
        } as any),
        activeSection==='database'&&React.createElement(DatabaseSchemaSection,{dbSchema:dbSchema,filteredDbSchema:filteredDbSchema,selectedDbTable:selectedDbTable}),
        activeSection==='pullrequests'&&React.createElement(PullRequestsSection,{prUrl:prUrl,onPrUrlChange:setPrUrl,onLoadPr:function(){setShowPR(true);}}),
        activeSection==='migrations'&&React.createElement(MigrationsSection,null),
        activeSection==='security'&&React.createElement(SecuritySection,{data:data,vulns:vulns,vulnLoading:vulnLoading,vulnError:vulnError,onRescan:function(){analyze(undefined,undefined,true);},scanning:loading,repoInfo:repoInfo,currentBranch:currentBranch}),
        activeSection==='patterns'&&React.createElement(PatternsSection,{data:data,onSelectFile:selectFile,onViewSource:openFilePreview}),
        activeSection==='actions'&&React.createElement(ActionsSection,{data:data,onSelectFile:selectFile,onViewSource:openFilePreview}),
        activeSection==='trends'&&React.createElement(MetricsTrendChart,{snapshots:trendSnapshots,activityPoints:activityPoints,loading:trendLoading,onCommitClick:function(sha: any){setActiveSection('commits');}}),
        activeSection==='architecture'&&React.createElement(ArchitectureDiagram,{
            nodes:data?((data as any).files||[]):[],
            connections:data?((data as any).connections||[]):[],
            repoName:repoInfo?repoInfo.owner+'/'+repoInfo.repo:'Repository',
            onOpenFile:function(path: string){if(selectFileRef.current)selectFileRef.current(path);}
        }),
        activeSection==='radar' && repoInfo && React.createElement(StaleCodeRadar, {
          owner: repoInfo.owner,
          repo: repoInfo.repo,
          token: token,
          files: ((data as any).files)||[],
          connections: ((data as any).connections)||[],
        } as any),
        activeSection==='ownership' && repoInfo && React.createElement(CodeOwnershipMap, {
          owner: repoInfo.owner,
          repo: repoInfo.repo,
          token: token,
          files: ((data as any).files)||[],
        } as any),
        activeSection==='releases' && repoInfo && React.createElement(ReleaseNotesGenerator, {
          owner: repoInfo.owner,
          repo: repoInfo.repo,
          token: token,
        } as any)

        ,activeSection==='debt' && data && React.createElement(TechDebtTimeline, {
          owner: repoInfo ? repoInfo.owner : '',
          repo: repoInfo ? repoInfo.repo : '',
          token: token,
          currentData: data,
        } as any)

        ,activeSection==='settings'&&React.createElement(SettingsSection,{
            login:authUser?.login??'',avatarUrl:authUser?.avatar_url??'',
            repoInfo:repoInfo,currentBranch:currentBranch,isLocalFolder:!!localDirHandle,
            excludeCount:parseExcludePatterns(excludePatternInput).length,
            onManageExcludes:function(){openExcludeModal(false);},
            onReanalyze:function(){analyze(undefined,undefined,true);},reanalyzing:loading,
            onExportReport:function(){setShowExport(true);},hasData:!!data,
        }),
        activeSection==='explorer'&&React.createElement('div',{className:'main',style:{'--sidebar-w':(loading?0:sidebarWidth)+'px','--panel-w':'0px'}},
            !loading&&React.createElement('div',{className:'sidebar',style:{width:sidebarWidth}},
                React.createElement('div',{className:'resize-handle',onMouseDown:function(e: any){
                    e.preventDefault();
                    var startX=e.clientX,startW=sidebarWidth;
                    function onMove(e){setSidebarWidth(Math.max(180,Math.min(400,startW+e.clientX-startX)));}
                    function onUp(){document.removeEventListener('mousemove',onMove);document.removeEventListener('mouseup',onUp);}
                    document.addEventListener('mousemove',onMove);document.addEventListener('mouseup',onUp);
                }}),
                data?React.createElement(WorkspaceExplorerSidebar,{folderFilter:folderFilter,onClearFilter:function(){setFolderFilter(null);}},
                    React.createElement(VirtualizedRepoTree,{tree:(data as any).tree,selected:selected,onSelect:selectFile,expanded:expandedPaths,toggle:togglePath,filterFolder:filterByFolder,activeFilter:folderFilter})
                ):React.createElement('div',{className:'panel-empty'},
                    React.createElement(Icon,{name:'search',size:'xxl',className:'empty-icon'}),
                    React.createElement('div',{className:'empty-title',style:{fontSize:'1.2rem'}},'No Repository'),
                    React.createElement('div',{className:'empty-desc'},'Connect a repository to start exploring architecture and dependencies.')
                )
            ),
            !loading&&data&&React.createElement('div',{className:'explorer-view-toggle',role:'tablist','aria-label':'Explorer view'},
                React.createElement('div',{className:'explorer-view-thumb'+(explorerView==='files'?' is-files':''),'aria-hidden':'true'}),
                React.createElement('button',{
                    role:'tab','aria-selected':explorerView==='graph',
                    className:'explorer-view-btn'+(explorerView==='graph'?' active':''),
                    onClick:function(){setExplorerView('graph');}
                },iconLabel('graph','Graph','s')),
                React.createElement('button',{
                    role:'tab','aria-selected':explorerView==='files',
                    className:'explorer-view-btn'+(explorerView==='files'?' active':''),
                    disabled:!selected,
                    title:selected?undefined:'Select a file in the graph or explorer to view its details',
                    onClick:function(){if(selected)setExplorerView('files');}
                },iconLabel('file','Files','s'))
            ),
            (explorerView==='graph'||loading||!data)
                ?React.createElement(RepositoryGraphCanvas,{
                    className:'explorer-content-swap from-left',
                    data:data,loading:loading,progress:progress,folderFilter:folderFilter,
                    selected:selected,blastRadius:blastRadius,activeSection:activeSection,
                    onSelectFile:selectFile,onFilterFolder:filterByFolder,
                    onClearSelection:function(){setSelected(null);setBlastRadius(null);},
                    onFetchFileContent:fetchFileContent
                })
                :React.createElement('div',{className:'canvas-area canvas-area-files explorer-content-swap from-right'},
                    React.createElement(ExplorerFilesView,{
                        data:data,selected:selected,blastRadius:blastRadius,repoInfo:repoInfo,token:token,
                        ownership:ownership,ownerLoading:ownerLoading,expandedFns:expandedFns,onToggleFn:toggleFn,
                        onClearSelection:function(){setSelected(null);setBlastRadius(null);},
                        onSelectFile:selectFile,onViewSource:openFilePreview,
                        onSelectIssue:function(issue: any){setDrillDown({type:'issue',data:issue});}
                    })
                )
        )
        )),
        showExport&&React.createElement(AnalysisReportModal,{onExportReport:function(format: any){generateReport(format,data,repoInfo,localDirHandle);showNotification('Report exported as '+format.toUpperCase(),'success');},onExportRawJson:exportJSON,onClose:function(){setShowExport(false);}}),
        showExcludeModal&&React.createElement('div',{className:'modal-overlay',onClick:closeExcludeModal},
            React.createElement('div',{className:'modal',onClick:function(e: any){e.stopPropagation();},style:{maxWidth:540}},
                React.createElement('div',{className:'modal-header'},
                    React.createElement('div',{className:'modal-title'},iconLabel('ban','Exclude Patterns','m')),
                    React.createElement('div',{style:{display:'flex',alignItems:'center',gap:12}},
                        React.createElement('div',{className:'exclude-count'},parseExcludePatterns(excludePatternDraft).length,' custom'),
                        React.createElement('button',{className:'modal-close',onClick:closeExcludeModal},'×')
                    )
                ),
                React.createElement('div',{className:'modal-body'},
                    React.createElement('div',{className:'exclude-note'},
                        'Common build and cache folders are already excluded by default. Add project-specific patterns here before scanning a repo or opening a local folder.'
                    ),
                    React.createElement('div',{className:'exclude-note'},
                        'Supports exact names like ',React.createElement('code',null,'.git'),' or ',React.createElement('code',null,'attachments'),
                        ', file globs like ',React.createElement('code',null,'*.png'),
                        ', and path globs like ',React.createElement('code',null,'uploads/**'),' or ',React.createElement('code',null,'**/cache/**'),'.'
                    ),
                    React.createElement('div',{className:'form-group'},
                        React.createElement('label',{className:'form-label'},'Always Excluded'),
                        React.createElement('div',{className:'exclude-chip-list'},
                            DEFAULT_EXCLUDE_CHIPS.map(function(pattern: any){return React.createElement('div',{key:pattern,className:'exclude-chip'},pattern);})
                        )
                    ),
                    React.createElement('div',{className:'form-group'},
                        React.createElement('label',{className:'form-label'},'Custom Patterns'),
                        React.createElement('textarea',{className:'form-input exclude-textarea','aria-label':'Custom exclude patterns',placeholder:'attachments\nuploads/**\n**/cache/**\n*.png\n*.log',value:excludePatternDraft,onChange:function(e: any){setExcludePatternDraft(e.target.value);},rows:8}),
                        React.createElement('div',{className:'exclude-help'},'Use one pattern per line, or separate patterns with commas. Changes apply to the next analysis or refresh.')
                    )
                ),
                React.createElement('div',{className:'modal-footer'},
                    excludePatternDraft&&React.createElement('button',{className:'top-btn',onClick:function(){setExcludePatternDraft('');},style:{marginRight:'auto'}},'Clear Custom'),
                    React.createElement('button',{className:'top-btn',onClick:closeExcludeModal},'Cancel'),
                    React.createElement('button',{className:'top-btn primary',onClick:saveExcludePatterns},launchFolderAfterExcludeSave?'Save & Continue':'Save')
                )
            )
        ),
        showPR&&React.createElement(PrReviewModal,{prUrl:prUrl,onPrUrlChange:setPrUrl,onAnalyze:analyzePR,prData:prData,data:data,revertCounts:revertCounts,onClose:function(){setShowPR(false);}}),
        drillDown&&React.createElement(DrillDownModal,{drillDown:drillDown,onClose:function(){setDrillDown(null);},onSelectFile:selectFile,onViewSource:openFilePreview}),
        showPrivacy&&React.createElement(PrivacyModal,{onClose:function(){setShowPrivacy(false);}}),
        showKeyModal&&React.createElement(GithubAppKeyModal,{privateKey:privateKey,onPrivateKeyChange:setPrivateKey,onClose:function(){setShowKeyModal(false);}}),
        showUnused&&data&&(data as any).deadFunctions&&React.createElement(UnusedFunctionsModal,{deadFunctions:(data as any).deadFunctions,expandedFns:expandedFns,setExpandedFns:setExpandedFns,onClose:function(){setShowUnused(false);},onViewSource:openFilePreview}),
        confirmDialog&&React.createElement(ConfirmDialog,{dialog:confirmDialog,onResolve:closeConfirmDialog}),
        toast&&React.createElement('div',{className:'toast '+(toast.type||'success'),'role':'alert'},toast.msg),
        filePreview&&React.createElement(FilePreviewModal,{filePreview:filePreview,onClose:function(){setFilePreview(null);}}),
        error&&React.createElement('div',{style:{position:'fixed',bottom:20,right:20,background:'var(--red)',color:'white',padding:'12px 20px',borderRadius:8,zIndex:1000,maxWidth:350},'role':'alert'},
            React.createElement('span',{key:'msg'},error),
            React.createElement('button',{key:'btn','aria-label':'Dismiss error','onClick':function(){setError(null);},style:{marginLeft:12,background:'none',border:'none',color:'white',cursor:'pointer',fontSize:16}},'×')
        ),
        showDbSchema&&React.createElement(DbSchemaOverlay,{
            dbSchema:dbSchema,
            filteredDbSchema:filteredDbSchema,
            dbAppOptions:dbAppOptions,
            dbSearchQuery:dbSearchQuery,
            onSearchChange:setDbSearchQuery,
            dbAppFilter:dbAppFilter,
            onAppFilterChange:setDbAppFilter,
            dbViewMode:dbViewMode,
            onViewModeChange:setDbViewMode,
            selectedDbTable:selectedDbTable,
            onSelectTable:setSelectedDbTable,
            onClose:function(){setShowDbSchema(false);},
        })
        ,showExport && data && React.createElement(React.Suspense,{fallback:sectionFallback()},React.createElement(ExportModal, {
            nodes: ((data as any).files||[]).map(function(f: any){ return {id: f.path, name: f.name, layer: f.layer}; }),
            edges: ((data as any).connections||[]).map(function(c: any){ return {source: c.source, target: c.target, fn: c.fn}; }),
            svgRef: svgRef,
            repoUrl: repoUrl,
            filterState: {layerFilter: folderFilter, searchQuery: ''},
            onClose: function(){ setShowExport(false); },
        }))
        ,showPalette && data && React.createElement(CommandPalette, {
          files: ((data as any).files)||[],
          functions: ((data as any).functions)||[],
          folders: ((data as any).folders)||[],
          onSelectFile: function(file: any){
            setActiveSection('explorer');
            openExplorerFile(file.path);
            setShowPalette(false);
          },
          onSelectFunction: function(fn: any){
            setActiveSection('explorer');
            openExplorerFile(fn.file);
            setShowPalette(false);
          },
          onSelectFolder: function(folder: any){
            setActiveSection('explorer');
            setShowPalette(false);
          },
          onClose: function(){ setShowPalette(false); },
        })
    )
    );
}
