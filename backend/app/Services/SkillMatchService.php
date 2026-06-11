<?php

namespace App\Services;

/**
 * Hybrid RAG scoring: combines embedding similarity with explicit skill overlap.
 * Pure vectors often score 70%+ for unrelated tech stacks (e.g. HTML-only vs Laravel jobs).
 */
class SkillMatchService
{
    /** Canonical skill tokens extracted from job text and compared to user skills */
    private const TECH_SKILLS = [
        'php', 'laravel', 'symfony', 'wordpress', 'drupal',
        'javascript', 'typescript', 'react', 'vue', 'angular', 'next.js', 'nuxt',
        'node', 'express', 'nestjs',
        'python', 'django', 'flask', 'fastapi',
        'java', 'spring', 'kotlin', 'csharp', '.net',
        'go', 'golang', 'rust', 'ruby', 'rails',
        'mysql', 'postgresql', 'postgres', 'mongodb', 'redis', 'sqlite', 'sql',
        'html', 'css', 'sass', 'tailwind', 'bootstrap',
        'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'terraform',
        'git', 'graphql', 'rest', 'api',
        'figma', 'sketch', 'photoshop', 'ui', 'ux',
        'machine learning', 'ai', 'tensorflow', 'pytorch',
        'devops', 'ci/cd', 'jenkins',
    ];

    /** Maps extracted variants to a canonical token */
    private const ALIASES = [
        'vue.js' => 'vue',
        'react.js' => 'react',
        'node.js' => 'node',
        'next.js' => 'next',
        'nuxt.js' => 'nuxt',
        'golang' => 'go',
        'postgresql' => 'postgres',
        'ml' => 'machine learning',
        'ci/cd' => 'devops',
    ];

    /** Job title keywords that imply a non-tech or specialized role */
    private const ROLE_FAMILY_KEYWORDS = [
        'design' => ['designer', 'design', 'figma', 'ui/ux', 'ui ux', 'product design', 'graphic'],
        'devops' => ['devops', 'sre', 'platform engineer', 'infrastructure'],
        'data' => ['data scientist', 'data analyst', 'machine learning engineer'],
        'frontend' => ['frontend', 'front-end', 'front end', 'react', 'vue', 'angular'],
        'backend' => ['backend', 'back-end', 'back end', 'laravel', 'php', 'api developer'],
        'fullstack' => ['full stack', 'fullstack', 'full-stack'],
    ];

    public function normalizeSkill(string $skill): string
    {
        $skill = strtolower(trim($skill));
        $skill = preg_replace('/\s+/', ' ', $skill) ?? $skill;

        return self::ALIASES[$skill] ?? $skill;
    }

    /**
     * @param  string[]  $skillTitles
     * @return string[]
     */
    public function normalizeUserSkills(array $skillTitles): array
    {
        $normalized = [];
        foreach ($skillTitles as $title) {
            $token = $this->normalizeSkill((string) $title);
            if ($token !== '') {
                $normalized[] = $token;
            }
        }

        return array_values(array_unique($normalized));
    }

    /**
     * @return array{core: string[], all: string[]}
     */
    public function extractJobSkillSets(array $job): array
    {
        $titleSkills = $this->extractFromText((string) ($job['title'] ?? ''));
        $bodySkills = $this->extractFromText(strtolower(implode("\n", array_filter([
            $job['requirements'] ?? '',
            $job['description'] ?? '',
        ]))));

        $all = array_values(array_unique(array_merge($titleSkills, $bodySkills)));

        return [
            'core' => $titleSkills,
            'all' => $all,
        ];
    }

    /**
     * @return string[]
     */
    public function extractFromJob(array $job): array
    {
        return $this->extractJobSkillSets($job)['all'];
    }

    /**
     * @return string[]
     */
    public function extractFromText(string $text): array
    {
        $text = strtolower($text);
        $found = [];

        foreach (self::TECH_SKILLS as $skill) {
            $pattern = '/\b' . preg_quote($skill, '/') . '\b/i';
            if (preg_match($pattern, $text)) {
                $found[] = self::ALIASES[$skill] ?? $skill;
            }
        }

        return array_values(array_unique($found));
    }

    /**
     * Score how well a user's skills fit a job (hybrid with semantic similarity).
     *
     * @param  string[]  $userSkillTitles
     * @return array{
     *   eligible: bool,
     *   final_score: float,
     *   semantic_score: float,
     *   skill_score: float|null,
     *   skill_overlap_ratio: float|null,
     *   matched_skills: string[],
     *   missing_skills: string[],
     *   job_skills: string[],
     *   user_skills: string[]
     * }
     */
    public function scoreJobForUser(array $userSkillTitles, array $job, float $semanticScore): array
    {
        $userSkills = $this->normalizeUserSkills($userSkillTitles);
        $skillSets = $this->extractJobSkillSets($job);

        return $this->computeHybridScore($userSkills, $skillSets, $semanticScore, $job);
    }

    /**
     * @param  string[]  $userSkillTitles
     */
    public function scoreCandidateForJob(array $userSkillTitles, array $job, float $semanticScore): array
    {
        return $this->scoreJobForUser($userSkillTitles, $job, $semanticScore);
    }

    /**
     * @param  string[]  $userSkills  normalized
     * @param  array{core: string[], all: string[]}  $skillSets
     */
    protected function computeHybridScore(
        array $userSkills,
        array $skillSets,
        float $semanticScore,
        array $job
    ): array {
        $coreSkills = $skillSets['core'];
        $jobSkills = $skillSets['all'];

        $base = [
            'semantic_score' => round($semanticScore, 4),
            'user_skills' => $userSkills,
            'job_skills' => $jobSkills,
            'core_skills' => $coreSkills,
        ];

        if (!empty($jobSkills) && $this->hasRoleFamilyMismatch($userSkills, $job)) {
            return array_merge($base, [
                'eligible' => false,
                'final_score' => 0.0,
                'skill_score' => 0.0,
                'skill_overlap_ratio' => 0.0,
                'matched_skills' => [],
                'missing_skills' => $jobSkills,
            ]);
        }

        if (empty($jobSkills)) {
            $semanticOnlyThreshold = (float) config('ai.rag_semantic_only_threshold', 0.78);

            return array_merge($base, [
                'eligible' => $semanticScore >= $semanticOnlyThreshold,
                'final_score' => round($semanticScore, 4),
                'skill_score' => null,
                'skill_overlap_ratio' => null,
                'matched_skills' => [],
                'missing_skills' => [],
            ]);
        }

        $matched = array_values(array_intersect($jobSkills, $userSkills));
        $missing = array_values(array_diff($jobSkills, $matched));

        if (!empty($coreSkills)) {
            $coreMatched = array_values(array_intersect($coreSkills, $userSkills));
            if (count($coreMatched) === 0) {
                return array_merge($base, [
                    'eligible' => false,
                    'final_score' => 0.0,
                    'skill_score' => 0.0,
                    'skill_overlap_ratio' => 0.0,
                    'matched_skills' => [],
                    'missing_skills' => $missing,
                ]);
            }
        }

        if (count($matched) === 0) {
            return array_merge($base, [
                'eligible' => false,
                'final_score' => 0.0,
                'skill_score' => 0.0,
                'skill_overlap_ratio' => 0.0,
                'matched_skills' => [],
                'missing_skills' => $missing,
            ]);
        }

        $allOverlapRatio = count($matched) / count($jobSkills);
        $coreOverlapRatio = !empty($coreSkills)
            ? count(array_intersect($coreSkills, $userSkills)) / count($coreSkills)
            : $allOverlapRatio;

        $skillScore = (0.6 * $coreOverlapRatio) + (0.4 * $allOverlapRatio);

        $minOverlap = (float) config('ai.rag_min_skill_overlap', 0.2);
        if ($allOverlapRatio < $minOverlap && $coreOverlapRatio < 0.5) {
            return array_merge($base, [
                'eligible' => false,
                'final_score' => round($skillScore * 0.5, 4),
                'skill_score' => round($skillScore, 4),
                'skill_overlap_ratio' => round($allOverlapRatio, 4),
                'matched_skills' => $matched,
                'missing_skills' => $missing,
            ]);
        }

        $semanticWeight = (float) config('ai.rag_semantic_weight', 0.3);
        $skillWeight = (float) config('ai.rag_skill_weight', 0.7);
        $finalScore = ($semanticScore * $semanticWeight) + ($skillScore * $skillWeight);
        $threshold = (float) config('ai.rag_similarity_threshold', 0.65);

        return array_merge($base, [
            'eligible' => $finalScore >= $threshold,
            'final_score' => round($finalScore, 4),
            'skill_score' => round($skillScore, 4),
            'skill_overlap_ratio' => round($allOverlapRatio, 4),
            'matched_skills' => $matched,
            'missing_skills' => $missing,
        ]);
    }

    /**
     * Reject obvious mismatches (e.g. designer job vs backend-only skills).
     *
     * @param  string[]  $userSkills
     */
    protected function hasRoleFamilyMismatch(array $userSkills, array $job): bool
    {
        $jobText = strtolower(implode(' ', [
            $job['title'] ?? '',
            $job['requirements'] ?? '',
        ]));

        $jobFamilies = $this->detectRoleFamilies($jobText);
        if (empty($jobFamilies)) {
            return false;
        }

        $userText = implode(' ', $userSkills);
        $userFamilies = $this->detectRoleFamilies($userText);

        if (in_array('design', $jobFamilies, true) && !in_array('design', $userFamilies, true)) {
            return true;
        }

        if (in_array('devops', $jobFamilies, true) && !array_intersect($userFamilies, ['devops', 'backend'])) {
            return true;
        }

        return false;
    }

    /**
     * @return string[]
     */
    protected function detectRoleFamilies(string $text): array
    {
        $families = [];
        foreach (self::ROLE_FAMILY_KEYWORDS as $family => $keywords) {
            foreach ($keywords as $keyword) {
                if (str_contains($text, $keyword)) {
                    $families[] = $family;
                    break;
                }
            }
        }

        return array_values(array_unique($families));
    }
}
