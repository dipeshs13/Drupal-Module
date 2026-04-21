<?php

namespace Drupal\wcag_helper\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\Core\Site\Settings;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;

class GeminiProxyController extends ControllerBase {

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

        // --- 2. CACHE CHECK (BIG WIN 🚀) ---
        $cacheKey = 'wcag_ai_' . md5($prompt);
        $cache = \Drupal::cache()->get($cacheKey);

        if ($cache) {
            return new JsonResponse([
                'suggestion' => $cache->data,
                'success' => TRUE,
                'cached' => TRUE,
            ]);
        }

        // --- 3. RATE LIMIT ---
        $session = \Drupal::request()->getSession();
        $lastCall = $session->get('last_ai_call', 0);

        if (time() - $lastCall < 2) {
            return new JsonResponse([
                'error' => 'Please wait before making another request.'
            ], 429);
        }

        $session->set('last_ai_call', time());

        // --- 4. GET API KEY ---
        $apiKey = Settings::get('gemini_api_key');
        // $apiKey = getenv('GEMINI_API_KEY');
        if (empty($apiKey)) {
            \Drupal::logger('wcag_helper')->critical(
                'Gemini API key not configured.'
            );
            return new JsonResponse(['error' => 'AI service not configured'], 500);
        }

        // --- 5. PERMISSION CHECK ---
        $user = \Drupal::currentUser();
        if (!$user->hasPermission('administer content')) {
            return new JsonResponse(['error' => 'Insufficient permissions'], 403);
        }

        try {

            $client = new Client([
                'timeout' => 60,
                'connect_timeout' => 10,
                'verify' => false,
            ]);

            $apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent';

            $payload = [
                'contents' => [
                    [
                        'parts' => [
                            ['text' => $prompt]
                        ]
                    ]
                ],
                'generationConfig' => [
                    'temperature' => 0.3,
                    'maxOutputTokens' => 150, // reduced to save quota
                ],
            ];

            // --- 6. RETRY LOGIC (503 FIX) ---
            $maxRetries = 3;
            $attempt = 0;
            $delay = 1;
            $response = null;

            do {
                try {
                    $response = $client->post($apiUrl, [
                        'query' => ['key' => $apiKey],
                        'json' => $payload,
                    ]);
                    break;

                } catch (GuzzleException $e) {
                    $attempt++;

                    if ($attempt >= $maxRetries) {
                        throw $e;
                    }

                    sleep($delay);
                    $delay *= 2;
                }

            } while ($attempt < $maxRetries);

            // --- 7. HANDLE RESPONSE ---
            $data = json_decode($response->getBody(), TRUE);

            if (!isset($data['candidates']) || empty($data['candidates'])) {
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

            // --- 8. SAVE TO CACHE ---
            \Drupal::cache()->set(
                $cacheKey,
                $suggestion,
                time() + 3600 // 1 hour
            );

            return new JsonResponse([
                'suggestion' => $suggestion,
                'success' => TRUE,
            ]);

        } catch (GuzzleException $e) {

            $msg = $e->getMessage();

            if (str_contains($msg, '429')) {
                return new JsonResponse([
                    'error' => 'AI quota exceeded. Try again later.'
                ], 429);
            }

            if (str_contains($msg, '503')) {
                return new JsonResponse([
                    'error' => 'AI service busy. Please try again shortly.'
                ], 503);
            }

            \Drupal::logger('wcag_helper')->error('Guzzle error: @msg', ['@msg' => $msg]);

            return new JsonResponse([
                'error' => 'Network error: ' . $msg
            ], 503);

        } catch (\Exception $e) {

            \Drupal::logger('wcag_helper')->error('Error: @msg', ['@msg' => $e->getMessage()]);

            return new JsonResponse([
                'error' => 'Server error'
            ], 500);
        }
    }
}