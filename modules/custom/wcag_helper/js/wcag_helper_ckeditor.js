(function ($, Drupal, once) {
    'use strict';

    Drupal.behaviors.wcagHelperCkeditor = {
        attach: function (context) {
            once('wcag-editor-scan', '.ck-editor__editable', context).forEach(function (editorElement) {

                let isRunning = false; // ✅ prevent infinite loop

                const runAllChecks = function () {
                    if (isRunning) return;
                    isRunning = true;

                    const $editable = $(editorElement);

                    // -------------------
                    // 1. IMAGE CHECK
                    // -------------------
                    $editable.find('img').each(function () {
                        const $img = $(this);
                        const alt = $img.attr('alt');

                        if (!alt || alt.trim() === '') {
                            $img.css({
                                outline: '4px dashed #e62117',
                                'outline-offset': '-4px'
                            });
                        } else {
                            $img.css({ outline: '', 'outline-offset': '' });
                        }
                    });

                    // -------------------
                    // 2. LINK CHECK
                    // -------------------
                    const vague = ['click here', 'read more', 'learn more', 'here', 'view more', 'link'];

                    $editable.find('a').each(function () {
                        const $link = $(this);
                        const text = $link.text().toLowerCase().trim();

                        if (vague.includes(text)) {
                            $link.css({
                                'background-color': '#fff4e5',
                                outline: '2px dashed #ff9800',
                                padding: '2px'
                            });
                        } else {
                            $link.css({ backgroundColor: '', outline: '', padding: '' });
                        }
                    });

                    // -------------------
                    // 3. PARAGRAPH CHECK (FIXED)
                    // -------------------
                 
                    setTimeout(function () {

                        $editable.find('p').each(function () {
                            const $p = $(this);

                            const text = this.textContent || '';
                            const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

                            $p.find('.wcag-word-badge').remove();
                            $p.removeClass('wcag-long wcag-normal');

                            // force visible styles directly (NOT only class)
                            if (wordCount >= 80) {
                                $p.css({
                                    backgroundColor: '#ffebee',
                                    borderLeft: '6px solid #d32f2f',
                                    padding: '15px',
                                    position: 'relative'
                                });

                                $p.append(`<span class="wcag-word-badge">LONG: ${wordCount}</span>`);
                            }

                            else if (wordCount > 0) {
                                $p.css({
                                    backgroundColor: '#e0f7fa',
                                    borderLeft: '6px solid #00bcd4',
                                    padding: '15px',
                                    position: 'relative'
                                });

                                $p.append(`<span class="wcag-word-badge">${wordCount}</span>`);
                            }

                        });

                    }, 300);

                    isRunning = false;
                };

                // -------------------
                // OBSERVER (optimized)
                // -------------------
                const observer = new MutationObserver(() => {
                    requestAnimationFrame(runAllChecks);
                });

                observer.observe(editorElement, {
                    childList: true,
                    subtree: true
                });

                // -------------------
                // INPUT (debounced)
                // -------------------
                let timeout;
                editorElement.addEventListener('input', function () {
                    clearTimeout(timeout);
                    timeout = setTimeout(runAllChecks, 200); // ✅ debounce
                });

                // Initial run
                setTimeout(runAllChecks, 300);
            });
        }
    };
})(jQuery, Drupal, once);