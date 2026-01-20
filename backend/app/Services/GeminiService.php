<?php

namespace App\Services;

use GuzzleHttp\Client;
use Illuminate\Support\Facades\Log;

class GeminiService
{
    private $client;

    public function __construct()
    {
        $this->client = new Client();
    }

    /**
     * Send CV text to the local Flask AI bridge
     */
    private function callBridge(string $cvText): array
    {
        $bridgeUrl = rtrim(env('AI_BRIDGE_URL', 'http://127.0.0.1:5005'), '/');

        try {
            $response = $this->client->post($bridgeUrl . '/analyze', [
                'headers' => [
                    'Content-Type' => 'application/json',
                ],
                'json' => [
                    'cv_text' => $cvText,
                ],
                'timeout' => 120,
            ]);

            $body = $response->getBody()->getContents();
            $data = json_decode($body, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                Log::error('Bridge returned invalid JSON', ['body' => $body]);
                throw new \Exception('Invalid JSON from AI bridge');
            }

            if (!isset($data['success'])) {
                throw new \Exception('Unexpected bridge response');
            }

            if (!$data['success']) {
                throw new \Exception($data['error'] ?? 'Bridge processing failed');
            }

            return $data['result'] ?? [];
        } catch (\Exception $e) {
            Log::error('AI Bridge call failed', ['error' => $e->getMessage()]);
            throw new \Exception('AI Bridge call failed: ' . $e->getMessage());
        }
    }

    /**
     * Main CV analysis function
     */
    public function analyzeCv(string $cvText): array
    {
        try {
            $result = $this->callBridge($cvText);

            // Check document type
            $documentType = $result['documentType'] ?? 'UNKNOWN';
            
            // If not a CV, return error response with low scores
            if ($documentType !== 'CV') {
                $docTypeDisplay = [
                    'CERTIFICATE' => 'certificate of completion/training',
                    'COVER_LETTER' => 'cover letter',
                    'OTHER' => 'non-CV document',
                    'UNKNOWN' => 'unrecognized document'
                ][$documentType] ?? 'non-CV document';
                
                return [
                    'extractedInfo' => [
                        'name' => null,
                        'email' => null,
                        'phone' => null,
                        'skills' => [],
                        'experience' => [],
                        'education' => [],
                        'companies' => [],
                        'jobTitles' => [],
                    ],
                    'analysis' => [
                        'strengths' => [],
                        'weaknesses' => $result['weaknesses'] ?? [
                            "Document identified as: {$docTypeDisplay}",
                            'Not a valid CV/resume format',
                            'Missing essential CV sections'
                        ],
                        'atsScore' => 0,
                        'overallScore' => 0,
                        'suggestions' => $result['improvements'] ?? [
                            "This is a {$docTypeDisplay}, not a CV/resume",
                            'Please upload your full CV/resume for analysis',
                        ],
                    ],
                    'summary' => "This document appears to be a {$docTypeDisplay} rather than a CV/resume. Please upload your complete CV for proper analysis.",
                    'jobMatches' => [],
                    'sections' => [
                        'contact' => ['emails' => [], 'phones' => [], 'links' => []],
                        'summary' => '',
                        'skills' => ['technical' => [], 'soft' => [], 'tools' => []],
                        'experience' => [],
                        'education' => [],
                        'projects' => [],
                        'certifications' => [],
                        'languages' => [],
                    ],
                    'ats' => [
                        'score' => 0,
                        'reasons' => [
                            "Document type: {$docTypeDisplay}",
                            'Not a CV/resume format',
                            'ATS systems require proper CV structure',
                        ],
                        'keywordMatches' => ['skillsFound' => [], 'count' => 0],
                    ],
                    'documentType' => $documentType,
                    'isValidCV' => false,
                ];
            }

            // Normalize the response for valid CVs
            $normalized = [
                'extractedInfo' => [
                    'name' => $result['name'] ?? null,
                    'email' => $result['email'] ?? null,
                    'phone' => $result['phone'] ?? null,
                    'skills' => $result['skills'] ?? [],
                    'experience' => $result['experience'] ?? [],
                    'education' => $result['education'] ?? [],
                    'companies' => $result['companies'] ?? [],
                    'jobTitles' => $result['jobTitles'] ?? [],
                ],
                'analysis' => [
                    'strengths' => $result['strengths'] ?? [],
                    'weaknesses' => $result['weaknesses'] ?? $result['improvements'] ?? [],
                    'atsScore' => $result['atsScore'] ?? 50,
                    'overallScore' => $result['overallScore'] ?? 50,
                    'suggestions' => $result['suggestions'] ?? [],
                ],
                'summary' => $result['summary'] ?? 'CV analyzed successfully.',
                'jobMatches' => $result['jobMatches'] ?? [],
                'documentType' => 'CV',
                'isValidCV' => true,
            ];

            // Enrich with structured sections parsed from raw text
            $sections = $this->extractSections($cvText);
            $normalized['sections'] = $sections;

            // Compute heuristic ATS details and merge with AI result if provided
            $ats = $this->computeAtsDetails($cvText, $normalized);
            $normalized['ats'] = $ats;

            // Optionally refine strengths/weaknesses if empty
            if (empty($normalized['analysis']['strengths'])) {
                $normalized['analysis']['strengths'] = $this->deriveStrengths($normalized);
            }
            if (empty($normalized['analysis']['weaknesses'])) {
                $normalized['analysis']['weaknesses'] = $this->deriveWeaknesses($normalized);
            }

            // Sync top-level atsScore with detailed ats score
            if (isset($normalized['ats']['score'])) {
                $normalized['analysis']['atsScore'] = $normalized['ats']['score'];
            }

            return $normalized;
        } catch (\Exception $e) {
            Log::error('CV analysis failed', ['error' => $e->getMessage()]);
            return $this->createFallbackResponse($cvText);
        }
    }

    /**
     * Fallback structure if analysis fails
     */
    private function createFallbackResponse(string $cvText): array
    {
        $sections = $this->extractSections($cvText);
        $ats = $this->computeAtsDetails($cvText, [
            'sections' => $sections,
            'extractedInfo' => [
                'skills' => [],
                'experience' => [],
                'education' => [],
                'companies' => [],
                'jobTitles' => [],
            ],
        ]);

        return [
            'extractedInfo' => [
                'name' => null,
                'email' => null,
                'phone' => null,
                'skills' => [],
                'experience' => [],
                'education' => [],
                'companies' => [],
                'jobTitles' => [],
            ],
            'analysis' => [
                'strengths' => ['CV received'],
                'weaknesses' => ['Unable to analyze CV'],
                'suggestions' => ['Ensure the AI bridge is running on port 5005'],
                'atsScore' => $ats['score'] ?? 0,
                'overallScore' => 0,
            ],
            'summary' => 'AI bridge not reachable or returned an invalid response.',
            'jobMatches' => [],
            'sections' => $sections,
            'ats' => $ats,
            'documentType' => 'UNKNOWN',
            'isValidCV' => false,
        ];
    }

    /**
     * Extract structured sections from raw CV text
     */
    private function extractSections(string $cvText): array
    {
        $text = preg_replace('/[\r\t]+/', ' ', $cvText);
        $text = preg_replace('/\n{2,}/', "\n\n", $text);
        $lines = preg_split('/\n/', $text);

        $sections = [
            'contact' => [
                'emails' => [],
                'phones' => [],
                'links' => [],
            ],
            'summary' => '',
            'skills' => [
                'technical' => [],
                'soft' => [],
                'tools' => [],
            ],
            'experience' => [],
            'education' => [],
            'projects' => [],
            'certifications' => [],
            'languages' => [],
        ];

        // Contact: emails, phones, urls
        if (preg_match_all('/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i', $text, $m)) {
            $sections['contact']['emails'] = array_values(array_unique($m[0]));
        }
        if (preg_match_all('/(\+?\d[\d\s().-]{7,}\d)/', $text, $m)) {
            $sections['contact']['phones'] = array_values(array_unique($m[1]));
        }
        if (preg_match_all('/https?:\/\/[^\s)]+/i', $text, $m)) {
            $sections['contact']['links'] = array_values(array_unique($m[0]));
        }

        // Headings detection
        $headingMap = [
            'summary' => ['summary', 'professional summary', 'profile', 'objective', 'about me'],
            'skills' => ['skills', 'technical skills', 'skills & tools', 'core competencies'],
            'experience' => ['experience', 'work experience', 'professional experience', 'employment'],
            'education' => ['education', 'academic'],
            'projects' => ['projects', 'personal projects'],
            'certifications' => ['certifications', 'licenses'],
            'languages' => ['languages'],
        ];

        $current = null;
        $buffers = [];
        foreach ($lines as $line) {
            $trim = trim($line);
            if ($trim === '') continue;
            $lower = strtolower($trim);
            $matched = false;
            foreach ($headingMap as $key => $variants) {
                foreach ($variants as $v) {
                    if (preg_match('/^\s*' . preg_quote($v, '/') . '\s*[:]?$/i', $trim)) {
                        $current = $key;
                        $buffers[$current] = $buffers[$current] ?? [];
                        $matched = true;
                        break 2;
                    }
                }
            }
            if ($matched) continue;
            if ($current) {
                $buffers[$current][] = $trim;
            }
        }

        // Assign buffers
        if (!empty($buffers['summary'])) {
            $sections['summary'] = trim(implode(' ', $buffers['summary']));
        }
        if (!empty($buffers['skills'])) {
            $skillsText = strtolower(implode(' ', $buffers['skills']));
            $tokens = preg_split('/[,•\-\n;]+\s*/', $skillsText);
            $tokens = array_values(array_unique(array_filter(array_map('trim', $tokens))));
            $techKeywords = ['python','java','javascript','typescript','c#','c++','react','node','sql','mysql','postgres','aws','gcp','azure','docker','kubernetes','linux','git'];
            $toolKeywords = ['excel','tableau','power bi','figma','jira','notion','photoshop'];
            foreach ($tokens as $t) {
                if (in_array($t, $techKeywords)) $sections['skills']['technical'][] = $t;
                elseif (in_array($t, $toolKeywords)) $sections['skills']['tools'][] = $t;
                else $sections['skills']['soft'][] = $t;
            }
        }
        if (!empty($buffers['experience'])) {
            $blocks = preg_split('/\n\n+/', implode("\n", $buffers['experience']));
            foreach ($blocks as $block) {
                $b = trim($block);
                if ($b === '') continue;
                preg_match('/(\b[A-Z][A-Za-z&\-. ]{2,}\b)/', $b, $companyMatch);
                preg_match('/(\b[A-Za-z][A-Za-z&\-. ]{2,}\b)/', $b, $titleMatch);
                preg_match('/(\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})\s*(?:–|-|to)+\s*(Present|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})/i', $b, $dateMatch);
                $bullets = [];
                if (preg_match_all('/[\x{2022}\-\*]\s*(.+)/u', $b, $bm)) {
                    $bullets = array_map('trim', $bm[1]);
                }
                $sections['experience'][] = [
                    'company' => $companyMatch[1] ?? null,
                    'title' => $titleMatch[1] ?? null,
                    'startDate' => $dateMatch[1] ?? null,
                    'endDate' => $dateMatch[2] ?? null,
                    'details' => $b,
                    'bullets' => $bullets,
                ];
            }
        }
        if (!empty($buffers['education'])) {
            $blocks = preg_split('/\n\n+/', implode("\n", $buffers['education']));
            foreach ($blocks as $block) {
                $b = trim($block);
                if ($b === '') continue;
                preg_match('/(Bachelor|Master|BSc|MSc|PhD|Diploma|Associate)[^\n,]*/i', $b, $degree);
                preg_match('/\b([A-Z][A-Za-z&\-. ]{2,})\b/', $b, $inst);
                $sections['education'][] = [
                    'institution' => $inst[1] ?? null,
                    'degree' => $degree[0] ?? null,
                    'details' => $b,
                ];
            }
        }
        if (!empty($buffers['projects'])) {
            $sections['projects'] = array_map('trim', $buffers['projects']);
        }
        if (!empty($buffers['certifications'])) {
            $sections['certifications'] = array_map('trim', $buffers['certifications']);
        }
        if (!empty($buffers['languages'])) {
            $sections['languages'] = array_map('trim', $buffers['languages']);
        }

        return $sections;
    }

    /**
     * Compute heuristic ATS details based on structure and content
     */
    private function computeAtsDetails(string $cvText, array $normalized): array
    {
        $score = 0;
        $reasons = [];

        $length = strlen($cvText);
        if ($length > 400 && $length < 20000) { $score += 10; } else { $reasons[] = 'CV length is unusual for ATS'; }

        $hasEmail = preg_match('/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i', $cvText);
        $hasPhone = preg_match('/(\+?\d[\d\s().-]{7,}\d)/', $cvText);
        if ($hasEmail) { $score += 10; } else { $reasons[] = 'Missing professional email'; }
        if ($hasPhone) { $score += 10; } else { $reasons[] = 'Missing phone number'; }

        $sections = $normalized['sections'] ?? [];
        $hasSection = function(string $key) use ($sections): bool {
            if (!isset($sections[$key])) return false;
            if (is_array($sections[$key])) return count(array_filter($sections[$key])) > 0;
            return trim((string)$sections[$key]) !== '';
        };

        $hasHeading = function(string $text, string $word, array $variants = []): bool {
            $patterns = [];
            $variants = array_merge([$word], $variants);
            foreach ($variants as $w) {
                $w = trim($w);
                if ($w === '') continue;
                $patterns[] = '/\b' . preg_quote($w, '/') . '\b/i';
                $spaced = implode('\\s*', str_split($w));
                $patterns[] = '/\b' . $spaced . '\b/i';
            }
            foreach ($patterns as $p) {
                if (preg_match($p, $text)) return true;
            }
            return false;
        };

        $headingMap = [
            'experience' => ['work experience','professional experience','employment'],
            'education'  => ['academic background','education and training','academic'],
            'skills'     => ['technical skills','skills & tools','core competencies'],
        ];

        $headingsScore = 0;
        foreach ($headingMap as $key => $variants) {
            if ($hasSection($key) || $hasHeading($cvText, $key, $variants)) {
                $headingsScore += 5;
            } else {
                $reasons[] = "Missing section heading: $key";
            }
        }
        $score += $headingsScore;

        $bulletCount = preg_match_all('/[\x{2022}\-\*]\s+/u', $cvText);
        if ($bulletCount >= 5) { $score += 10; } else { $reasons[] = 'Add more bullet-pointed achievements'; }

        $hasDates = preg_match('/(\b\d{4}\b)/', $cvText);
        if ($hasDates) { $score += 10; } else { $reasons[] = 'Include dates for roles and education'; }

        $skills = $normalized['extractedInfo']['skills'] ?? [];
        $skillsCount = is_array($skills) ? count($skills) : 0;
        if ($skillsCount >= 8) { $score += 10; } else { $reasons[] = 'List more relevant skills and tools'; }

        $hasAllCapsName = preg_match('/^[A-Z\s]{6,}$/m', $cvText);
        if ($hasAllCapsName) { $score += 2; }

        $score = max(0, min(100, $score + 28));

        return [
            'score' => $score,
            'reasons' => $reasons,
            'keywordMatches' => [
                'skillsFound' => $skills,
                'count' => $skillsCount,
            ],
        ];
    }

    private function deriveStrengths(array $normalized): array
    {
        $s = [];
        if (!empty($normalized['sections']['experience'])) $s[] = 'Has documented professional experience';
        if (!empty($normalized['sections']['skills']['technical'])) $s[] = 'Good technical skills coverage';
        if (!empty($normalized['sections']['education'])) $s[] = 'Education section is present';
        return $s;
    }

    private function deriveWeaknesses(array $normalized): array
    {
        $w = [];
        if (empty($normalized['sections']['summary'])) $w[] = 'Missing or weak professional summary';
        if (empty($normalized['sections']['skills']['tools'])) $w[] = 'Add more tools/platforms used';
        if (empty($normalized['sections']['experience'])) $w[] = 'Add detailed work experience with achievements';
        return $w;
    }
}