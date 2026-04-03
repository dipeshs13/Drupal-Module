(function ($, Drupal, once){
    'use strict';

    Drupal.behaviors.wcagHelperCkeditor = {
        attach: function (context) {
            once('wcag-editor-scan', '.ck-editor__editable', context).forEach(function (editorElement){
                const observer = new MutationObserver(function (mutations){
                    mutations.forEach(function (mutation){
                        mutation.addedNodes.forEach(function (node){

                            //Look for images inside the added content
                            $(node).find('img').addBack('img').each(function (){
                                const $img = $(this);
                                const alt = $img.attr('alt');

                                // If alt is missing, empty, or just whitespace
                                if (alt === undefined || alt.trim() === '') {
                                    console.warn('WCAG Helper: Image missing alt text in Body.');

                                    // Highlight the image with a red dashed border
                                    $img.css({
                                        'outline': '4px dashed #e62117',
                                        'outline-offset': '-4px'
                                    });
                                }
                            });
                        });
                    });
                });

                // Start warning for changes in the editor
                observer.observe(editorElement, { childList:true, subtree:true});
            });
        }
    };
})(jQuery, Drupal, once);