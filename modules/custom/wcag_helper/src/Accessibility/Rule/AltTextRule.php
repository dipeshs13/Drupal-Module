<?php

namespace Drupal\wcag_helper\Accessibility\Rule;
use Drupal\wcag_helper\Accessibility\Rule\AccessibilityRuleInterface;
// Add this correct import
use Drupal\Core\Logger\LoggerChannelFactoryInterface; 
use Psr\Log\LoggerInterface;

class AltTextRule implements AccessibilityRuleInterface {

  /**
   * The logger instance.
   *
   * @var \Psr\Log\LoggerInterface
   */
  protected $logger;

  /**
   * Use the Factory to create your specific logger channel.
   */
  public function __construct(LoggerChannelFactoryInterface $factory) {
    // This creates a dedicated 'wcag_helper' channel in your logs
    $this->logger = $factory->get('wcag_helper');
  }

  public function check(array $content): array {
    $issues = [];

    if (isset($content['images']) && is_array($content['images'])) {
      foreach ($content['images'] as $index => $image) {
        // Checking for the alt text safely
        if (isset($image['alt']) && trim($image['alt']) === '') {
          $issues[] = [
            'type' => 'error',
            'message' => 'Image is missing alt text (WCAG 1.1.1)',
          ];
          
          $this->logger->warning('Accessibility violation: Missing alt text.');
        }
      }
    }

    return $issues;
  }
}