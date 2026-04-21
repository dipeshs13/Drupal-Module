(function ($, Drupal, once) {
    'use strict';

    // ============================================================
    // PERSISTENCE CONSTANTS
    // ============================================================
    const STORAGE_KEY = 'wcag_contrast_fixes';
    const GEMINI_ENDPOINT = '/wcag/gemini-fix';   // your GeminiProxyController route

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
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(fixesMap)); }
        catch (e) { console.warn('[WCAG] localStorage unavailable:', e); }
    };

    const loadFixesFromStorage = function () {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (e) { return {}; }
    };

    const clearFixesFromStorage = function () {
        try { localStorage.removeItem(STORAGE_KEY); }
        catch (e) { console.warn('[WCAG] Could not clear localStorage:', e); }
    };

    const restoreSavedFixes = function () {
        const fixesMap = loadFixesFromStorage();
        if (!Object.keys(fixesMap).length) return;
        Object.entries(fixesMap).forEach(function ([cssPath, data]) {
            try {
                const el = document.querySelector(cssPath);
                if (el) {
                    if (!$(el).attr('data-orig-color')) $(el).attr('data-orig-color', data.original);
                    $(el).css({ 'color': data.fixed, 'text-decoration': '' });
                }
            } catch (e) { }
        });
    };

    // ============================================================
    // GEMINI AI HELPER  (the core integration point)
    // ============================================================

    /**
     * Calls your GeminiProxyController at /wcag/gemini-fix
     * Returns the suggestion string or throws on failure.
     */
    const callGemini = async function (prompt) {
        const response = await fetch(GEMINI_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        return data.suggestion || 'No suggestion returned.';
    };

    /**
     * Applies an AI-powered smart fix to a DOM element.
     * Shows loading state -> calls Gemini -> updates element text + shows result bubble.
     *
     * @param {HTMLElement} element    The DOM element to fix
     * @param {string}      issueType  Human-readable issue label e.g. "vague link text"
     * @param {jQuery}      $resultBox jQuery element to write the AI response into
     */

    /**
     * The Brain: Suggests text for the specific CKEditor Balloon input
     */
    /**
 * Brain: Takes the user's input (e.g., "mountain") and expands it.
 */
    /**
 * Brain: Fetches a suggestion but does NOT fill the box yet.
 * Instead, it creates a dropdown UI.
 */
    /**
      * Creates a Dropdown UI with multiple AI suggestions based on user input.
      */
    const showAltDropdown = async function ($altInput, imgUrl) {
        const userHint = $altInput.val().trim();
        if (!imgUrl || userHint.length < 2) return;

        $('.wcag-ai-dropdown').remove();

        const $dropdown = $('<div class="wcag-ai-dropdown"></div>').css({
            position: 'absolute',
            background: '#1e2227',
            color: '#abb2bf',
            border: '1px solid #444',
            borderRadius: '6px',
            padding: '10px',
            fontSize: '11px',
            zIndex: 9999999, // Extremely high z-index
            width: $altInput.outerWidth() + 'px',
            top: ($altInput.offset().top + $altInput.outerHeight() + 8) + 'px',
            left: $altInput.offset().left + 'px',
            boxShadow: '0 8px 16px rgba(0,0,0,0.5)',
        });

        $dropdown.html('<div style="color:#7c3aed; font-size:10px; margin-bottom:5px; animation: pulse 1.5s infinite;">✨ GEMINI IS ANALYZING...</div>');
        $('body').append($dropdown);

        try {
            const prompt = `The user typed: "${userHint}". Provide 3 short WCAG alt tags for this image: ${imgUrl}. Separate options with |`;
            const result = await callGemini(prompt);
            const options = result.split('|').map(s => s.trim()).filter(s => s.length > 0);

            $dropdown.empty().append('<div style="color:#7c3aed; font-weight:bold; font-size:10px; margin-bottom:8px; border-bottom:1px solid #333; padding-bottom:4px;">SELECT TO APPLY:</div>');

            options.forEach(opt => {
                const $optDiv = $(`<div style="padding:8px; cursor:pointer; border-radius:4px; margin-bottom:2px; border:1px solid transparent;">${opt}</div>`);

                $optDiv.hover(
                    function () { $(this).css({ 'background': '#2c313a', 'border-color': '#7c3aed' }); },
                    function () { $(this).css({ 'background': 'transparent', 'border-color': 'transparent' }); }
                );

                // CRITICAL FIX: Use mousedown and preventDefault to stop the dropdown 
                // from stealing focus and closing the CKEditor balloon.
                $optDiv.on('mousedown', function (e) {
                    e.preventDefault();
                    e.stopPropagation();

                    // 1. Update the actual input value
                    $altInput.val(opt);

                    // 2. Force CKEditor to recognize the change
                    $altInput[0].dispatchEvent(new Event('input', { bubbles: true }));
                    $altInput[0].dispatchEvent(new Event('change', { bubbles: true }));

                    // 3. Clean up
                    $('.wcag-ai-dropdown').remove();

                    // 4. Refocus the input so the user sees the cursor
                    $altInput.focus();
                });

                $dropdown.append($optDiv);
            });

        } catch (err) {
            $dropdown.html('<div style="color:#f87171;">AI busy. Try again.</div>');
            setTimeout(() => $dropdown.remove(), 2000);
        }
    };
    const applySmartFix = async function (element, issueType, $resultBox) {
        const $el = $(element);
        const originalText = $el.text().trim();

        $resultBox.html(
            '<div style="color:#a78bfa; font-style:italic; font-size:11px; margin-top:6px; display:flex; align-items:center; gap:6px;">' +
            '<span class="wcag-ai-spinner" style="display:inline-block; width:10px; height:10px; border:2px solid #a78bfa; border-top-color:transparent; border-radius:50%; animation:wcagSpin 0.8s linear infinite;"></span>' +
            'Gemini is analyzing...</div>'
        ).show();

        const prompt = `You are a WCAG 2.1 expert. Original Text: "${originalText}". Issue: ${issueType}. Return FIXED_TEXT and FIXED_COLOR.`;

        try {
            const suggestion = await callGemini(prompt);
            const textMatch = suggestion.match(/FIXED_TEXT:\s*([\s\S]*?)(?=FIXED_COLOR:|$)/i);
            const colorMatch = suggestion.match(/FIXED_COLOR:\s*(#\w+|NONE)/i);

            const cleanText = textMatch ? textMatch[1].trim() : originalText;
            const cleanColor = (colorMatch && colorMatch[1].toUpperCase() !== 'NONE') ? colorMatch[1].trim() : null;

            // UPDATED: UI only shows suggestions; "Apply" button is removed
            $resultBox.html(
                `<div style="margin-top:8px; padding:10px; background:rgba(124,58,237,0.12); border:1px solid rgba(124,58,237,0.4); border-radius:6px; font-size:11px;">` +
                `<div style="font-size:10px; color:#7c3aed; font-weight:bold; margin-bottom:4px;">GEMINI SUGGESTION</div>` +
                `<div style="color:#e2d9f3; margin-bottom: 5px;">${cleanText}</div>` +
                (cleanColor ? `<div style="font-size:10px; color:#10b981;">Recommended Hex: <span style="background:${cleanColor}; padding:0 4px; border-radius:2px; color:#fff;">${cleanColor}</span></div>` : '')  +
                `<button class="wcag-ai-dismiss" style="margin-top:8px; background:transparent; color:#999; border:1px solid #444; padding:3px 8px; border-radius:4px; cursor:pointer; font-size:9px;">DISMISS</button>` +
                `</div>`
            );

            $resultBox.find('.wcag-ai-dismiss').on('click', () => $resultBox.slideUp(200));
        } catch (err) {
            $resultBox.html(`<div style="color:#f87171; font-size:11px;">AI Suggestion Error.</div>`);
        }
    };

    /**
     * Pings Gemini with a simple prompt and updates the status badge.
     * Gives the editor visual proof the connection works.
     */
    const checkGeminiStatus = async function () {
        const $badge = $('#wcag-ai-status-badge');
        $badge.text('CHECKING...').css({ background: '#374151', color: '#9ca3af' });
        try {
            await callGemini('Reply with the single word: CONNECTED');
            $badge.text('AI CONNECTED').css({ background: 'rgba(124,58,237,0.2)', color: '#a78bfa', border: '1px solid rgba(124,58,237,0.5)' });
        } catch (e) {
            $badge.text('AI OFFLINE').css({ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)' });
        }
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

                // Inject keyframe for spinner (once globally)
                if (!document.getElementById('wcag-ai-styles')) {
                    const style = document.createElement('style');
                    style.id = 'wcag-ai-styles';
                    style.textContent =
                        '@keyframes wcagSpin { to { transform: rotate(360deg); } }' +
                        '@keyframes wcagPulse { 0%,100%{opacity:1} 50%{opacity:0.5} }';
                    document.head.appendChild(style);
                }

                // Tooltip
                if (!$('#wcag-hover-tooltip').length) {
                    $('body').append('<div id="wcag-hover-tooltip" style="position:fixed; z-index:999999; pointer-events:none; padding:6px 12px; border-radius:4px; font-family:monospace; font-size:12px; display:none; white-space:nowrap; box-shadow:0 2px 8px rgba(0,0,0,0.3); border:1px solid rgba(0,0,0,0.2); font-weight:bold;"></div>');
                }

                // Hover listener
                $(document).on('mousemove', function (e) {
                    const $tooltip = $('#wcag-hover-tooltip');
                    const target = e.target;
                    if ($(target).closest('#wcag-accessibility-sidebar, #toolbar-administration, .toolbar, #wcag-hover-tooltip').length) {
                        $tooltip.hide(); return;
                    }
                    const $el = $(target);
                    const text = $el.text().trim();
                    if (text.length < 1 || $el.is(':empty')) { $tooltip.hide(); return; }

                    const style = window.getComputedStyle(target);
                    const fg = parseRGB(style.color);
                    const bg = parseRGB(getActualBackgroundColor(target));
                    const ratio = parseFloat(getContrastRatio(fg, bg));
                    const isLarge = isLargeText(target, style);
                    const thresh = isLarge ? 3 : 4.5;

                    const contrastOk = ratio >= 4.5;
                    const ratioOk = ratio >= thresh;

                    let message, bgColor;
                    if (contrastOk && ratioOk) { message = 'Contrast and ratio are fine'; bgColor = '#28a745'; }
                    else if (ratioOk && !contrastOk) { message = 'Ratio matches but contrast is low'; bgColor = '#ff9800'; }
                    else if (contrastOk && !ratioOk) { message = 'Contrast matches but ratio is low'; bgColor = '#ff9800'; }
                    else { message = 'Contrast and ratio do not match'; bgColor = '#e62117'; }

                    $tooltip.html(`<span>${message}</span> --- ${ratio}:1 ratio`)
                        .css({
                            background: bgColor, color: '#fff', display: 'block',
                            top: (e.clientY + 20) + 'px', left: (e.clientX + 15) + 'px'
                        });
                });
                $(document).on('mouseleave', function () { $('#wcag-hover-tooltip').hide(); });

                // --- 1a. SUMMARY STATS ---
                if (!$('#wcag-summary-stats').length) {
                    const $statsBar = $(`
                        <div id="wcag-summary-stats" style="display:flex; justify-content:space-around; padding:10px 0; margin-bottom:15px; font-family:monospace; font-size:13px;">
                            <div style="background:rgba(230,33,23,0.1); color:#e62117; padding:4px 16px; border-radius:20px; border:1px solid rgba(230,33,23,0.3); display:flex; align-items:center; gap:6px;">
                                <span style="width:8px; height:8px; background:#e62117; border-radius:50%;"></span>
                                <span id="wcag-count-fail">0</span> Fail
                            </div>
                            <div style="background:rgba(255,152,0,0.1); color:#ff9800; padding:4px 16px; border-radius:20px; border:1px solid rgba(255,152,0,0.3); display:flex; align-items:center; gap:6px;">
                                <span style="width:8px; height:8px; background:#ff9800; border-radius:50%;"></span>
                                <span id="wcag-count-large">0</span> AA-Large
                            </div>
                            <div style="background:rgba(40,167,69,0.1); color:#28a745; padding:4px 16px; border-radius:20px; border:1px solid rgba(40,167,69,0.3); display:flex; align-items:center; gap:6px;">
                                <span style="width:8px; height:8px; background:#28a745; border-radius:50%;"></span>
                                <span id="wcag-count-pass">0</span> Pass
                            </div>
                        </div>
                    `);
                    $content.prepend($statsBar);
                }

                // --- 1b. ACTION BUTTONS ---
                if (!$('#wcag-action-buttons').length) {
                    const $btnContainer = $('<div id="wcag-action-buttons" style="display:flex; flex-direction:column; gap:8px; margin-bottom:15px; border-bottom:1px solid #444; padding-bottom:15px;"></div>');
                    const $scanBtn = $('<button id="wcag-manual-scan"  style="background:#007bff; color:white; border:none; padding:10px; cursor:pointer; font-weight:bold; border-radius:4px;">SCAN PAGE CONTENT</button>');
                    const $fixBtn = $('<button id="wcag-fix-contrast" style="background:#28a745; color:white; border:none; padding:10px; cursor:pointer; font-weight:bold; border-radius:4px;">FIX ALL CONTRAST</button>');
                    const $resetBtn = $('<button id="wcag-reset-all"    style="background:#6c757d; color:white; border:none; padding:10px; cursor:pointer; font-weight:bold; border-radius:4px;">RESET ALL</button>');
                    const $wcagLink = $('<a href="https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html" target="_blank" style="font-size:11px; color:#007bff; text-decoration:none; margin-top:5px;">Understand WCAG 1.4.3 Contrast</a>');
                    $btnContainer.append($scanBtn, $fixBtn, $resetBtn, $wcagLink);
                    $('#wcag-summary-stats').after($btnContainer);

                    $scanBtn.on('click', function () {
                        $(this).text('SCANNING...').prop('disabled', true);
                        setTimeout(() => { runFullAudit(); $(this).text('SCAN PAGE CONTENT').prop('disabled', false); }, 150);
                    });
                    $fixBtn.on('click', () => applyContrastFix());
                    $resetBtn.on('click', () => resetSiteStyles());
                }

                // -------------------------------------------------------
                // --- 1d. GEMINI AI PANEL  (the new visible integration) ---
                // -------------------------------------------------------
                if (!$('#wcag-ai-panel').length) {
                    const $aiPanel = $(`
                        <div id="wcag-ai-panel" style="margin-bottom:15px; border-bottom:1px solid #444; padding-bottom:15px;">

                            <!-- Header row -->
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <!-- Gemini icon (SVG, no emoji) -->
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" fill="#a78bfa"/>
                                        <path d="M12 2 L12 22 M2 12 L22 12" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="2 2"/>
                                    </svg>
                                    <span style="color:#a78bfa; font-family:monospace; font-size:12px; font-weight:bold; letter-spacing:1px;">GEMINI AI ASSISTANT</span>
                                </div>
                                <!-- Status badge -->
                                <span id="wcag-ai-status-badge"
                                      style="font-family:monospace; font-size:9px; padding:3px 8px; border-radius:20px; border:1px solid #444; color:#666; background:#1e2227; cursor:pointer; font-weight:bold; letter-spacing:0.5px;"
                                      title="Click to test connection">
                                    CLICK TO TEST
                                </span>
                            </div>

                            <!-- Ask a question input -->
                            <div style="margin-bottom:8px;">
                                <textarea id="wcag-ai-question"
                                    placeholder="Ask Gemini about this page's accessibility..."
                                    style="width:100%; box-sizing:border-box; background:#1e2227; color:#ccc; border:1px solid #444; border-radius:6px; padding:8px 10px; font-family:monospace; font-size:11px; resize:vertical; min-height:60px; outline:none; line-height:1.5;"
                                ></textarea>
                            </div>
                            <div style="display:flex; gap:6px;">
                                <button id="wcag-ai-ask-btn"
                                    style="flex:1; background:linear-gradient(135deg,#7c3aed,#4f46e5); color:white; border:none; padding:8px; border-radius:6px; font-family:monospace; font-size:11px; font-weight:bold; cursor:pointer; letter-spacing:0.5px;">
                                    ASK GEMINI
                                </button>
                                <button id="wcag-ai-page-summary-btn"
                                    style="flex:1; background:#1e2227; color:#a78bfa; border:1px solid rgba(124,58,237,0.4); padding:8px; border-radius:6px; font-family:monospace; font-size:11px; font-weight:bold; cursor:pointer; letter-spacing:0.5px;">
                                    PAGE SUMMARY
                                </button>
                            </div>

                            <!-- AI response output -->
                            <div id="wcag-ai-response" style="display:none; margin-top:10px; padding:10px; background:rgba(124,58,237,0.1); border:1px solid rgba(124,58,237,0.3); border-radius:6px; font-family:monospace; font-size:11px; color:#c4b5fd; line-height:1.6; max-height:200px; overflow-y:auto;"></div>
                        </div>
                    `);

                    // Insert AI panel AFTER action buttons
                    $('#wcag-action-buttons').after($aiPanel);

                    // --- Wire: status badge click -> ping Gemini ---
                    $('#wcag-ai-status-badge').on('click', function () {
                        checkGeminiStatus();
                    });

                    // --- Wire: ASK GEMINI button ---
                    $('#wcag-ai-ask-btn').on('click', async function () {
                        const question = $('#wcag-ai-question').val().trim();
                        if (!question) return;

                        const $btn = $(this);
                        const $response = $('#wcag-ai-response');

                        $btn.text('THINKING...').prop('disabled', true);
                        $response.html(
                            '<div style="display:flex; align-items:center; gap:8px; color:#a78bfa;">' +
                            '<span style="display:inline-block; width:12px; height:12px; border:2px solid #a78bfa; border-top-color:transparent; border-radius:50%; animation:wcagSpin 0.8s linear infinite;"></span>' +
                            'Gemini is analyzing...</div>'
                        ).show();

                        // Build a context-aware prompt from visible page content
                        const pageSnippet = $('main, .region-content, #main-content')
                            .first().text().replace(/\s+/g, ' ').trim().substring(0, 800);

                        const fullPrompt =
                            `You are an expert in WCAG 2.1 web accessibility. ` +
                            `The editor is reviewing this page. Page content snippet: "${pageSnippet}". ` +
                            `Editor question: "${question}". ` +
                            `Give a concise, practical answer focused on WCAG compliance. ` +
                            `Use plain text. Maximum 3 sentences.`;

                        try {
                            const reply = await callGemini(fullPrompt);
                            $response.html(
                                '<div style="color:#7c3aed; font-size:9px; font-weight:bold; margin-bottom:6px; letter-spacing:1px;">GEMINI RESPONSE</div>' +
                                '<div style="color:#e2d9f3;">' + reply + '</div>'
                            );
                        } catch (err) {
                            $response.html('<span style="color:#f87171;">Error: ' + err.message + '</span>');
                        } finally {
                            $btn.text('ASK GEMINI').prop('disabled', false);
                        }
                    });

                    // --- Wire: PAGE SUMMARY button ---
                    $('#wcag-ai-page-summary-btn').on('click', async function () {
                        const $btn = $(this);
                        const $response = $('#wcag-ai-response');

                        $btn.text('SUMMARIZING...').prop('disabled', true);
                        $response.html(
                            '<div style="display:flex; align-items:center; gap:8px; color:#a78bfa;">' +
                            '<span style="display:inline-block; width:12px; height:12px; border:2px solid #a78bfa; border-top-color:transparent; border-radius:50%; animation:wcagSpin 0.8s linear infinite;"></span>' +
                            'Generating accessibility summary...</div>'
                        ).show();

                        const failCount = $('#wcag-count-fail').text();
                        const largeCount = $('#wcag-count-large').text();
                        const passCount = $('#wcag-count-pass').text();
                        const pageText = $('main, .region-content, #main-content')
                            .first().text().replace(/\s+/g, ' ').trim().substring(0, 800);

                        const summaryPrompt =
                            `You are a WCAG 2.1 expert. Audit summary for this page: ` +
                            `${failCount} contrast failures, ${largeCount} large-text AA issues, ${passCount} passing elements. ` +
                            `Page content snippet: "${pageText}". ` +
                            `Write a 3-bullet accessibility health report. ` +
                            `Format: each bullet starts with a dash (-). Plain text only.`;

                        try {
                            const reply = await callGemini(summaryPrompt);
                            $response.html(
                                '<div style="color:#7c3aed; font-size:9px; font-weight:bold; margin-bottom:6px; letter-spacing:1px;">ACCESSIBILITY SUMMARY</div>' +
                                '<div style="color:#e2d9f3; white-space:pre-line;">' + reply + '</div>'
                            );
                        } catch (err) {
                            $response.html('<span style="color:#f87171;">Error: ' + err.message + '</span>');
                        } finally {
                            $btn.text('PAGE SUMMARY').prop('disabled', false);
                        }
                    });

                    // Auto-ping on sidebar load so the badge updates immediately
                    checkGeminiStatus();
                }

                // --- 1c. THRESHOLDS & INDICATORS PANEL ---
                if (!$('#wcag-reference-panels').length) {
                    const $refPanels = $(`
                        <div id="wcag-reference-panels" style="margin-top:20px; font-family:'Courier New',monospace; font-size:12px; color:#ccc;">
                            <div style="border-bottom:1px solid #444; padding-bottom:5px; margin-bottom:10px; color:#888; font-weight:bold; font-size:11px; letter-spacing:1px;">WCAG 1.4.3 THRESHOLDS</div>
                            <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:20px;">
                                <div style="display:flex; justify-content:space-between; align-items:center; background:#1e2227; padding:8px 12px; border-radius:6px; border:1px solid #333;">
                                    <span>AA Normal Text</span><span style="color:#e62117; font-weight:bold;">4.5 : 1</span>
                                </div>
                                <div style="display:flex; justify-content:space-between; align-items:center; background:#1e2227; padding:8px 12px; border-radius:6px; border:1px solid #333;">
                                    <span>AA Large Text (18pt+)</span><span style="color:#ff9800; font-weight:bold;">3.0 : 1</span>
                                </div>
                                <div style="display:flex; justify-content:space-between; align-items:center; background:#1e2227; padding:8px 12px; border-radius:6px; border:1px solid #333;">
                                    <span>AAA Enhanced</span><span style="color:#007bff; font-weight:bold;">7.0 : 1</span>
                                </div>
                            </div>
                            <div style="border-bottom:1px solid #444; padding-bottom:5px; margin-bottom:10px; color:#888; font-weight:bold; font-size:11px; letter-spacing:1px;">VISUAL INDICATORS</div>
                            <div style="display:flex; flex-direction:column; gap:10px; padding-left:5px;">
                                <div style="display:flex; align-items:center; gap:10px;">
                                    <div style="width:20px; height:2px; background:#e62117; border-bottom:1px dashed #e62117;"></div>
                                    <span>Wavy underline = contrast failure</span>
                                </div>
                                <div style="display:flex; align-items:center; gap:10px;">
                                    <div style="width:18px; height:12px; border:2px solid #e62117; border-radius:4px;"></div>
                                    <span>Red ring - AA fail</span>
                                </div>
                                <div style="display:flex; align-items:center; gap:10px;">
                                    <div style="width:18px; height:12px; border:2px solid #28a745; border-radius:4px;"></div>
                                    <span>Green ring - AA pass</span>
                                </div>
                                <div style="display:flex; align-items:center; gap:10px;">
                                    <div style="width:18px; height:12px; background:#7c3aed; border-radius:2px;"></div>
                                    <span>Purple button = AI Suggestion available</span>
                                </div>
                            </div>
                        </div>
                    `);
                    $content.append($refPanels);
                }

                if (!$content.find('#wcag-issue-list').length) {
                    $content.append('<div id="wcag-issue-list" style="margin-top:20px;"></div>');
                }


                // --- NEW: CKEDITOR OBSERVER ---
                // This watches for new images being uploaded or pasted into the editor
                // Look for the editor, but we will watch document.body for the balloon popup
                const bodyObserver = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === 1) {
                                const $altInput = $(node).find('.ck-input-text, .ck-labeled-field-view__input-wrapper input');

                                if ($altInput.length > 0) {
                                    const $activeImg = $('.ck-editor__editable img.ck-widget_selected, .ck-editor__editable .ck-widget_selected img');
                                    const imgUrl = $activeImg.attr('src');

                                    let typingTimer;
                                    $altInput.on('input', function () {
                                        clearTimeout(typingTimer);
                                        typingTimer = setTimeout(() => {
                                            showAltDropdown($(this), imgUrl);
                                        }, 1000);
                                    });
                                }
                            }
                        });
                    });
                });

                bodyObserver.observe(document.body, { childList: true, subtree: true });

                // Close dropdown if clicked outside
                $(document).on('mousedown.wcagGlobal', function (e) {
                    if (!$(e.target).closest('.wcag-ai-dropdown, .ck-balloon-panel').length) {
                        $('.wcag-ai-dropdown').remove();
                    }
                });
            });
            // --- 2. INITIAL SCAN FOR EXISTING IMAGES ---
            // This handles images already on the page when it loads
            $(once('wcag-img-init', '.ck-content img, .ck-editor__editable img', context)).each(function () {
                if (!$(this).attr('alt')) {
                    suggestAltText(this);
                }
            });
            // --- 2. SIDEBAR TOGGLE ---
            once('wcag-toggle', '#wcag-sidebar-header', context).forEach(function (header) {
                $(header).on('click', function () {
                    $('#wcag-accessibility-sidebar').toggleClass('wcag-sidebar-minimized');
                });
            });

            // --- RESTORE SAVED FIXES (once per body attach) ---
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
                const fontSize = parseFloat(style.fontSize);
                const fontWeight = style.fontWeight;
                const isBold = fontWeight === 'bold' || parseInt(fontWeight) >= 700;
                return fontSize >= 24 || (fontSize >= 18.66 && isBold) || ['H1', 'H2', 'H3'].includes(el.tagName);
            };

            // --- 4. FIX & RESET FUNCTIONS ---

            const applyContrastFix = function () {
                const $targets = $('.ck-editor__editable, .ck-content, .region-content, .node__content, main article, #main-content').filter(':visible');
                const fixesMap = loadFixesFromStorage();

                $targets.find('p, h1, h2, h3, h4, h5, h6, a, span, li').each(function () {
                    const style = window.getComputedStyle(this);
                    const fg = parseRGB(style.color);
                    const bgStr = getActualBackgroundColor(this);
                    const bg = parseRGB(bgStr);
                    const ratio = getContrastRatio(fg, bg);
                    const threshold = isLargeText(this, style) ? 3 : 4.5;

                    if (ratio < threshold) {
                        if (!$(this).attr('data-orig-color')) $(this).attr('data-orig-color', style.color);
                        const bgLum = getLuminance(...bg);
                        const newColor = bgLum > 0.5 ? '#000000' : '#ffffff';
                        $(this).css({ 'color': newColor, 'text-decoration': '' });
                        const key = buildElementKey(this);
                        if (key) fixesMap[key] = { fixed: newColor, original: $(this).attr('data-orig-color') };
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
                    outline: '', 'outline-offset': '', backgroundColor: '',
                    borderLeft: '', padding: '', textDecoration: ''
                });
                $targets.find('.wcag-word-badge').remove();
                clearFixesFromStorage();
                runFullAudit();
            };

            // --- 5. THE CONTENT AUDIT ENGINE ---
           const runFullAudit = function () {
                const $issueList = $('#wcag-issue-list');
                const $statusIndicator = $('.wcag-status-indicator');
                const vagueLinks = ['click here', 'read more', 'learn more', 'here', 'view more', 'link'];
                const $targets = $('.ck-editor__editable, .ck-content, .region-content, .node__content, main article, #main-content').filter(':visible');

                let countFail = 0, countLarge = 0, countPass = 0;

                if (!$targets.length) {
                    $issueList.html('<p style="color:#888; padding:10px;">No content found to scan.</p>');
                    return;
                }

                const $auditContainer = $('<div class="wcag-audit-container"></div>');
                let hasIssues = false;

                $targets.each(function () {
                    $(this).find('p, h1, h2, h3, h4, h5, h6, a, img, span, li').each(function () {
                        const $el = $(this);
                        if ($el.closest('#toolbar-administration, .toolbar, #wcag-accessibility-sidebar').length) return;

                        // Shared ring style constants
                        const ringStyle = { 'outline-offset': '2px', 'border-radius': '2px' };

                        // ---- A. IMAGE CHECK ----
                        if (this.tagName === 'IMG') {
                            const alt = $el.attr('alt');
                            if (!alt || alt.trim() === '') {
                                hasIssues = true; countFail++;
                                $el.css({ ...ringStyle, outline: '2px solid #e62117' });

                                const domEl = this;
                                const $item = $('<div></div>').css({ background: '#1e2227', borderRadius: '6px', padding: '10px', marginBottom: '10px', border: '1px solid #e62117' });
                                const $meta = $('<div></div>').css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' });
                                const $label = $('<span>IMAGE: missing alt</span>').css({ color: '#ccc', fontWeight: 'bold', fontFamily: 'monospace', fontSize: '11px' });
                                const $badge = $('<span>MISSING ALT</span>').css({ color: '#e62117', fontWeight: 'bold', fontFamily: 'monospace', fontSize: '11px' });
                                const $aiBtn = buildAiButton();
                                const $aiBox = $('<div></div>').hide();

                                $aiBtn.on('click', function () {
                                    applySmartFix(domEl, 'missing image alt text - suggest a descriptive alt attribute value', $aiBox);
                                });

                                $meta.append($label, $badge);
                                $item.append($meta, $aiBtn, $aiBox);
                                $auditContainer.append($item);
                            } else {
                                $el.css({ ...ringStyle, outline: '2px solid #28a745' });
                            }
                            return;
                        }

                        // ---- B. LINK CHECK ----
                        if (this.tagName === 'A') {
                            const linkText = $el.text().toLowerCase().trim();
                            if (vagueLinks.includes(linkText)) {
                                hasIssues = true; countFail++;
                                $el.css({ ...ringStyle, outline: '2px solid #e62117' });

                                const domEl = this;
                                const $item = $('<div></div>').css({ background: '#1e2227', borderRadius: '6px', padding: '10px', marginBottom: '10px', border: '1px solid #ff9800' });
                                const $meta = $('<div></div>').css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' });
                                const $lbl = $('<span>LINK: vague text</span>').css({ color: '#ccc', fontWeight: 'bold', fontFamily: 'monospace', fontSize: '11px' });
                                const $badge = $('<span>VAGUE</span>').css({ color: '#ff9800', fontWeight: 'bold', fontFamily: 'monospace', fontSize: '11px' });
                                const $aiBtn = buildAiButton();
                                const $aiBox = $('<div></div>').hide();

                                $aiBtn.on('click', function () {
                                    applySmartFix(domEl, 'vague link text (e.g. "click here") - suggest descriptive anchor text that explains the destination', $aiBox);
                                });

                                $meta.append($lbl, $badge);
                                $item.append($meta, $aiBtn, $aiBox);
                                $auditContainer.append($item);
                            } else {
                                $el.css({ ...ringStyle, outline: '2px solid #28a745' });
                            }
                        }

                        // ---- C. PARAGRAPH CHECK ----
                        if (this.tagName === 'P') {
                            const pText = $el.text().trim();
                            if (pText.length > 0) {
                                const wordCount = pText.split(/\s+/).filter(Boolean).length;
                                $el.find('.wcag-word-badge').remove();
                                if (wordCount >= 80) {
                                    hasIssues = true; countFail++;
                                    
                                    // UPDATED: Apply both Red Ring and Red Background for high visibility
                                    $el.css({ 
                                        ...ringStyle, 
                                        outline: '2px solid #e62117',
                                        backgroundColor: '#ffebee'
                                    });

                                    const domEl = this;
                                    const $item = $('<div></div>').css({ background: '#1e2227', borderRadius: '6px', padding: '10px', marginBottom: '10px', border: '1px solid #d32f2f' });
                                    const $meta = $('<div></div>').css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' });
                                    const $lbl = $('<span>PARA: too long</span>').css({ color: '#ccc', fontWeight: 'bold', fontFamily: 'monospace', fontSize: '11px' });
                                    const $badge = $('<span>' + wordCount + ' words</span>').css({ color: '#e62117', fontWeight: 'bold', fontFamily: 'monospace', fontSize: '11px' });
                                    const $aiBtn = buildAiButton('SHORTEN WITH AI');
                                    const $aiBox = $('<div></div>').hide();

                                    $aiBtn.on('click', function () {
                                        applySmartFix(domEl, `paragraph too long (${wordCount} words, max recommended 80) - rewrite in 40-60 words keeping core meaning`, $aiBox);
                                    });

                                    $meta.append($lbl, $badge);
                                    $item.append($meta, $aiBtn, $aiBox);
                                    $auditContainer.append($item);
                                } else {
                                    $el.css({ ...ringStyle, outline: '2px solid #28a745', backgroundColor: '' });
                                }
                            }
                        }

                        // ---- D. CONTRAST SCAN ----
                        const text = $el.text().trim();
                        if (text.length < 2) return;

                        const style = window.getComputedStyle(this);
                        const fg = parseRGB(style.color);
                        const bgStr = getActualBackgroundColor(this);
                        const bg = parseRGB(bgStr);
                        const ratio = getContrastRatio(fg, bg);
                        const isLarge = isLargeText(this, style);
                        const threshold = isLarge ? 3 : 4.5;

                        let statusColor = '#e62117'; 
                        let badgesHtml = '';        

                        if (ratio >= 7) {
                            statusColor = '#28a745';
                            badgesHtml += `<span style="display:inline-block; border:1px solid #28a745; padding:2px 8px; border-radius:4px; fontSize:10px; color:#28a745; fontFamily:monospace; margin-right:4px;">Pass AAA</span>`;
                        }

                        if (ratio >= threshold) {
                            statusColor = '#28a745';
                            badgesHtml += `<span style="display:inline-block; border:1px solid #28a745; padding:2px 8px; border-radius:4px; fontSize:10px; color:#28a745; fontFamily:monospace;">Pass AA</span>`;
                            countPass++;
                            
                            // Only apply green outline if not already set to red by paragraph/link check
                            if ($el.css('outline-color') !== 'rgb(230, 33, 23)') {
                                $el.css({ ...ringStyle, outline: '2px solid #28a745', 'text-decoration': 'none' });
                            }
                        } else {
                            statusColor = '#e62117';
                            const failLabel = isLarge ? 'Fail (Large)' : 'Fail AA';
                            badgesHtml = `<span style="display:inline-block; border:1px solid #e62117; padding:2px 8px; border-radius:4px; fontSize:10px; color:#e62117; fontFamily:monospace;">${failLabel}</span>`;
                            hasIssues = true;
                            if (isLarge) countLarge++; else countFail++;
                            
                            // Apply Red Ring and Underline for contrast fail
                            $el.css({ ...ringStyle, outline: '2px solid #e62117', 'text-decoration': 'underline wavy #e62117' });
                        }

                        const isFail = (statusColor === '#e62117');
                        const domEl = this;
                        const $item = $('<div></div>').css({ background: '#1e2227', borderRadius: '6px', padding: '10px', marginBottom: '10px', border: `1px solid #333` });
                        const $meta = $('<div></div>').css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' });
                        const $name = $('<span></span>').text(this.tagName + ': ' + text.substring(0, 15) + '...').css({ color: '#ccc', fontWeight: 'bold', fontFamily: 'monospace', fontSize: '11px' });
                        const $ratio = $('<span></span>').text(ratio + ':1').css({ color: statusColor, fontWeight: 'bold', fontFamily: 'monospace', fontSize: '11px' });
                        const $bar = $('<div></div>').css({ height: '6px', background: '#333', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' });
                        const $fill = $('<div></div>').css({ height: '100%', background: statusColor, width: Math.min(ratio * 10, 100) + '%' });

                        const $badgeContainer = $('<div></div>').html(badgesHtml);

                        $meta.append($name, $ratio);
                        $bar.append($fill);
                        $item.append($meta, $bar, $badgeContainer);

                        if (isFail) {
                            const $aiBtn = buildAiButton();
                            const $aiBox = $('<div></div>').hide();
                            $aiBtn.on('click', function () {
                                applySmartFix(
                                    domEl,
                                    `contrast ratio too low (${ratio}:1, needs ${threshold}:1) - suggest new accessible text color value or rewrite text for clarity`,
                                    $aiBox
                                );
                            });
                            $item.append($aiBtn, $aiBox);
                        }

                        $auditContainer.append($item);
                    });
                });

                $('#wcag-count-fail').text(countFail);
                $('#wcag-count-large').text(countLarge);
                $('#wcag-count-pass').text(countPass);

                $issueList.empty().append($auditContainer);
                $statusIndicator.toggleClass('wcag-status-active', hasIssues);
            };

            /**
             * Builds a small purple "AI FIX" button for audit items.
             */
            const buildAiButton = function (label) {
                return $('<button></button>')
                    .text(label || 'AI SUGGESTION')
                    .css({
                        marginTop: '6px',
                        background: 'linear-gradient(135deg,#7c3aed,#4f46e5)',
                        color: 'white',
                        border: 'none',
                        padding: '3px 10px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontFamily: 'monospace',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        letterSpacing: '0.5px'
                    });
            };




        }
    };

})(jQuery, Drupal, once);