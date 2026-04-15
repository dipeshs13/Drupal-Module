<?php

namespace Drupal\wcag_helper\Accessibility\Rule;

class UnclearLinkTextRule implements AccessibilityRuleInterface {
    public function check(array $content): array {
        $issues = [];
        $links = $content['links'] ?? [];

        //List of common non-descriptive phrases
        $blacklist = [
            'click here',
            'read more',
            'view more',
            'learn more',
            'more info',
            'here',
            'link',
            'go',
        ];
        foreach ($links as $link_text) {
            $clean_text = strtolower(trim($link_text));

            if (in_array($clean_text, $blacklist)) {
                $issues[] = [
                    'type' => 'warning',
                    'message' => "Unclear link text detected: \"$link_text\". Link text should be describe the destination (WCAG 2.4.4).",

                ];
            }
        }
        return $issues;
    }
}