<?php

namespace Database\Factories;

use App\Models\Company;
use Illuminate\Database\Eloquent\Factories\Factory;

class JobFactory extends Factory
{
    public function definition(): array
    {
        $jobTypes = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship'];
        $skills = ['PHP', 'Laravel', 'Vue.js', 'React', 'Node.js', 'Python', 'Java', 'JavaScript', 'AWS', 'Docker'];
        
        // Generate a detailed job description
        $description = $this->faker->paragraph(3) . "\n\n" .
            "Key Responsibilities:\n" .
            "- " . $this->faker->sentence() . "\n" .
            "- " . $this->faker->sentence() . "\n" .
            "- " . $this->faker->sentence() . "\n" .
            "- " . $this->faker->sentence();

        // Generate detailed requirements
        $requirements = "Required Skills and Experience:\n" .
            "- " . $this->faker->randomElement($skills) . ": " . rand(1, 5) . "+ years\n" .
            "- " . $this->faker->randomElement($skills) . ": " . rand(1, 5) . "+ years\n" .
            "- " . $this->faker->sentence() . "\n" .
            "- " . $this->faker->sentence() . "\n\n" .
            "Education:\n" .
            "- " . $this->faker->randomElement(['Bachelor\'s', 'Master\'s']) . " degree in " . 
            $this->faker->randomElement(['Computer Science', 'Software Engineering', 'Information Technology', 'Related Field']);

        return [
            'title' => $this->faker->jobTitle(),
            'description' => $description,
            'requirements' => $requirements,
            'type' => $this->faker->randomElement($jobTypes),
            'salary_range' => $this->faker->numberBetween(40000, 150000) . ' - ' . $this->faker->numberBetween(160000, 250000),
            'location' => $this->faker->city(),
            'company_id' => Company::factory(),
            'status' => 'open',
            'created_at' => $this->faker->dateTimeBetween('-3 months', 'now'),
            'updated_at' => $this->faker->dateTimeBetween('-3 months', 'now'),
        ];
    }
}