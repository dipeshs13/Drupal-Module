(function ($, Drupal, once) {
    'use strict';

    // ============================================================
    // PERSISTENCE CONSTANTS
    // ============================================================
    const STORAGE_KEY = 'wcag_contrast_fixes';      
    const DRUPAL_SAVE_ENDPOINT = '/wcag/save-fixes'; 
    const DRUPAL_LOAD_ENDPOINT = '/wcag/get-fixes';  
    const USE_SERVER_PERSISTENCE = false;            

    // ============================================================
    // PERSISTENCE HELPERS
    // ============================================================

    const buildElementKey = function (el) {
        const parts = [];
        let current = el;
        while (current && current !== document.body) {
            let tag = current.tagName.toLowerCase();
            const parent = current.parentElement;
            if (parent) {
                const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
                if (siblings.length > 1) {
                    const idx = siblings.indexOf(current) + 1;
                    tag += `:nth-of-type(${idx})`;
                }
            }
            if (current.id && !current.id.startsWith('wcag')) {
                parts.unshift(`#${current.id}`);
                break; 
            }
            parts.unshift(tag);
            current = parent;
        }
        return parts.join('>');
    };

    const saveFixesToStorage = function (fixesMap) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(fixesMap));
        } catch (e) {
            console.warn('[WCAG] localStorage unavailable:', e);
        }
    };

    const loadFixesFromStorage = function () {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            console.warn('[WCAG] Could not read localStorage:', e);
            return {};
        }
    };

    const clearFixesFromStorage = function () {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) {
            console.warn('[WCAG] Could not clear localStorage:', e);
        }
    };

    const restoreSavedFixes = function () {
        const fixesMap = loadFixesFromStorage();
        if (!Object.keys(fixesMap).length) return;
        Object.entries(fixesMap).forEach(function ([cssPath, data]) {
            try {
                const el = document.querySelector(cssPath);
                if (el) {
                    if (!$(el).attr('data-orig-color')) {
                        $(el).attr('data-orig-color', data.original);
                    }
                    $(el).css({ 'color': data.fixed, 'text-decoration': '' });
                }
            } catch (e) {}
        });
    };

    // ============================================================
    // MAIN BEHAVIOR
    // ============================================================

    Drupal.behaviors.wcagHelperSidebar = {
        attach: function (context) {

            // --- 1. INITIALIZE SIDEBAR & BUTTONS ---
            once('wcag-init', '#wcag-accessibility-sidebar', context).forEach(function (sidebar) {
                const $sidebar = $(sidebar);
                const $content = $sidebar.find('#wcag-sidebar-content');

                // Create global tooltip element for hover behavior
                if (!$('#wcag-hover-tooltip').length) {
                    $('body').append('<div id="wcag-hover-tooltip" style="position:fixed; z-index:999999; pointer-events:none; padding:6px 12px; border-radius:4px; font-family:monospace; font-size:12px; display:none; white-space:nowrap; box-shadow:0 2px 8px rgba(0,0,0,0.3); border:1px solid rgba(0,0,0,0.2); font-weight: bold;"></div>');
                }

                // --- GLOBAL HOVER LISTENER (UPDATED) ---
                $(document).on('mousemove', function(e) {
                    const $tooltip = $('#wcag-hover-tooltip');
                    const target = e.target;

                    if ($(target).closest('#wcag-accessibility-sidebar, #toolbar-administration, .toolbar, #wcag-hover-tooltip').length) {
                        $tooltip.hide();
                        return;
                    }

                    const $el = $(target);
                    const text = $el.text().trim();
                    if (text.length < 1 || $el.is(':empty')) {
                        $tooltip.hide();
                        return;
                    }

                    const style = window.getComputedStyle(target);
                    const fg = parseRGB(style.color);
                    const bg = parseRGB(getActualBackgroundColor(target));
                    const ratio = parseFloat(getContrastRatio(fg, bg));
                    const isLarge = isLargeText(target, style);
                    const threshold = isLarge ? 3 : 4.5;

                    // UPDATED LOGIC PER REQUEST
                    let message = "";
                    let bgColor = "#28a745"; 

                    const contrastMatches = (ratio >= 4.5);
                    const ratioMatches = (ratio >= threshold);

                    if (contrastMatches && ratioMatches) {
                        message = "Contrast and ratio are fine";
                        bgColor = "#28a745";
                    } else if (ratioMatches && !contrastMatches) {
                        message = "ratio matches but contrast is low";
                        bgColor = "#ff9800";
                    } else if (contrastMatches && !ratioMatches) {
                        message = "contrast matches but ratio is low";
                        bgColor = "#ff9800";
                    } else {
                        message = "Contrast and ratio don't match";
                        bgColor = "#e62117";
                    }

                    $tooltip.html(`<span>${message}</span> --- ${ratio}:1 ratio`)
                            .css({ background: bgColor, color: '#fff', display: 'block' });

                    $tooltip.css({
                        top: (e.clientY + 20) + 'px',
                        left: (e.clientX + 15) + 'px'
                    });
                });

                $(document).on('mouseleave', function() {
                    $('#wcag-hover-tooltip').hide();
                });

                // --- 1a. UPDATED SUMMARY STATS (Pill Style) ---
                if (!$('#wcag-summary-stats').length) {
                    const $statsBar = $(`
                        <div id="wcag-summary-stats" style="display:flex; justify-content:space-around; padding: 10px 0; margin-bottom: 15px; font-family: monospace; font-size: 13px;">
                            <div style="background: rgba(230, 33, 23, 0.1); color: #e62117; padding: 4px 16px; border-radius: 20px; border: 1px solid rgba(230, 33, 23, 0.3); display: flex; align-items: center; gap: 6px;">
                                <span style="width: 8px; height: 8px; background: #e62117; border-radius: 50%;"></span>
                                <span id="wcag-count-fail">0</span> Fail
                            </div>
                            <div style="background: rgba(255, 152, 0, 0.1); color: #ff9800; padding: 4px 16px; border-radius: 20px; border: 1px solid rgba(255, 152, 0, 0.3); display: flex; align-items: center; gap: 6px;">
                                <span style="width: 8px; height: 8px; background: #ff9800; border-radius: 50%;"></span>
                                <span id="wcag-count-large">0</span> AA-Large
                            </div>
                            <div style="background: rgba(40, 167, 69, 0.1); color: #28a745; padding: 4px 16px; border-radius: 20px; border: 1px solid rgba(40, 167, 69, 0.3); display: flex; align-items: center; gap: 6px;">
                                <span style="width: 8px; height: 8px; background: #28a745; border-radius: 50%;"></span>
                                <span id="wcag-count-pass">0</span> Pass
                            </div>
                        </div>
                    `);
                    $content.prepend($statsBar);
                }

                // --- 1b. ACTION BUTTONS ---
                if (!$('#wcag-action-buttons').length) {
                    const $btnContainer = $('<div id="wcag-action-buttons" style="display:flex; flex-direction:column; gap:8px; margin-bottom:15px; border-bottom:1px solid #444; padding-bottom:15px;"></div>');
                    const $scanBtn  = $('<button id="wcag-manual-scan"  style="background:#007bff; color:white; border:none; padding:10px; cursor:pointer; font-weight:bold; border-radius:4px;">SCAN PAGE CONTENT</button>');
                    const $fixBtn   = $('<button id="wcag-fix-contrast"  style="background:#28a745; color:white; border:none; padding:10px; cursor:pointer; font-weight:bold; border-radius:4px;">FIX ALL CONTRAST</button>');
                    const $resetBtn = $('<button id="wcag-reset-all"     style="background:#6c757d; color:white; border:none; padding:10px; cursor:pointer; font-weight:bold; border-radius:4px;">RESET ALL</button>');
                    const $wcagLink = $('<a href="https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html" target="_blank" style="font-size:11px; color:#007bff; text-decoration:none; margin-top:5px;">Understand WCAG 1.4.3 Contrast</a>');

                    $btnContainer.append($scanBtn, $fixBtn, $resetBtn, $wcagLink);
                    $('#wcag-summary-stats').after($btnContainer);

                    $scanBtn.on('click', function () {
                        $(this).text('SCANNING...').prop('disabled', true);
                        setTimeout(() => {
                            runFullAudit();
                            $(this).text('SCAN PAGE CONTENT').prop('disabled', false);
                        }, 150);
                    });

                    $fixBtn.on('click',   () => applyContrastFix());
                    $resetBtn.on('click', () => resetSiteStyles());
                }

                // --- 1c. THRESHOLDS & INDICATORS PANEL ---
                if (!$('#wcag-reference-panels').length) {
                    const $refPanels = $(`
                        <div id="wcag-reference-panels" style="margin-top: 20px; font-family: 'Courier New', monospace; font-size: 12px; color: #ccc;">
                            <div style="border-bottom: 1px solid #444; padding-bottom: 5px; margin-bottom: 10px; color: #888; font-weight: bold; font-size: 11px; letter-spacing: 1px;">WCAG 1.4.3 THRESHOLDS</div>
                            <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; background: #1e2227; padding: 8px 12px; border-radius: 6px; border: 1px solid #333;">
                                    <span>AA Normal Text</span>
                                    <span style="color: #e62117; font-weight: bold;">4.5 : 1</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: center; background: #1e2227; padding: 8px 12px; border-radius: 6px; border: 1px solid #333;">
                                    <span>AA Large Text (18pt+)</span>
                                    <span style="color: #ff9800; font-weight: bold;">3.0 : 1</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: center; background: #1e2227; padding: 8px 12px; border-radius: 6px; border: 1px solid #333;">
                                    <span>AAA Enhanced</span>
                                    <span style="color: #007bff; font-weight: bold;">7.0 : 1</span>
                                </div>
                            </div>
                            <div style="border-bottom: 1px solid #444; padding-bottom: 5px; margin-bottom: 10px; color: #888; font-weight: bold; font-size: 11px; letter-spacing: 1px;">VISUAL INDICATORS</div>
                            <div style="display: flex; flex-direction: column; gap: 10px; padding-left: 5px;">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <div style="width: 20px; height: 2px; background: #e62117; border-bottom: 1px dashed #e62117;"></div>
                                    <span>Wavy underline = contrast failure</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <div style="width: 18px; height: 12px; border: 2px solid #e62117; border-radius: 4px;"></div>
                                    <span>Red ring - AA fail</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <div style="width: 18px; height: 12px; border: 2px solid #28a745; border-radius: 4px;"></div>
                                    <span>Green ring - AA pass</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <div style="width: 18px; height: 12px; background: #ff4d4d; border-radius: 2px;"></div>
                                    <span>FIX button - one-click repair</span>
                                </div>
                            </div>
                        </div>
                    `);
                    $content.append($refPanels);
                }

                if (!$content.find('#wcag-issue-list').length) {
                    $content.append('<div id="wcag-issue-list" style="margin-top:20px;"></div>');
                }
            });

            once('wcag-toggle', '#wcag-sidebar-header', context).forEach(function (header) {
                $(header).on('click', function () {
                    $('#wcag-accessibility-sidebar').toggleClass('wcag-sidebar-minimized');
                });
            });

            once('wcag-restore', 'body', context).forEach(function () {
                restoreSavedFixes();
            });

            // --- 3. MATH & BACKGROUND HELPERS ---

            const getActualBackgroundColor = (el) => {
                const style = window.getComputedStyle(el);
                const bg = style.backgroundColor;
                if ((bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && el.parentElement) {
                    return getActualBackgroundColor(el.parentElement);
                }
                return (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') ? 'rgb(255, 255, 255)' : bg;
            };

            const lumCache = {};
            const getLuminance = (r, g, b) => {
                const key = `${r},${g},${b}`;
                if (lumCache[key] !== undefined) return lumCache[key];
                let a = [r, g, b].map(v => {
                    v /= 255;
                    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
                });
                const res = a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
                lumCache[key] = res;
                return res;
            };

            const getContrastRatio = (rgb1, rgb2) => {
                const lum1 = getLuminance(...rgb1) + 0.05;
                const lum2 = getLuminance(...rgb2) + 0.05;
                return (Math.max(lum1, lum2) / Math.min(lum1, lum2)).toFixed(2);
            };

            const parseRGB = (colorStr) => {
                const rgb = colorStr.match(/\d+/g);
                return rgb ? rgb.map(Number) : [255, 255, 255];
            };

            const isLargeText = (el, style) => {
                const fontSize   = parseFloat(style.fontSize);
                const fontWeight = style.fontWeight;
                const isBold     = fontWeight === 'bold' || parseInt(fontWeight) >= 700;
                return fontSize >= 24 || (fontSize >= 18.66 && isBold) || ['H1', 'H2', 'H3'].includes(el.tagName);
            };

            // --- 4. FIX & RESET FUNCTIONS ---

            const applyContrastFix = function () {
                const $targets = $('.ck-editor__editable, .ck-content, .region-content, .node__content, main article, #main-content').filter(':visible');
                const fixesMap = loadFixesFromStorage();
                $targets.find('p, h1, h2, h3, h4, h5, h6, a, span, li').each(function () {
                    const style     = window.getComputedStyle(this);
                    const fg        = parseRGB(style.color);
                    const bgStr     = getActualBackgroundColor(this);
                    const bg        = parseRGB(bgStr);
                    const ratio     = getContrastRatio(fg, bg);
                    const threshold = isLargeText(this, style) ? 3 : 4.5;
                    if (ratio < threshold) {
                        if (!$(this).attr('data-orig-color')) {
                            $(this).attr('data-orig-color', style.color);
                        }
                        const bgLum    = getLuminance(...bg);
                        const newColor = bgLum > 0.5 ? '#000000' : '#ffffff';
                        $(this).css({ 'color': newColor, 'text-decoration': '' });
                        const key = buildElementKey(this);
                        if (key) {
                            fixesMap[key] = { fixed: newColor, original: $(this).attr('data-orig-color') };
                        }
                    }
                });
                saveFixesToStorage(fixesMap);
                runFullAudit();
            };

            const resetSiteStyles = function () {
                const $targets = $('.ck-editor__editable, .ck-content, .region-content, .node__content, main article, #main-content').filter(':visible');
                $targets.find('[data-orig-color]').each(function () {
                    $(this).css('color', $(this).attr('data-orig-color')).removeAttr('data-orig-color');
                });
                $targets.find('p, h1, h2, h3, h4, h5, h6, a, img, span, li').css({
                    outline: '', 'outline-offset': '', backgroundColor: '', borderLeft: '', padding: '', textDecoration: ''
                });
                $targets.find('.wcag-word-badge').remove();
                clearFixesFromStorage();
                runFullAudit();
            };

            // --- 5. THE CONTENT AUDIT ENGINE ---
            const runFullAudit = function () {
                const $issueList       = $('#wcag-issue-list');
                const $statusIndicator = $('.wcag-status-indicator');
                const vagueLinks       = ['click here', 'read more', 'learn more', 'here', 'view more', 'link'];

                const $targets = $('.ck-editor__editable, .ck-content, .region-content, .node__content, main article, #main-content').filter(':visible');

                let countFail = 0;
                let countLarge = 0;
                let countPass = 0;

                if (!$targets.length) {
                    $issueList.html('<p style="color:#888; padding:10px;">No content found to scan.</p>');
                    return;
                }

                let auditHtml = '<div class="wcag-audit-container">';
                let hasIssues = false;

                $targets.each(function () {
                    const $elements = $(this).find('p, h1, h2, h3, h4, h5, h6, a, img, span, li');
                    $elements.each(function () {
                        const $el = $(this);
                        if ($el.closest('#toolbar-administration, .toolbar, #wcag-accessibility-sidebar').length) return;

                        // A. IMAGE CHECK
                        if (this.tagName === 'IMG') {
                            const alt = $el.attr('alt');
                            if (!alt || alt.trim() === '') {
                                hasIssues = true; countFail++;
                                $el.css({ outline: '4px dashed #e62117', 'outline-offset': '-4px' });
                                auditHtml += `<div class="wcag-audit-item fail-border"><div class="audit-meta"><span class="audit-name">IMAGE</span><span class="audit-ratio fail">MISSING ALT</span></div></div>`;
                            } else {
                                $el.css({ outline: '', 'outline-offset': '' });
                            }
                            return;
                        }

                        // B. LINK CHECK
                        if (this.tagName === 'A') {
                            const linkText = $el.text().toLowerCase().trim();
                            if (vagueLinks.includes(linkText)) {
                                hasIssues = true; countFail++;
                                $el.css({ 'background-color': '#fff4e5', 'outline': '2px dashed #ff9800', 'padding': '2px' });
                                auditHtml += `<div class="wcag-audit-item fail-border"><div class="audit-meta"><span class="audit-name">LINK</span><span class="audit-ratio fail">VAGUE</span></div></div>`;
                            }
                        }

                        // C. PARAGRAPH CHECK
                        if (this.tagName === 'P') {
                            const pText = $el.text().trim();
                            if (pText.length > 0) {
                                const wordCount = pText.split(/\s+/).filter(Boolean).length;
                                $el.find('.wcag-word-badge').remove();
                                if (wordCount >= 80) {
                                    hasIssues = true; countFail++;
                                    $el.css({ backgroundColor: '#ffebee', borderLeft: '6px solid #d32f2f', padding: '15px', position: 'relative' });
                                    auditHtml += `<div class="wcag-audit-item fail-border" style="background:#1e2227; border-radius:6px; padding:10px; margin-bottom:10px; border:1px solid #d32f2f;">
                                        <div class="audit-meta" style="display:flex; justify-content:space-between; align-items:center;">
                                            <span class="audit-name" style="color:#ccc; font-weight:bold;">PARA</span>
                                            <span class="audit-ratio fail" style="color:#e62117; font-weight:bold;">TOO LONG</span>
                                        </div>
                                    </div>`;
                                } else {
                                    $el.css({ backgroundColor: '', borderLeft: '', padding: '', position: '' });
                                }
                            }
                        }
                        
                        // D. CONTRAST SCAN
                        const text = $el.text().trim();
                        if (text.length < 2) return;

                        const style     = window.getComputedStyle(this);
                        const fg        = parseRGB(style.color);
                        const bgStr     = getActualBackgroundColor(this);
                        const bg        = parseRGB(bgStr);
                        const ratio     = getContrastRatio(fg, bg);
                        const isLarge   = isLargeText(this, style);
                        const threshold = isLarge ? 3 : 4.5;

                        let statusClass = 'fail';
                        let label       = isLarge ? 'Fail (Large Text)' : 'Fail AA';

                        if (ratio >= 7) { 
                            statusClass = 'pass-aaa'; label = 'Pass AAA'; countPass++; 
                        }
                        else if (ratio >= threshold) { 
                            statusClass = 'pass-aa';  label = 'Pass AA';  countPass++; 
                        }
                        else {
                            hasIssues = true;
                            if (isLarge) { countLarge++; } else { countFail++; }
                            $el.css({ 'text-decoration': 'underline wavy #e62117' });
                        }

                        auditHtml += `
                            <div class="wcag-audit-item" style="background:#1e2227; border-radius:6px; padding:10px; margin-bottom:10px; border:1px solid #333;">
                                <div class="audit-meta" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                    <span class="audit-name" style="color:#ccc; font-weight:bold;">${this.tagName}: ${text.substring(0, 15)}...</span>
                                    <span class="audit-ratio ${statusClass}" style="color:${statusClass === 'pass-aaa' || statusClass === 'pass-aa' ? '#28a745' : '#e62117'}; font-weight:bold;">${ratio}:1</span>
                                </div>
                                <div class="audit-bar-bg" style="height:6px; background:#333; border-radius:3px; overflow:hidden; margin-bottom:8px;">
                                    <div class="audit-bar-fill" style="height:100%; background:${statusClass === 'pass-aaa' || statusClass === 'pass-aa' ? '#28a745' : '#e62117'}; width: ${Math.min(ratio * 10, 100)}%"></div>
                                </div>
                                <div class="audit-badges"><span class="badge" style="display:inline-block; border:1px solid currentColor; padding:2px 8px; border-radius:4px; font-size:10px; color:${statusClass === 'pass-aaa' || statusClass === 'pass-aa' ? '#28a745' : '#e62117'};">${label}</span></div>
                            </div>`;
                    });
                });

                // Update counters
                $('#wcag-count-fail').text(countFail);
                $('#wcag-count-large').text(countLarge);
                $('#wcag-count-pass').text(countPass);

                $issueList.html(auditHtml + '</div>');
                $statusIndicator.toggleClass('wcag-status-active', hasIssues);
            };
        }
    };

})(jQuery, Drupal, once);