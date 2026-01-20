<?php

namespace App\Services;

use App\Models\Profile;
use App\Models\User;
use Illuminate\Support\Facades\Log;

class ProfileEmbeddingService
{
    protected $embeddingService;

    public function __construct(EmbeddingService $embeddingService)
    {
        $this->embeddingService = $embeddingService;
    }

    /**
     * Check if profile has minimum required data
     *
     * @param User $user
     * @return array ['valid' => bool, 'score' => int, 'missing' => array]
     */
    /**
 * Check if profile has minimum required data
 *
 * @param User $user
 * @return array ['valid' => bool, 'score' => int, 'missing' => array]
 */
public function validateProfileCompleteness(User $user): array
{
    $profile = $user->profile;
    $profileScore = 0;
    $missing = [];

    // Professional Bio (50 points)
    if (!empty($profile->professional_bio) && strlen($profile->professional_bio) >= 50) {
        $profileScore += 50;
    } else {
        $missing[] = 'professional_bio';
    }

    // Skills (50 points)
    $skillsCount = $user->skills()->count();
    if ($skillsCount > 0) {
        $profileScore += 50;
    } else {
        $missing[] = 'skills';
    }

    // ❌ REMOVED: Work Experience requirement

    return [
        'valid' => $profileScore >= 60, // Need bio OR skills (50%)
        'score' => $profileScore,
        'missing' => $missing
    ];
}


    /**
     * Prepare user profile text for embedding
     *
     * @param User $user
     * @return string
     */
    public function prepareProfileText(User $user): string
    {
        $profile = $user->profile;
        $text = "";

        // Basic profile info
        if ($profile) {
            if ($profile->professional_bio) {
                $text .= "Professional Bio: {$profile->professional_bio}\n";
            }
            if ($profile->years_of_experience) {
                $text .= "Years of Experience: {$profile->years_of_experience}\n";
            }
            if ($profile->location) {
                $text .= "Location: {$profile->location}\n";
            }
        }

        // Skills
        $skills = $user->skills;
        if ($skills->count() > 0) {
            $text .= "\nSkills:\n";
            foreach ($skills as $skill) {
                $text .= "- {$skill->title} ({$skill->proficiency_level}, {$skill->years_of_experience} years)\n";
            }
        }

        // Work Experience
        $workExperiences = $user->workExperiences;
        if ($workExperiences->count() > 0) {
            $text .= "\nWork Experience:\n";
            foreach ($workExperiences as $experience) {
                $text .= "- {$experience->position} at {$experience->company_name}\n";
                if ($experience->location) {
                    $text .= "  Location: {$experience->location}\n";
                }
                if ($experience->description) {
                    $text .= "  Description: {$experience->description}\n";
                }
                if ($experience->achievements) {
                    $text .= "  Achievements: {$experience->achievements}\n";
                }
            }
        }

        // Education
        $education = $user->education;
        if ($education->count() > 0) {
            $text .= "\nEducation:\n";
            foreach ($education as $edu) {
                $text .= "- {$edu->degree} in {$edu->field_of_study} from {$edu->institution}\n";
                if ($edu->description) {
                    $text .= "  {$edu->description}\n";
                }
            }
        }

        return trim($text);
    }

    /**
     * Generate and store embedding for a user profile
     *
     * @param User $user
     * @return bool
     */
    public function generateEmbedding(User $user): bool
    {
        try {
            $profile = $user->profile;
            if (!$profile) {
                Log::warning("User {$user->id} has no profile");
                return false;
            }

            // Validate profile completeness
            $validation = $this->validateProfileCompleteness($user);
            if (!$validation['valid']) {
                Log::warning("User {$user->id} profile incomplete. Score: {$validation['score']}%");
                return false;
            }

            $text = $this->prepareProfileText($user);
            
            if (empty($text)) {
                Log::warning("User {$user->id} has no profile data to embed");
                return false;
            }

            $embedding = $this->embeddingService->generateEmbedding($text);

            if (!$embedding) {
                Log::error("Failed to generate embedding for user {$user->id}");
                return false;
            }

            $profile->embedding = json_encode($embedding);
            $profile->embedding_text = $text;
            $profile->embedding_generated_at = now();
            $profile->save();

            Log::info("Successfully generated embedding for user {$user->id}");
            return true;
        } catch (\Exception $e) {
            Log::error('Error generating profile embedding: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Generate embeddings for all profiles that don't have one
     *
     * @return int Number of profiles processed
     */
    public function generateAllEmbeddings(): int
    {
        $users = User::with(['profile', 'skills', 'workExperiences', 'education'])
            ->whereHas('profile', function ($query) {
                $query->whereNull('embedding')
                    ->orWhere('embedding_generated_at', '<', now()->subDays(30));
            })
            ->get();

        $count = 0;
        $skipped = 0;

        foreach ($users as $user) {
            $validation = $this->validateProfileCompleteness($user);
            
            if (!$validation['valid']) {
                $skipped++;
                Log::info("Skipped user {$user->id}: Profile incomplete (score: {$validation['score']}%)");
                continue;
            }

            if ($this->generateEmbedding($user)) {
                $count++;
            }
            
            // Rate limiting to avoid OpenAI rate limits
            sleep(1);
        }

        Log::info("Generated {$count} profile embeddings. Skipped {$skipped} incomplete profiles.");
        return $count;
    }

    /**
     * Update embedding when profile or related data is modified
     *
     * @param User $user
     * @return bool
     */
    public function updateEmbedding(User $user): bool
    {
        return $this->generateEmbedding($user);
    }
}
