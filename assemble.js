const fs = require('fs');
const transformed = fs.readFileSync('WorkspaceArea.transformed.tsx', 'utf8');
const imports = `import * as d3 from 'd3';
import * as d3Sankey from 'd3-sankey';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Icon } from '../components/ui/Icon';
import { StatusDot } from '../components/ui/StatusDot';
import { HealthRing } from '../components/ui/HealthRing';
import { TreeNode } from '../components/ui/TreeNode';
import { Parser, COLORS, LAYER_COLORS, IGNORE, DEFAULT_EXCLUDE_CHIPS, compileExcludePatterns, parseExcludePatterns, shouldExcludeFile, shouldIgnoreDirectory, getSeverityColor, getAccentBlockStyle, getFilePreviewIconName, getDialogTone, buildAppUrl, formatSize, formatDate, getLanguageIcon, renderTooltipHtml, escapeHtml } from '../lib/parser';
import { GitHub, buildTree, calcBlast, calcHealth, calcPRRisk, findSuggestedReviewers, findTestImpact, findDependencyChains } from '../lib/github';

function iconLabel(name, label, size, className) {
    return React.createElement(React.Fragment, null,
        React.createElement(Icon, { name: name, size: size || 's', className: className } as any),
        ' ',
        label
    );
}

`;
fs.writeFileSync('client/src/pages/WorkspaceArea.tsx', imports + transformed);
console.log('Successfully assembled WorkspaceArea.tsx');
