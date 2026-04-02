<?php

namespace Drupal\wcag_helper\Accessibility\Rule;

/**
 * Interface for all accessibility rules.
 */
interface AccessibilityRuleInterface {

    /**
     * Runs accessibilty check on content.
     * 
     * @param array $content
     *   Content to check.
     * 
     * @return array 
     *   List of issues found.
     */
    public function check(array $content): array;
}