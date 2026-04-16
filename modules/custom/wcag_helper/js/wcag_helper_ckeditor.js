(function ($, Drupal, once) {
    'use strict';

    Drupal.behaviors.wcagHelperSidebar = {
        attach: function (context) {
            
            // --- 1. INITIALIZE SIDEBAR & SCAN BUTTON ---
            once('wcag-init', '#wcag-accessibility-sidebar', context).forEach(function (sidebar) {
                const $sidebar = $(sidebar);
                const $content = $sidebar.find('#wcag-sidebar-content');

                if (!$content.find('#wcag-issue-list').length) {
                    $content.append('<div id="wcag-issue-list"></div>');
                }

                if (!$('#wcag-manual-scan').length) {
                    const $scanBtn = $('<button id="wcag-manual-scan">SCAN PAGE CONTENT</button>');
                    $content.prepend($scanBtn);

                    $scanBtn.on('click', function() {
                        $(this).text('SCANNING...').prop('disabled', true);
                        setTimeout(() => {
                            runFullAudit();
                            $(this).text('SCAN PAGE CONTENT').prop('disabled', false);
                        }, 150);
                    });
                }
            });

            // --- 2. SIDEBAR TOGGLE ---
            once('wcag-toggle', '#wcag-sidebar-header', context).forEach(function (header) {
                $(header).on('click', function () {
                    $('#wcag-accessibility-sidebar').toggleClass('wcag-sidebar-minimized');
                });
            });

            // --- 3. MATH HELPERS ---
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

            // --- 4. THE CONTENT AUDIT ENGINE ---
            const runFullAudit = function () {
                const $issueList = $('#wcag-issue-list');
                const $statusIndicator = $('.wcag-status-indicator');
                const vagueLinks = ['click here', 'read more', 'learn more', 'here', 'view more', 'link'];
                
                // Removed .first() so we scan all possible content regions
                const $targets = $('.ck-editor__editable, .ck-content, .region-content, .node__content, main article, #main-content').filter(':visible');
                
                if (!$targets.length) {
                    $issueList.html('<p style="color:#888; padding:10px;">No content found to scan.</p>');
                    return;
                }

                let auditHtml = '<div class="wcag-audit-container">';
                let hasIssues = false;

                // Loop through all target areas found
                $targets.each(function() {
                    const $currentZone = $(this);
                    const $elements = $currentZone.find('p, h1, h2, h3, h4, h5, h6, a, img, span, li');

                    $elements.each(function () {
                        const $el = $(this);
                        
                        // Skip admin UI and sidebar
                        if ($el.closest('#toolbar-administration, .toolbar, #wcag-accessibility-sidebar').length) return;

                        // A. IMAGE CHECK
                        if (this.tagName === 'IMG') {
                            const alt = $el.attr('alt');
                            if (!alt || alt.trim() === '') {
                                hasIssues = true;
                                $el.css({ outline: '4px dashed #e62117', 'outline-offset': '-4px' });
                                auditHtml += `
                                    <div class="wcag-audit-item fail-border">
                                        <div class="audit-meta"><span class="audit-name">IMAGE</span><span class="audit-ratio fail">MISSING ALT</span></div>
                                        <div class="audit-badges"><span class="badge fail">Fail AA</span></div>
                                    </div>`;
                            } else {
                                $el.css({ outline: '', 'outline-offset': '' });
                            }
                            return;
                        }

                        // B. LINK CHECK
                        if (this.tagName === 'A') {
                            const linkText = $el.text().toLowerCase().trim();
                            if (vagueLinks.includes(linkText)) {
                                hasIssues = true;
                                $el.css({ 'background-color': '#fff4e5', 'outline': '2px dashed #ff9800', 'padding': '2px' });
                                auditHtml += `
                                    <div class="wcag-audit-item fail-border">
                                        <div class="audit-meta"><span class="audit-name">LINK</span><span class="audit-ratio fail">VAGUE TEXT</span></div>
                                        <p style="font-size:10px; color:#aaa;">"${linkText}" is not descriptive.</p>
                                    </div>`;
                            } else {
                                $el.css({ backgroundColor: '', outline: '', padding: '' });
                            }
                        }

                        // C. PARAGRAPH CHECK
                        if (this.tagName === 'P') {
                            const pText = $el.text().trim();
                            if (pText.length > 0) {
                                const wordCount = pText.split(/\s+/).filter(Boolean).length;
                                $el.find('.wcag-word-badge').remove();

                                if (wordCount >= 80) {
                                    $el.css({ backgroundColor: '#ffebee', borderLeft: '6px solid #d32f2f', padding: '15px', position: 'relative' });
                                    $el.append(`<span class="wcag-word-badge" style="position:absolute; top:0; right:0; background:#d32f2f; color:white; font-size:10px; padding:2px 5px; z-index:10;">LONG: ${wordCount}</span>`);
                                } else {
                                    $el.css({ backgroundColor: '#e0f7fa', borderLeft: '6px solid #00bcd4', padding: '15px', position: 'relative' });
                                    $el.append(`<span class="wcag-word-badge" style="position:absolute; top:0; right:0; background:#00bcd4; color:white; font-size:10px; padding:2px 5px; z-index:10;">${wordCount} words</span>`);
                                }
                            }
                        }

                        // D. CONTRAST CHECK
                        const text = $el.text().trim();
                        if (text.length < 2) return;

                        const style = window.getComputedStyle(this);
                        const fg = parseRGB(style.color);
                        let bg = style.backgroundColor;
                        if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') { bg = 'rgb(255, 255, 255)'; }
                        
                        const ratio = getContrastRatio(fg, parseRGB(bg));
                        let statusClass = 'fail';
                        let label = 'Fail AA';

                        if (ratio >= 7) { statusClass = 'pass-aaa'; label = 'Pass AAA'; }
                        else if (ratio >= 4.5) { statusClass = 'pass-aa'; label = 'Pass AA'; }
                        else { hasIssues = true; }

                        auditHtml += `
                            <div class="wcag-audit-item">
                                <div class="audit-meta">
                                    <span class="audit-name">${this.tagName}: ${text.substring(0, 15)}...</span>
                                    <span class="audit-ratio ${statusClass}">${ratio}:1</span>
                                </div>
                                <div class="audit-bar-bg"><div class="audit-bar-fill ${statusClass}" style="width: ${Math.min(ratio * 10, 100)}%"></div></div>
                                <div class="audit-badges"><span class="badge ${statusClass}">${label}</span></div>
                            </div>`;
                    });
                });

                $issueList.html(auditHtml + '</div>');
                $statusIndicator.toggleClass('wcag-status-active', hasIssues);
            };
        }
    };
})(jQuery, Drupal, once);