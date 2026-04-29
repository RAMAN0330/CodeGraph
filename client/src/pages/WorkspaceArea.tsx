// @ts-nocheck
import * as d3 from 'd3';
import * as d3Sankey from 'd3-sankey';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Icon } from '../components/ui/Icon';
import { StatusDot } from '../components/ui/StatusDot';
import { HealthRing } from '../components/ui/HealthRing';
import { VirtualizedRepoTree } from '../components/ui/VirtualizedRepoTree';
import { Parser, COLORS, LAYER_COLORS, IGNORE, DEFAULT_EXCLUDE_CHIPS, compileExcludePatterns, parseExcludePatterns, shouldExcludeFile, shouldIgnoreDirectory, getSeverityColor, getAccentBlockStyle, getFilePreviewIconName, getDialogTone, buildAppUrl, renderTooltipHtml, escapeHtml } from '../lib/parser';
import { GitHub, buildTree, calcBlast, calcHealth, calcPRRisk, findSuggestedReviewers, findTestImpact, findDependencyChains } from '../lib/github';
import WorkspaceHeader from '../components/WorkspaceHeader';
import { dbSchemaToFlowSchema, parseDbSchema } from '../lib/dbParser';
import ERDiagramGraph from '../components/ERDiagramGraph';
import BranchDiff from '../components/BranchDiff';

function iconLabel(name, label, size, className) {
    return React.createElement(React.Fragment, null,
        React.createElement(Icon, { name: name, size: size || 's', className: className } as any),
        ' ',
        label
    );
}

export default function WorkspaceArea(){
    var _a=useState<any>(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'),theme=_a[0],setTheme=_a[1];
    var _b=useState<any>(''),repoUrl=_b[0],setRepoUrl=_b[1];
    var _c=useState<any>(''),token=_c[0],setToken=_c[1];
    var _auth=useState<any>(null),authUser=_auth[0],setAuthUser=_auth[1];
    var _authMethod=useState<any>('none'),authMethod=_authMethod[0],setAuthMethod=_authMethod[1];// 'none', 'pat', 'github_app'
    var _appId=useState<any>(''),appId=_appId[0],setAppId=_appId[1];
    var _privateKey=useState<any>(''),privateKey=_privateKey[0],setPrivateKey=_privateKey[1];
    var _showKeyModal=useState<any>(false),showKeyModal=_showKeyModal[0],setShowKeyModal=_showKeyModal[1];
    var _d=useState<any>(false),loading=_d[0],setLoading=_d[1];
    var _e=useState<any>(''),progress=_e[0],setProgress=_e[1];
    var _f=useState<any>(null),error=_f[0],setError=_f[1];
    var _g=useState<any>(null),data=_g[0],setData=_g[1];
    var _h=useState<any>(null),repoInfo=_h[0],setRepoInfo=_h[1];
    var _i=useState<any>('folder'),colorMode=_i[0],setColorMode=_i[1];
    var _j=useState<any>(null),selected=_j[0],setSelected=_j[1];
    var _k=useState<any>(new Set([''])),expandedPaths=_k[0],setExpandedPaths=_k[1];
    var _l=useState<any>(new Set(['blast','fns'])),expandedCards=_l[0],setExpandedCards=_l[1];
    var _m=useState<any>('details'),rightTab=_m[0],setRightTab=_m[1];
    var _m2=useState<any>(null),drillDown=_m2[0],setDrillDown=_m2[1];// {type:'issue'|'pattern'|'security'|'suggestion'|'duplicate', data:...}
    var _n=useState<any>(null),blastRadius=_n[0],setBlastRadius=_n[1];
    var _o=useState<any>(null),ownership=_o[0],setOwnership=_o[1];
    var _p=useState<any>(''),prUrl=_p[0],setPrUrl=_p[1];
    var _q=useState<any>(null),prData=_q[0],setPrData=_q[1];
    var _r=useState<any>(false),showExport=_r[0],setShowExport=_r[1];
    var _s=useState<any>(false),showPR=_s[0],setShowPR=_s[1];
    var _t=useState<any>(false),showPrivacy=_t[0],setShowPrivacy=_t[1];
    var _u=useState<any>(null),tooltip=_u[0],setTooltip=_u[1];
    var _v=useState<any>(null),toast=_v[0],setToast=_v[1];
    var _w=useState<any>(false),ownerLoading=_w[0],setOwnerLoading=_w[1];
    var _x=useState<any>(null),folderFilter=_x[0],setFolderFilter=_x[1];
    var _y=useState<any>(new Set()),expandedFns=_y[0],setExpandedFns=_y[1];
    var _z=useState<any>(false),showUnused=_z[0],setShowUnused=_z[1];
    var _aa=useState<any>({spacing:200,linkDist:70,viewMode:'force',vizType:'graph',showLabels:true,curvedLinks:true}),graphConfig=_aa[0],setGraphConfig=_aa[1];
    var _ab=useState<any>(false),showGraphConfig=_ab[0],setShowGraphConfig=_ab[1];
    var _ac=useState<any>(260),sidebarWidth=_ac[0],setSidebarWidth=_ac[1];
    var _ad=useState<any>(360),rightPanelWidth=_ad[0],setRightPanelWidth=_ad[1];
    var _ae=useState<any>(true),legendCollapsed=_ae[0],setLegendCollapsed=_ae[1];
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
    // Branch diff state
    var _bdiff=useState<any>(false),showBranchDiff=_bdiff[0],setShowBranchDiff=_bdiff[1];
    // DB schema auto-detected badge
    var _dbdet=useState<any>(false),dbSchemaDetected=_dbdet[0],setDbSchemaDetected=_dbdet[1];
    // DB Schema state
    var _dbs=useState<any>(false),showDbSchema=_dbs[0],setShowDbSchema=_dbs[1];
    var _dbflow=useState<any>('table'),dbViewMode=_dbflow[0],setDbViewMode=_dbflow[1];
    var _dbsd=useState<any>(null),dbSchema=_dbsd[0],setDbSchema=_dbsd[1];
    var _dbq=useState<any>(''),dbSearchQuery=_dbq[0],setDbSearchQuery=_dbq[1];
    var _dbapp=useState<any>('all'),dbAppFilter=_dbapp[0],setDbAppFilter=_dbapp[1];
    var _dbtbl=useState<any>(null),selectedDbTable=_dbtbl[0],setSelectedDbTable=_dbtbl[1];
    var svgRef=useRef(null);
    var filePreviewRef=useRef(null);
    var analysisContentCacheRef=useRef({});
    var treemapRef=useRef(null);
    var matrixRef=useRef(null);
    var dendroRef=useRef(null);
    var sankeyRef=useRef(null);
    var disjointRef=useRef(null);
    var bundleRef=useRef(null);
    var zoomRef=useRef(null);
    var simRef=useRef(null);
    var nodesRef=useRef(null);
    var linksRef=useRef(null);
    var selectFileRef=useRef(null);
    var confirmResolverRef=useRef(null);
    var activeExcludePatterns=useMemo(function(){return compileExcludePatterns(excludePatternInput);},[excludePatternInput]);
    var customExcludeCount=activeExcludePatterns.length;

    useEffect(function(){
      fetch('http://localhost:5000/auth/me',{credentials:'include'})
        .then(function(r){
          if(r.status===401){window.location.href='/';return null;}
          return r.json();
        })
        .then(function(user){
          if(user){setAuthUser(user);setToken(user.token);}
        })
        .catch(function(){window.location.href='/';});
    },[]);

    useEffect(function(){document.body.className=theme==='light'?'light':'';},[theme]);

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
        var params=new URLSearchParams(window.location.search);
        var repo=params.get('repo');
        var shouldAutoRun=params.get('run')==='1';
        if(repo&&repo.length<200&&!repo.includes('{')&&/^[a-zA-Z0-9_.\/-]+$/.test(repo)){
            setRepoUrl(repo);
            if(shouldAutoRun){
                setTimeout(function(){var btn=document.getElementById('analyze-btn');if(btn)btn.click();},500);
            }
        }
    },[]);

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
        }).catch(function(e: any){
            showNotification('Failed to switch branch: '+e.message,'error');
            setCurrentBranch(currentBranch);
        }).finally(function(){setBranchLoading(false);});
    }

    function pollTask(taskId: string) {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`http://localhost:8000/api/tasks/${taskId}`);
                const data = await res.json();
                if (data.status === 'completed') {
                    clearInterval(interval);
                    setData(data.result);
                    setLoading(false);
                    setProgress('');
                } else if (data.status === 'failed') {
                    clearInterval(interval);
                    setLoading(false);
                } else if (data.progress) {
                    setProgress(`Processing: ${data.progress}%`);
                }
            } catch (e) {
                clearInterval(interval);
            }
        }, 2000);
    }

    function analyze(branchOverride?: any) {
        if (branchOverride && typeof branchOverride !== 'string') branchOverride = undefined;
        const p = parseUrl(repoUrl);
        if (p) {
            setLoading(true);
            setProgress('Requesting deep analysis...');
            fetch('http://localhost:8000/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: repoUrl, token, branch: branchOverride || currentBranch || 'main' })
            }).then(res => res.json())
            .then(data => {
                if (data.task_id) {
                    pollTask(data.task_id);
                } else {
                    internal_analyze(branchOverride);
                }
            }).catch(() => {
                internal_analyze(branchOverride);
            });
        } else {
            internal_analyze(branchOverride);
        }
    }

    function internal_analyze(branchOverride?: any)
{
        // Ensure branchOverride is a string (React can pass event objects if called from onClick)
        if (branchOverride && typeof branchOverride !== 'string') branchOverride = undefined;
        var p=parseUrl(repoUrl);
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
        
        if(authMethod==='pat'){
            GitHub.token=token;
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

        var authPromise;
        if(authMethod==='github_app'){
            setProgress('Authenticating with GitHub App...');
            authPromise=GitHub.authenticateApp(p.owner,p.repo).catch(function(err: any){
                throw new Error('GitHub App authentication failed: '+err.message);
            });
        }else{
            authPromise=Promise.resolve();
        }
        
        authPromise.then(function(){
            setProgress('Connecting...');
            return GitHub.getRateLimit();
        }).then(function(rl: any){
            setProgress('Scanning repository...');
            return GitHub.scan(p.owner,p.repo,setProgress,currentExcludePatterns,branchOverride||currentBranch||undefined);
        }).then(function(result: any){
            var files=result.files||result;
            var detectedBranch=result.branch||currentBranch||'main';
            if(detectedBranch&&!currentBranch)setCurrentBranch(detectedBranch);
            if(!files)return;// Cancelled
            if(!files.length)throw new Error(currentExcludePatterns.length?'No code files found after applying exclude patterns':'No code files found');
            var SOFT_LIMIT=300,HARD_LIMIT=Infinity;
            function beginRepoAnalysis(){
                if(files.length>2000){
                    showNotification('Analyzing '+files.length+' files — this may take a while on large repos.','info');
                }
                var max=files.length;
                var analyzed=[];
                var allFns=[];
                var contentCache=analysisContentCacheRef.current||{};
                analysisContentCacheRef.current=contentCache;

                async function analyzeFile(f,i){
                    if(i===0||i%10===0)setProgress('Analyzing '+(i+1)+'/'+max+': '+f.name);
                    var isCodeFile=f.isCode!==false&&Parser.isCode(f.name);
                    try{
                        var content=contentCache[f.path];
                        if(content===undefined){
                            content=await GitHub.getFile(p.owner,p.repo,f.path,currentBranch||undefined);
                            contentCache[f.path]=content||'';
                        }
                        var layer=Parser.detectLayer(f.path);
                        if(isCodeFile&&content){
                            var actualIsCode=!Parser.isScriptContainer(f.path)||Parser.hasEmbeddedCode(content,f.path);
                            var fns=actualIsCode?Parser.extract(content,f.path):[];
                            analyzed.push({path:f.path,name:f.name,folder:f.folder,content:content,functions:fns,lines:content.split('\n').length,layer:layer,churn:0,isCode:actualIsCode});
                            if(actualIsCode){
                                fns.forEach(function(fn: any){allFns.push(Object.assign({},fn,{folder:f.folder,layer:layer}));});
                            }
                        }else{
                            var lines=content?content.split('\n').length:0;
                            analyzed.push({path:f.path,name:f.name,folder:f.folder,content:content||'',functions:[],lines:lines,layer:layer,churn:0,isCode:false});
                        }
                    }catch(e){
                        analyzed.push({path:f.path,name:f.name,folder:f.folder,content:'',functions:[],lines:0,layer:Parser.detectLayer(f.path),churn:0,isCode:false});
                    }
                }

                async function processFiles(){
                    var nextIndex=0;
                    var completed=0;
                    var CONCURRENCY=6;
                    async function worker(){
                        while(nextIndex<max){
                            var i=nextIndex++;
                            await analyzeFile(files[i],i);
                            completed++;
                            if(completed%10===0)setProgress('Analyzed '+completed+'/'+max+' files');
                            if(completed%24===0)await new Promise(function(r: any){setTimeout(r,0);});
                        }
                    }
                    var workers=[];
                    for(var wi=0;wi<Math.min(CONCURRENCY,max);wi++)workers.push(worker());
                    await Promise.all(workers);
                    await finishAnalysis();
                }

                async function finishAnalysis(){
                    try{
                // Phase 1: Build function stats index
                setProgress('Building dependency graph (1/5)...');
                await new Promise(function(r: any){setTimeout(r,0);});
                var fnNames=[...new Set(allFns.map(function(f: any){return f.name;}))];
                var conns=[];
                var fnStats={};
                // Initialize fnStats with additional metadata for accurate unused detection
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
                            isTopLevel:fn.isTopLevel!==false,  // Default to true for backward compat
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
                        // Pass file path and all function defs for accurate call detection
                        var tokenSet=new Set((file.content.match(/\b[A-Za-z_$]\w*\b/g)||[]));
                        var candidateFnNames=fnNames.filter(function(fn: any){var base=String(fn).split('.').pop();return tokenSet.has(fn)||tokenSet.has(base);});
                        if(!candidateFnNames.length)continue;
                        var calls=Parser.findCalls(file.content,candidateFnNames,file.path,allFns);
                        Object.entries(calls).forEach(function(entry: any){
                            var fn=entry[0],cnt=entry[1];
                            // Only process if there are actual calls (cnt > 0)
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
                // Only flag truly unused functions with language-aware filtering
                // Understands Python decorators, framework conventions, magic methods, etc.
                var deadFns=Object.entries(fnStats).filter(function(x: any){
                    var name=x[0],stats=x[1];
                    // Skip if has any calls (internal or external)
                    if(stats.internal>0||stats.external>0)return false;
                    // Skip class methods - they're called via instance
                    if(stats.isClassMethod)return false;
                    // Skip nested functions - they're private to their scope
                    if(!stats.isTopLevel)return false;
                    // Python-aware: skip decorated functions (framework-registered: routes, signals, etc.)
                    if(stats.decorators&&stats.decorators.length>0)return false;
                    // Python-aware: skip classes (instantiated dynamically, registered by frameworks)
                    if(stats.type==='class'||stats.type==='dataclass'||stats.type==='abstract_class')return false;
                    // Python-aware: skip dunder/magic methods (__init__, __str__, __enter__, etc.)
                    var baseName=name.includes('.')?name.split('.').pop():name;
                    if(baseName.startsWith('__')&&baseName.endsWith('__'))return false;
                    // Python-aware: skip test functions (discovered by pytest/unittest)
                    if(baseName.startsWith('test_')||baseName==='setUp'||baseName==='tearDown'||baseName==='setUpClass'||baseName==='tearDownClass')return false;
                    if(stats.file&&(stats.file.includes('test_')||stats.file.includes('_test.')||stats.file.includes('/tests/')))return false;
                    // Python-aware: skip migration functions (Alembic upgrade/downgrade)
                    if((baseName==='upgrade'||baseName==='downgrade')&&stats.file&&(stats.file.includes('migration')||stats.file.includes('alembic')||stats.file.includes('versions')))return false;
                    // Python-aware: skip common framework entry points and hooks
                    if(['main','create_app','make_app','get_app','setup','configure','register','on_startup','on_shutdown','lifespan'].indexOf(baseName)>=0)return false;
                    // JS/TS: skip explicitly exported functions (module exports are meant for external consumption)
                    // The export keyword is an explicit declaration of public API - if call detection
                    // can't find usage, it's a detection gap, not genuinely dead code
                    if(stats.isExported&&stats.file&&/\.[jt]sx?$/.test(stats.file))return false;
                    // Skip functions in test/spec files (broader pattern)
                    if(stats.file&&(/\.(?:spec|test)\.[jt]sx?$/.test(stats.file)||stats.file.includes('__tests__')))return false;
                    // This is a top-level function with zero calls and no framework registration
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

                // Phase 4: Duplicate detection and complexity
                setProgress('Analyzing code quality (4/5)...');
                await new Promise(function(r: any){setTimeout(r,0);});
                var duplicates=Parser.detectDuplicates(analyzed,allFns);
                var layerViolations=Parser.detectLayerViolations(analyzed,conns);
                // Add complexity to each file in batches
                for(var ci=0;ci<analyzed.length;ci+=CALL_BATCH){
                    var cEnd=Math.min(ci+CALL_BATCH,analyzed.length);
                    for(var cj=ci;cj<cEnd;cj++){
                        analyzed[cj].complexity=Parser.calcComplexity(analyzed[cj].content,analyzed[cj].path);
                    }
                    if(ci+CALL_BATCH<analyzed.length)await new Promise(function(r: any){setTimeout(r,0);});
                }

                // Phase 5: Free file content from memory (can be re-fetched for preview)
                setProgress('Finalizing (5/5)...');
                await new Promise(function(r: any){setTimeout(r,0);});
                analyzed.forEach(function(f: any){f.content=null;});

                var folders=[...new Set(analyzed.map(function(f: any){return f.folder;}))].sort();
                var tree=buildTree(analyzed);
                var totalLoc=analyzed.reduce(function(s: any, f: any){return s+f.lines;},0);
                var langStats={};
                analyzed.forEach(function(f: any){var ext=f.name.split('.').pop().toLowerCase();langStats[ext]=(langStats[ext]||0)+f.lines;});
                var langArray=Object.entries(langStats).sort(function(a: any, b: any){return b[1]-a[1];}).map(function(e: any){return{ext:e[0],lines:e[1],pct:Math.round(e[1]/totalLoc*100)};});
                // Add duplicate issues - include ALL items
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
                var dataObj={files:analyzed,functions:allFns,connections:conns,fnStats:fnStats,folders:folders,tree:tree,issues:issues,patterns:patterns,securityIssues:securityIssues,duplicates:duplicates,layerViolations:layerViolations,deadFunctions:deadFns.map(function(x: any){var codeLines=x[1].code?x[1].code.split('\n').length:0;return{name:x[0],file:x[1].file,folder:x[1].folder,line:x[1].line,code:x[1].code,codeLines:codeLines,ext:x[1].file.split('.').pop()};}),excludePatterns:currentExcludePatterns.map(function(x: any){return x.raw;}),stats:{files:analyzed.length,functions:allFns.length,connections:conns.length,dead:deadFns.length,patterns:patterns.length,security:securityIssues.filter(function(i: any){return i.severity==='high';}).length,duplicates:duplicates.length,violations:layerViolations.length,loc:totalLoc,languages:langArray}};
                dataObj.suggestions=Parser.generateSuggestions(dataObj);
                setData(dataObj);
                setExpandedPaths(new Set(['']));
                window.history.replaceState({},'',buildAppUrl(p.owner+'/'+p.repo,false));
                // Auto-detect Django/SQL schema files
                var hasDjango=analyzed.some(function(f: any){return f.name==='models.py'||f.path.toLowerCase().includes('/models/');});
                var hasSql=analyzed.some(function(f: any){var ext=(f.name.split('.').pop()||'').toLowerCase();return ext==='sql'||ext==='prisma';});
                if(hasDjango||hasSql){setDbSchemaDetected(true);showNotification('Django models detected — click DB Schema to visualize','info');}
                else{setDbSchemaDetected(false);}
                setLoading(false);
                }catch(err){
                    setError('Analysis failed: '+(err.message||err)+'. Try a smaller repository.');
                    setLoading(false);
                }
                }

                processFiles().catch(function(err: any){setError('Analysis failed: '+(err.message||err));setLoading(false);});
                return null;
            }

            if(files.length>SOFT_LIMIT&&files.length<=HARD_LIMIT){
                return requestConfirm({
                    tone:'warning',
                    icon:'warning',
                    title:'Analyze a large repository?',
                    message:
                        'This repository has '+files.length+' files.\n\n'+
                        'Analyzing larger repositories can take a while.',
                    confirmLabel:'Analyze repository'
                }).then(function(proceed: any){
                    if(!proceed){
                        setLoading(false);
                        return Promise.reject('cancelled');
                    }
                    return beginRepoAnalysis();
                });
            }

            return beginRepoAnalysis();
        }).catch(function(e: any){if(e!=='cancelled'){setError(e.message||e);setLoading(false);}});
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
        analyze();
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
                    var actualIsCode=!Parser.isScriptContainer(f.path)||Parser.hasEmbeddedCode(content,f.path);
                    var fns=actualIsCode?Parser.extract(content,f.path):[];
                    analyzed.push({path:f.path,name:f.name,folder:f.folder,content:content,functions:fns,lines:content.split('\n').length,layer:layer,churn:0,isCode:actualIsCode});
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
            setExpandedPaths(new Set(['']));
            setRepoInfo({owner:'local',repo:'folder',name:'Local Folder'});
            var hasDjangoLocal=analyzed.some(function(f: any){return f.name==='models.py'||f.path.toLowerCase().includes('/models/');});
            var hasSqlLocal=analyzed.some(function(f: any){var ext=(f.name.split('.').pop()||'').toLowerCase();return ext==='sql'||ext==='prisma';});
            if(hasDjangoLocal||hasSqlLocal){setDbSchemaDetected(true);showNotification('Schema files detected — click DB Schema to visualize','info');}
            else{setDbSchemaDetected(false);}
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
            setRightTab('details');
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
            updateGraphHighlight(path,blast);
        }
    },[data,repoInfo,localDirHandle]);
    selectFileRef.current=selectFile;

    function updateGraphHighlight(path,blast){
        if(!nodesRef.current||!linksRef.current)return;
        var affectedSet=new Set(blast?blast.affected:[]);
        nodesRef.current.selectAll('.nc').transition().duration(200)
            .attr('opacity',function(n: any){if(n.id===path)return 1;if(affectedSet.has(n.id))return 1;return path?0.2:1;})
            .attr('fill',function(n: any){if(n.id===path)return'#ff5f5f';if(affectedSet.has(n.id))return'#ff9f43';return getNodeColor(n);});
        linksRef.current.transition().duration(200)
            .attr('stroke-opacity',function(l: any){var src=l.source.id||l.source;var tgt=l.target.id||l.target;if(src===path||tgt===path)return 0.8;return path?0.05:0.4;})
            .attr('stroke',function(l: any){var src=l.source.id||l.source;var tgt=l.target.id||l.target;if(src===path||tgt===path)return'var(--acc)';return theme==='light'?'#ccc':'#333';});
    }

    function getNodeColor(d){
        if(colorMode==='folder')return colorMap[d.folder]||COLORS[0];
        if(colorMode==='layer')return LAYER_COLORS[d.layer]||LAYER_COLORS['utils'];
        if(colorMode==='churn')return colorMap[d.id]||'#22c55e';
        return COLORS[0];
    }

    var togglePath=useCallback(function(p: any){setExpandedPaths(function(prev: any){var n=new Set(prev);if(n.has(p))n.delete(p);else n.add(p);return n;});},[]);
    var toggleCard=useCallback(function(id: any){setExpandedCards(function(prev: any){var n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);return n;});},[]);
    var toggleFn=useCallback(function(name: any){setExpandedFns(function(prev: any){var n=new Set(prev);if(n.has(name))n.delete(name);else n.add(name);return n;});},[]);

    // Syntax highlighting function
    function highlightSyntax(code,filename){
        if(!code)return'';
        var ext=(filename||'').split('.').pop().toLowerCase();
        var isJS=['js','jsx','ts','tsx','mjs','cjs'].includes(ext);
        var isPy=['py','pyw','pyi'].indexOf(ext)>=0;
        var isJava=['java','kt','scala','cs','go'].includes(ext);
        var isHTML=['html','htm','vue','svelte'].includes(ext);
        var isCSS=['css','scss','sass','less'].includes(ext);
        var isJSON=['json','yaml','yml','toml'].includes(ext);
        var isRuby=['rb','rake'].includes(ext);
        var isPHP=ext==='php';
        var isVBA=['vba','bas','cls','xlsm','xlam','xlsb','xla','xlw'].includes(ext);
        function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
        // Split into tokens while preserving structure
        var result=code.split('\n').map(function(line: any){
            var escaped=esc(line);
            // Comments
            if(isJS||isJava||isPHP||isCSS)escaped=escaped.replace(/(\/\/.*$)/gm,'<span class="syn-com">$1</span>');
            if(isPy||isRuby)escaped=escaped.replace(/(#.*$)/gm,'<span class="syn-com">$1</span>');
            if(isHTML)escaped=escaped.replace(/(&lt;!--[\s\S]*?--&gt;)/g,'<span class="syn-com">$1</span>');
            // Strings - careful with order
            escaped=escaped.replace(/(&quot;[^&]*&quot;|'[^']*'|`[^`]*`)/g,'<span class="syn-str">$1</span>');
            // Numbers
            escaped=escaped.replace(/\b(\d+\.?\d*)\b/g,'<span class="syn-num">$1</span>');
            // Keywords
            if(isJS)escaped=escaped.replace(/\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|class|extends|import|export|from|default|async|await|yield|typeof|instanceof|in|of|this|super|null|undefined|true|false|void|static|get|set)\b/g,'<span class="syn-kw">$1</span>');
            if(isPy){
                escaped=escaped.replace(/\b(async|await|def|class|return|if|elif|else|for|while|try|except|finally|raise|import|from|as|with|pass|break|continue|lambda|yield|global|nonlocal|assert|True|False|None|and|or|not|in|is|del|match|case|type)\b/g,'<span class="syn-kw">$1</span>');
                escaped=escaped.replace(/(@\w+)/g,'<span class="syn-fn">$1</span>');
                escaped=escaped.replace(/\b(self|cls)\b/g,'<span class="syn-kw" style="opacity:0.7">$1</span>');
            }
            if(isJava)escaped=escaped.replace(/\b(public|private|protected|static|final|void|class|interface|extends|implements|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|import|package|this|super|null|true|false)\b/g,'<span class="syn-kw">$1</span>');
            if(isRuby)escaped=escaped.replace(/\b(def|class|module|end|return|if|elsif|else|unless|case|when|for|while|until|do|begin|rescue|ensure|raise|require|include|extend|attr_accessor|attr_reader|attr_writer|true|false|nil|self)\b/g,'<span class="syn-kw">$1</span>');
            if(isPHP)escaped=escaped.replace(/\b(function|class|return|if|else|elseif|for|foreach|while|do|switch|case|break|continue|try|catch|finally|throw|new|public|private|protected|static|const|use|namespace|extends|implements|true|false|null)\b/g,'<span class="syn-kw">$1</span>');
            if(isVBA)escaped=escaped.replace(/\b(Public|Private|Friend|Static|Dim|Set|Let|Get|Call|Function|Sub|End Sub|End Function|Exit Sub|Exit Function|If|Then|Else|ElseIf|End If|For|To|Step|Next|Do|Loop|While|Wend|Select|Case|End Select|With|End With|On Error|Resume|GoTo|ByVal|ByRef|Optional|ParamArray|As|Type|Enum|Const|True|False|Nothing|Empty|Null|Me|Application|ThisWorkbook|Worksheets|Cells|Range|MsgBox|InputBox|Debug\.Print)\b/gi,'<span class="syn-kw">$1</span>');
            if(isCSS)escaped=escaped.replace(/(@media|@import|@keyframes|@font-face|!important)/g,'<span class="syn-kw">$1</span>');
            if(isHTML){escaped=escaped.replace(/(&lt;\/?)([\w-]+)/g,'$1<span class="syn-tag">$2</span>');escaped=escaped.replace(/([\w-]+)(=)/g,'<span class="syn-attr">$1</span>$2');}
            // Function calls
            escaped=escaped.replace(/\b([a-zA-Z_]\w*)\s*\(/g,'<span class="syn-fn">$1</span>(');
            // Types (capitalized words in certain contexts)
            if(isJS||isJava)escaped=escaped.replace(/:\s*([A-Z]\w*)/g,': <span class="syn-type">$1</span>');
            return escaped;
        });
        return result;
    }

    // Open file preview
    function openFilePreview(path,line){
        if(!repoInfo)return;
        var filename=path.split('/').pop();
        if(Parser.isBinary(filename)){setFilePreview({path:path,filename:filename,content:null,line:null,loading:false,error:'Binary file — cannot be previewed'});return;}
        setFilePreview({path:path,filename:filename,content:null,line:line||null,loading:true,error:null});
        // Check if we already have the content in data
        if(data as any){
            var existingFile=(data as any).files.find(function(f: any){return f.path===path;});
            if(existingFile&&existingFile.content){
                setFilePreview({path:path,filename:filename,content:existingFile.content,line:line||null,loading:false,error:null});
                return;
            }
        }
        if(analysisContentCacheRef.current&&analysisContentCacheRef.current[path]){
            setFilePreview({path:path,filename:filename,content:analysisContentCacheRef.current[path],line:line||null,loading:false,error:null});
            return;
        }
        // Fetch from GitHub or local directory
        if(localDirHandle){
            // Read from local directory using async traversal
            (async function(){
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
                    setFilePreview({path:path,filename:filename,content:content,line:line||null,loading:false,error:null});
                }catch(e){
                    setFilePreview({path:path,filename:filename,content:null,line:line||null,loading:false,error:e.message||'Failed to load file'});
                }
            })();
        }else{
            // Fetch from GitHub (pass current branch so raw fallback works correctly)
            GitHub.getFile(repoInfo.owner,repoInfo.repo,path,currentBranch||undefined).then(function(content: any){
                if(content){
                    analysisContentCacheRef.current[path]=content;
                    setFilePreview({path:path,filename:filename,content:content,line:line||null,loading:false,error:null});
                }else{
                    setFilePreview({path:path,filename:filename,content:null,line:line||null,loading:false,error:'File not accessible — try a PAT for private repos'});
                }
            }).catch(function(e: any){
                setFilePreview({path:path,filename:filename,content:null,line:line||null,loading:false,error:e.message||'Failed to load file'});
            });
        }
    }

    // Scroll to highlighted line after file preview loads
    useEffect(function(){
        if(filePreview&&filePreview.content&&filePreview.line&&filePreviewRef.current){
            setTimeout(function(){
                var el=filePreviewRef.current.querySelector('.file-preview-line.highlighted');
                if(el)el.scrollIntoView({behavior:'smooth',block:'center'});
            },100);
        }
    },[filePreview]);

    var colorMap=useMemo(function(){
        if(!data)return{};
        var m={};
        if(colorMode==='folder'){(data as any).folders.forEach(function(f: any, i: any){m[f]=COLORS[i%COLORS.length];});m['root']=COLORS[0];}
        else if(colorMode==='layer')(data as any).files.forEach(function(f: any){m[f.path]=LAYER_COLORS[f.layer]||COLORS[0];});
        else if(colorMode==='churn'){
            var maxC=Math.max.apply(null,(data as any).files.map(function(f: any){return f.churn||0;}))||1;
            (data as any).files.forEach(function(f: any){var r=(f.churn||0)/maxC;m[f.path]=r>0.7?'#ff5f5f':r>0.4?'#ff9f43':'#22c55e';});
        }
        return m;
    },[data,colorMode]);

    useEffect(function(){
        if(!data||!svgRef.current)return;
        var svg=d3.select(svgRef.current);
        svg.selectAll('*').remove();
        try{
        var w=svgRef.current.clientWidth;
        var h=svgRef.current.clientHeight;
        var filteredFiles=folderFilter?(data as any).files.filter(function(f: any){return f.folder===folderFilter||f.folder.startsWith(folderFilter+'/');}):(data as any).files;
        var fileIds=new Set(filteredFiles.map(function(f: any){return f.path;}));
        var nodes=filteredFiles.map(function(f: any){return{id:f.path,name:f.name,folder:f.folder,fnCount:f.functions.length,layer:f.layer,churn:f.churn||0};});
        var linkMap=new Map();
        (data as any).connections.forEach(function(c: any){
            if(!fileIds.has(c.source)||!fileIds.has(c.target))return;
            if(c.source===c.target)return;// Skip self-links
            var k=c.source+'|'+c.target;
            if(!linkMap.has(k))linkMap.set(k,{source:c.source,target:c.target,count:0});
            linkMap.get(k).count+=c.count;
        });
        var links=Array.from(linkMap.values());
        function getR(d){return Math.max(8,Math.min(24,5+d.fnCount*0.8));}
        function getC(d){
            if(colorMode==='folder')return colorMap[d.folder]||COLORS[0];
            if(colorMode==='layer')return LAYER_COLORS[d.layer]||LAYER_COLORS['utils'];
            if(colorMode==='churn')return colorMap[d.id]||'#22c55e';
            return COLORS[0];
        }
        var folders=[...new Set(nodes.map(function(n: any){return n.folder;}))];
        var cols=Math.max(2,Math.ceil(Math.sqrt(folders.length)));
        var cw=w/(cols+1);
        var ch=h/(Math.ceil(folders.length/cols)+1);
        var centers={};
        folders.forEach(function(f: any, i: any){centers[f]={x:(i%cols+1)*cw,y:(Math.floor(i/cols)+1)*ch};});
        var zoom=d3.zoom().scaleExtent([0.05,5]).on('zoom',function(e: any){container.attr('transform',e.transform);});
        svg.call(zoom);
        zoomRef.current=zoom;
        var container=svg.append('g');
        var defs=svg.append('defs');
        defs.append('marker').attr('id','arr').attr('viewBox','0 -5 10 10').attr('refX',14).attr('markerWidth',4).attr('markerHeight',4).attr('orient','auto').append('path').attr('d','M0,-4L10,0L0,4').attr('fill',theme==='light'?'#aaa':'#444');
        var hullLayer=container.append('g');
        var linkLayer=container.append('g');
        var nodeLayer=container.append('g');
        var sim=d3.forceSimulation(nodes);
        // Scale spacing up for larger graphs so nodes don't clump together
        var breathe=Math.max(1,Math.pow(nodes.length/200,0.55));
        var linkDist=graphConfig.linkDist*breathe;
        var spacing=graphConfig.spacing*breathe;
        var collidePad=12*Math.min(2,breathe);
        if(graphConfig.viewMode==='force'){
            // Spread folder centers further apart for large graphs
            if(breathe>1.2){
                Object.keys(centers).forEach(function(k: any){
                    centers[k].x=w/2+(centers[k].x-w/2)*breathe;
                    centers[k].y=h/2+(centers[k].y-h/2)*breathe;
                });
            }
            sim.force('link',d3.forceLink(links).id(function(d: any){return d.id;}).distance(linkDist).strength(0.3))
               .force('charge',d3.forceManyBody().strength(-spacing).distanceMax(400*breathe))
               .force('collision',d3.forceCollide().radius(function(d: any){return getR(d)+collidePad;}))
               .force('x',d3.forceX(function(d: any){return (centers as any)[(d as any).folder]?(centers as any)[(d as any).folder].x:w/2;}).strength(0.15))
               .force('y',d3.forceY(function(d: any){return (centers as any)[(d as any).folder]?(centers as any)[(d as any).folder].y:h/2;}).strength(0.15));
        }else if(graphConfig.viewMode==='radial'){
            var r=Math.min(w,h)*0.35*Math.min(2.5,breathe);
            nodes.forEach(function(n: any, i: any){n.angle=i/nodes.length*2*Math.PI;n.targetX=w/2+Math.cos(n.angle)*r;n.targetY=h/2+Math.sin(n.angle)*r;});
            sim.force('link',d3.forceLink(links).id(function(d: any){return d.id;}).distance(linkDist*0.5).strength(0.05))
               .force('charge',d3.forceManyBody().strength(-spacing*0.3))
               .force('collision',d3.forceCollide().radius(function(d: any){return getR(d)+collidePad*0.7;}))
               .force('x',d3.forceX(function(d: any){return d.targetX;}).strength(0.8))
               .force('y',d3.forceY(function(d: any){return d.targetY;}).strength(0.8));
        }else if(graphConfig.viewMode==='hierarchical'){
            var layerOrder={util:0,model:1,service:2,controller:3,view:4,test:5,config:6,modules:7,forms:8,classes:9};
            var layerGroups={};
            nodes.forEach(function(n: any){var l=n.layer||'util';if(!layerGroups[l])layerGroups[l]=[];layerGroups[l].push(n);});
            var sortedLayers=Object.keys(layerGroups).sort(function(a: any, b: any){return(layerOrder[a]||99)-(layerOrder[b]||99);});
            var wideW=Math.max(w,w*breathe*0.7);
            sortedLayers.forEach(function(l: any, li: any){var g=layerGroups[l];var colW=wideW/(sortedLayers.length+1);g.forEach(function(n: any, ni: any){n.targetX=(li+1)*colW;n.targetY=(ni+1)*Math.max(h,h*breathe*0.7)/(g.length+1);});});
            sim.force('link',d3.forceLink(links).id(function(d: any){return d.id;}).distance(linkDist).strength(0.1))
               .force('charge',d3.forceManyBody().strength(-spacing*0.5).distanceMax(200*breathe))
               .force('collision',d3.forceCollide().radius(function(d: any){return getR(d)+collidePad*0.85;}))
               .force('x',d3.forceX(function(d: any){return d.targetX||w/2;}).strength(0.9))
               .force('y',d3.forceY(function(d: any){return d.targetY||h/2;}).strength(0.3));
        }else if(graphConfig.viewMode==='grid'){
            var gridCols=Math.ceil(Math.sqrt(nodes.length));
            var gridW=Math.max(w,w*breathe*0.8);
            var gridH=Math.max(h,h*breathe*0.8);
            var cellW=gridW/(gridCols+1);
            var cellH=gridH/(Math.ceil(nodes.length/gridCols)+1);
            nodes.forEach(function(n: any, i: any){n.targetX=(i%gridCols+1)*cellW;n.targetY=(Math.floor(i/gridCols)+1)*cellH;});
            sim.force('link',d3.forceLink(links).id(function(d: any){return d.id;}).distance(linkDist*1.5).strength(0.02))
               .force('collision',d3.forceCollide().radius(function(d: any){return getR(d)+collidePad*1.25;}))
               .force('x',d3.forceX(function(d: any){return d.targetX;}).strength(1))
               .force('y',d3.forceY(function(d: any){return d.targetY;}).strength(1));
        }else if(graphConfig.viewMode==='metro'){
            var metro={lines:[],stations:{}};
            var roots=nodes.filter(function(n: any){return!links.some(function(l: any){return(l.target.id||l.target)===n.id;});});
            if(!roots.length)roots=[nodes[0]];
            var lineY=80,lineSpacing=Math.min(120,(h-160)/Math.max(1,roots.length));
            roots.forEach(function(root: any, li: any){
                var visited=new Set(),queue=[root.id],line=[],x=80;
                while(queue.length){
                    var id=queue.shift();if(visited.has(id))continue;visited.add(id);
                    var node=nodes.find(function(n: any){return n.id===id;});
                    if(node){node.targetX=x;node.targetY=lineY+li*lineSpacing;node.metroLine=li;line.push(node);x+=spacing*0.8;}
                    links.forEach(function(l: any){var s=l.source.id||l.source,t=l.target.id||l.target;if(s===id&&!visited.has(t))queue.push(t);});
                }
                metro.lines.push(line);
            });
            nodes.filter(function(n: any){return!n.targetX;}).forEach(function(n: any, i: any){n.targetX=80+i*50;n.targetY=h-80;n.metroLine=roots.length;});
            sim.force('link',d3.forceLink(links).id(function(d: any){return d.id;}).distance(linkDist).strength(0.05))
               .force('collision',d3.forceCollide().radius(function(d: any){return getR(d)+collidePad;}))
               .force('x',d3.forceX(function(d: any){return d.targetX||w/2;}).strength(0.95))
               .force('y',d3.forceY(function(d: any){return d.targetY||h/2;}).strength(0.95));
        }
        // Adaptive simulation parameters based on graph size
        var isLargeGraph=nodes.length>300;
        var alphaDecay=isLargeGraph?0.08:0.05;
        var velDecay=isLargeGraph?0.7:0.6;
        sim.velocityDecay(velDecay).alphaDecay(alphaDecay);
        simRef.current=sim;
        var link=linkLayer.selectAll('path').data(links).join('path').attr('fill','none').attr('stroke',theme==='light'?'#ccc':'#333').attr('stroke-width',function(d: any){return Math.max(1,Math.min(2,Math.sqrt(d.count)*0.3));}).attr('stroke-opacity',0.4).attr('marker-end','url(#arr)');
        linksRef.current=link;
        var node=nodeLayer.selectAll('g').data(nodes).join('g').style('cursor','pointer');
        nodesRef.current=node;
        node.call(d3.drag().on('start',function(e: any, d: any){if(!e.active)sim.alphaTarget(0.1).restart();d.fx=d.x;d.fy=d.y;}).on('drag',function(e: any, d: any){d.fx=e.x;d.fy=e.y;}).on('end',function(e: any, d: any){if(!e.active)sim.alphaTarget(0);d.fx=null;d.fy=null;}));
        node.on('click',function(e: any, d: any){e.stopPropagation();if(selectFileRef.current)selectFileRef.current(d.id);});
        node.on('mouseenter',function(e: any, d: any){var r=svgRef.current.getBoundingClientRect();setTooltip({x:e.clientX-r.left+10,y:e.clientY-r.top,title:d.name,content:d.fnCount+' functions\n'+d.layer+' layer\n'+d.churn+' recent commits'});}).on('mouseleave',function(){setTooltip(null);});
        svg.on('click',function(e: any){if(e.target===svgRef.current){setSelected(null);setBlastRadius(null);link.attr('stroke',theme==='light'?'#ccc':'#333').attr('stroke-opacity',0.4);node.selectAll('.nc').attr('opacity',1).attr('fill',getC);}});
        node.append('circle').attr('class','nc').attr('r',getR).attr('fill',getC).attr('stroke',function(d: any){var c=d3.color(getC(d));return c?c.brighter(0.3):'#fff';}).attr('stroke-width',1.5);
        // Hide labels for large graphs to reduce DOM overhead
        if(!isLargeGraph||graphConfig.showLabels){
            node.append('text').attr('text-anchor','middle').attr('dy',0).attr('fill',theme==='light'?'#333':'#eee').attr('font-size',function(d: any){return Math.max(6,Math.min(10,getR(d)*0.6))+'px';}).attr('font-family','JetBrains Mono').attr('font-weight','500').attr('pointer-events','none').text(function(d: any){var n=d.name.replace(/\.[^.]+$/,'');var maxLen=Math.max(4,Math.floor(getR(d)/2));return n.length>maxLen+1?n.slice(0,maxLen)+'…':n;});
        }
        // Pre-index nodes by folder for faster hull computation
        var nodesByFolder={};
        folders.forEach(function(f: any){nodesByFolder[f]=nodes.filter(function(n: any){return n.folder===f;});});
        function updateHulls(){
            hullLayer.selectAll('*').remove();
            folders.forEach(function(f: any){
                var fn=nodesByFolder[f];
                if(!fn||fn.length<1)return;
                var pad=30,pts=[];
                fn.forEach(function(n: any){if(n.x&&n.y)pts.push([n.x-pad,n.y-pad],[n.x+pad,n.y-pad],[n.x-pad,n.y+pad],[n.x+pad,n.y+pad]);});
                if(pts.length<3)return;
                var hull=d3.polygonHull(pts);
                if(hull){
                    var color=colorMap[f]||COLORS[folders.indexOf(f)%COLORS.length];
                    hullLayer.append('path').attr('d','M'+hull.join('L')+'Z').attr('fill',color).attr('fill-opacity',0.04).attr('stroke',color).attr('stroke-width',2).attr('stroke-opacity',0.25).attr('rx',8);
                    var cx=d3.mean(fn,function(n: any){return n.x;}),cy=d3.min(fn,function(n: any){return n.y;})-pad-8;
                    hullLayer.append('text').attr('x',cx).attr('y',cy).attr('text-anchor','middle').attr('fill',color).attr('font-size','10px').attr('font-family','JetBrains Mono').attr('font-weight','600').attr('opacity',0.7).text(f||'root');
                }
            });
        }
        // Throttle hull updates for large graphs (every N ticks instead of every tick)
        var hullInterval=isLargeGraph?5:1;
        var tickCount=0;
        sim.on('tick',function(){
            if(graphConfig.curvedLinks){
                link.attr('d',function(d: any){var dx=d.target.x-d.source.x,dy=d.target.y-d.source.y,dr=Math.sqrt(dx*dx+dy*dy);return'M'+d.source.x+','+d.source.y+'A'+dr+','+dr+' 0 0,1 '+d.target.x+','+d.target.y;});
            }else{
                link.attr('d',function(d: any){return'M'+d.source.x+','+d.source.y+'L'+d.target.x+','+d.target.y;});
            }
            node.attr('transform',function(d: any){return'translate('+d.x+','+d.y+')';});
            tickCount++;
            if(tickCount%hullInterval===0)updateHulls();
        });
        node.selectAll('text').attr('opacity',graphConfig.showLabels?1:0);
        }catch(e){console.error('Force graph error:',e);svg.selectAll('*').remove();svg.append('text').attr('x',20).attr('y',30).attr('fill','var(--t3)').text('Graph rendering error: '+e.message);}
        return function(){if(simRef.current)simRef.current.stop();};
    },[data,colorMap,colorMode,theme,folderFilter,graphConfig]);

    // Treemap - Nested folder hierarchy with group headers
    useEffect(function(){
        if(!data||!treemapRef.current||graphConfig.vizType!=='treemap')return;
        var container=d3.select(treemapRef.current);
        container.selectAll('*').remove();
        var w=treemapRef.current.clientWidth||800,h=treemapRef.current.clientHeight||600;
        var svg=container.append('svg').attr('width',w).attr('height',h).style('cursor','grab');
        var g=svg.append('g');
        var zoom=d3.zoom().scaleExtent([0.2,6]).on('zoom',function(e: any){g.attr('transform',e.transform);});
        svg.call(zoom);
        var filteredFiles=folderFilter?(data as any).files.filter(function(f: any){return f.folder===folderFilter||f.folder.startsWith(folderFilter+'/');}):(data as any).files;

        // Build true nested folder hierarchy from path segments
        var rootNode={name:'root',fullPath:'',children:[],_idx:{}};
        filteredFiles.forEach(function(f: any){
            var parts=(f.folder||'root').split('/').filter(Boolean);
            if(!parts.length)parts=['root'];
            var cur=rootNode,acc='';
            parts.forEach(function(p: any){
                acc=acc?acc+'/'+p:p;
                if(!cur._idx[p]){var child={name:p,fullPath:acc,children:[],_idx:{}};cur._idx[p]=child;cur.children.push(child);}
                cur=cur._idx[p];
            });
            cur.children.push({name:f.name,value:f.lines||1,path:f.path,layer:f.layer,fns:f.functions.length,folder:f.folder||'root'});
        });
        function strip(n){delete n._idx;if(n.children)n.children.forEach(strip);}
        strip(rootNode);

        var root=d3.hierarchy(rootNode).sum(function(d: any){return d.value||0;}).sort(function(a: any, b: any){return b.value-a.value;});
        d3.treemap().size([w-8,h-8]).paddingOuter(3).paddingTop(function(d: any){return d.depth===0?0:16;}).paddingInner(2).round(true)(root);

        // Draw parent folder groups first (headers)
        var parents=root.descendants().filter(function(d: any){return d.children&&d.depth>0;});
        var parentG=g.selectAll('g.tm-parent').data(parents).join('g').attr('class','tm-parent')
            .attr('transform',function(d: any){return'translate('+d.x0+','+d.y0+')';});
        parentG.append('rect')
            .attr('width',function(d: any){return Math.max(0,d.x1-d.x0);})
            .attr('height',function(d: any){return Math.max(0,d.y1-d.y0);})
            .attr('fill',function(d: any){var top=d.ancestors().find(function(a: any){return a.depth===1;});return colorMap[top?top.data.fullPath:d.data.fullPath]||COLORS[parents.indexOf(d)%COLORS.length];})
            .attr('fill-opacity',0.08).attr('stroke',function(d: any){var top=d.ancestors().find(function(a: any){return a.depth===1;});return colorMap[top?top.data.fullPath:d.data.fullPath]||COLORS[parents.indexOf(d)%COLORS.length];})
            .attr('stroke-opacity',0.45).attr('rx',5).style('cursor','pointer');
        parentG.filter(function(d: any){return d.x1-d.x0>40&&d.y1-d.y0>18;}).append('text')
            .attr('x',6).attr('y',12).attr('fill','var(--t1)').attr('font-size','9px').attr('font-weight','600').attr('font-family','JetBrains Mono').style('pointer-events','none')
            .text(function(d: any){var maxLen=Math.floor((d.x1-d.x0-10)/6);var n=d.data.name;return n.length>maxLen?n.slice(0,maxLen-1)+'…':n;});
        parentG.on('click',function(e: any, d: any){e.stopPropagation();if(d.data.fullPath)filterByFolder(d.data.fullPath);});

        // Leaves (files)
        var leafColor=function(d: any){var top=d.ancestors().find(function(a: any){return a.depth===1;});return colorMap[top?top.data.fullPath:d.data.folder]||COLORS[0];};
        var cells=g.selectAll('g.treemap-cell-g').data(root.leaves()).join('g').attr('class','treemap-cell-g')
            .attr('transform',function(d: any){return'translate('+d.x0+','+d.y0+')';});
        cells.append('rect').attr('class','treemap-rect').attr('width',function(d: any){return Math.max(0,d.x1-d.x0);}).attr('height',function(d: any){return Math.max(0,d.y1-d.y0);})
            .attr('fill',leafColor).attr('opacity',0.85).attr('rx',3).attr('stroke','var(--bg0)').attr('stroke-width',1).style('cursor','pointer');
        cells.filter(function(d: any){return d.x1-d.x0>45&&d.y1-d.y0>22;}).append('text').attr('class','treemap-text')
            .attr('x',4).attr('y',14).attr('fill','white').attr('font-size','10px').attr('font-weight','500').style('text-shadow','0 1px 2px rgba(0,0,0,0.5)').style('pointer-events','none')
            .text(function(d: any){var n=d.data.name.replace(/\.[^.]+$/,'');var maxLen=Math.floor((d.x1-d.x0-8)/6);return n.length>maxLen?n.slice(0,maxLen-1)+'…':n;});
        cells.filter(function(d: any){return d.x1-d.x0>60&&d.y1-d.y0>35;}).append('text').attr('class','treemap-subtext')
            .attr('x',4).attr('y',26).attr('fill','rgba(255,255,255,0.7)').attr('font-size','8px').style('pointer-events','none')
            .text(function(d: any){return d.data.value+' lines';});

        var tooltip=container.append('div').attr('class','treemap-tooltip').style('display','none').style('position','absolute');
        cells.on('mouseenter',function(e: any, d: any){
            tooltip.html(renderTooltipHtml(d.data.name,[
                {label:'Lines',value:d.data.value},
                {label:'Functions',value:d.data.fns||0},
                {label:'Layer',value:d.data.layer||'—'},
                {label:'Folder',value:d.data.folder||'root'}
            ])).style('display','block').style('left',(e.offsetX+15)+'px').style('top',(e.offsetY+15)+'px');
            d3.select(this).select('rect').transition().duration(150).attr('opacity',1).attr('stroke','var(--acc)').attr('stroke-width',2);
        }).on('mousemove',function(e: any){tooltip.style('left',(e.offsetX+15)+'px').style('top',(e.offsetY+15)+'px');})
        .on('mouseleave',function(e: any, d: any){
            tooltip.style('display','none');
            var sel=selected?selected.path:null;
            var isSelected=d.data.path===sel;
            var isAffected=blastRadius&&blastRadius.affected.includes(d.data.path);
            d3.select(this).select('rect').transition().duration(150).attr('opacity',isSelected?1:isAffected?0.95:0.85).attr('stroke',isSelected?'#ff5f5f':isAffected?'var(--orange)':'var(--bg0)').attr('stroke-width',isSelected||isAffected?2:1);
        }).on('click',function(e: any, d: any){
            e.stopPropagation();
            if(d.data.path&&selectFileRef.current){
                selectFileRef.current(d.data.path);
                setTimeout(function(){
                    var blast=blastRadius;
                    cells.select('rect').transition().duration(300)
                        .attr('opacity',function(n: any){return n.data.path===d.data.path?1:(blast&&blast.affected.includes(n.data.path))?0.95:0.4;})
                        .attr('fill',function(n: any){return n.data.path===d.data.path?'#ff5f5f':(blast&&blast.affected.includes(n.data.path))?'#ff9f43':leafColor(n);})
                        .attr('stroke',function(n: any){return n.data.path===d.data.path?'#ff5f5f':(blast&&blast.affected.includes(n.data.path))?'var(--orange)':'var(--bg0)';})
                        .attr('stroke-width',function(n: any){return n.data.path===d.data.path||blast&&blast.affected.includes(n.data.path)?2:1;});
                },100);
            }
        });
        svg.on('click',function(){
            setSelected(null);setBlastRadius(null);
            cells.select('rect').transition().duration(300).attr('opacity',0.85).attr('fill',leafColor).attr('stroke','var(--bg0)').attr('stroke-width',1);
        });
        svg.on('dblclick.zoom',function(e: any){e.preventDefault();svg.transition().duration(300).call(zoom.scaleTo,1);});
    },[data,graphConfig.vizType,colorMap,folderFilter,selected,blastRadius]);

    // Dependency Matrix visualization - Interactive with zoom, highlighting, selection
    useEffect(function(){
        if(!data||!matrixRef.current||graphConfig.vizType!=='matrix')return;
        var container=d3.select(matrixRef.current);
        container.selectAll('*').remove();
        var w=matrixRef.current.clientWidth||800,h=matrixRef.current.clientHeight||600;
        var svg=container.append('svg').attr('width',w).attr('height',h);
        var g=svg.append('g').attr('transform','translate(100,80)');
        var zoom=d3.zoom().scaleExtent([0.5,3]).on('zoom',function(e: any){g.attr('transform','translate('+(100+e.transform.x)+','+(80+e.transform.y)+') scale('+e.transform.k+')');});
        svg.call(zoom);
        var filteredFiles=folderFilter?(data as any).files.filter(function(f: any){return f.folder===folderFilter||f.folder.startsWith(folderFilter+'/');}):(data as any).files;
        var files=filteredFiles.slice(0,40);
        var n=files.length;
        var cellSize=Math.min(18,Math.max(10,(Math.min(w-120,h-100))/n));
        var matrix=[];var fileIdx={};
        files.forEach(function(f: any, i: any){fileIdx[f.path]=i;matrix[i]=[];for(var j=0;j<n;j++)matrix[i][j]=0;});
        (data as any).connections.forEach(function(c: any){
            var src=typeof c.source==='object'?c.source.id:c.source;
            var tgt=typeof c.target==='object'?c.target.id:c.target;
            if(fileIdx[src]!==undefined&&fileIdx[tgt]!==undefined)matrix[fileIdx[src]][fileIdx[tgt]]+=c.count||1;
        });
        var maxVal=1;matrix.forEach(function(row: any){row.forEach(function(v: any){if(v>maxVal)maxVal=v;});});
        var colLabels=g.selectAll('text.col-label').data(files).join('text').attr('class','col-label')
            .attr('x',function(d: any, i: any){return i*cellSize+cellSize/2;}).attr('y',-8).attr('text-anchor','start').attr('transform',function(d: any, i: any){return'rotate(-45,'+(i*cellSize+cellSize/2)+','+-8+')';})
            .attr('fill','var(--t2)').attr('font-size','9px').text(function(d: any){var n=d.name.replace(/\.[^.]+$/,'');return n.length>10?n.slice(0,8)+'…':n;}).style('cursor','pointer')
            .on('click',function(e: any, d: any){if(selectFileRef.current)selectFileRef.current(d.path);});
        var rowLabels=g.selectAll('text.row-label').data(files).join('text').attr('class','row-label')
            .attr('x',-8).attr('y',function(d: any, i: any){return i*cellSize+cellSize/2+3;}).attr('text-anchor','end')
            .attr('fill','var(--t2)').attr('font-size','9px').text(function(d: any){var n=d.name.replace(/\.[^.]+$/,'');return n.length>10?n.slice(0,8)+'…':n;}).style('cursor','pointer')
            .on('click',function(e: any, d: any){if(selectFileRef.current)selectFileRef.current(d.path);});
        var cellData=[];
        files.forEach(function(f: any, i: any){files.forEach(function(g: any, j: any){cellData.push({row:i,col:j,value:matrix[i][j],source:f,target:g});});});
        var tooltip=container.append('div').attr('class','treemap-tooltip').style('display','none').style('position','absolute');
        var cells=g.selectAll('rect.matrix-cell-rect').data(cellData).join('rect').attr('class','matrix-cell-rect')
            .attr('x',function(d: any){return d.col*cellSize;}).attr('y',function(d: any){return d.row*cellSize;})
            .attr('width',cellSize-1).attr('height',cellSize-1).attr('rx',2)
            .attr('fill',function(d: any){return d.value>0?'rgba(0,255,157,'+Math.max(0.15,d.value/maxVal)+')':'var(--bg2)';})
            .attr('stroke','var(--bg0)').attr('stroke-width',0.5).style('cursor','pointer');
        cells.on('mouseenter',function(e: any, d: any){
            tooltip.html(renderTooltipHtml(d.source.name+' → '+d.target.name,[
                {label:'Connections',value:d.value}
            ]))
                .style('display','block').style('left',(e.offsetX+15)+'px').style('top',(e.offsetY+15)+'px');
            g.selectAll('rect.matrix-cell-rect').attr('opacity',function(c: any){return c.row===d.row||c.col===d.col?1:0.3;});
            colLabels.attr('fill',function(f: any, i: any){return i===d.col?'var(--acc)':'var(--t2)';}).attr('font-weight',function(f: any, i: any){return i===d.col?'600':'400';});
            rowLabels.attr('fill',function(f: any, i: any){return i===d.row?'var(--acc)':'var(--t2)';}).attr('font-weight',function(f: any, i: any){return i===d.row?'600':'400';});
            d3.select(this).attr('stroke','var(--acc)').attr('stroke-width',2);
        }).on('mousemove',function(e: any){tooltip.style('left',(e.offsetX+15)+'px').style('top',(e.offsetY+15)+'px');})
        .on('mouseleave',function(){
            tooltip.style('display','none');
            cells.attr('opacity',1);
            colLabels.attr('fill','var(--t2)').attr('font-weight','400');
            rowLabels.attr('fill','var(--t2)').attr('font-weight','400');
            d3.select(this).attr('stroke','var(--bg0)').attr('stroke-width',0.5);
        }).on('click',function(e: any, d: any){e.stopPropagation();if(selectFileRef.current)selectFileRef.current(d.source.path);});
        var legend=container.append('div').attr('class','heatmap-legend').style('position','absolute').style('bottom','60px').style('right','20px');
        legend.html('<div style="font-size:9px;color:var(--t2)">Connection Strength</div><div class="heatmap-gradient"></div><div style="display:flex;justify-content:space-between;font-size:8px;color:var(--t3)"><span>0</span><span>'+maxVal+'</span></div>');
    },[data,graphConfig.vizType,folderFilter]);

    // Tree - Radial cluster of nested folder/file hierarchy
    useEffect(function(){
        if(!data||!dendroRef.current||graphConfig.vizType!=='dendro')return;
        var container=d3.select(dendroRef.current);
        container.selectAll('*').remove();
        var w=dendroRef.current.clientWidth||800,h=dendroRef.current.clientHeight||600;
        var svg=container.append('svg').attr('width',w).attr('height',h);
        var g=svg.append('g').attr('transform','translate('+w/2+','+h/2+')');
        var zoom=d3.zoom().scaleExtent([0.2,4]).on('zoom',function(e: any){g.attr('transform','translate('+(w/2+e.transform.x)+','+(h/2+e.transform.y)+') scale('+e.transform.k+')');});
        svg.call(zoom);

        var filteredFiles=folderFilter?(data as any).files.filter(function(f: any){return f.folder===folderFilter||f.folder.startsWith(folderFilter+'/');}):(data as any).files;

        // Build full nested folder hierarchy
        var rootNode={name:'root',fullPath:'',children:[],_idx:{}};
        filteredFiles.forEach(function(f: any){
            var parts=(f.folder||'root').split('/').filter(Boolean);
            if(!parts.length)parts=['root'];
            var cur=rootNode,acc='';
            parts.forEach(function(p: any){
                acc=acc?acc+'/'+p:p;
                if(!cur._idx[p]){var c={name:p,fullPath:acc,children:[],_idx:{}};cur._idx[p]=c;cur.children.push(c);}
                cur=cur._idx[p];
            });
            cur.children.push({name:f.name,path:f.path,fns:f.functions.length,lines:f.lines,folder:f.folder||'root',layer:f.layer});
        });
        function strip(n){delete n._idx;if(n.children)n.children.forEach(strip);}
        strip(rootNode);

        var root=d3.hierarchy(rootNode);
        var radius=Math.min(w,h)/2-60;
        // Scale radius up for larger trees so leaves don't collide
        var leafCount=root.leaves().length;
        if(leafCount>120)radius=Math.min(w,h)/2-30+Math.sqrt(leafCount-120)*8;
        d3.cluster().size([2*Math.PI,radius])(root);

        var tooltip=container.append('div').attr('class','treemap-tooltip').style('display','none').style('position','absolute');

        // Radial links
        g.selectAll('path.dendro-link').data(root.links()).join('path').attr('class','dendro-link')
            .attr('d',d3.linkRadial().angle(function(d: any){return d.x;}).radius(function(d: any){return d.y;}))
            .attr('fill','none').attr('stroke','var(--border)').attr('stroke-width',1.2).attr('stroke-opacity',0.6);

        var node=g.selectAll('g.dendro-node').data(root.descendants()).join('g').attr('class','dendro-node')
            .attr('transform',function(d: any){return'rotate('+(d.x*180/Math.PI-90)+') translate('+d.y+',0)';}).style('cursor','pointer');
        node.append('circle').attr('r',function(d: any){return d.children?4:6;})
            .attr('fill',function(d: any){return d.children?'var(--bg3)':colorMap[d.data.folder]||COLORS[0];})
            .attr('stroke',function(d: any){return d.children?'var(--t3)':'var(--bg0)';}).attr('stroke-width',1.5);

        // Leaf labels: tangent to circle, flipped on left half
        node.filter(function(d: any){return!d.children;}).append('text')
            .attr('dy','0.31em')
            .attr('x',function(d: any){return d.x<Math.PI?8:-8;})
            .attr('text-anchor',function(d: any){return d.x<Math.PI?'start':'end';})
            .attr('transform',function(d: any){return d.x>=Math.PI?'rotate(180)':null;})
            .attr('fill','var(--t1)').attr('font-size','9px').attr('font-family','JetBrains Mono')
            .text(function(d: any){var n=d.data.name.replace(/\.[^.]+$/,'');return n.length>22?n.slice(0,20)+'…':n;});

        // Folder labels
        node.filter(function(d: any){return d.children&&d.depth>0;}).append('text')
            .attr('dy','0.31em')
            .attr('x',function(d: any){return d.x<Math.PI?-8:8;})
            .attr('text-anchor',function(d: any){return d.x<Math.PI?'end':'start';})
            .attr('transform',function(d: any){return d.x>=Math.PI?'rotate(180)':null;})
            .attr('fill','var(--t2)').attr('font-size','10px').attr('font-weight','600').attr('font-family','JetBrains Mono')
            .text(function(d: any){return d.data.name;});

        node.on('mouseenter',function(e: any, d: any){
            tooltip.html(renderTooltipHtml(d.data.name||'root',d.data.path?[
                {label:'Lines',value:d.data.lines||0},
                {label:'Functions',value:d.data.fns||0},
                {label:'Layer',value:d.data.layer||'—'}
            ]:[{label:'Children',value:(d.children||[]).length}])).style('display','block').style('left',(e.offsetX+15)+'px').style('top',(e.offsetY+15)+'px');
            d3.select(this).select('circle').transition().duration(150).attr('r',function(n: any){return n.children?7:10;}).attr('stroke','var(--acc)').attr('stroke-width',2.5);
        }).on('mousemove',function(e: any){tooltip.style('left',(e.offsetX+15)+'px').style('top',(e.offsetY+15)+'px');})
        .on('mouseleave',function(e: any, d: any){
            tooltip.style('display','none');
            d3.select(this).select('circle').transition().duration(150).attr('r',d.children?4:6).attr('stroke',d.children?'var(--t3)':'var(--bg0)').attr('stroke-width',1.5);
        }).on('click',function(e: any, d: any){
            e.stopPropagation();
            if(d.data.path&&selectFileRef.current)selectFileRef.current(d.data.path);
            else if(d.data.fullPath)filterByFolder(d.data.fullPath);
        });
    },[data,graphConfig.vizType,colorMap,folderFilter]);

    // Flow Diagram - Layered left-to-right DAG of folder dependencies with animated arrows
    useEffect(function(){
        if(!data||!sankeyRef.current||graphConfig.vizType!=='sankey')return;
        var container=d3.select(sankeyRef.current);
        container.selectAll('*').remove();
        var w=sankeyRef.current.clientWidth||800,h=sankeyRef.current.clientHeight||600;
        var svg=container.append('svg').attr('width',w).attr('height',h);
        var gRoot=svg.append('g');
        var zoom=d3.zoom().scaleExtent([0.2,3]).on('zoom',function(e: any){gRoot.attr('transform',e.transform);});
        svg.call(zoom);

        var filteredFiles=folderFilter?(data as any).files.filter(function(f: any){return f.folder===folderFilter||f.folder.startsWith(folderFilter+'/');}):(data as any).files;
        var folders=[...new Set(filteredFiles.map(function(f: any){return f.folder||'root';}))];
        var filteredPaths=new Set(filteredFiles.map(function(f: any){return f.path;}));
        var folderIdx={};folders.forEach(function(f: any, i: any){folderIdx[f]=i;});
        var fileCountByFolder={};filteredFiles.forEach(function(f: any){var k=f.folder||'root';fileCountByFolder[k]=(fileCountByFolder[k]||0)+1;});

        // Aggregate directed cross-folder edges
        var edgeMap={};
        (data as any).connections.forEach(function(c: any){
            var src=typeof c.source==='object'?c.source.id:c.source;
            var tgt=typeof c.target==='object'?c.target.id:c.target;
            if(!filteredPaths.has(src)||!filteredPaths.has(tgt))return;
            var sf=(data as any).files.find(function(f: any){return f.path===src;});
            var tf=(data as any).files.find(function(f: any){return f.path===tgt;});
            if(!sf||!tf)return;
            var sFolder=sf.folder||'root',tFolder=tf.folder||'root';
            if(sFolder===tFolder)return;
            var k=sFolder+' '+tFolder;
            edgeMap[k]=(edgeMap[k]||0)+(c.count||1);
        });
        var nodes=folders.map(function(f: any){return{id:f,name:f.split('/').pop()||'root',fullPath:f,fileCount:fileCountByFolder[f]||0,layer:0};});
        var nodeById={};nodes.forEach(function(n: any){nodeById[n.id]=n;});
        var edges=Object.keys(edgeMap).map(function(k: any){var p=k.split(' ');return{source:p[0],target:p[1],value:edgeMap[k]};});

        if(!edges.length){
            gRoot.append('text').attr('x',w/2).attr('y',h/2).attr('fill','var(--t3)').attr('font-size','12px').attr('text-anchor','middle').text('No cross-folder flow to visualize');
            return;
        }

        // Assign layers via longest-path from sources; cycles handled by iteration cap
        var adj={},indeg={};
        nodes.forEach(function(n: any){adj[n.id]=[];indeg[n.id]=0;});
        edges.forEach(function(e: any){adj[e.source].push(e.target);indeg[e.target]++;});
        var changed=true,iter=0;
        while(changed&&iter++<nodes.length+5){
            changed=false;
            edges.forEach(function(e: any){
                var s=nodeById[e.source],t=nodeById[e.target];
                if(t.layer<=s.layer){t.layer=s.layer+1;changed=true;}
            });
        }
        var maxLayer=Math.max(0,d3.max(nodes,function(n: any){return n.layer;})||0);
        var layers=[];for(var i=0;i<=maxLayer;i++)layers.push([]);
        nodes.forEach(function(n: any){layers[n.layer].push(n);});

        // Position nodes
        var padX=80,padY=40;
        var colW=Math.max(180,(w-padX*2)/Math.max(1,maxLayer));
        var nodeW=140,nodeH=38;
        layers.forEach(function(col: any, li: any){
            var total=col.length;
            var slot=(h-padY*2)/Math.max(1,total);
            col.sort(function(a: any, b: any){return b.fileCount-a.fileCount;});
            col.forEach(function(n: any, ni: any){
                n.x=padX+li*colW;
                n.y=padY+slot*(ni+0.5);
            });
        });

        // Arrowhead marker
        var defs=svg.append('defs');
        defs.append('marker').attr('id','flow-arrow').attr('viewBox','0 -5 10 10').attr('refX',9).attr('markerWidth',6).attr('markerHeight',6).attr('orient','auto')
            .append('path').attr('d','M0,-5L10,0L0,5').attr('fill','var(--acc)').attr('opacity',0.85);

        // Edge layer
        var maxVal=d3.max(edges,function(e: any){return e.value;})||1;
        var edgeG=gRoot.append('g').attr('class','flow-edges');
        var edgePaths=edgeG.selectAll('path').data(edges).join('path')
            .attr('class','flow-edge')
            .attr('fill','none')
            .attr('stroke',function(e: any){return colorMap[e.source]||COLORS[folderIdx[e.source]%COLORS.length];})
            .attr('stroke-width',function(e: any){return Math.max(1.5,Math.min(6,1+Math.log2(e.value+1)*1.4));})
            .attr('stroke-opacity',0.55)
            .attr('stroke-linecap','round')
            .attr('marker-end','url(#flow-arrow)')
            .attr('d',function(e: any){
                var s=nodeById[e.source],t=nodeById[e.target];
                var x1=s.x+nodeW/2,y1=s.y,x2=t.x-nodeW/2,y2=t.y;
                var mx=(x1+x2)/2;
                return'M'+x1+','+y1+'C'+mx+','+y1+' '+mx+','+y2+' '+x2+','+y2;
            });

        // Animated dashed overlay for flow direction
        var flowAnim=edgeG.selectAll('path.flow-anim').data(edges).join('path')
            .attr('class','flow-anim')
            .attr('fill','none')
            .attr('stroke',function(e: any){return colorMap[e.source]||COLORS[folderIdx[e.source]%COLORS.length];})
            .attr('stroke-width',function(e: any){return Math.max(1.5,Math.min(6,1+Math.log2(e.value+1)*1.4));})
            .attr('stroke-opacity',0.9)
            .attr('stroke-dasharray','6 10')
            .attr('pointer-events','none')
            .attr('d',function(e: any){
                var s=nodeById[e.source],t=nodeById[e.target];
                var x1=s.x+nodeW/2,y1=s.y,x2=t.x-nodeW/2,y2=t.y;
                var mx=(x1+x2)/2;
                return'M'+x1+','+y1+'C'+mx+','+y1+' '+mx+','+y2+' '+x2+','+y2;
            });
        function animate(){
            flowAnim.transition().duration(1400).ease(d3.easeLinear)
                .attrTween('stroke-dashoffset',function(){return d3.interpolate(0,-32);})
                .on('end',animate);
        }
        animate();

        // Node layer
        var tooltip=container.append('div').attr('class','treemap-tooltip').style('display','none').style('position','absolute');
        var nodeG=gRoot.append('g').attr('class','flow-nodes');
        var nodeSel=nodeG.selectAll('g').data(nodes).join('g').attr('class','flow-node').style('cursor','pointer')
            .attr('transform',function(n: any){return'translate('+n.x+','+n.y+')';});
        nodeSel.append('rect')
            .attr('x',-nodeW/2).attr('y',-nodeH/2).attr('width',nodeW).attr('height',nodeH)
            .attr('rx',10)
            .attr('fill',function(n: any){return colorMap[n.id]||COLORS[folderIdx[n.id]%COLORS.length];})
            .attr('fill-opacity',0.15)
            .attr('stroke',function(n: any){return colorMap[n.id]||COLORS[folderIdx[n.id]%COLORS.length];})
            .attr('stroke-width',1.5);
        nodeSel.append('text').attr('text-anchor','middle').attr('dy',-2)
            .attr('fill','var(--t0)').attr('font-size','11px').attr('font-weight','600').attr('font-family','JetBrains Mono')
            .text(function(n: any){var nm=n.name;return nm.length>18?nm.slice(0,17)+'…':nm;});
        nodeSel.append('text').attr('text-anchor','middle').attr('dy',12)
            .attr('fill','var(--t2)').attr('font-size','9px').attr('font-family','JetBrains Mono')
            .text(function(n: any){return n.fileCount+' file'+(n.fileCount===1?'':'s');});

        nodeSel.on('mouseenter',function(e: any, d: any){
            tooltip.html(renderTooltipHtml(d.fullPath,[{label:'Files',value:d.fileCount}]))
                .style('display','block').style('left',(e.offsetX+15)+'px').style('top',(e.offsetY+15)+'px');
            edgePaths.attr('stroke-opacity',function(l: any){return l.source===d.id||l.target===d.id?0.9:0.08;});
            flowAnim.attr('stroke-opacity',function(l: any){return l.source===d.id||l.target===d.id?1:0;});
        }).on('mouseleave',function(){
            tooltip.style('display','none');
            edgePaths.attr('stroke-opacity',0.55);
            flowAnim.attr('stroke-opacity',0.9);
        }).on('click',function(e: any, d: any){e.stopPropagation();filterByFolder(d.fullPath);});

        edgePaths.on('mouseenter',function(e: any, d: any){
            d3.select(this).attr('stroke-opacity',0.95);
            tooltip.html(renderTooltipHtml(d.source+' → '+d.target,[{label:'Connections',value:d.value}]))
                .style('display','block').style('left',(e.offsetX+15)+'px').style('top',(e.offsetY+15)+'px');
        }).on('mouseleave',function(){d3.select(this).attr('stroke-opacity',0.55);tooltip.style('display','none');});
    },[data,graphConfig.vizType,colorMap,folderFilter]);

    // Disjoint Force-Directed - Separate clusters per folder
    useEffect(function(){
        if(!data||!disjointRef.current||graphConfig.vizType!=='disjoint')return;
        var container=d3.select(disjointRef.current);
        container.selectAll('*').remove();
        var w=disjointRef.current.clientWidth||800,h=disjointRef.current.clientHeight||600;
        var svg=container.append('svg').attr('width',w).attr('height',h);
        var g=svg.append('g');
        var zoom=d3.zoom().scaleExtent([0.2,4]).on('zoom',function(e: any){g.attr('transform',e.transform);});
        svg.call(zoom);
        var filteredFiles=folderFilter?(data as any).files.filter(function(f: any){return f.folder===folderFilter||f.folder.startsWith(folderFilter+'/');}):(data as any).files;
        var files=filteredFiles.slice(0,100);
        var fileIdx={};files.forEach(function(f: any, i: any){fileIdx[f.path]=i;});
        var folders=[...new Set(files.map(function(f: any){return f.folder||'root';}))];
        var cols=Math.ceil(Math.sqrt(folders.length));
        var cellW=w/cols,cellH=h/Math.ceil(folders.length/cols);
        var centers={};
        folders.forEach(function(f: any, i: any){centers[f]={x:(i%cols+0.5)*cellW,y:(Math.floor(i/cols)+0.5)*cellH};});
        var nodes=files.map(function(f: any){return{id:f.path,name:f.name,folder:f.folder||'root',fns:f.functions.length,lines:f.lines,layer:f.layer,cx:centers[f.folder||'root'].x,cy:centers[f.folder||'root'].y};});
        var links=[];
        (data as any).connections.forEach(function(c: any){
            var src=typeof c.source==='object'?c.source.id:c.source;
            var tgt=typeof c.target==='object'?c.target.id:c.target;
            if(fileIdx[src]!==undefined&&fileIdx[tgt]!==undefined&&src!==tgt)links.push({source:src,target:tgt,count:c.count||1});
        });
        var sim=d3.forceSimulation(nodes)
            .force('link',d3.forceLink(links).id(function(d: any){return d.id;}).distance(40).strength(0.3))
            .force('charge',d3.forceManyBody().strength(-80))
            .force('x',d3.forceX(function(d: any){return d.cx;}).strength(0.15))
            .force('y',d3.forceY(function(d: any){return d.cy;}).strength(0.15))
            .force('collide',d3.forceCollide(15));
        g.selectAll('rect.cluster-bg').data(folders).join('rect').attr('class','cluster-bg')
            .attr('x',function(d: any, i: any){return(i%cols)*cellW+10;}).attr('y',function(d: any, i: any){return Math.floor(i/cols)*cellH+10;})
            .attr('width',cellW-20).attr('height',cellH-20).attr('rx',12)
            .attr('fill',function(d: any){return colorMap[d]||COLORS[folders.indexOf(d)%COLORS.length];}).attr('opacity',0.08)
            .attr('stroke',function(d: any){return colorMap[d]||COLORS[folders.indexOf(d)%COLORS.length];}).attr('stroke-width',1).attr('stroke-opacity',0.3);
        g.selectAll('text.cluster-label').data(folders).join('text').attr('class','cluster-label')
            .attr('x',function(d: any, i: any){return(i%cols)*cellW+20;}).attr('y',function(d: any, i: any){return Math.floor(i/cols)*cellH+28;})
            .attr('fill','var(--t2)').attr('font-size','11px').attr('font-weight','600').text(function(d: any){return d.split('/').pop()||'root';});
        var link=g.selectAll('line.disjoint-link').data(links).join('line').attr('class','disjoint-link')
            .attr('stroke','var(--border)').attr('stroke-width',1).attr('stroke-opacity',0.3);
        var tooltip=container.append('div').attr('class','treemap-tooltip').style('display','none').style('position','absolute');
        var node=g.selectAll('g.disjoint-node').data(nodes).join('g').attr('class','disjoint-node').style('cursor','pointer')
            .call(d3.drag().on('start',function(e: any, d: any){if(!e.active)sim.alphaTarget(0.3).restart();d.fx=d.x;d.fy=d.y;})
                .on('drag',function(e: any, d: any){d.fx=e.x;d.fy=e.y;}).on('end',function(e: any, d: any){if(!e.active)sim.alphaTarget(0);d.fx=null;d.fy=null;}));
        node.append('circle').attr('class','disjoint-circle').attr('r',function(d: any){return Math.max(6,Math.min(14,4+d.fns));})
            .attr('fill',function(d: any){return colorMap[d.folder]||COLORS[0];}).attr('stroke','var(--bg0)').attr('stroke-width',1.5);
        node.on('mouseenter',function(e: any, d: any){
            tooltip.html(renderTooltipHtml(d.name,[
                {label:'Lines',value:d.lines||0},
                {label:'Functions',value:d.fns||0},
                {label:'Folder',value:d.folder}
            ]))
                .style('display','block').style('left',(e.offsetX+15)+'px').style('top',(e.offsetY+15)+'px');
            link.attr('stroke-opacity',function(l: any){return l.source.id===d.id||l.target.id===d.id?0.8:0.05;}).attr('stroke',function(l: any){return l.source.id===d.id||l.target.id===d.id?'var(--acc)':'var(--border)';});
            d3.select(this).select('circle').transition().duration(150).attr('r',14).attr('stroke','var(--acc)').attr('stroke-width',2);
        }).on('mousemove',function(e: any){tooltip.style('left',(e.offsetX+15)+'px').style('top',(e.offsetY+15)+'px');})
        .on('mouseleave',function(e: any, d: any){
            tooltip.style('display','none');
            link.attr('stroke-opacity',0.3).attr('stroke','var(--border)');
            d3.select(this).select('circle').transition().duration(150).attr('r',Math.max(6,Math.min(14,4+d.fns))).attr('stroke','var(--bg0)').attr('stroke-width',1.5);
        }).on('click',function(e: any, d: any){e.stopPropagation();if(selectFileRef.current)selectFileRef.current(d.id);});
        sim.on('tick',function(){
            link.attr('x1',function(d: any){return d.source.x;}).attr('y1',function(d: any){return d.source.y;}).attr('x2',function(d: any){return d.target.x;}).attr('y2',function(d: any){return d.target.y;});
            node.attr('transform',function(d: any){return'translate('+d.x+','+d.y+')';});
        });
        svg.on('click',function(){setSelected(null);setBlastRadius(null);});
        return function(){sim.stop();};
    },[data,graphConfig.vizType,colorMap,folderFilter]);

    // Circular Bundle visualization - Interactive with zoom, selection, blast radius
    useEffect(function(){
        if(!data||!bundleRef.current||graphConfig.vizType!=='bundle')return;
        var container=d3.select(bundleRef.current);
        container.selectAll('*').remove();
        var w=bundleRef.current.clientWidth||800,h=bundleRef.current.clientHeight||600;
        var svg=container.append('svg').attr('width',w).attr('height',h);
        var mainG=svg.append('g').attr('transform','translate('+w/2+','+h/2+')');
        var zoom=d3.zoom().scaleExtent([0.4,3]).on('zoom',function(e: any){mainG.attr('transform','translate('+(w/2+e.transform.x)+','+(h/2+e.transform.y)+') scale('+e.transform.k+')');});
        svg.call(zoom);
        var radius=Math.min(w,h)/2-100;
        var filteredFiles=folderFilter?(data as any).files.filter(function(f: any){return f.folder===folderFilter||f.folder.startsWith(folderFilter+'/');}):(data as any).files;
        var files=filteredFiles.slice(0,70);
        var fileIdx={};files.forEach(function(f: any, i: any){fileIdx[f.path]=i;});
        var folderGroups={};files.forEach(function(f: any){var folder=f.folder||'root';if(!folderGroups[folder])folderGroups[folder]=[];folderGroups[folder].push(f);});
        var nodes=[],angle=0;
        var sortedFolders=Object.entries(folderGroups).sort(function(a: any, b: any){return b[1].length-a[1].length;});
        sortedFolders.forEach(function(entry: any){
            var folder=entry[0],fls=entry[1];
            var step=2*Math.PI*fls.length/files.length;
            fls.forEach(function(f: any){
                nodes.push({id:f.path,name:f.name,folder:folder,angle:angle,x:Math.cos(angle-Math.PI/2)*radius,y:Math.sin(angle-Math.PI/2)*radius,layer:f.layer,fns:f.functions.length,lines:f.lines});
                angle+=step/fls.length;
            });
        });
        var nodeMap={};nodes.forEach(function(n: any){nodeMap[n.id]=n;});
        var links=[];
        (data as any).connections.forEach(function(c: any){
            var src=typeof c.source==='object'?c.source.id:c.source;
            var tgt=typeof c.target==='object'?c.target.id:c.target;
            if(nodeMap[src]&&nodeMap[tgt]&&src!==tgt)links.push({source:nodeMap[src],target:nodeMap[tgt],count:c.count||1});
        });
        function isBundleLinkMatch(nodeId,linkDatum){
            return linkDatum.source.id===nodeId||linkDatum.target.id===nodeId;
        }
        function getBundleLinkColor(linkDatum){
            return colorMap[linkDatum.source.folder]||'var(--acc)';
        }
        function getBundleDirectConnections(nodeId){
            var connected=new Set([nodeId]);
            links.forEach(function(linkDatum: any){
                if(isBundleLinkMatch(nodeId,linkDatum)){
                    connected.add(linkDatum.source.id);
                    connected.add(linkDatum.target.id);
                }
            });
            return connected;
        }
        var link=mainG.selectAll('path.bundle-link').data(links).join('path').attr('class','bundle-link')
            .attr('d',function(d: any){
                var a1=d.source.angle,a2=d.target.angle;
                var x1=Math.cos(a1-Math.PI/2)*(radius-15),y1=Math.sin(a1-Math.PI/2)*(radius-15);
                var x2=Math.cos(a2-Math.PI/2)*(radius-15),y2=Math.sin(a2-Math.PI/2)*(radius-15);
                var midAngle=(a1+a2)/2;
                var tension=0.3*radius;
                var cx=Math.cos(midAngle-Math.PI/2)*tension,cy=Math.sin(midAngle-Math.PI/2)*tension;
                return'M'+x1+','+y1+'Q'+cx+','+cy+' '+x2+','+y2;
            })
            .attr('fill','none').attr('stroke',getBundleLinkColor)
            .attr('stroke-width',1.8).attr('stroke-opacity',0.35);
        var tooltip=container.append('div').attr('class','treemap-tooltip').style('display','none').style('position','absolute');
        var node=mainG.selectAll('g.bundle-node').data(nodes).join('g').attr('class','bundle-node').style('cursor','pointer')
            .attr('transform',function(d: any){return'rotate('+(d.angle*180/Math.PI-90)+') translate('+radius+',0)'+(d.angle>Math.PI?' rotate(180)':'');});
        node.append('circle').attr('class','bundle-circle').attr('r',6).attr('fill',function(d: any){return colorMap[d.folder]||COLORS[0];}).attr('stroke','var(--bg0)').attr('stroke-width',1.5)
            .attr('transform',function(d: any){return d.angle>Math.PI?'translate(-6,0)':'translate(6,0)';});
        node.append('text').attr('dy','0.31em').attr('x',function(d: any){return d.angle>Math.PI?-14:14;}).attr('text-anchor',function(d: any){return d.angle>Math.PI?'end':'start';})
            .attr('fill','var(--t2)').attr('font-size','9px').text(function(d: any){var n=d.name.replace(/\.[^.]+$/,'');return n.length>16?n.slice(0,13)+'…':n;});
        function applyBundleDefaultState(){
            link.transition().duration(200)
                .attr('stroke-opacity',0.35)
                .attr('stroke-width',1.8)
                .attr('stroke',getBundleLinkColor);
            node.selectAll('.bundle-circle').transition().duration(200)
                .attr('fill',function(d: any){return colorMap[d.folder]||COLORS[0];})
                .attr('opacity',1)
                .attr('r',6)
                .attr('stroke','var(--bg0)')
                .attr('stroke-width',1.5);
        }
        function applyBundleHoverState(nodeId){
            var directConnections=getBundleDirectConnections(nodeId);
            link.transition().duration(200)
                .attr('stroke-opacity',function(linkDatum: any){return isBundleLinkMatch(nodeId,linkDatum)?0.88:0.04;})
                .attr('stroke-width',function(linkDatum: any){return isBundleLinkMatch(nodeId,linkDatum)?3.1:1;})
                .attr('stroke',function(linkDatum: any){return isBundleLinkMatch(nodeId,linkDatum)?'var(--acc)':getBundleLinkColor(linkDatum);});
            node.selectAll('.bundle-circle').transition().duration(200)
                .attr('opacity',function(nodeDatum: any){return directConnections.has(nodeDatum.id)?1:0.22;})
                .attr('r',function(nodeDatum: any){return nodeDatum.id===nodeId?9:6;})
                .attr('stroke',function(nodeDatum: any){return nodeDatum.id===nodeId?'var(--acc)':'var(--bg0)';})
                .attr('stroke-width',function(nodeDatum: any){return nodeDatum.id===nodeId?2:1.5;});
        }
        function applyBundleSelectionState(nodeId,blast){
            var directConnections=getBundleDirectConnections(nodeId);
            var affectedSet=new Set(blast&&blast.affected?blast.affected:[]);
            link.transition().duration(300)
                .attr('stroke-opacity',function(linkDatum: any){return isBundleLinkMatch(nodeId,linkDatum)?0.96:0.08;})
                .attr('stroke-width',function(linkDatum: any){return isBundleLinkMatch(nodeId,linkDatum)?3.6:1.15;})
                .attr('stroke',function(linkDatum: any){return isBundleLinkMatch(nodeId,linkDatum)?'#ff9f43':getBundleLinkColor(linkDatum);});
            node.selectAll('.bundle-circle').transition().duration(300)
                .attr('fill',function(nodeDatum: any){return nodeDatum.id===nodeId?'#ff5f5f':affectedSet.has(nodeDatum.id)?'#ff9f43':colorMap[nodeDatum.folder]||COLORS[0];})
                .attr('opacity',function(nodeDatum: any){return directConnections.has(nodeDatum.id)||affectedSet.has(nodeDatum.id)?1:0.22;})
                .attr('r',function(nodeDatum: any){return nodeDatum.id===nodeId?9:6;})
                .attr('stroke',function(nodeDatum: any){return nodeDatum.id===nodeId?'var(--acc)':'var(--bg0)';})
                .attr('stroke-width',function(nodeDatum: any){return nodeDatum.id===nodeId?2:1.5;});
        }
        node.on('mouseenter',function(e: any, d: any){
            var rect=bundleRef.current.getBoundingClientRect();
            tooltip.html(renderTooltipHtml(d.name,[
                {label:'Lines',value:d.lines||0},
                {label:'Functions',value:d.fns||0},
                {label:'Folder',value:d.folder||'root'}
            ]))
                .style('display','block').style('left',(e.clientX-rect.left+15)+'px').style('top',(e.clientY-rect.top+15)+'px');
            applyBundleHoverState(d.id);
        }).on('mousemove',function(e: any){var rect=bundleRef.current.getBoundingClientRect();tooltip.style('left',(e.clientX-rect.left+15)+'px').style('top',(e.clientY-rect.top+15)+'px');})
        .on('mouseleave',function(){
            tooltip.style('display','none');
            if(selected&&nodeMap[selected.path]){
                applyBundleSelectionState(selected.path,blastRadius);
            }else{
                applyBundleDefaultState();
            }
        }).on('click',function(e: any, d: any){
            e.stopPropagation();
            if(selectFileRef.current){
                selectFileRef.current(d.id);
            }
        });
        var arcGen=d3.arc().innerRadius(radius+20).outerRadius(radius+30);
        var folderAngleStart=0;
        sortedFolders.forEach(function(entry: any, i: any){
            var folder=entry[0],count=entry[1].length;
            var span=2*Math.PI*count/files.length;
            mainG.append('path').attr('d',arcGen({startAngle:folderAngleStart,endAngle:folderAngleStart+span}))
                .attr('fill',colorMap[folder]||COLORS[i%COLORS.length]).attr('opacity',0.5).style('cursor','pointer')
                .on('click',function(){filterByFolder(folder);});
            if(span>0.15){
                var midAngle=folderAngleStart+span/2-Math.PI/2;
                mainG.append('text').attr('x',Math.cos(midAngle)*(radius+40)).attr('y',Math.sin(midAngle)*(radius+40))
                    .attr('text-anchor','middle').attr('fill','var(--t2)').attr('font-size','8px')
                    .attr('transform','rotate('+(midAngle*180/Math.PI+90)+','+Math.cos(midAngle)*(radius+40)+','+Math.sin(midAngle)*(radius+40)+')')
                    .text(folder.split('/').pop()||'root');
            }
            folderAngleStart+=span;
        });
        svg.on('click',function(){
            setSelected(null);setBlastRadius(null);
            applyBundleDefaultState();
        });
        if(selected&&nodeMap[selected.path]){
            applyBundleSelectionState(selected.path,blastRadius);
        }else{
            applyBundleDefaultState();
        }
    },[data,graphConfig.vizType,colorMap,folderFilter,selected,blastRadius]);

    function zoomIn(){if(zoomRef.current&&svgRef.current)d3.select(svgRef.current).transition().duration(200).call(zoomRef.current.scaleBy,1.4);}
    function zoomOut(){if(zoomRef.current&&svgRef.current)d3.select(svgRef.current).transition().duration(200).call(zoomRef.current.scaleBy,0.7);}
    function resetZoom(){if(zoomRef.current&&svgRef.current)d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.transform,d3.zoomIdentity);}
    function fitView(){
        if(!zoomRef.current||!svgRef.current||!simRef.current)return;
        var nodes=simRef.current.nodes();
        if(!nodes.length)return;
        var xs=nodes.map(function(n: any){return n.x;}),ys=nodes.map(function(n: any){return n.y;});
        var minX=Math.min.apply(null,xs),maxX=Math.max.apply(null,xs),minY=Math.min.apply(null,ys),maxY=Math.max.apply(null,ys);
        var w=svgRef.current.clientWidth,h=svgRef.current.clientHeight;
        var scale=0.8/Math.max((maxX-minX+100)/w,(maxY-minY+100)/h);
        d3.select(svgRef.current).transition().duration(400).call(zoomRef.current.transform,d3.zoomIdentity.translate(w/2-scale*(minX+maxX)/2,h/2-scale*(minY+maxY)/2).scale(Math.min(scale,2)));
    }
    function exportSVG(){if(!svgRef.current)return;var svgClone=svgRef.current.cloneNode(true);svgClone.setAttribute('xmlns','http://www.w3.org/2000/svg');svgClone.setAttribute('width',svgRef.current.clientWidth);svgClone.setAttribute('height',svgRef.current.clientHeight);var style=document.createElementNS('http://www.w3.org/2000/svg','style');style.textContent='text{font-family:JetBrains Mono,monospace;pointer-events:none}';svgClone.insertBefore(style,svgClone.firstChild);var blob=new Blob([new XMLSerializer().serializeToString(svgClone)],{type:'image/svg+xml'});var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download='codeflow-'+Date.now()+'.svg';a.click();URL.revokeObjectURL(url);}
    function exportJSON(){if(!data)return;var blob=new Blob([JSON.stringify({stats:(data as any).stats,files:(data as any).files.map(function(f: any){return{path:f.path,fns:f.functions.length,layer:f.layer,lines:f.lines,dependencies:f.dependencies||[]};}),connections:(data as any).connections,issues:(data as any).issues,patterns:(data as any).patterns,security:(data as any).securityIssues},null,2)],{type:'application/json'});var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download='codegraph-analysis.json';a.click();}
    function generateReport(format){
        if(!data)return;
        var repo=repoInfo?(localDirHandle?'Local Folder':repoInfo.owner+'/'+repoInfo.repo):'Unknown Repository';
        var h=calcHealth(data as any);
        var report={
            repository:repo,
            analyzedAt:new Date().toISOString(),
            codegraphVersion:'1.0',
            summary:{
                healthScore:h.score,
                healthGrade:h.grade,
                totalFiles:(data as any).stats.files,
                totalFunctions:(data as any).stats.functions,
                totalConnections:(data as any).stats.connections,
                linesOfCode:(data as any).stats.loc,
                unusedFunctions:(data as any).stats.dead,
                securityIssues:(data as any).securityIssues.length,
                patterns:(data as any).patterns.length,
                duplicates:(data as any).stats.duplicates||0,
                layerViolations:(data as any).stats.violations||0,
                highSecurityIssues:(data as any).stats.security||0
            },
            files:(data as any).files.map(function(f: any){
                var fns=f.functions.map(function(fn: any){
                    var st=(data as any).fnStats[fn.name];
                    return{
                        name:fn.name,
                        line:fn.line,
                        internalCalls:st?st.internal:0,
                        externalCalls:st?st.external:0,
                        totalCalls:st?(st.internal+st.external):0,
                        isUnused:st?(st.internal+st.external===0):true,
                        isExported:st?st.isExported:false,
                        isClassMethod:st?st.isClassMethod:false,
                        isTopLevel:st?st.isTopLevel:true,
                        type:st?st.type:'function',
                        callers:st&&st.callers?st.callers.map(function(c: any){return{file:c.file,name:c.name,count:c.count};}):[],
                        code:fn.code
                    };
                });
                return{
                    path:f.path,
                    name:f.name,
                    folder:f.folder,
                    layer:f.layer,
                    lines:f.lines,
                    churn:f.churn||0,
                    isCode:f.isCode!==false,
                    functions:fns,
                    functionCount:f.functions.length
                };
            }),
            unusedFunctions:(data as any).deadFunctions.map(function(fn: any){return{name:fn.name,file:fn.file,folder:fn.folder,line:fn.line,codeLines:fn.codeLines,code:fn.code,extension:fn.ext};}),
            dependencies:(data as any).connections.map(function(c: any){
                var src=typeof c.source==='object'?c.source.id:c.source;
                var tgt=typeof c.target==='object'?c.target.id:c.target;
                return{from:src,to:tgt,function:c.fn,callCount:c.count};
            }),
            architectureIssues:(data as any).issues.map(function(i: any){return{type:i.type,title:i.title,description:i.desc,affectedFiles:i.items?i.items.map(function(x: any){return x.file||x.name;}):[],affectedItems:i.items||[]};}),
            patterns:(data as any).patterns.map(function(p: any){return{name:p.name,description:p.desc,isAntiPattern:p.isAnti||false,severity:p.severity||'info',icon:p.icon||'',files:p.files.map(function(f: any){return f.path||f.name;}),fileDetails:p.files||[],metrics:p.metrics||{}};}),
            securityIssues:(data as any).securityIssues.map(function(s: any){return{severity:s.severity,title:s.title,description:s.desc,file:s.file,path:s.path,line:s.line,code:s.code};}),
            duplicates:(data as any).duplicates||[],
            layerViolations:(data as any).layerViolations||[],
            suggestions:(data as any).suggestions||[],
            languageBreakdown:(data as any).stats.languages||[],
            folderStructure:(data as any).folders,
            functionStatistics:Object.keys((data as any).fnStats||{}).map(function(fnName: any){
                var st=(data as any).fnStats[fnName];
                return{
                    name:fnName,
                    file:st.file,
                    folder:st.folder,
                    line:st.line,
                    internalCalls:st.internal,
                    externalCalls:st.external,
                    totalCalls:st.count||(st.internal+st.external),
                    isExported:st.isExported,
                    isClassMethod:st.isClassMethod,
                    isTopLevel:st.isTopLevel,
                    type:st.type,
                    callers:st.callers?st.callers.map(function(c: any){return{file:c.file,name:c.name,count:c.count};}):[],
                    code:st.code
                };
            })
        };
        if(format==='json'){
            var blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});
            var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download='codegraph-report.json';a.click();URL.revokeObjectURL(url);
        }else if(format==='md'){
            var md='# CodeGraph Analysis Report\n\n';
            md+='**Repository:** '+repo+'\n';
            md+='**Analyzed:** '+new Date().toLocaleString()+'\n\n';
            md+='## Summary\n\n';
            md+='| Metric | Value |\n|--------|-------|\n';
            md+='| Health Score | '+h.score+'/100 ('+h.grade+') |\n';
            md+='| Files | '+(data as any).stats.files+' |\n';
            md+='| Functions | '+(data as any).stats.functions+' |\n';
            md+='| Lines of Code | '+(data as any).stats.loc.toLocaleString()+' |\n';
            md+='| Dependencies | '+(data as any).stats.connections+' |\n';
            md+='| Unused Functions | '+(data as any).stats.dead+' |\n';
            md+='| Security Issues | '+(data as any).securityIssues.length+' |\n\n';
            if((data as any).securityIssues.length>0){
                md+='## Security Issues\n\n';
                (data as any).securityIssues.forEach(function(s: any){
                    md+='### '+s.severity.toUpperCase()+': '+s.title+'\n';
                    md+='- **File:** `'+s.path+'`'+(s.line?' (line '+s.line+')':'')+'\n';
                    md+='- **Description:** '+s.desc+'\n';
                    if(s.code)md+='- **Code:** `'+s.code+'`\n';
                    md+='\n';
                });
            }
            if((data as any).deadFunctions.length>0){
                md+='## Unused Functions ('+(data as any).deadFunctions.length+')\n\n';
                md+='These functions have zero calls (internal or external) and may be dead code:\n\n';
                (data as any).deadFunctions.slice(0,50).forEach(function(fn: any){
                    md+='### `'+fn.name+'()`\n';
                    md+='- **File:** `'+fn.file+'`\n';
                    md+='- **Line:** '+fn.line+'\n';
                    md+='- **Lines of code:** '+fn.codeLines+'\n';
                    if(fn.code)md+='```\n'+fn.code+'\n```\n';
                    md+='\n';
                });
                if((data as any).deadFunctions.length>50)md+='\n*...and '+((data as any).deadFunctions.length-50)+' more unused functions*\n\n';
            }
            if((data as any).patterns.length>0){
                md+='## Design Patterns\n\n';
                (data as any).patterns.filter(function(p: any){return!p.isAnti;}).forEach(function(p: any){
                    md+='### '+p.name+'\n';
                    md+=p.desc+'\n\n';
                    md+='**Files:** '+p.files.slice(0,5).map(function(f: any){return'`'+f.name+'`';}).join(', ')+(p.files.length>5?' (+'+p.files.length-5+' more)':'')+'\n\n';
                });
                var antiPatterns=(data as any).patterns.filter(function(p: any){return p.isAnti;});
                if(antiPatterns.length>0){
                    md+='## Anti-Patterns\n\n';
                    antiPatterns.forEach(function(p: any){
                        md+='### '+p.name+'\n';
                        md+=p.desc+'\n\n';
                        md+='**Affected files:** '+p.files.slice(0,5).map(function(f: any){return'`'+f.name+'`';}).join(', ')+'\n\n';
                    });
                }
            }
            if((data as any).issues.length>0){
                md+='## Architecture Issues\n\n';
                (data as any).issues.forEach(function(i: any){
                    md+='### '+i.title+'\n';
                    md+=i.desc+'\n\n';
                    if(i.items)md+='**Affected:** '+i.items.slice(0,5).map(function(x: any){return'`'+(x.name||x.file)+'`';}).join(', ')+'\n\n';
                });
            }
            md+='## File Details\n\n';
            md+='| File | Folder | Layer | Lines | Functions |\n';
            md+='|------|--------|-------|-------|----------|\n';
            (data as any).files.slice(0,100).forEach(function(f: any){
                md+='| `'+f.name+'` | '+f.folder+' | '+f.layer+' | '+f.lines+' | '+f.functions.length+' |\n';
            });
            if((data as any).files.length>100)md+='\n*...and '+((data as any).files.length-100)+' more files*\n';
            var blob=new Blob([md],{type:'text/markdown'});
            var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download='codegraph-report.md';a.click();URL.revokeObjectURL(url);
        }else if(format==='txt'){
            var txt='CODEGRAPH ANALYSIS REPORT\n';
            txt+='========================\n\n';
            txt+='Repository: '+repo+'\n';
            txt+='Analyzed: '+new Date().toLocaleString()+'\n\n';
            txt+='SUMMARY\n-------\n';
            txt+='Health Score: '+h.score+'/100 (Grade: '+h.grade+')\n';
            txt+='Files: '+(data as any).stats.files+'\n';
            txt+='Functions: '+(data as any).stats.functions+'\n';
            txt+='Lines of Code: '+(data as any).stats.loc.toLocaleString()+'\n';
            txt+='Dependencies: '+(data as any).stats.connections+'\n';
            txt+='Unused Functions: '+(data as any).stats.dead+'\n';
            txt+='Security Issues: '+(data as any).securityIssues.length+'\n\n';
            if((data as any).securityIssues.length>0){
                txt+='SECURITY ISSUES\n---------------\n';
                (data as any).securityIssues.forEach(function(s: any, i: any){
                    txt+=(i+1)+'. ['+s.severity.toUpperCase()+'] '+s.title+'\n';
                    txt+='   File: '+s.path+(s.line?' (line '+s.line+')':'')+'\n';
                    txt+='   '+s.desc+'\n';
                    if(s.code)txt+='   Code: '+s.code+'\n';
                    txt+='\n';
                });
            }
            if((data as any).deadFunctions.length>0){
                txt+='UNUSED FUNCTIONS ('+(data as any).deadFunctions.length+')\n'+'-'.repeat(20)+'\n';
                txt+='These functions are never called and may be dead code:\n\n';
                (data as any).deadFunctions.forEach(function(fn: any, i: any){
                    txt+=(i+1)+'. '+fn.name+'()\n';
                    txt+='   File: '+fn.file+' (line '+fn.line+')\n';
                    txt+='   Lines: '+fn.codeLines+'\n';
                    if(fn.code){txt+='   Code:\n';fn.code.split('\n').forEach(function(line: any){txt+='      '+line+'\n';});}
                    txt+='\n';
                });
            }
            if((data as any).patterns.length>0){
                txt+='PATTERNS DETECTED\n-----------------\n';
                (data as any).patterns.forEach(function(p: any){
                    txt+=(p.isAnti?'[ANTI-PATTERN] ':'')+p.name+'\n';
                    txt+='  '+p.desc+'\n';
                    txt+='  Files: '+p.files.map(function(f: any){return f.name;}).join(', ')+'\n\n';
                });
            }
            if((data as any).issues.length>0){
                txt+='ARCHITECTURE ISSUES\n-------------------\n';
                (data as any).issues.forEach(function(i: any){
                    txt+='['+i.type.toUpperCase()+'] '+i.title+'\n';
                    txt+='  '+i.desc+'\n';
                    if(i.items)txt+='  Affected: '+i.items.map(function(x: any){return x.name||x.file;}).join(', ')+'\n';
                    txt+='\n';
                });
            }
            txt+='FILE LIST\n---------\n';
            (data as any).files.forEach(function(f: any){
                txt+=f.path+' ('+f.lines+' lines, '+f.functions.length+' functions, '+f.layer+')\n';
            });
            txt+='\nDEPENDENCIES\n------------\n';
            (data as any).connections.slice(0,100).forEach(function(c: any){
                var src=typeof c.source==='object'?c.source.id:c.source;
                var tgt=typeof c.target==='object'?c.target.id:c.target;
                txt+=src.split('/').pop()+' -> '+tgt.split('/').pop()+' ('+c.fn+': '+c.count+' calls)\n';
            });
            if((data as any).connections.length>100)txt+='\n...and '+((data as any).connections.length-100)+' more dependencies\n';
            var blob=new Blob([txt],{type:'text/plain'});
            var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download='codegraph-report.txt';a.click();URL.revokeObjectURL(url);
        }
        showNotification('Report exported as '+format.toUpperCase(),'success');
    }
    function showNotification(msg,type){setToast({msg:msg,type:type||'success'});setTimeout(function(){setToast(null);},3000);}
    function copyLink(){
        if(localDirHandle){
            showNotification('Share links are not available for local folders','warning');
            return;
        }
        var shareUrl=buildAppUrl(repoInfo?repoInfo.owner+'/'+repoInfo.repo:repoUrl,true);
        navigator.clipboard.writeText(shareUrl).then(function(){showNotification('Link copied to clipboard!');}).catch(function(){showNotification('Failed to copy link','error');});
    }
    function analyzePR(){if(!prUrl||!repoInfo)return;var m=prUrl.match(/\/pull\/(\d+)/);if(!m){showNotification('Invalid PR URL','error');return;}GitHub.getPR(repoInfo.owner,repoInfo.repo,m[1]).then(function(pr: any){if(pr)setPrData(pr);else showNotification('Could not load PR','error');});}
    function resetAnalysis(){setData(null);setSelected(null);setBlastRadius(null);setOwnership(null);setRepoInfo(null);setRepoUrl('');setPrData(null);setFolderFilter(null);setLocalDirHandle(null);setCurrentBranch('');setBranches([]);analysisContentCacheRef.current={};window.history.replaceState({},'',window.location.pathname);}
    function filterByFolder(path){setFolderFilter(function(prev: any){return prev===path?null:path;});}
    function isSchemaFile(path: string, name: string){
        var ext=(name.split('.').pop()||'').toLowerCase();
        var lname=name.toLowerCase();
        var lpath=path.toLowerCase();
        if(ext==='sql'||ext==='prisma')return true;
        if(ext==='py'){
            // Django: models.py, models/xxx.py, admin.py (sometimes has models), apps with models dir
            if(lname==='models.py')return true;
            if(lpath.includes('/models/')&&lname.endsWith('.py')&&!lname.startsWith('test'))return true;
            if(lname==='serializers.py'||lname==='schema.py')return true;
        }
        if((ext==='ts'||ext==='js')&&(lname.includes('schema')||lname.includes('model')||lname.includes('entity')||lname.includes('migration')))return true;
        return false;
    }

    function openDbSchema(){
        if(!data)return;
        setShowDbSchema(true);
        setDbSchema(null);
        setDbSearchQuery('');
        setDbAppFilter('all');
        setSelectedDbTable(null);

        var dataFiles: any[]=(data as any).files||[];
        // Build a path→content map from already-analyzed files
        var contentMap: Record<string,string>=Object.assign({},analysisContentCacheRef.current||{});
        dataFiles.forEach(function(f: any){if(f.content)contentMap[f.path]=f.content;});

        // Collect schema candidates from already-known files
        var knownCandidates=dataFiles.filter(function(f: any){return isSchemaFile(f.path,f.name);});
        var knownPaths=new Set(knownCandidates.map(function(f: any){return f.path;}));

        function fetchAndParse(candidates: any[]){
            var toLoad=candidates.slice(0,400);
            var loaded: any[]=[];
            var i=0;
            function next(){
                if(i>=toLoad.length){
                    var schema=parseDbSchema(loaded);
                    setDbSchema(schema);
                    if(schema.tables.length===0)showNotification('No DB tables found — try a repo with Django models, SQL files, or Prisma schema','warning');
                    else showNotification('Found '+schema.tables.length+' tables from '+schema.source.toUpperCase()+' ('+schema.files.length+' files)','success');
                    return;
                }
                var f=toLoad[i++];
                if(contentMap[f.path]){
                    loaded.push({path:f.path,content:contentMap[f.path]});next();
                }else if(repoInfo&&!localDirHandle){
                    GitHub.getFile(repoInfo.owner,repoInfo.repo,f.path,currentBranch||undefined).then(function(c: any){
                        contentMap[f.path]=c||'';
                        analysisContentCacheRef.current[f.path]=c||'';
                        loaded.push({path:f.path,content:c||''});next();
                    }).catch(function(){next();});
                }else if(localDirHandle){
                    (async function(){
                        try{
                            var parts=f.path.split('/');
                            var h: any=localDirHandle;
                            for(var j=0;j<parts.length-1;j++)h=await h.getDirectoryHandle(parts[j]);
                            var fh=await h.getFileHandle(parts[parts.length-1]);
                            var fo=await fh.getFile();
                            var c=await fo.text();
                            contentMap[f.path]=c;
                            analysisContentCacheRef.current[f.path]=c||'';
                            loaded.push({path:f.path,content:c});
                        }catch(e){/*skip*/}
                        next();
                    })();
                }else{next();}
            }
            next();
        }

        // For GitHub repos: also scan full tree for models.py files not in analyzed set
        if(repoInfo&&!localDirHandle){
            GitHub.scanTree(repoInfo.owner,repoInfo.repo,null,null,currentBranch||undefined).then(function(result: any){
                var treeFils: any[]=result.files||[];
                var extra=treeFils.filter(function(f: any){return isSchemaFile(f.path,f.name)&&!knownPaths.has(f.path);});
                // Prioritize: models.py first, then other schema files
                var all=[...knownCandidates,...extra].sort(function(a: any,b: any){
                    var aScore=(a.name==='models.py'?0:a.path.includes('/models/')?1:2);
                    var bScore=(b.name==='models.py'?0:b.path.includes('/models/')?1:2);
                    return aScore-bScore;
                });
                fetchAndParse(all);
            }).catch(function(){
                // Tree API failed — fall back to already-known candidates
                fetchAndParse(knownCandidates);
            });
        }else{
            fetchAndParse(knownCandidates);
        }
    }
    var health=useMemo(function(){return calcHealth(data as any);},[data]);
    var dbAppOptions=useMemo(function(){
        if(!dbSchema)return[];
        return [...new Set(dbSchema.tables.map(function(t: any){return t.app;}).filter(Boolean))].sort();
    },[dbSchema]);
    var filteredDbSchema=useMemo(function(){
        if(!dbSchema)return null;
        var q=(dbSearchQuery||'').toLowerCase();
        var tables=dbSchema.tables.filter(function(t: any){
            if(dbAppFilter!=='all'&&t.app!==dbAppFilter)return false;
            if(selectedDbTable&&t.name!==selectedDbTable)return false;
            if(!q)return true;
            return t.name.toLowerCase().includes(q)||t.columns.some(function(c: any){return (c.name||'').toLowerCase().includes(q)||(c.type||'').toLowerCase().includes(q);});
        });
        var tableNames=new Set(tables.map(function(t: any){return t.name;}));
        return Object.assign({},dbSchema,{
            tables:tables,
            relations:dbSchema.relations.filter(function(r: any){return tableNames.has(r.fromTable)&&tableNames.has(r.toTable);})
        });
    },[dbSchema,dbSearchQuery,dbAppFilter,selectedDbTable]);

    return React.createElement('div',{className:'app',style:{paddingTop:'56px'}},
        React.createElement(WorkspaceHeader,{
            login:authUser?.login??'',
            avatarUrl:authUser?.avatar_url??'',
            repoUrl:repoUrl,
            onRepoUrlChange:function(url: any){setRepoUrl(url);},
            onAnalyze:analyze,
            loading:loading,
            hasData:!!data,
            dbSchemaDetected:dbSchemaDetected,
            onPRReview:function(){setShowPR(true);},
            onDbMap:function(){openDbSchema();},
        }),
        React.createElement('div',{className:'main',style:{'--sidebar-w':sidebarWidth+'px','--panel-w':rightPanelWidth+'px'}},
            React.createElement('div',{className:'sidebar',style:{width:sidebarWidth}},
                React.createElement('div',{className:'resize-handle',onMouseDown:function(e: any){
                    e.preventDefault();
                    var startX=e.clientX,startW=sidebarWidth;
                    function onMove(e){setSidebarWidth(Math.max(180,Math.min(400,startW+e.clientX-startX)));}
                    function onUp(){document.removeEventListener('mousemove',onMove);document.removeEventListener('mouseup',onUp);}
                    document.addEventListener('mousemove',onMove);document.addEventListener('mouseup',onUp);
                }}),
                data?React.createElement(React.Fragment,null,
                    React.createElement('div',{className:'sidebar-section'},
                        React.createElement('div',{className:'health-score'},
                            React.createElement(HealthRing,{score:health.score,grade:health.grade}),
                            React.createElement('div',{className:'health-info'},
                                React.createElement('div',{className:'health-grade',style:{color:health.score>=80?'var(--green)':health.score>=60?'var(--orange)':'var(--red)'}},health.score,'/100'),
                                React.createElement('div',{className:'health-label'},'Health Score')
                            )
                        )
                    ),
                    React.createElement('div',{className:'sidebar-section'},
                        React.createElement('div',{className:'sidebar-title'},'Color By'),
                        React.createElement('div',{className:'view-modes'},
                            React.createElement('div',{className:'view-mode'+(colorMode==='folder'?' active':''),onClick:function(){setColorMode('folder');}},React.createElement(Icon,{name:'folder',size:'m',className:'view-mode-icon'}),'Folder'),
                            React.createElement('div',{className:'view-mode'+(colorMode==='layer'?' active':''),onClick:function(){setColorMode('layer');}},React.createElement(Icon,{name:'layers',size:'m',className:'view-mode-icon'}),'Layer'),
                            React.createElement('div',{className:'view-mode'+(colorMode==='churn'?' active':''),onClick:function(){setColorMode('churn');}},React.createElement(Icon,{name:'activity',size:'m',className:'view-mode-icon'}),'Churn')
                        )
                    ),
                    React.createElement('div',{className:'sidebar-section'},
                        React.createElement('div',{className:'stats-grid'},
                            React.createElement('div',{className:'stat-card'},React.createElement('div',{className:'stat-value'},(data as any).stats.files),React.createElement('div',{className:'stat-label'},'Files')),
                            React.createElement('div',{className:'stat-card'},React.createElement('div',{className:'stat-value'},(data as any).stats.functions),React.createElement('div',{className:'stat-label'},'Functions')),
                            React.createElement('div',{className:'stat-card'},React.createElement('div',{className:'stat-value'},(data as any).stats.connections),React.createElement('div',{className:'stat-label'},'Links')),
                            React.createElement('div',{className:'stat-card'+((data as any).stats.dead>10?' warn':''),style:{cursor:(data as any).stats.dead>0?'pointer':'default'},onClick:function(){if((data as any).stats.dead>0)setShowUnused(true);}},React.createElement('div',{className:'stat-value'},(data as any).stats.dead),React.createElement('div',{className:'stat-label'},'Unused'))
                        ),
                        React.createElement('div',{className:'loc-stat'},
                            React.createElement('div',{className:'loc-value'},(data as any).stats.loc?(data as any).stats.loc.toLocaleString():'0'),
                            React.createElement('div',{className:'loc-label'},'Lines of Code')
                        ),
                        (data as any).stats.languages&&(data as any).stats.languages.length>0&&React.createElement(React.Fragment,null,
                            React.createElement('div',{className:'lang-bar'},
                                (data as any).stats.languages.slice(0,6).map(function(l: any, i: any){return React.createElement('div',{key:l.ext,className:'lang-bar-segment',style:{width:l.pct+'%',background:COLORS[i%COLORS.length]}});})
                            ),
                            React.createElement('div',{className:'lang-legend'},
                                (data as any).stats.languages.slice(0,6).map(function(l: any, i: any){return React.createElement('div',{key:l.ext,className:'lang-item'},
                                    React.createElement('div',{className:'lang-dot',style:{background:COLORS[i%COLORS.length]}}),
                                    React.createElement('span',null,l.ext,' ',l.pct,'%')
                                );})
                            )
                        )
                    ),
                    React.createElement('div',{className:'sidebar-section',style:{paddingBottom:8}},
                        React.createElement('div',{className:'sidebar-title'},'Explorer'),
                        folderFilter&&React.createElement('button',{className:'top-btn',style:{width:'100%',marginTop:8},onClick:function(){setFolderFilter(null);}},
                            React.createElement(Icon,{name:'close',size:'s'}),
                            ' Clear Filter: ',
                            folderFilter
                        )
                    ),
                    React.createElement('div',{className:'sidebar-scroll'},React.createElement(VirtualizedRepoTree,{tree: (data as any).tree,selected:selected,onSelect:selectFile,expanded:expandedPaths,toggle:togglePath,filterFolder:filterByFolder,activeFilter:folderFilter}))
                ):React.createElement('div',{className:'panel-empty'},
                    React.createElement(Icon,{name:'search',size:'xxl',className:'empty-icon'}),
                    React.createElement('div',{className:'empty-title',style:{fontSize:'1.2rem'}},'No Repository'),
                    React.createElement('div',{className:'empty-desc'},'Connect a repository to start exploring architecture and dependencies.')
                )
            ),
            React.createElement('div',{className:'canvas-area'},
                loading?React.createElement('div',{className:'loading'},React.createElement('div',{className:'spinner'}),React.createElement('div',{className:'loading-text'},'Analyzing...'),React.createElement('div',{className:'loading-progress'},progress)):
                !data?React.createElement('div',{className:'empty-state'},
                    React.createElement('div',{className:'empty-state-glow'}),
                    React.createElement('div',{className:'empty-state-content'},
                        React.createElement(Icon,{name:'logo',size:'xxl',className:'empty-icon'}),
                        React.createElement('div',{className:'empty-title'},'RepoScope'),
                        React.createElement('div',{className:'empty-desc'},'High-performance repository introspection and database visualization.\nEnter a GitHub URL above or open a local folder to get started.'),
                        React.createElement('div',{className:'empty-features'},
                            React.createElement('span',{className:'empty-feature'},React.createElement(Icon,{name:'graph',size:'s'}),' Dependency Graph'),
                            React.createElement('span',{className:'empty-feature'},React.createElement(Icon,{name:'impact',size:'s'}),' Blast Radius'),
                            React.createElement('span',{className:'empty-feature'},React.createElement(Icon,{name:'security',size:'s'}),' Security Scan'),
                            React.createElement('span',{className:'empty-feature'},React.createElement(Icon,{name:'puzzle',size:'s'}),' Pattern Detection'),
                            React.createElement('span',{className:'empty-feature'},React.createElement(Icon,{name:'users',size:'s'}),' Code Ownership'),
                            React.createElement('span',{className:'empty-feature'},React.createElement(Icon,{name:'key',size:'s'}),' Private Repos')
                        )
                    )
                ):
                React.createElement(React.Fragment,null,
                    React.createElement('div',{className:'viz-selector'},
                        React.createElement('button',{className:'viz-selector-btn'+(graphConfig.vizType==='graph'?' active':''),onClick:function(){setGraphConfig(Object.assign({},graphConfig,{vizType:'graph'}));}},iconLabel('graph','Graph')),
                        React.createElement('button',{className:'viz-selector-btn'+(graphConfig.vizType==='treemap'?' active':''),onClick:function(){setGraphConfig(Object.assign({},graphConfig,{vizType:'treemap'}));}},iconLabel('treemap','Treemap')),
                        React.createElement('button',{className:'viz-selector-btn'+(graphConfig.vizType==='matrix'?' active':''),onClick:function(){setGraphConfig(Object.assign({},graphConfig,{vizType:'matrix'}));}},iconLabel('matrix','Matrix')),
                        React.createElement('button',{className:'viz-selector-btn'+(graphConfig.vizType==='dendro'?' active':''),onClick:function(){setGraphConfig(Object.assign({},graphConfig,{vizType:'dendro'}));}},iconLabel('tree','Tree')),
                        React.createElement('button',{className:'viz-selector-btn'+(graphConfig.vizType==='sankey'?' active':''),onClick:function(){setGraphConfig(Object.assign({},graphConfig,{vizType:'sankey'}));}},iconLabel('flow','Flow')),
                        React.createElement('button',{className:'viz-selector-btn'+(graphConfig.vizType==='disjoint'?' active':''),onClick:function(){setGraphConfig(Object.assign({},graphConfig,{vizType:'disjoint'}));}},iconLabel('cluster','Cluster')),
                        React.createElement('button',{className:'viz-selector-btn'+(graphConfig.vizType==='bundle'?' active':''),onClick:function(){setGraphConfig(Object.assign({},graphConfig,{vizType:'bundle'}));}},iconLabel('target','Bundle'))
                    ),
                    graphConfig.vizType==='graph'&&React.createElement('svg',{ref:svgRef}),
                    graphConfig.vizType==='treemap'&&React.createElement('div',{ref:treemapRef,className:'treemap-container'}),
                    graphConfig.vizType==='matrix'&&React.createElement('div',{ref:matrixRef,className:'matrix-container',style:{width:'100%',height:'100%',overflow:'auto',display:'flex',alignItems:'center',justifyContent:'center'}}),
                    graphConfig.vizType==='dendro'&&React.createElement('div',{ref:dendroRef,className:'dendro-container',style:{width:'100%',height:'100%',position:'relative'}}),
                    graphConfig.vizType==='sankey'&&React.createElement('div',{ref:sankeyRef,className:'sankey-container',style:{width:'100%',height:'100%',position:'relative'}}),
                    graphConfig.vizType==='disjoint'&&React.createElement('div',{ref:disjointRef,className:'disjoint-container',style:{width:'100%',height:'100%',position:'relative'}}),
                    graphConfig.vizType==='bundle'&&React.createElement('div',{ref:bundleRef,className:'bundle-container'}),
                    graphConfig.vizType==='graph'&&React.createElement('div',{className:'canvas-toolbar'},
                        React.createElement('button',{className:'tool-btn',onClick:zoomIn,'aria-label':'Zoom in'},'+'),
                        React.createElement('button',{className:'tool-btn',onClick:zoomOut,'aria-label':'Zoom out'},'−'),
                        React.createElement('button',{className:'tool-btn',onClick:resetZoom,'aria-label':'Reset zoom'},'⟲'),
                        React.createElement('button',{className:'tool-btn',onClick:fitView,'aria-label':'Fit view'},'⊡'),
                        React.createElement('button',{className:'tool-btn'+(showGraphConfig?' active':''),onClick:function(){setShowGraphConfig(!showGraphConfig);},'aria-label':'Graph settings',style:showGraphConfig?{background:'var(--accbg)',borderColor:'var(--acc)'}:{}},
                            React.createElement(Icon,{name:'settings',size:'m'})
                        )
                    ),
                    graphConfig.vizType==='graph'&&showGraphConfig&&React.createElement('div',{className:'graph-config'},
                        React.createElement('div',{className:'graph-config-title'},'Layout'),
                        React.createElement('div',{className:'view-toggle',style:{flexWrap:'wrap'}},
                            React.createElement('button',{className:'view-btn'+(graphConfig.viewMode==='force'?' active':''),onClick:function(){setGraphConfig(Object.assign({},graphConfig,{viewMode:'force'}));}},'Force'),
                            React.createElement('button',{className:'view-btn'+(graphConfig.viewMode==='radial'?' active':''),onClick:function(){setGraphConfig(Object.assign({},graphConfig,{viewMode:'radial'}));}},'Radial'),
                            React.createElement('button',{className:'view-btn'+(graphConfig.viewMode==='hierarchical'?' active':''),onClick:function(){setGraphConfig(Object.assign({},graphConfig,{viewMode:'hierarchical'}));}},'Layers'),
                            React.createElement('button',{className:'view-btn'+(graphConfig.viewMode==='grid'?' active':''),onClick:function(){setGraphConfig(Object.assign({},graphConfig,{viewMode:'grid'}));}},'Grid'),
                            React.createElement('button',{className:'view-btn'+(graphConfig.viewMode==='metro'?' active':''),onClick:function(){setGraphConfig(Object.assign({},graphConfig,{viewMode:'metro'}));}},'Metro')
                        ),
                        React.createElement('div',{className:'graph-config-title',style:{marginTop:8}},'Spacing'),
                        React.createElement('div',{className:'config-row'},
                            React.createElement('span',{className:'config-label'},'Spread'),
                            React.createElement('input',{type:'range',className:'config-slider',min:'50',max:'500',value:graphConfig.spacing,onChange:function(e: any){setGraphConfig(Object.assign({},graphConfig,{spacing:parseInt(e.target.value)}));}}),
                            React.createElement('span',{className:'config-value'},graphConfig.spacing)
                        ),
                        React.createElement('div',{className:'config-row'},
                            React.createElement('span',{className:'config-label'},'Links'),
                            React.createElement('input',{type:'range',className:'config-slider',min:'30',max:'200',value:graphConfig.linkDist,onChange:function(e: any){setGraphConfig(Object.assign({},graphConfig,{linkDist:parseInt(e.target.value)}));}}),
                            React.createElement('span',{className:'config-value'},graphConfig.linkDist)
                        ),
                        React.createElement('div',{className:'graph-config-title',style:{marginTop:8}},'Display'),
                        React.createElement('label',{className:'config-check'},
                            React.createElement('input',{type:'checkbox',checked:graphConfig.showLabels,onChange:function(e: any){setGraphConfig(Object.assign({},graphConfig,{showLabels:e.target.checked}));}}),
                            'Show labels'
                        ),
                        React.createElement('label',{className:'config-check',style:{marginTop:6}},
                            React.createElement('input',{type:'checkbox',checked:graphConfig.curvedLinks,onChange:function(e: any){setGraphConfig(Object.assign({},graphConfig,{curvedLinks:e.target.checked}));}}),
                            'Curved links'
                        )
                    ),
                    React.createElement('div',{className:'canvas-info'},
                        React.createElement('div',{className:'info-chip'},React.createElement('strong',null,folderFilter?(data as any).files.filter(function(f: any){return f.folder===folderFilter||f.folder.startsWith(folderFilter+'/');}).length:(data as any).files.length),' files'),
                        React.createElement('div',{className:'info-chip'},React.createElement('strong',null,(data as any).connections.length),' links'),
                        (data as any).excludePatterns&&(data as any).excludePatterns.length>0&&React.createElement('div',{className:'info-chip'},
                            React.createElement(Icon,{name:'ban',size:'s'}),
                            ' ',
                            React.createElement('strong',null,(data as any).excludePatterns.length),
                            ' custom excludes'
                        ),
                        selected&&blastRadius&&React.createElement('div',{className:'info-chip'},
                            React.createElement(Icon,{name:'impact',size:'s'}),
                            ' ',
                            React.createElement('strong',null,blastRadius.count),
                            ' dependents',
                            blastRadius.fnsUsed>0?' • '+blastRadius.fnsUsed+' fns used':''
                        )
                    ),
                    React.createElement('div',{className:'legend'+(legendCollapsed?' collapsed':'')},
                        React.createElement('div',{className:'legend-header',onClick:function(){setLegendCollapsed(!legendCollapsed);}},
                            React.createElement('div',{className:'legend-title',style:{margin:0}},colorMode==='folder'?'Folders':colorMode==='layer'?'Layers':'Churn'),
                            React.createElement('span',{className:'legend-toggle'},'▼')
                        ),
                        React.createElement('div',{className:'legend-content'},
                            colorMode==='folder'&&(data as any).folders.slice(0,12).map(function(f: any, i: any){return React.createElement('div',{key:f,className:'legend-item'+(folderFilter===f?' active':''),onClick:function(e: any){e.stopPropagation();filterByFolder(f);}},React.createElement('div',{className:'legend-color',style:{background:colorMap[f]||COLORS[i%COLORS.length]}}),f||'root');}),
                            colorMode==='folder'&&(data as any).folders.length>12&&React.createElement('div',{style:{fontSize:9,color:'var(--t3)',marginTop:4}},'+',(data as any).folders.length-12,' more'),
                            colorMode==='layer'&&Object.entries(LAYER_COLORS).map(function(e: any){return React.createElement('div',{key:e[0],className:'legend-item'},React.createElement('div',{className:'legend-color',style:{background:e[1]}}),e[0]=== 'modules' ? 'Modules' : e[0]=== 'forms' ? 'UserForms' : e[0]=== 'classes' ? 'Classes' : e[0]);}),
                            colorMode==='churn'&&React.createElement(React.Fragment,null,React.createElement('div',{className:'legend-item'},React.createElement('div',{className:'legend-color',style:{background:'#ff5f5f'}}),'High (7+ commits)'),React.createElement('div',{className:'legend-item'},React.createElement('div',{className:'legend-color',style:{background:'#ff9f43'}}),'Medium (4-6)'),React.createElement('div',{className:'legend-item'},React.createElement('div',{className:'legend-color',style:{background:'#22c55e'}}),'Low (0-3)'))
                        )
                    ),
                    tooltip&&React.createElement('div',{className:'tooltip',style:{left:tooltip.x,top:tooltip.y}},React.createElement('div',{className:'tooltip-title'},tooltip.title),React.createElement('div',{className:'tooltip-content'},tooltip.content))
                )
            ),
            React.createElement('div',{className:'right-panel',style:{width:rightPanelWidth}},
                React.createElement('div',{className:'resize-handle',onMouseDown:function(e: any){
                    e.preventDefault();
                    var startX=e.clientX,startW=rightPanelWidth;
                    function onMove(e){setRightPanelWidth(Math.max(280,Math.min(500,startW-(e.clientX-startX))));}
                    function onUp(){document.removeEventListener('mousemove',onMove);document.removeEventListener('mouseup',onUp);}
                    document.addEventListener('mousemove',onMove);document.addEventListener('mouseup',onUp);
                }}),
                data?React.createElement(React.Fragment,null,
                    React.createElement('div',{className:'panel-tabs'},
                        React.createElement('button',{className:'panel-tab'+(rightTab==='details'?' active':''),onClick:function(){setRightTab('details');setDrillDown(null);}},selected?iconLabel('file','FILE'):iconLabel('search','ISSUES')),
                        React.createElement('button',{className:'panel-tab'+(rightTab==='patterns'?' active':''),onClick:function(){setRightTab('patterns');setDrillDown(null);}},iconLabel('puzzle','PATTERNS'),' ',React.createElement('span',{className:'badge badge-default'},(data as any).patterns.length)),
                        React.createElement('button',{className:'panel-tab'+(rightTab==='security'?' active':''),onClick:function(){setRightTab('security');setDrillDown(null);}},iconLabel('security','SECURITY'),(data as any).stats.security>0&&React.createElement('span',{className:'view-mode-badge',style:{marginLeft:4}},(data as any).stats.security)),
                        React.createElement('button',{className:'panel-tab'+(rightTab==='suggestions'?' active':''),onClick:function(){setRightTab('suggestions');setDrillDown(null);}},iconLabel('action','ACTIONS'),(data as any).suggestions&&(data as any).suggestions.length>0&&React.createElement('span',{className:'view-mode-badge',style:{marginLeft:4}},(data as any).suggestions.length))
                    ),
                    React.createElement('div',{className:'panel-content'},
                        rightTab==='details'&&(selected?React.createElement(React.Fragment,null,
                            React.createElement('button',{className:'top-btn',style:{width:'100%',marginBottom:12},onClick:function(){setSelected(null);setBlastRadius(null);if(nodesRef.current){nodesRef.current.selectAll('.nc').transition().duration(200).attr('opacity',1).attr('fill',getNodeColor);}if(linksRef.current){linksRef.current.transition().duration(200).attr('stroke-opacity',0.4).attr('stroke',theme==='light'?'#ccc':'#333');}}},'← Back to Issues'),
                            React.createElement('div',{className:'panel-header',style:{margin:'0 -12px 12px',padding:12}},
                                React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}},
                                    React.createElement('div',null,
                                        React.createElement('div',{className:'panel-title'},React.createElement(Icon,{name:'file',size:'m'}),' ',selected.name),
                                        React.createElement('div',{className:'panel-subtitle'},selected.folder||'root',' • ',selected.layer,' • ',selected.lines,' lines',selected.complexity&&selected.complexity.score>0?' • Complexity: '+selected.complexity.score:'')
                                    ),
                                    React.createElement('button',{className:'view-file-btn',onClick:function(){openFilePreview(selected.path);}},iconLabel('eye','View Source'))
                                )
                            ),
                            blastRadius&&React.createElement('div',{className:'card',style:{marginBottom:12}},
                                React.createElement('div',{className:'card-header',onClick:function(){toggleCard('blast');}},React.createElement('div',{className:'card-title'},React.createElement('span',{className:'card-toggle'+(expandedCards.has('blast')?' open':'')},'▶'),React.createElement(Icon,{name:'impact',size:'s'}),' Impact Analysis'),React.createElement('span',{className:'badge badge-'+(blastRadius.level==='low'?'success':blastRadius.level==='medium'?'warning':'danger')},blastRadius.level.toUpperCase())),
                                expandedCards.has('blast')&&React.createElement('div',{className:'card-body'},
                                    React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}},
                                        React.createElement('div',{style:{background:'var(--bg0)',padding:8,borderRadius:6,textAlign:'center'}},
                                            React.createElement('div',{style:{fontSize:16,fontWeight:600,color:'var(--acc)'}},blastRadius.count),
                                            React.createElement('div',{style:{fontSize:9,color:'var(--t3)'}},'Direct Dependents')
                                        ),
                                        React.createElement('div',{style:{background:'var(--bg0)',padding:8,borderRadius:6,textAlign:'center'}},
                                            React.createElement('div',{style:{fontSize:16,fontWeight:600,color:'var(--purple)'}},blastRadius.transitiveCount||0),
                                            React.createElement('div',{style:{fontSize:9,color:'var(--t3)'}},'Transitive')
                                        ),
                                        React.createElement('div',{style:{background:'var(--bg0)',padding:8,borderRadius:6,textAlign:'center'}},
                                            React.createElement('div',{style:{fontSize:16,fontWeight:600,color:'var(--green)'}},blastRadius.fnsUsed||0),
                                            React.createElement('div',{style:{fontSize:9,color:'var(--t3)'}},'Fns Exported')
                                        ),
                                        React.createElement('div',{style:{background:'var(--bg0)',padding:8,borderRadius:6,textAlign:'center'}},
                                            React.createElement('div',{style:{fontSize:16,fontWeight:600,color:'var(--orange)'}},(blastRadius.dependencies||[]).length),
                                            React.createElement('div',{style:{fontSize:9,color:'var(--t3)'}},'Dependencies')
                                        )
                                    ),
                                    (blastRadius.count>0||blastRadius.fnsUsed>0)&&React.createElement('div',{style:{fontSize:9,color:'var(--t3)',marginBottom:8,padding:'6px 8px',background:'var(--bg0)',borderRadius:4}},
                                        blastRadius.count>0?blastRadius.count+' file'+(blastRadius.count>1?'s':'')+' directly depend on this file':'',
                                        blastRadius.count>0&&blastRadius.fnsUsed>0?' • ':'',
                                        blastRadius.fnsUsed>0?blastRadius.fnsUsed+' function'+(blastRadius.fnsUsed>1?'s':'')+' used '+blastRadius.totalCalls+' times':''
                                    ),
                                    blastRadius.affected.length>0&&React.createElement('div',{className:'blast-detail'},
                                        React.createElement('div',{style:{fontSize:9,fontWeight:600,marginBottom:6}},'Files that import from this:'),
                                        blastRadius.affected.slice(0,8).map(function(path: any){return React.createElement('div',{key:path,className:'blast-file',onClick:function(){selectFile(path);}},React.createElement(Icon,{name:'file',size:'s'}),' ',path.split('/').pop());}),
                                        blastRadius.affected.length>8&&React.createElement('div',{style:{fontSize:9,color:'var(--t3)',marginTop:4}},'+',blastRadius.affected.length-8,' more')
                                    ),
                                    (blastRadius.dependencies||[]).length>0&&React.createElement('div',{className:'blast-detail',style:{marginTop:8}},
                                        React.createElement('div',{style:{fontSize:9,fontWeight:600,marginBottom:6,color:'var(--orange)'}},'Dependencies (risk if these change):'),
                                        blastRadius.dependencies.slice(0,5).map(function(path: any){return React.createElement('div',{key:path,className:'blast-file',onClick:function(){selectFile(path);}},React.createElement(Icon,{name:'file',size:'s'}),' ',path.split('/').pop());}),
                                        blastRadius.dependencies.length>5&&React.createElement('div',{style:{fontSize:9,color:'var(--t3)',marginTop:4}},'+',blastRadius.dependencies.length-5,' more')
                                    )
                                )
                            ),
                            (function(){
                                var outgoing=[],incoming=[];
                                var connByFile={out:{},in:{}};
                                (data as any).connections.forEach(function(c: any){
                                    var src=typeof c.source==='object'?c.source.id:c.source;
                                    var tgt=typeof c.target==='object'?c.target.id:c.target;
                                    if(src===selected.path){
                                        if(!connByFile.out[tgt])connByFile.out[tgt]={file:tgt,fns:[]};
                                        connByFile.out[tgt].fns.push({name:c.fn,count:c.count});
                                    }
                                    if(tgt===selected.path){
                                        if(!connByFile.in[src])connByFile.in[src]={file:src,fns:[]};
                                        connByFile.in[src].fns.push({name:c.fn,count:c.count});
                                    }
                                });
                                outgoing=Object.values(connByFile.out).sort(function(a: any, b: any){return b.fns.length-a.fns.length;});
                                incoming=Object.values(connByFile.in).sort(function(a: any, b: any){return b.fns.length-a.fns.length;});
                                var totalConns=outgoing.length+incoming.length;
                                return totalConns>0&&React.createElement('div',{className:'card',style:{marginBottom:12}},
                                    React.createElement('div',{className:'card-header',onClick:function(){toggleCard('conns');}},React.createElement('div',{className:'card-title'},React.createElement('span',{className:'card-toggle'+(expandedCards.has('conns')?' open':'')},'▶'),React.createElement(Icon,{name:'link',size:'s'}),' Connections'),React.createElement('span',{className:'badge badge-default'},totalConns)),
                                    expandedCards.has('conns')&&React.createElement('div',{className:'card-body',style:{padding:0}},
                                        outgoing.length>0&&React.createElement(React.Fragment,null,
                                            React.createElement('div',{style:{fontSize:9,fontWeight:600,color:'var(--t3)',padding:'8px 12px',background:'var(--bg2)',borderBottom:'1px solid var(--border)'}},'Uses (',outgoing.length,' files)'),
                                            outgoing.slice(0,15).map(function(conn: any){
                                                var isOpen=expandedCards.has('conn-out-'+conn.file);
                                                return React.createElement('div',{key:conn.file,className:'conn-item'},
                                                    React.createElement('div',{className:'conn-header',onClick:function(e: any){e.stopPropagation();toggleCard('conn-out-'+conn.file);}},
                                                        React.createElement('span',{className:'card-toggle'+(isOpen?' open':''),style:{fontSize:8,marginRight:6}},'▶'),
                                                        React.createElement('span',{className:'conn-file-icon'},React.createElement(Icon,{name:'file',size:'s'})),
                                                        React.createElement('span',{className:'conn-file-name'},conn.file.split('/').pop()),
                                                        React.createElement('span',{className:'badge badge-default',style:{marginLeft:'auto'}},conn.fns.length,' fn',conn.fns.length!==1?'s':'')
                                                    ),
                                                    isOpen&&React.createElement('div',{className:'conn-fns'},
                                                        conn.fns.map(function(fn: any, i: any){return React.createElement('div',{key:i,className:'conn-fn'},
                                                            React.createElement('span',{className:'conn-fn-name'},fn.name,'()'),
                                                            React.createElement('span',{className:'conn-fn-count'},fn.count,'×')
                                                        );}),
                                                        React.createElement('div',{className:'conn-goto',onClick:function(){selectFile(conn.file);}},'→ View ',conn.file.split('/').pop())
                                                    )
                                                );
                                            }),
                                            outgoing.length>15&&React.createElement('div',{style:{fontSize:9,color:'var(--t3)',padding:8,textAlign:'center'}},'+',outgoing.length-15,' more files')
                                        ),
                                        incoming.length>0&&React.createElement(React.Fragment,null,
                                            React.createElement('div',{style:{fontSize:9,fontWeight:600,color:'var(--t3)',padding:'8px 12px',background:'var(--bg2)',borderBottom:'1px solid var(--border)',borderTop:outgoing.length>0?'1px solid var(--border)':'none'}},'Used by (',incoming.length,' files)'),
                                            incoming.slice(0,15).map(function(conn: any){
                                                var isOpen=expandedCards.has('conn-in-'+conn.file);
                                                return React.createElement('div',{key:conn.file,className:'conn-item'},
                                                    React.createElement('div',{className:'conn-header',onClick:function(e: any){e.stopPropagation();toggleCard('conn-in-'+conn.file);}},
                                                        React.createElement('span',{className:'card-toggle'+(isOpen?' open':''),style:{fontSize:8,marginRight:6}},'▶'),
                                                        React.createElement('span',{className:'conn-file-icon'},React.createElement(Icon,{name:'file',size:'s'})),
                                                        React.createElement('span',{className:'conn-file-name'},conn.file.split('/').pop()),
                                                        React.createElement('span',{className:'badge badge-default',style:{marginLeft:'auto'}},conn.fns.length,' fn',conn.fns.length!==1?'s':'')
                                                    ),
                                                    isOpen&&React.createElement('div',{className:'conn-fns'},
                                                        conn.fns.map(function(fn: any, i: any){return React.createElement('div',{key:i,className:'conn-fn'},
                                                            React.createElement('span',{className:'conn-fn-name'},fn.name,'()'),
                                                            React.createElement('span',{className:'conn-fn-count'},fn.count,'×')
                                                        );}),
                                                        React.createElement('div',{className:'conn-goto',onClick:function(){selectFile(conn.file);}},'→ View ',conn.file.split('/').pop())
                                                    )
                                                );
                                            }),
                                            incoming.length>15&&React.createElement('div',{style:{fontSize:9,color:'var(--t3)',padding:8,textAlign:'center'}},'+',incoming.length-15,' more files')
                                        )
                                    )
                                );
                            })(),
                            React.createElement('div',{className:'card',style:{marginBottom:12}},
                                React.createElement('div',{className:'card-header',onClick:function(){toggleCard('own');}},React.createElement('div',{className:'card-title'},React.createElement('span',{className:'card-toggle'+(expandedCards.has('own')?' open':'')},'▶'),React.createElement(Icon,{name:'users',size:'s'}),' Ownership')),
                                expandedCards.has('own')&&React.createElement('div',{className:'card-body'},
                                    ownerLoading?React.createElement('div',{className:'loading-owner'},'Loading ownership (data as any)...'):
                                    ownership&&ownership.length>0?React.createElement(React.Fragment,null,
                                        React.createElement('div',{className:'owner-bar'},ownership.slice(0,5).map(function(o: any, i: any){return React.createElement('div',{key:i,className:'owner-segment',style:{width:o.percent+'%',background:COLORS[i%COLORS.length]}});})),
                                        React.createElement('div',{className:'owner-list'},ownership.slice(0,5).map(function(o: any, i: any){return React.createElement('div',{key:i,className:'owner-item'},React.createElement('div',{className:'owner-avatar',style:{background:COLORS[i%COLORS.length]}},o.name[0].toUpperCase()),React.createElement('span',{className:'owner-name'},o.name),React.createElement('span',{className:'owner-percent'},o.percent,'%'));}))
                                    ):React.createElement('div',{style:{fontSize:10,color:'var(--t3)',padding:8}},'No ownership data available')
                                )
                            ),
                            React.createElement('div',{className:'card'},
                                React.createElement('div',{className:'card-header',onClick:function(){toggleCard('fns');}},React.createElement('div',{className:'card-title'},React.createElement('span',{className:'card-toggle'+(expandedCards.has('fns')?' open':'')},'▶'),React.createElement(Icon,{name:'bolt',size:'s'}),' Functions (',selected.functions.length,')')),
                                expandedCards.has('fns')&&React.createElement('div',{className:'card-body',style:{padding:8}},
                                    selected.functions.length===0?React.createElement('div',{style:{fontSize:10,color:'var(--t3)',padding:8,textAlign:'center'}},'No functions detected'):
                                    selected.functions.map(function(fn: any){
                                        var st=(data as any).fnStats[fn.name];
                                        var isExpanded=expandedFns.has(fn.name);
                                        var intCalls=st?st.internal:0,extCalls=st?st.external:0;
                                        return React.createElement('div',{key:fn.name,className:'fn-item'},
                                            React.createElement('div',{className:'fn-header',onClick:function(){toggleFn(fn.name);}},
                                                React.createElement('span',{className:'fn-name'},fn.name,'()'),
                                                React.createElement('span',{style:{display:'flex',alignItems:'center',gap:4}},
                                                    React.createElement('button',{className:'view-file-btn',onClick:function(e: any){e.stopPropagation();openFilePreview(selected.path,fn.line);},title:'View source'},React.createElement(Icon,{name:'eye',size:'s'})),
                                                    React.createElement('span',{className:'fn-line'},'L',fn.line),
                                                    React.createElement('span',{className:'badge badge-default',title:'Internal calls (same file)'},intCalls,' int'),
                                                    React.createElement('span',{className:'badge '+(extCalls>10?'badge-danger':extCalls>0?'badge-warning':'badge-default'),title:'External calls (other files)'},extCalls,' ext')
                                                )
                                            ),
                                            isExpanded&&React.createElement(React.Fragment,null,
                                                fn.code&&React.createElement('div',{className:'fn-code'},fn.code),
                                                st&&st.callers&&st.callers.length>0&&React.createElement('div',{className:'fn-callers'},
                                                    React.createElement('div',{className:'fn-callers-title'},'External callers:'),
                                                    st.callers.slice(0,8).map(function(c: any, i: any){return React.createElement('div',{key:i,className:'fn-caller',onClick:function(){selectFile(c.file);}},
                                                        React.createElement(Icon,{name:'file',size:'s'}),
                                                        React.createElement('span',null,c.name),
                                                        React.createElement('span',{style:{marginLeft:'auto',color:'var(--t3)'}},c.count,'×')
                                                    );}),
                                                    st.callers.length>8&&React.createElement('div',{style:{fontSize:9,color:'var(--t3)',padding:'4px 6px'}},'+',st.callers.length-8,' more')
                                                ),
                                                intCalls===0&&extCalls===0&&React.createElement('div',{style:{fontSize:9,color:'var(--orange)',padding:8,textAlign:'center',background:'rgba(255,159,67,0.1)',borderRadius:4}},
                                                    React.createElement(Icon,{name:'warning',size:'s'}),
                                                    ' This function is never called'
                                                )
                                            )
                                        );
                                    })
                                )
                            )
                        ):React.createElement(React.Fragment,null,
                            React.createElement('div',{style:{fontSize:12,fontWeight:600,marginBottom:12}},React.createElement(Icon,{name:'search',size:'m'}),' Architecture Issues (',(data as any).issues.length,')'),
                            (data as any).issues.length===0?React.createElement('div',{style:{textAlign:'center',padding:20}},React.createElement(Icon,{name:'spark',size:'xxl',className:'empty-icon'}),React.createElement('div',{style:{color:'var(--green)'}},'No issues detected!')):
                            (data as any).issues.map(function(issue: any, i: any){return React.createElement('div',{key:i,className:'security-item '+(issue.type==='critical'?'high':'medium'),style:{cursor:'pointer'},onClick:function(){setDrillDown({type:'issue',data:issue});}},
                                React.createElement('div',{className:'security-header'},
                                    React.createElement(StatusDot,{color:issue.type==='critical'?'var(--red)':'var(--orange)'}),
                                    React.createElement('span',{className:'security-title'},issue.title)
                                ),
                                React.createElement('div',{className:'security-desc'},issue.desc),
                                React.createElement('div',{style:{fontSize:9,color:'var(--acc)',marginTop:6}},'Click for details (',issue.items?issue.items.length:0,' items) →')
                            );})
                        )),
                        rightTab==='patterns'&&React.createElement(React.Fragment,null,
                            React.createElement('div',{style:{fontSize:12,fontWeight:600,marginBottom:12}},React.createElement(Icon,{name:'puzzle',size:'m'}),' Design Patterns & Anti-Patterns'),
                            (data as any).patterns.length===0?React.createElement('div',{style:{textAlign:'center',padding:20,color:'var(--t3)'}},React.createElement(Icon,{name:'puzzle',size:'xxl',className:'empty-icon'}),React.createElement('div',null,'No patterns detected'),React.createElement('div',{style:{fontSize:10,marginTop:8}},'Patterns are detected based on code structure')):
                            (data as any).patterns.map(function(p: any, i: any){return React.createElement('div',{key:i,className:'pattern-item'+(p.isAnti?' anti':''),style:{cursor:'pointer'},onClick:function(){setDrillDown({type:'pattern',data:p});}},
                                React.createElement('div',{className:'pattern-header'},
                                    React.createElement(Icon,{name:p.icon,size:'m',className:'pattern-icon'}),
                                    React.createElement('span',{className:'pattern-name'},p.name),
                                    p.isAnti&&React.createElement('span',{className:'badge badge-danger',style:{marginLeft:8}},'Anti-pattern')
                                ),
                                React.createElement('div',{className:'pattern-desc'},p.desc),
                                React.createElement('div',{style:{fontSize:9,color:'var(--acc)',marginTop:6}},'Click for details (',p.files.length,' files) →')
                            );})
                        ),
                        rightTab==='security'&&React.createElement(React.Fragment,null,
                            React.createElement('div',{style:{fontSize:12,fontWeight:600,marginBottom:12}},React.createElement(Icon,{name:'security',size:'m'}),' Security Analysis'),
                            (data as any).securityIssues.length===0?React.createElement('div',{style:{textAlign:'center',padding:20}},React.createElement(Icon,{name:'security',size:'xxl',className:'empty-icon'}),React.createElement('div',{style:{color:'var(--green)',fontWeight:600}},'No security issues found!'),React.createElement('div',{style:{fontSize:10,color:'var(--t3)',marginTop:8}},'Your code passed all security checks')):
                            React.createElement(React.Fragment,null,
                                React.createElement('div',{style:{display:'flex',gap:8,marginBottom:12}},
                                    React.createElement('div',{className:'badge badge-danger'},(data as any).securityIssues.filter(function(i: any){return i.severity==='high';}).length,' High'),
                                    React.createElement('div',{className:'badge badge-warning'},(data as any).securityIssues.filter(function(i: any){return i.severity==='medium';}).length,' Medium'),
                                    React.createElement('div',{className:'badge badge-info'},(data as any).securityIssues.filter(function(i: any){return i.severity==='low';}).length,' Low')
                                ),
                                (data as any).securityIssues.map(function(issue: any, i: any){return React.createElement('div',{key:i,className:'security-item '+issue.severity,style:{cursor:'pointer'},onClick:function(){setDrillDown({type:'security',data:issue});}},
                                    React.createElement('div',{className:'security-header'},
                                        React.createElement(StatusDot,{color:getSeverityColor(issue.severity)}),
                                        React.createElement('span',{className:'security-title'},issue.title)
                                    ),
                                    React.createElement('div',{className:'security-desc'},issue.desc),
                                    React.createElement('div',{style:{fontSize:9,color:'var(--acc)',marginTop:6}},'Click for details →'),
                                    issue.code&&React.createElement('div',{className:'security-code'},issue.code)
                                );})
                            )
                        ),
                        rightTab==='suggestions'&&React.createElement(React.Fragment,null,
                            React.createElement('div',{style:{fontSize:12,fontWeight:600,marginBottom:12}},React.createElement(Icon,{name:'action',size:'m'}),' Actionable Suggestions'),
                            (!(data as any).suggestions||(data as any).suggestions.length===0)?React.createElement('div',{style:{textAlign:'center',padding:20}},React.createElement(Icon,{name:'spark',size:'xxl',className:'empty-icon'}),React.createElement('div',{style:{color:'var(--green)',fontWeight:600}},'No issues to address!'),React.createElement('div',{style:{fontSize:10,color:'var(--t3)',marginTop:8}},'Your codebase looks healthy')):
                            React.createElement(React.Fragment,null,
                                React.createElement('div',{style:{fontSize:9,color:'var(--t3)',marginBottom:12}},'Prioritized recommendations based on your codebase analysis'),
                                (data as any).suggestions.map(function(s: any, i: any){
                                    var suggestionTone=s.priority==='critical'
                                        ? getAccentBlockStyle('rgba(255,95,95,0.36)','rgba(255,95,95,0.08)',{padding:12,marginBottom:10})
                                        : s.priority==='high'
                                            ? getAccentBlockStyle('rgba(255,159,67,0.34)','rgba(255,159,67,0.08)',{padding:12,marginBottom:10})
                                            : getAccentBlockStyle('rgba(0,255,157,0.28)','rgba(0,255,157,0.08)',{padding:12,marginBottom:10});
                                    return React.createElement('div',{key:i,className:'suggestion-card',style:suggestionTone},
                                    React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8,marginBottom:6}},
                                        React.createElement(Icon,{name:s.icon,size:'l'}),
                                        React.createElement('span',{style:{fontWeight:600,fontSize:11}},s.title),
                                        React.createElement('span',{className:'badge badge-'+(s.priority==='critical'?'danger':s.priority==='high'?'warning':'info'),style:{marginLeft:'auto',fontSize:8}},s.priority.toUpperCase())
                                    ),
                                    React.createElement('div',{style:{fontSize:10,color:'var(--t2)',marginBottom:8}},s.desc),
                                    React.createElement('div',{style:{fontSize:9,background:'var(--bg2)',padding:'6px 8px',borderRadius:4,marginBottom:6}},
                                        React.createElement('span',{style:{color:'var(--t3)'}},'Action: '),
                                        React.createElement('span',{style:{color:'var(--t1)'}},s.action)
                                    ),
                                    React.createElement('div',{style:{fontSize:9,color:'var(--green)'}},React.createElement(Icon,{name:'spark',size:'s'}),' ',s.impact)
                                );}),
                                (data as any).duplicates&&(data as any).duplicates.length>0&&React.createElement('div',{style:{marginTop:16}},
                                    React.createElement('div',{style:{fontSize:11,fontWeight:600,marginBottom:8}},React.createElement(Icon,{name:'copy',size:'m'}),' Duplicate Functions (',(data as any).duplicates.length,')'),
                                    (data as any).duplicates.slice(0,10).map(function(d: any, i: any){return React.createElement('div',{key:i,style:{background:'var(--bg0)',borderRadius:6,padding:8,marginBottom:6,fontSize:10,cursor:'pointer'},onClick:function(){setDrillDown({type:'duplicate',data:d});}},
                                        React.createElement('div',{style:{fontWeight:600,color:d.type==='code'?'var(--purple)':'var(--orange)'}},d.type==='code'?'Similar Code':'Same Name',': ',d.name),
                                        React.createElement('div',{style:{fontSize:9,color:'var(--acc)',marginTop:4}},'Click for details (',d.files.length,' locations) →')
                                    );})
                                )
                            )
                        )
                    )
                ):React.createElement('div',{className:'panel-empty'},
                    React.createElement(Icon,{name:'chart',size:'xxl',className:'empty-icon'}),
                    React.createElement('div',{className:'empty-title',style:{fontSize:'1.2rem'}},'Analysis'),
                    React.createElement('div',{className:'empty-desc'},'RepoScope will automatically detect patterns and security risks.')
                )
            )
        ),
        showExport&&React.createElement('div',{className:'modal-overlay',onClick:function(){setShowExport(false);}},
            React.createElement('div',{className:'modal',onClick:function(e: any){e.stopPropagation();},style:{maxWidth:480}},
                React.createElement('div',{className:'modal-header'},React.createElement('div',{className:'modal-title'},iconLabel('export','Export','m')),React.createElement('button',{className:'modal-close',onClick:function(){setShowExport(false);}},'×')),
                React.createElement('div',{className:'modal-body'},
                    React.createElement('div',{style:{fontSize:10,fontWeight:600,color:'var(--t3)',textTransform:'uppercase',marginBottom:8}},'Visualization'),
                    React.createElement('div',{className:'export-options'},
                        React.createElement('div',{className:'export-option',onClick:function(){exportSVG();setShowExport(false);}},React.createElement('div',{className:'export-option-icon'},React.createElement(Icon,{name:'image',size:'xl'})),React.createElement('div',{className:'export-option-label'},'SVG Image')),
                        React.createElement('div',{className:'export-option',onClick:function(){copyLink();setShowExport(false);}},React.createElement('div',{className:'export-option-icon'},React.createElement(Icon,{name:'link',size:'xl'})),React.createElement('div',{className:'export-option-label'},'Share Link'))
                    ),
                    React.createElement('div',{style:{fontSize:10,fontWeight:600,color:'var(--t3)',textTransform:'uppercase',marginBottom:8,marginTop:16}},'Analysis Report'),
                    React.createElement('div',{style:{fontSize:9,color:'var(--t2)',marginBottom:10}},'Complete analysis with files, functions, patterns, security issues, and dependencies'),
                    React.createElement('div',{className:'export-options'},
                        React.createElement('div',{className:'export-option',onClick:function(){generateReport('json');setShowExport(false);}},React.createElement('div',{className:'export-option-icon'},React.createElement(Icon,{name:'code',size:'xl'})),React.createElement('div',{className:'export-option-label'},'JSON Report')),
                        React.createElement('div',{className:'export-option',onClick:function(){generateReport('md');setShowExport(false);}},React.createElement('div',{className:'export-option-icon'},React.createElement(Icon,{name:'note',size:'xl'})),React.createElement('div',{className:'export-option-label'},'Markdown')),
                        React.createElement('div',{className:'export-option',onClick:function(){generateReport('txt');setShowExport(false);}},React.createElement('div',{className:'export-option-icon'},React.createElement(Icon,{name:'file',size:'xl'})),React.createElement('div',{className:'export-option-label'},'Plain Text'))
                    ),
                    React.createElement('div',{style:{fontSize:10,fontWeight:600,color:'var(--t3)',textTransform:'uppercase',marginBottom:8,marginTop:16}},'Raw Data'),
                    React.createElement('div',{className:'export-options'},
                        React.createElement('div',{className:'export-option',onClick:function(){exportJSON();setShowExport(false);}},React.createElement('div',{className:'export-option-icon'},React.createElement(Icon,{name:'settings',size:'xl'})),React.createElement('div',{className:'export-option-label'},'Raw JSON'))
                    )
                )
            )
        ),
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
        showPR&&React.createElement('div',{className:'modal-overlay',onClick:function(){setShowPR(false);}},
            React.createElement('div',{className:'modal pr-modal',onClick:function(e: any){e.stopPropagation();}},
                React.createElement('div',{className:'modal-header'},React.createElement('div',{className:'modal-title'},iconLabel('chart','PR Impact Analyzer','m')),React.createElement('button',{className:'modal-close',onClick:function(){setShowPR(false);}},'×')),
                React.createElement('div',{className:'modal-body',style:{maxHeight:'75vh',overflowY:'auto'}},
                    React.createElement('div',{className:'form-group'},React.createElement('label',{className:'form-label'},'Pull Request URL'),React.createElement('input',{className:'form-input','aria-label':'Pull Request URL',placeholder:'https://github.com/owner/repo/pull/123',value:prUrl,onChange:function(e: any){setPrUrl(e.target.value);},onKeyDown:function(e: any){if(e.key==='Enter')analyzePR();}})),
                    React.createElement('button',{className:'top-btn primary','aria-label':'Analyze Pull Request',onClick:analyzePR,style:{marginBottom:16,width:'100%'}},iconLabel('search','Analyze PR Impact')),
                    prData&&(function(){
                        var risk = calcPRRisk(prData, data);
                        var reviewers = findSuggestedReviewers(prData, data);
                        var testImpact = findTestImpact(prData, data);
                        var chains = findDependencyChains(prData, data);
                        var riskColor = risk.level === 'critical' ? 'var(--red)' : risk.level === 'high' ? 'var(--orange)' : risk.level === 'medium' ? 'var(--blue)' : 'var(--green)';
                        return React.createElement(React.Fragment, null,
                            React.createElement('div',{className:'pr-header',style:{marginBottom:16}},
                                React.createElement('div',{className:'pr-title',style:{fontSize:14}},prData.title),
                                React.createElement('div',{className:'pr-stats',style:{marginTop:8}},
                                    React.createElement('span',{className:'pr-add'},'+',prData.additions||0),
                                    React.createElement('span',{className:'pr-del'},'-',prData.deletions||0),
                                    React.createElement('span',{style:{color:'var(--t3)',marginLeft:8}},prData.files?prData.files.length:0,' files')
                                )
                            ),
                            React.createElement('div',{className:'pr-impact-grid'},
                                React.createElement('div',{className:'pr-impact-card'},
                                    React.createElement('div',{className:'pr-risk-meter'},
                                        React.createElement('div',{className:'pr-risk-circle',style:{borderColor:riskColor,background:'rgba('+[risk.level==='critical'?'255,95,95':risk.level==='high'?'255,159,67':risk.level==='medium'?'77,159,255':'34,197,94'].join(',')+',0.1)'}},
                                            React.createElement('div',{className:'pr-risk-value',style:{color:riskColor}},risk.score),
                                            React.createElement('div',{className:'pr-risk-text',style:{color:riskColor}},risk.level)
                                        ),
                                        React.createElement('div',{style:{marginTop:12,fontSize:10,color:'var(--t2)',textAlign:'center'}},'Risk Score')
                                    ),
                                    risk.factors.length > 0 && React.createElement('div',{style:{marginTop:12}},
                                        risk.factors.map(function(f: any, i: any) { return React.createElement('div',{key:i,style:{fontSize:9,color:'var(--t2)',padding:'4px 0',borderTop:i>0?'1px solid var(--border2)':'none'}},'• ',f); })
                                    )
                                ),
                                React.createElement('div',{className:'pr-impact-card'},
                                    React.createElement('div',{className:'pr-impact-card-title'},iconLabel('impact','Impact Metrics')),
                                    React.createElement('div',{className:'pr-metric-row'},React.createElement('span',{className:'pr-metric-label'},'Total Blast Radius'),React.createElement('span',{className:'pr-metric-value'},risk.totalBlast,' files')),
                                    React.createElement('div',{className:'pr-metric-row'},React.createElement('span',{className:'pr-metric-label'},'Files Changed'),React.createElement('span',{className:'pr-metric-value'},prData.files?prData.files.length:0)),
                                    React.createElement('div',{className:'pr-metric-row'},React.createElement('span',{className:'pr-metric-label'},'Lines Modified'),React.createElement('span',{className:'pr-metric-value'},(prData.additions||0)+(prData.deletions||0))),
                                    React.createElement('div',{className:'pr-metric-row'},React.createElement('span',{className:'pr-metric-label'},'Net Change'),React.createElement('span',{className:'pr-metric-value',style:{color:(prData.additions||0)-(prData.deletions||0)>=0?'var(--green)':'var(--red)'}},(prData.additions||0)-(prData.deletions||0)>0?'+':'',(prData.additions||0)-(prData.deletions||0)))
                                ),
                                reviewers.length > 0 && React.createElement('div',{className:'pr-impact-card'},
                                    React.createElement('div',{className:'pr-impact-card-title'},iconLabel('users','Suggested Reviewers')),
                                    reviewers.map(function(r: any, i: any) { return React.createElement('div',{key:i,className:'pr-reviewer-card'},
                                        React.createElement('div',{className:'pr-reviewer-avatar',style:{background:r.avatar}},r.name[0]),
                                        React.createElement('div',{className:'pr-reviewer-info'},
                                            React.createElement('div',{className:'pr-reviewer-name'},r.name),
                                            React.createElement('div',{className:'pr-reviewer-reason'},r.reason)
                                        )
                                    ); })
                                ),
                                testImpact.length > 0 && React.createElement('div',{className:'pr-impact-card'},
                                    React.createElement('div',{className:'pr-impact-card-title'},iconLabel('beaker','Test Impact')),
                                    React.createElement('div',{className:'pr-test-impact'},
                                        testImpact.slice(0,5).map(function(t: any, i: any) { return React.createElement('div',{key:i,className:'pr-test-file'},
                                            React.createElement('span',{className:'pr-test-icon'},React.createElement(Icon,{name:t.suggested?'spark':'security',size:'s'})),
                                            React.createElement('span',{style:{flex:1}},t.file),
                                            t.suggested && React.createElement('span',{className:'badge badge-info'},'suggested')
                                        ); })
                                    )
                                )
                            ),
                            chains.length > 0 && React.createElement('div',{className:'pr-impact-card',style:{marginTop:16}},
                                React.createElement('div',{className:'pr-impact-card-title'},iconLabel('link','Dependency Chains')),
                                React.createElement('div',{style:{fontSize:10,color:'var(--t3)',marginBottom:12}},'Files that import modified files (downstream impact)'),
                                chains.map(function(chain: any, i: any) { return React.createElement('div',{key:i,className:'pr-dependency-chain',style:{marginBottom:8}},
                                    chain.map(function(node: any, j: any) { return React.createElement(React.Fragment,{key:j},
                                        React.createElement('span',{className:'pr-chain-node'+(j===0?' changed':'')},node),
                                        j < chain.length - 1 && React.createElement('span',{className:'pr-chain-arrow'},'→')
                                    ); })
                                ); })
                            ),
                            risk.hotspots.length > 0 && React.createElement('div',{className:'pr-impact-card',style:{marginTop:16}},
                                React.createElement('div',{className:'pr-impact-card-title'},iconLabel('activity','Hotspots')),
                                React.createElement('div',{style:{fontSize:10,color:'var(--t3)',marginBottom:12}},'Files with highest blast radius'),
                                risk.hotspots.map(function(h: any, i: any) {
                                    var maxBlast = Math.max.apply(null, risk.hotspots.map(function(x: any){return x.blast;})) || 1;
                                    return React.createElement('div',{key:i,className:'pr-hotspot'},
                                        React.createElement('span',{style:{fontSize:10,color:'var(--t1)',minWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},h.file.split('/').pop()),
                                        React.createElement('div',{className:'pr-hotspot-bar'},
                                            React.createElement('div',{className:'pr-hotspot-fill',style:{width:(h.blast/maxBlast*100)+'%',background:'linear-gradient(90deg, var(--orange), var(--red))'}})
                                        ),
                                        React.createElement('span',{style:{fontSize:9,color:'var(--t3)',minWidth:50,textAlign:'right'}},h.blast,' files')
                                    );
                                })
                            ),
                            React.createElement('div',{className:'pr-impact-card',style:{marginTop:16}},
                                React.createElement('div',{className:'pr-impact-card-title'},iconLabel('folder','Changed Files')),
                                React.createElement('div',{className:'pr-files-list'},
                                    prData.files&&prData.files.slice(0,20).map(function(f: any, i: any){
                                        var existing=data&&(data as any).files.find(function(df: any){return df.path===f.filename;});
                                        var blast=existing?calcBlast(f.filename,(data as any).connections,(data as any).files):null;
                                        var statusColor = f.status === 'added' ? 'var(--green)' : f.status === 'removed' ? 'var(--red)' : 'var(--blue)';
                                        return React.createElement('div',{key:i,className:'pr-file-row'},
                                            React.createElement('div',{className:'pr-file-status',style:{background:statusColor}}),
                                            React.createElement('div',{className:'pr-file-info'},
                                                React.createElement('div',{className:'pr-file-path'},f.filename.split('/').pop()),
                                                React.createElement('div',{className:'pr-file-folder'},f.filename.includes('/')?f.filename.substring(0,f.filename.lastIndexOf('/')):'root')
                                            ),
                                            React.createElement('div',{className:'pr-file-badges'},
                                                f.additions>0&&React.createElement('span',{className:'pr-mini-badge',style:{background:'rgba(34,197,94,0.2)',color:'var(--green)'}},'+',f.additions),
                                                f.deletions>0&&React.createElement('span',{className:'pr-mini-badge',style:{background:'rgba(255,95,95,0.2)',color:'var(--red)'}},'-',f.deletions),
                                                blast&&React.createElement('span',{className:'pr-mini-badge',style:{background:blast.level==='low'?'rgba(34,197,94,0.2)':blast.level==='medium'?'rgba(255,159,67,0.2)':'rgba(255,95,95,0.2)',color:blast.level==='low'?'var(--green)':blast.level==='medium'?'var(--orange)':'var(--red)'}},React.createElement(Icon,{name:'impact',size:'s'}),' ',blast.count)
                                            )
                                        );
                                    }),
                                    prData.files&&prData.files.length>20&&React.createElement('div',{style:{textAlign:'center',padding:8,fontSize:10,color:'var(--t3)'}},'+',prData.files.length-20,' more files')
                                )
                            )
                        );
                    })()
                )
            )
        ),
        drillDown&&React.createElement('div',{className:'modal-overlay',onClick:function(){setDrillDown(null);}},
            React.createElement('div',{className:'modal',onClick:function(e: any){e.stopPropagation();},style:{maxWidth:600,maxHeight:'85vh',display:'flex',flexDirection:'column'}},
                React.createElement('div',{className:'modal-header'},
                    React.createElement('div',{className:'modal-title'},
                        drillDown.type==='issue'?React.createElement(React.Fragment,null,React.createElement(StatusDot,{color:drillDown.data.type==='critical'?'var(--red)':'var(--orange)'}),' ',drillDown.data.title):
                        drillDown.type==='pattern'?iconLabel(drillDown.data.icon,drillDown.data.name,'m'):
                        drillDown.type==='security'?React.createElement(React.Fragment,null,React.createElement(StatusDot,{color:getSeverityColor(drillDown.data.severity)}),' ',drillDown.data.title):
                        drillDown.type==='duplicate'?iconLabel(drillDown.data.type==='code'?'copy':'note',(drillDown.data.type==='code'?'Similar Code':'Duplicate Name')+': '+drillDown.data.name,'m'):
                        'Details'
                    ),
                    React.createElement('button',{className:'modal-close',onClick:function(){setDrillDown(null);}},'×')
                ),
                React.createElement('div',{className:'modal-body',style:{overflowY:'auto',flex:1}},
                    // Issue drill-down
                    drillDown.type==='issue'&&React.createElement(React.Fragment,null,
                        React.createElement('div',{style:{background:'var(--bg0)',padding:12,borderRadius:8,marginBottom:16}},
                            React.createElement('div',{style:{fontSize:11,color:'var(--t2)'}},drillDown.data.desc)
                        ),
                        React.createElement('div',{style:{fontSize:12,fontWeight:600,marginBottom:12}},'All Affected Items (',drillDown.data.items?drillDown.data.items.length:0,')'),
                        drillDown.data.items&&drillDown.data.items.map(function(item: any, j: any){return React.createElement('div',{key:j,style:getAccentBlockStyle('rgba(0,255,157,0.28)','rgba(0,255,157,0.08)',{padding:12,marginBottom:8})},
                            React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},
                                React.createElement('div',{style:{fontWeight:600,fontSize:11}},item.name),
                                item.file&&React.createElement('div',{style:{display:'flex',gap:6}},
                                    React.createElement('button',{className:'view-file-btn',onClick:function(e: any){e.stopPropagation();openFilePreview(item.file,item.line);}},iconLabel('eye','View')),
                                    React.createElement('button',{style:{fontSize:9,padding:'4px 8px',background:'var(--acc)',color:'var(--bg0)',border:'none',borderRadius:4,cursor:'pointer'},onClick:function(e: any){e.stopPropagation();selectFile(item.file);setDrillDown(null);}},'Go to file →')
                                )
                            ),
                            item.file&&React.createElement('div',{style:{fontSize:10,color:'var(--t3)',marginTop:4,fontFamily:'monospace'}},item.file,item.line?' : '+item.line:''),
                            (item.lines||item.fns||item.imports||item.score)&&React.createElement('div',{style:{display:'flex',gap:12,marginTop:8}},
                                item.lines&&React.createElement('span',{style:{fontSize:9,color:'var(--purple)'}},item.lines,' lines'),
                                item.fns&&React.createElement('span',{style:{fontSize:9,color:'var(--orange)'}},item.fns,' functions'),
                                item.imports&&React.createElement('span',{style:{fontSize:9,color:'var(--blue)'}},item.imports,' imports'),
                                item.score&&React.createElement('span',{style:{fontSize:9,color:'var(--red)'}},'Complexity: ',item.score)
                            ),
                            item.code&&React.createElement('pre',{style:{fontSize:9,background:'var(--bg2)',padding:8,borderRadius:4,marginTop:8,overflow:'auto',maxHeight:100,fontFamily:'monospace'}},item.code),
                            item.suggestion&&React.createElement('div',{style:{fontSize:10,color:'var(--acc)',marginTop:8,padding:'6px 8px',background:'var(--bg2)',borderRadius:4}},React.createElement(Icon,{name:'spark',size:'s'}),' ',item.suggestion),
                            // For items with nested files (like duplicates)
                            item.files&&React.createElement('div',{style:{marginTop:8}},
                                React.createElement('div',{style:{fontSize:9,color:'var(--t3)',marginBottom:4}},'Locations:'),
                                item.files.map(function(f: any, k: any){return React.createElement('div',{key:k,style:{fontSize:9,color:'var(--t2)',padding:'4px 8px',background:'var(--bg2)',borderRadius:4,marginBottom:4,display:'flex',justifyContent:'space-between',alignItems:'center'}},
                                    React.createElement('span',{style:{fontFamily:'monospace',cursor:'pointer',flex:1},onClick:function(){selectFile(f.file||f);setDrillDown(null);}},typeof f==='string'?f.split('/').pop():(f.file||'').split('/').pop(),f.line?' :'+f.line:''),
                                    React.createElement('div',{style:{display:'flex',gap:4}},
                                        React.createElement('button',{className:'view-file-btn',onClick:function(e: any){e.stopPropagation();openFilePreview(f.file||f,f.line);}},React.createElement(Icon,{name:'eye',size:'s'})),
                                        React.createElement('span',{style:{color:'var(--acc)',cursor:'pointer'},onClick:function(){selectFile(f.file||f);setDrillDown(null);}},'→')
                                    )
                                );})
                            )
                        );})
                    ),
                    // Pattern drill-down
                    drillDown.type==='pattern'&&React.createElement(React.Fragment,null,
                        React.createElement('div',{style:{background:'var(--bg0)',padding:12,borderRadius:8,marginBottom:16}},
                            React.createElement('div',{style:{fontSize:11,color:'var(--t2)'}},drillDown.data.desc),
                            drillDown.data.isAnti&&React.createElement('div',{style:{marginTop:8}},React.createElement('span',{className:'badge badge-danger'},'Anti-pattern'))
                        ),
                        drillDown.data.metrics&&React.createElement('div',{style:{display:'flex',gap:12,marginBottom:16}},
                            Object.entries(drillDown.data.metrics).map(function(e: any){return React.createElement('div',{key:e[0],style:{background:'var(--bg0)',padding:12,borderRadius:8,textAlign:'center',flex:1}},
                                React.createElement('div',{style:{fontSize:20,fontWeight:600,color:'var(--acc)'}},e[1]),
                                React.createElement('div',{style:{fontSize:9,color:'var(--t3)',textTransform:'capitalize'}},e[0])
                            );})
                        ),
                        React.createElement('div',{style:{fontSize:12,fontWeight:600,marginBottom:12}},'All Files (',drillDown.data.files.length,')'),
                        drillDown.data.files.map(function(f: any, j: any){return React.createElement('div',{key:j,style:getAccentBlockStyle('rgba(0,255,157,0.28)','rgba(0,255,157,0.08)',{padding:12,marginBottom:8})},
                            React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},
                                React.createElement('div',{style:{fontWeight:600,fontSize:11,cursor:'pointer'},onClick:function(){selectFile(f.path);setDrillDown(null);}},f.name),
                                React.createElement('button',{className:'view-file-btn',onClick:function(e: any){e.stopPropagation();openFilePreview(f.path);}},iconLabel('eye','View'))
                            ),
                            React.createElement('div',{style:{fontSize:10,color:'var(--t3)',marginTop:4,fontFamily:'monospace',cursor:'pointer'},onClick:function(){selectFile(f.path);setDrillDown(null);}},f.path),
                            f.fns&&React.createElement('div',{style:{fontSize:10,color:'var(--orange)',marginTop:4}},f.fns,' functions'),
                            f.lines&&React.createElement('div',{style:{fontSize:10,color:'var(--purple)',marginTop:4}},f.lines,' lines')
                        );})
                    ),
                    // Security drill-down
                    drillDown.type==='security'&&React.createElement(React.Fragment,null,
                        React.createElement('div',{style:drillDown.data.severity==='high'
                            ? getAccentBlockStyle('rgba(255,95,95,0.36)','rgba(255,95,95,0.1)',{padding:12,marginBottom:16})
                            : drillDown.data.severity==='medium'
                                ? getAccentBlockStyle('rgba(255,159,67,0.34)','rgba(255,180,100,0.1)',{padding:12,marginBottom:16})
                                : getAccentBlockStyle('rgba(77,159,255,0.34)','rgba(100,180,255,0.1)',{padding:12,marginBottom:16})},
                            React.createElement('div',{style:{fontSize:11,fontWeight:600,marginBottom:4}},drillDown.data.severity.toUpperCase()+' Severity'),
                            React.createElement('div',{style:{fontSize:11,color:'var(--t2)'}},drillDown.data.desc)
                        ),
                        React.createElement('div',{style:{fontSize:12,fontWeight:600,marginBottom:12}},'Location'),
                        React.createElement('div',{style:{background:'var(--bg0)',padding:12,borderRadius:8,marginBottom:16}},
                            React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},
                                React.createElement('div',{style:{fontWeight:600,fontSize:11,cursor:'pointer'},onClick:function(){selectFile(drillDown.data.path);setDrillDown(null);}},drillDown.data.file),
                                React.createElement('button',{className:'view-file-btn',onClick:function(e: any){e.stopPropagation();openFilePreview(drillDown.data.path,drillDown.data.line);}},iconLabel('eye','View'))
                            ),
                            React.createElement('div',{style:{fontSize:10,color:'var(--t3)',marginTop:4,fontFamily:'monospace',cursor:'pointer'},onClick:function(){selectFile(drillDown.data.path);setDrillDown(null);}},drillDown.data.path),
                            drillDown.data.line&&React.createElement('div',{style:{fontSize:10,color:'var(--orange)',marginTop:4}},'Line ',drillDown.data.line)
                        ),
                        drillDown.data.code&&React.createElement(React.Fragment,null,
                            React.createElement('div',{style:{fontSize:12,fontWeight:600,marginBottom:12}},'Code'),
                            React.createElement('pre',{style:{background:'var(--bg0)',padding:12,borderRadius:8,fontSize:10,fontFamily:'monospace',overflow:'auto',whiteSpace:'pre-wrap',wordBreak:'break-all'}},drillDown.data.code)
                        ),
                        React.createElement('div',{style:{fontSize:12,fontWeight:600,marginBottom:12,marginTop:16}},'How to Fix'),
                        React.createElement('div',{style:{background:'var(--bg0)',padding:12,borderRadius:8,fontSize:10}},
                            drillDown.data.title==='Hardcoded Secret'?'Move credentials to environment variables (process.env) or a secrets manager like AWS Secrets Manager, HashiCorp Vault, or .env files (not committed to git).':
                            drillDown.data.title==='SQL Injection Risk'?'Use parameterized queries or prepared statements. Never concatenate user input directly into SQL strings.':
                            drillDown.data.title==='XSS Vulnerability'?'Sanitize user input before rendering. Use textContent instead of innerHTML, or use a sanitization library like DOMPurify.':
                            drillDown.data.title==='Dynamic Code Execution'?'Avoid eval() entirely. Use JSON.parse() for JSON, or Function constructor only with trusted input.':
                            'Review the flagged code and apply security best practices.'
                        )
                    ),
                    // Duplicate drill-down
                    drillDown.type==='duplicate'&&React.createElement(React.Fragment,null,
                        React.createElement('div',{style:{background:'var(--bg0)',padding:12,borderRadius:8,marginBottom:16}},
                            React.createElement('div',{style:{fontSize:11,color:'var(--t2)'}},drillDown.data.suggestion)
                        ),
                        React.createElement('div',{style:{fontSize:12,fontWeight:600,marginBottom:12}},'All Locations (',drillDown.data.files.length,')'),
                        drillDown.data.files.map(function(f: any, j: any){return React.createElement('div',{key:j,style:drillDown.data.type==='code'
                            ? getAccentBlockStyle('rgba(167,139,250,0.34)','rgba(167,139,250,0.08)',{padding:12,marginBottom:8})
                            : getAccentBlockStyle('rgba(255,159,67,0.34)','rgba(255,159,67,0.08)',{padding:12,marginBottom:8})},
                            React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},
                                React.createElement('div',{style:{fontWeight:600,fontSize:11,cursor:'pointer'},onClick:function(){selectFile(f.file);setDrillDown(null);}},f.name||drillDown.data.name),
                                React.createElement('button',{className:'view-file-btn',onClick:function(e: any){e.stopPropagation();openFilePreview(f.file,f.line);}},iconLabel('eye','View'))
                            ),
                            React.createElement('div',{style:{fontSize:10,color:'var(--t3)',marginTop:4,fontFamily:'monospace',cursor:'pointer'},onClick:function(){selectFile(f.file);setDrillDown(null);}},f.file),
                            f.line&&React.createElement('div',{style:{fontSize:10,color:'var(--orange)',marginTop:4}},'Line ',f.line)
                        );}),
                        React.createElement('div',{style:{fontSize:12,fontWeight:600,marginBottom:12,marginTop:16}},'Suggested Action'),
                        React.createElement('div',{style:{background:'var(--bg0)',padding:12,borderRadius:8,fontSize:10}},
                            drillDown.data.type==='code'?'Extract the similar code into a shared utility function. This reduces maintenance burden and ensures consistent behavior.':
                            'Consider renaming these functions to be more specific, or consolidate them into a single shared function if they serve the same purpose.'
                        )
                    )
                )
            )
        ),
        showPrivacy&&React.createElement('div',{className:'modal-overlay',onClick:function(){setShowPrivacy(false);}},
            React.createElement('div',{className:'modal privacy-modal',onClick:function(e: any){e.stopPropagation();}},
                React.createElement('div',{className:'modal-header'},React.createElement('div',{className:'modal-title'},iconLabel('lock','Privacy & Security','m')),React.createElement('button',{className:'modal-close',onClick:function(){setShowPrivacy(false);}},'×')),
                React.createElement('div',{className:'modal-body'},
                    React.createElement('div',{className:'privacy-item'},
                        React.createElement('div',{className:'privacy-icon'},React.createElement(Icon,{name:'globe',size:'l'})),
                        React.createElement('div',null,React.createElement('div',{className:'privacy-title'},'100% Browser-Based'),React.createElement('div',{className:'privacy-text'},'CodeFlow runs entirely in your browser. No backend servers, no data collection.'))
                    ),
                    React.createElement('div',{className:'privacy-item'},
                        React.createElement('div',{className:'privacy-icon'},React.createElement(Icon,{name:'key',size:'l'})),
                        React.createElement('div',null,React.createElement('div',{className:'privacy-title'},'Your Token Stays Local'),React.createElement('div',{className:'privacy-text'},'Your GitHub token is stored only in your browser\'s memory. It\'s never saved, logged, or transmitted anywhere except directly to GitHub\'s API.'))
                    ),
                    React.createElement('div',{className:'privacy-item'},
                        React.createElement('div',{className:'privacy-icon'},React.createElement(Icon,{name:'share',size:'l'})),
                        React.createElement('div',null,React.createElement('div',{className:'privacy-title'},'Direct API Calls'),React.createElement('div',{className:'privacy-text'},'All GitHub API calls go directly from your browser to api.github.com. We have no proxy, no middleware, no way to intercept your (data as any).'))
                    ),
                    React.createElement('div',{className:'privacy-item'},
                        React.createElement('div',{className:'privacy-icon'},React.createElement(Icon,{name:'ban',size:'l'})),
                        React.createElement('div',null,React.createElement('div',{className:'privacy-title'},'Nothing Persisted'),React.createElement('div',{className:'privacy-text'},'Close the tab and everything is gone. No cookies, no local storage, no tracking. Check the source code - it\'s all in one HTML file!'))
                    ),
                    React.createElement('div',{style:{marginTop:16,padding:12,background:'var(--accbg)',borderRadius:8,fontSize:10,color:'var(--t1)'}},
                        React.createElement(Icon,{name:'spark',size:'s'}),
                        ' Tip: Create a ',
                        React.createElement('a',{href:'https://github.com/settings/tokens',target:'_blank',rel:'noopener',style:{color:'var(--acc)'}},'Personal Access Token'),
                        ' with only "public_repo" scope for extra peace of mind when analyzing public repositories.'
                    )
                ),
                React.createElement('div',{className:'modal-footer'},
                    React.createElement('button',{className:'top-btn primary',onClick:function(){setShowPrivacy(false);}},'Got it!')
                )
            )
        ),
        showKeyModal&&React.createElement('div',{className:'modal-overlay',onClick:function(){setShowKeyModal(false);}},
            React.createElement('div',{className:'modal key-modal',onClick:function(e: any){e.stopPropagation();}},
                React.createElement('div',{className:'modal-header'},React.createElement('div',{className:'modal-title'},iconLabel('key','GitHub App Private Key','m')),React.createElement('button',{className:'modal-close',onClick:function(){setShowKeyModal(false);}},'×')),
                React.createElement('div',{className:'modal-body'},
                    React.createElement('div',{className:'key-info'},
                        'Paste the private key from your GitHub App. This key is stored only in memory and never leaves your browser.',
                        React.createElement('br'),React.createElement('br'),
                        'To get a private key:',React.createElement('br'),
                        '1. Go to GitHub → Settings → Developer settings → GitHub Apps',React.createElement('br'),
                        '2. Select your app → Generate a private key',React.createElement('br'),
                        '3. Open the downloaded ',React.createElement('code',null,'.pem'),' file and paste its contents below'
                    ),
                    React.createElement('div',{className:'form-group'},
                        React.createElement('label',{className:'form-label'},'Private Key (PEM format)'),
                        React.createElement('textarea',{className:'form-input',placeholder:'-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----',value:privateKey,onChange:function(e: any){setPrivateKey(e.target.value);},rows:10})
                    )
                ),
                React.createElement('div',{className:'modal-footer'},
                    privateKey&&React.createElement('button',{className:'top-btn',onClick:function(){setPrivateKey('');},style:{marginRight:'auto'}},'Clear Key'),
                    React.createElement('button',{className:'top-btn',onClick:function(){setShowKeyModal(false);}},'Cancel'),
                    React.createElement('button',{className:'top-btn primary',onClick:function(){setShowKeyModal(false);}},'Save')
                )
            )
        ),
        showUnused&&data&&(data as any).deadFunctions&&React.createElement('div',{className:'modal-overlay',onClick:function(){setShowUnused(false);}},
            React.createElement('div',{className:'modal',style:{maxWidth:650,maxHeight:'85vh'},onClick:function(e: any){e.stopPropagation();}},
                React.createElement('div',{className:'modal-header'},React.createElement('div',{className:'modal-title'},iconLabel('warning','Unused Functions','m')),React.createElement('button',{className:'modal-close',onClick:function(){setShowUnused(false);}},'×')),
                React.createElement('div',{className:'modal-body',style:{maxHeight:'70vh',overflowY:'auto'}},
                    React.createElement('div',{className:'unused-summary'},
                        React.createElement('div',{className:'unused-summary-item'},
                            React.createElement('div',{className:'unused-summary-value'},(data as any).deadFunctions.length),
                            React.createElement('div',{className:'unused-summary-label'},'Dead Functions')
                        ),
                        React.createElement('div',{className:'unused-summary-item'},
                            React.createElement('div',{className:'unused-summary-value'},(data as any).deadFunctions.reduce(function(s: any, f: any){return s+f.codeLines;},0)),
                            React.createElement('div',{className:'unused-summary-label'},'Dead Lines')
                        ),
                        React.createElement('div',{className:'unused-summary-item'},
                            React.createElement('div',{className:'unused-summary-value'},[...new Set((data as any).deadFunctions.map(function(f: any){return f.file;}))].length),
                            React.createElement('div',{className:'unused-summary-label'},'Files Affected')
                        )
                    ),
                    React.createElement('div',{style:Object.assign(getAccentBlockStyle('rgba(255,159,67,0.34)','rgba(255,159,67,0.08)'),{fontSize:10,color:'var(--t3)',marginBottom:12,padding:'8px 12px',borderRadius:6})},'These functions have zero calls from other files or within their own file. They are likely dead code that can be safely removed.'),
                    (data as any).deadFunctions.map(function(fn: any, i: any){
                        var isExpanded=expandedFns.has('dead-'+fn.name);
                        return React.createElement('div',{key:i,className:'unused-fn'},
                            React.createElement('div',{className:'unused-fn-header',onClick:function(){toggleFn('dead-'+fn.name);}},
                                React.createElement('div',null,
                                    React.createElement('span',{className:'unused-fn-name'},fn.name,'()'),
                                    React.createElement('div',{className:'unused-fn-path'},
                                        React.createElement('span',null,React.createElement(Icon,{name:'folder',size:'s'}),' ',fn.folder||'root'),
                                        React.createElement('span',null,'→'),
                                        React.createElement('span',{className:'unused-fn-file',onClick:function(e: any){e.stopPropagation();selectFile(fn.file);setShowUnused(false);}},fn.file.split('/').pop())
                                    )
                                ),
                                React.createElement('div',{className:'unused-fn-meta'},
                                    React.createElement('button',{className:'view-file-btn',onClick:function(e: any){e.stopPropagation();openFilePreview(fn.file,fn.line);},title:'View source'},React.createElement(Icon,{name:'eye',size:'s'})),
                                    React.createElement('span',{className:'unused-fn-lines'},fn.codeLines,' lines'),
                                    fn.line&&React.createElement('span',{className:'unused-fn-loc'},'L',fn.line),
                                    React.createElement('span',{style:{fontSize:10,color:'var(--t3)'}},isExpanded?'▼':'▶')
                                )
                            ),
                            isExpanded&&fn.code&&React.createElement('div',{className:'unused-fn-preview'},
                                React.createElement('div',{className:'unused-fn-code'},fn.code)
                            )
                        );
                    })
                ),
                React.createElement('div',{className:'modal-footer',style:{display:'flex',gap:8}},
                    React.createElement('button',{className:'top-btn',onClick:function(){(data as any).deadFunctions.forEach(function(fn: any){expandedFns.add('dead-'+fn.name);});setExpandedFns(new Set(expandedFns));}},'Expand All'),
                    React.createElement('button',{className:'top-btn',onClick:function(){setExpandedFns(new Set());}},'Collapse All'),
                    React.createElement('button',{className:'top-btn primary',onClick:function(){setShowUnused(false);}},'Close')
                )
            )
        ),
        confirmDialog&&(function(){
            var tone=getDialogTone(confirmDialog.tone);
            return React.createElement('div',{className:'modal-overlay',style:{zIndex:1200},onClick:function(){closeConfirmDialog(false);}},
                React.createElement('div',{className:'modal confirm-modal',onClick:function(e: any){e.stopPropagation();}},
                    React.createElement('div',{className:'modal-body'},
                        React.createElement('div',{className:'confirm-content'},
                            React.createElement('div',{className:'confirm-icon',style:{color:tone.color,background:tone.background,border:'1px solid '+tone.borderColor}},
                                React.createElement(Icon,{name:confirmDialog.icon||'warning',size:'l'})
                            ),
                            React.createElement('div',{className:'confirm-copy'},
                                React.createElement('div',{className:'confirm-title'},confirmDialog.title),
                                React.createElement('div',{className:'confirm-message'},confirmDialog.message)
                            )
                        )
                    ),
                    React.createElement('div',{className:'modal-footer'},
                        React.createElement('button',{className:'top-btn',onClick:function(){closeConfirmDialog(false);}},confirmDialog.cancelLabel||'Cancel'),
                        React.createElement('button',{className:'top-btn primary',style:{background:tone.color,borderColor:tone.color,color:'var(--bg0)'},onClick:function(){closeConfirmDialog(true);}},confirmDialog.confirmLabel||'Continue')
                    )
                )
            );
        })(),
        toast&&React.createElement('div',{className:'toast '+(toast.type||'success'),'role':'alert'},toast.msg),
        filePreview&&React.createElement('div',{className:'file-preview-overlay',onClick:function(){setFilePreview(null);}},
            React.createElement('div',{className:'file-preview-modal',onClick:function(e: any){e.stopPropagation();}},
                React.createElement('div',{className:'file-preview-header'},
                    React.createElement('div',{className:'file-preview-title'},
                        React.createElement('span',{className:'file-preview-icon'},React.createElement(Icon,{name:getFilePreviewIconName(filePreview.filename),size:'l'})),
                        React.createElement('span',{className:'file-preview-name'},filePreview.filename),
                        React.createElement('span',{className:'file-preview-path'},filePreview.path)
                    ),
                    React.createElement('div',{className:'file-preview-actions'},
                        filePreview.line&&React.createElement('span',{className:'file-preview-line-badge'},'Line ',filePreview.line),
                        React.createElement('button',{className:'file-preview-close',onClick:function(){setFilePreview(null);}},'×')
                    )
                ),
                React.createElement('div',{className:'file-preview-content',ref:filePreviewRef},
                    filePreview.loading?React.createElement('div',{className:'file-preview-loading'},
                        React.createElement('div',{className:'spinner'}),
                        React.createElement('div',{className:'file-preview-loading-text'},'Loading file...')
                    ):filePreview.error?React.createElement('div',{className:'file-preview-error'},
                        React.createElement(Icon,{name:'warning',size:'xxl',className:'file-preview-error-icon'}),
                        React.createElement('div',null,filePreview.error)
                    ):filePreview.content?React.createElement('pre',{className:'file-preview-code'},
                        highlightSyntax(filePreview.content,filePreview.filename).map(function(lineHtml: any, i: any){
                            var lineNum=i+1;
                            var isHighlighted=filePreview.line&&lineNum===filePreview.line;
                            return React.createElement('div',{key:i,className:'file-preview-line'+(isHighlighted?' highlighted':'')},
                                React.createElement('span',{className:'file-preview-linenum'},lineNum),
                                React.createElement('span',{className:'file-preview-text',dangerouslySetInnerHTML:{__html:lineHtml||' '}})
                            );
                        })
                    ):null
                )
            )
        ),
        error&&React.createElement('div',{style:{position:'fixed',bottom:20,right:20,background:'var(--red)',color:'white',padding:'12px 20px',borderRadius:8,zIndex:1000,maxWidth:350},'role':'alert'},
            React.createElement('span',{key:'msg'},error),
            React.createElement('button',{key:'btn','aria-label':'Dismiss error','onClick':function(){setError(null);},style:{marginLeft:12,background:'none',border:'none',color:'white',cursor:'pointer',fontSize:16}},'×')
        ),
        showBranchDiff&&repoInfo&&React.createElement(BranchDiff,{
            owner:repoInfo.owner,
            repo:repoInfo.repo,
            branches:branches,
            currentBranch:currentBranch,
            onClose:function(){setShowBranchDiff(false);}
        }),
        showDbSchema&&React.createElement('div',{className:'db-schema-overlay',onClick:function(){setShowDbSchema(false);}},
            React.createElement('div',{className:'db-schema-modal',onClick:function(e: any){e.stopPropagation();}},
                // Header
                React.createElement('div',{className:'db-schema-header'},
                    React.createElement('div',{className:'db-schema-title'},
                        React.createElement(Icon,{name:'database',size:'l'}),
                        'Database Schema',
                        dbSchema&&React.createElement('span',{className:'db-schema-badge'},dbSchema.source.toUpperCase()),
                        dbSchema&&dbSchema.tables.length>0&&React.createElement('div',{className:'db-schema-stats',style:{marginLeft:12}},
                            React.createElement('span',{className:'db-schema-stat-pill'},React.createElement('strong',null,dbSchema.tables.length),' tables'),
                            React.createElement('span',{className:'db-schema-stat-pill'},React.createElement('strong',null,dbSchema.tables.reduce(function(s: any,t: any){return s+t.columns.length;},0)),' columns'),
                            React.createElement('span',{className:'db-schema-stat-pill'},React.createElement('strong',null,dbSchema.relations.length),' relations')
                        )
                    ),
                    React.createElement('button',{className:'db-schema-close',onClick:function(){setShowDbSchema(false);}},'×')
                ),
                // Toolbar
                !dbSchema?null:React.createElement('div',{className:'db-schema-toolbar'},
                    React.createElement('input',{className:'db-schema-search',placeholder:'Search tables or columns...',value:dbSearchQuery,onChange:function(e: any){setDbSearchQuery(e.target.value);setSelectedDbTable(null);},autoFocus:true}),
                    dbAppOptions.length?React.createElement('select',{className:'db-schema-search',value:dbAppFilter,onChange:function(e: any){setDbAppFilter(e.target.value);setSelectedDbTable(null);},style:{maxWidth:160}},
                        React.createElement('option',{value:'all'},'All apps'),
                        dbAppOptions.map(function(app: any){return React.createElement('option',{key:app,value:app},app);})
                    ):null,
                    React.createElement('div',{style:{display:'flex',gap:4,marginLeft:'auto',alignItems:'center'}},
                        React.createElement('button',{onClick:function(){setDbViewMode('table');},style:{padding:'3px 10px',fontSize:11,borderRadius:4,border:'1px solid var(--border)',background:dbViewMode==='table'?'var(--accent)':'transparent',color:dbViewMode==='table'?'white':'var(--t2)',cursor:'pointer'}},'⊞ Table'),
                        React.createElement('button',{onClick:function(){setDbViewMode('flow');},style:{padding:'3px 10px',fontSize:11,borderRadius:4,border:'1px solid var(--border)',background:dbViewMode==='flow'?'var(--accent)':'transparent',color:dbViewMode==='flow'?'white':'var(--t2)',cursor:'pointer'}},'◈ Flow'),
                        React.createElement('span',{style:{fontSize:10,color:'var(--t3)',marginLeft:8}},
                            dbSchema.files.length,' schema file'+(dbSchema.files.length!==1?'s':''),' analyzed'
                        )
                    )
                ),
                // Body
                !dbSchema?React.createElement('div',{style:{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:16,flexDirection:'column',color:'var(--t2)'}},
                    React.createElement('div',{className:'spinner',style:{width:32,height:32,borderWidth:2}}),
                    React.createElement('div',{style:{fontSize:12}},'Parsing schema files...')
                ):dbSchema.tables.length===0?React.createElement('div',{className:'db-schema-empty'},
                    React.createElement('div',{className:'db-schema-empty-icon'},'🗄️'),
                    React.createElement('div',{className:'db-schema-empty-title'},'No Tables Found'),
                    React.createElement('div',{className:'db-schema-empty-desc'},'No SQL tables, Django models, Prisma models, or SQLAlchemy entities were detected in the scanned files.')
                ):dbViewMode==='flow'?React.createElement('div',{style:{flex:1,minHeight:0,padding:'1rem'}},
                    React.createElement(ERDiagramGraph,{schema:dbSchemaToFlowSchema(filteredDbSchema||dbSchema),selectedTable:selectedDbTable})
                ):React.createElement('div',{className:'db-schema-body'},
                    // Sidebar
                    React.createElement('div',{className:'db-schema-sidebar'},
                        React.createElement('div',{className:'db-schema-sidebar-title'},'Tables'),
                        (filteredDbSchema||dbSchema).tables.map(function(t: any){
                            return React.createElement('div',{
                                key:t.name,
                                className:'db-table-nav-item'+(selectedDbTable===t.name?' active':''),
                                onClick:function(){setSelectedDbTable(t.name);}
                            },
                                React.createElement('span',null,t.name),
                                React.createElement('span',{className:'db-table-nav-count'},t.columns.length)
                            );
                        })
                    ),
                    // Canvas
                    React.createElement('div',{className:'db-schema-canvas'},
                        React.createElement('div',{className:'db-tables-grid'},
                            (filteredDbSchema||dbSchema).tables.slice(0,120).map(function(t: any){
                                var relCount=(filteredDbSchema||dbSchema).relations.filter(function(r: any){return r.fromTable===t.name||r.toTable===t.name;}).length;
                                return React.createElement('div',{key:t.name,className:'db-table-card'+(selectedDbTable===t.name?' selected':'')},
                                    React.createElement('div',{className:'db-table-header',onClick:function(){setSelectedDbTable(function(prev: any){return prev===t.name?null:t.name;});}},
                                        React.createElement('span',{className:'db-table-icon'},'⊞'),
                                        React.createElement('span',{className:'db-table-name'},t.name),
                                        React.createElement('span',{className:'db-table-file',title:t.file},t.file.split('/').pop())
                                    ),
                                    React.createElement('div',{className:'db-table-cols'},
                                        t.columns.map(function(col: any,ci: any){
                                            return React.createElement('div',{key:ci,className:'db-col-row'},
                                                React.createElement('div',{className:'db-col-key'},
                                                    col.isPrimaryKey&&React.createElement('span',{className:'db-key-badge db-key-pk',title:'Primary Key'},'PK'),
                                                    col.isForeignKey&&!col.isPrimaryKey&&React.createElement('span',{className:'db-key-badge db-key-fk',title:'Foreign Key'},'FK'),
                                                    col.isUnique&&!col.isPrimaryKey&&React.createElement('span',{className:'db-key-badge db-key-uk',title:'Unique'},'UK'),
                                                    col.isIndexed&&!col.isPrimaryKey&&!col.isForeignKey&&React.createElement('span',{className:'db-key-badge db-key-idx',title:'Indexed'},'IDX')
                                                ),
                                                React.createElement('span',{className:'db-col-name'},col.name),
                                                React.createElement('span',{className:'db-col-type'},col.type),
                                                col.isNullable&&React.createElement('span',{className:'db-col-nullable'},'null'),
                                                col.references&&React.createElement('span',{style:{fontSize:8,color:'var(--blue)',marginLeft:4},title:'→ '+col.references.table+'.'+col.references.column},'→'+col.references.table)
                                            );
                                        })
                                    ),
                                    React.createElement('div',{className:'db-table-footer'},
                                        React.createElement('span',{className:'db-table-stat'},React.createElement('strong',null,t.columns.length),' columns'),
                                        relCount>0&&React.createElement('span',{className:'db-relation-badge',title:'Related tables'},relCount+' relation'+(relCount!==1?'s':''))
                                    )
                                );
                            })
                        )
                    )
                )
            )
        )
    );
}
