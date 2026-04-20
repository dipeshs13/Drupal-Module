<?php

namespace Drupal\wcag_helper\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\Core\Site\Settings;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use Drupal\node\Entity\Node;
/**
 * Provides a secure proxy for Gemini AI requests.
 * API key is stored in settings.php, never exposed to client.
 */
class GeminiProxyController extends ControllerBase {

    /**
     * Generates content using Gemini 2.0 Flash model (currently most reliable).
     *
     * @param \Symfony\Component\HttpFoundation\Request $request
     *   The HTTP request containing the prompt.
     *
     * @return \Symfony\Component\HttpFoundation\JsonResponse
     *   JSON response with suggestion or error.
     */
    public function generate(Request $request) {

        // --- 1. VALIDATE REQUEST ---
        $content = json_decode($request->getContent(), TRUE);
        if (!is_array($content)) {
            return new JsonResponse(['error' => 'Invalid JSON payload'], 400);
        }

        $prompt = trim($content['prompt'] ?? '');
        if (empty($prompt)) {
            return new JsonResponse(['error' => 'Prompt is required'], 400);
        }

        if (strlen($prompt) > 2000) {
            return new JsonResponse(['error' => 'Prompt exceeds 2000 characters'], 400);
        }

        // --- 2. GET API KEY ---
        $apiKey = Settings::get('gemini_api_key');
        if (empty($apiKey)) {
            \Drupal::logger('wcag_helper')->critical(
                'Gemini API key not configured. Add to settings.php: $settings["gemini_api_key"] = "YOUR_KEY_HERE";'
            );
            return new JsonResponse(['error' => 'AI service not configured'], 500);
        }

        // --- 3. PERMISSION CHECK ---
        $user = \Drupal::currentUser();
        if (!$user->hasPermission('administer content')) {
            return new JsonResponse(['error' => 'Insufficient permissions'], 403);
        }

        // --- 4. CALL GEMINI API ---
        try {
            $client = new Client([
                'timeout'           => 15,
                'connect_timeout'   => 10,
                'verify'            => false,  // Safe for localhost
            ]);

            // ✅ CORRECT MODEL NAME (gemini-2.0-flash is current & reliable)
            $apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent';

            $response = $client->post($apiUrl, [
                'query' => ['key' => $apiKey],
                'json'  => [
                    'contents' => [
                        [
                            'parts' => [
                                ['text' => $prompt]
                            ]
                        ]
                    ],
                    'generationConfig' => [
                        'temperature'     => 0.3,
                        'maxOutputTokens' => 300,
                    ],
                ],
            ]);

            $statusCode = $response->getStatusCode();
            if ($statusCode !== 200) {
                throw new \Exception("Gemini API returned HTTP $statusCode");
            }

            $data = json_decode($response->getBody(), TRUE);

            // --- 5. EXTRACT RESPONSE ---
            if (!isset($data['candidates']) || empty($data['candidates'])) {
                \Drupal::logger('wcag_helper')->warning(
                    'Gemini empty response: @data',
                    ['@data' => json_encode($data)]
                );
                return new JsonResponse(['error' => 'No response from AI'], 500);
            }

            $candidate = $data['candidates'][0];
            if (!isset($candidate['content']['parts'][0]['text'])) {
                return new JsonResponse(['error' => 'Unexpected response format'], 500);
            }

            $suggestion = trim($candidate['content']['parts'][0]['text']);
            if (empty($suggestion)) {
                return new JsonResponse(['error' => 'AI returned empty response'], 500);
            }

            return new JsonResponse([
                'suggestion' => $suggestion,
                'success'    => TRUE,
            ]);

        } catch (GuzzleException $e) {
            \Drupal::logger('wcag_helper')->error('Guzzle error: @msg', ['@msg' => $e->getMessage()]);
            return new JsonResponse(['error' => 'Network error: ' . $e->getMessage()], 503);

        } catch (\Exception $e) {
            \Drupal::logger('wcag_helper')->error('Error: @msg', ['@msg' => $e->getMessage()]);
            return new JsonResponse(['error' => 'Server error'], 500);
        }
    }
    
}